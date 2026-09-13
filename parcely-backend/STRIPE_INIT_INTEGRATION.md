# Init Stripe Integration — Stripe Events + Platform Webhooks + Onboarding

As-built documentation for the first Stripe slice: seller connected-account creation,
hosted onboarding, and the platform webhook endpoint that keeps capability status
converged.

This supersedes **STRIPE.md §6 (Webhooks)**, which was written before implementation and
describes a v1 `account.updated` handler and a `Stripe-Account` header for seller
resolution. Neither is how the code works. Everything else in STRIPE.md still stands.

---

## 1. Scope

**Built:**

| Piece | File |
|---|---|
| Outbound Stripe calls | `billing/connect.py` |
| Webhook event handlers | `billing/handlers.py` |
| Platform webhook endpoint | `billing/views/stripeWebhooks.py` |
| Seller onboarding endpoint | `billing/views/onboarding.py` |
| Event audit log | `billing/models.py` (`StripeEvent`) |
| Seller state | `accounts/models.py` (`stripe_account_id`, `card_payments_status`) |

**Not built:** the Connect (payments-scoped) webhook endpoint, and the
`Payment` / `Subscription` / `Order` models. Those are deferred until real payment
payloads are observed.

### 1.1 Platform scope only — answering a common question

There is exactly **one** Stripe webhook route, `webhooks/stripe/platform/`
(`core/urls.py:29`). A Connect-scoped endpoint does not exist in any form — no route, no
view, and nothing in the repo calls `construct_event` (the v1/snapshot API a Connect
endpoint would need).

`STRIPE_CONNECT_WEBHOOK_SECRET` **is** required by `core/settings.py:38` via
`os.environ[...]`, so the process won't boot without it, but it is referenced nowhere
else. It is a placeholder for the endpoint STRIPE.md §6 specifies and we have not written.

### 1.2 Events are not account-scoped at the delivery layer

The second common question: *are webhooks tied to an account id?* Not by Stripe — we
derive the account ourselves.

A **v1 snapshot event** has a top-level `account` field. A **v2 thin event does not.**
What it carries instead is (`stripe/v2/core/_event.py:150`):

```python
context: Optional[StripeContext] = None
"""[Optional] Authentication context needed to fetch the event or related object."""
```

`StripeContext` is a slash-delimited segment list, not an account id — it is an auth scope
you replay as the `Stripe-Context` header, which is exactly what `fetch_event()` does.

So: **one platform endpoint receives events about every connected account**, and the
`acct_` id is dug out of the payload body differently per event type. That is what
`handlers.account_id_for()` exists to do, and why `StripeEvent.stripe_account_id` is
nullable — some events (ping) have no account at all.

---

## 2. Domain model

One `AppUser` = one Stripe connected account = the payout destination for **all** of that
seller's storefronts. Buyers pay via direct charges, so the seller is merchant of record.

Account shape, set at creation in `connect.create_connected_account()`:

- **Accounts v2 only.** Never the v1 `type: "express" | "standard" | "custom"`.
- `dashboard: "full"` — sellers get a real Stripe dashboard.
- `defaults.responsibilities.fees_collector = "stripe"`, `losses_collector = "stripe"`.
- `configuration.merchant.capabilities.card_payments.requested = true`.

> **One-way door.** `defaults.responsibilities` is **immutable** once the merchant
> configuration is applied. Changing it is not an edit — it means re-onboarding every
> existing seller. Treat any proposed change as a migration project.

---

## 3. Object shapes

This is the section that cannot be reconstructed from our code, because our code only
shows the handful of fields we happened to extract. All shapes below are verified against
the installed SDK (`stripe/v2/...`); line references are given so they can be re-checked
when the SDK is upgraded.

### 3a. The thin event notification — what arrives in the request body

Source: `EventNotification` at `_event.py:126-175`, `RelatedObject` at `_event.py:112-123`.

```jsonc
{
  "id": "evt_...",                    // idempotency key; reused across retries/resends
  "object": "v2.core.event",          // v1 snapshot events say "event" instead
  "type": "v2.core.account[configuration.merchant].capability_status_updated",
  "created": "2026-09-11T04:12:33.412Z",  // ISO-8601 STRING (v1 uses a unix int)
  "livemode": false,
  "context": "acct_.../...",       // auth scope for the follow-up fetch, NOT an id
  "reason": {                         // absent for non-API-originated events
    "type": "request",
    "request": { "id": "req_...", "idempotency_key": "..." }
  },
  "related_object": {                 // PRESENT ONLY ON SOME TYPES - see 3a.1
    "id": "acct_...",
    "type": "v2.core.account",
    "url": "/v2/core/accounts/acct_..."
  }
}
```

**What we persist:** the entire body verbatim into `StripeEvent.payload`, plus `id`,
`type`, and our derived `stripe_account_id`.

**What we never read:** `context` (passed through implicitly by the SDK), `reason`,
`livemode`, `related_object.url`.

> **Why `reason.request.idempotency_key` is *not* our idempotency key.** It identifies
> the API *request*, not the event — one request can emit many events, and it is absent
> entirely for events Stripe originates itself. `evt_` is the stable per-event id and is
> reused across retries and dashboard resends, so that is the unique column.

#### 3a.1 `related_object` presence varies by type — this matters

| Event type | `related_object`? | `.id` is |
|---|---|---|
| `...capability_status_updated` | yes | `acct_...` |
| `...[requirements].updated` | yes | `acct_...` |
| `v2.core.account.closed` | yes | `acct_...` |
| `v2.core.account_link.returned` | **no — not declared at all** | — |
| `v2.core.event_destination.ping` | yes | **`ed_...`** (event destination!) |

A generic `related_object.id if related_object else None` is wrong in **both** directions:
it raises `AttributeError` on `account_link.returned`, and silently writes an `ed_...`
into `stripe_account_id` on `ping`. Hence the explicit allowlist
`handlers._ACCOUNT_ID_ON_RELATED_OBJECT`.

#### 3a.2 Contrast: a v1 snapshot event

```jsonc
{
  "id": "evt_...",
  "object": "event",              // <- differs
  "api_version": "2025-08-27",    // pinned; thin events are unversioned
  "created": 1757563953,          // unix int
  "account": "acct_...",          // top-level account; thin events have none
  "data": { "object": { /* full resource snapshot */ } },
  "type": "account.updated"
}
```

Posting one of these to our thin endpoint raises `ValueError` inside
`parse_event_notification`, which is the view's second exception branch.

### 3b. The "second round" — `fetch_event()`

`_event.py:219`. Issues `GET /v2/core/events/{evt_id}` with the `Stripe-Context` header
(from `notification.context`) and a `Stripe-Request-Trigger: event=evt_...` header so
Stripe can attribute the read back to the event that caused it.

The notification is a *pointer*. The fetched `Event` is the thing it points at, and adds
two fields the notification does not have:

```jsonc
{
  "id": "evt_...", "object": "v2.core.event", "type": "...", "created": "...",
  "livemode": false, "context": "...", "reason": { ... },

  "changes": { /* before/after for the primary related object */ },   // added
  "data":    { /* TYPED per event type */ }                            // added
}
```

For `account_link.returned`, `data` is
(`stripe/events/_v2_core_account_link_returned_event.py`):

```jsonc
"data": {
  "account_id": "acct_...",
  "configurations": ["merchant"],
  "use_case": "account_onboarding"     // or "account_update"
}
```

**This is the only route to the account id for that event type**, because its notification
class declares no `related_object`. That is why `handle_account_link_returned` is the one
handler that makes an extra network call before it can even identify the seller.

> Events are retrievable for ~30 days. Replaying a very old event from the dashboard can
> 404 on this fetch.

### 3c. The Account object

`connect.retrieve_account()` → `GET /v2/core/accounts/{id}` with
`include=["configuration.merchant"]`. Top-level keys (`_account.py:4388-4450`):

```jsonc
{
  "id": "acct_...",
  "object": "v2.core.account",
  "applied_configurations": ["merchant"],
  "closed": false,                    // <- the real closure signal; see gap 1
  "configuration": { "merchant": { ... } },   // null unless include= asks for it
  "contact_email": "seller@example.com",
  "contact_phone": null,
  "created": "2026-09-10T22:04:11.003Z",
  "dashboard": "full",
  "defaults": { "responsibilities": { ... } },
  "display_name": "seller_username",
  "future_requirements": { ... },
  "identity": { ... },                // null unless include= asks for it
  "livemode": false,
  "metadata": { "app_user_id": "42" },
  "requirements": { ... }             // null unless include= asks for it
}
```

The single path we read (`connect.merchant_status()`):

```
configuration.merchant.capabilities.card_payments.status          // _account.py:1830
configuration.merchant.capabilities.card_payments.status_details[]
```

where each `status_details` entry is (`_account.py:622`):

```jsonc
{
  "code": "unsupported_business",      // determining_status | requirements_past_due |
                                       // requirements_pending_verification | restricted_other |
                                       // unsupported_business | unsupported_country |
                                       // unsupported_entity_type
  "resolution": "provide_info"         // contact_stripe | no_resolution | provide_info
}
```

`status_details` is empty only when `status == "active"`.

#### Two traps, both silent

1. **`include=` is mandatory.** Without it the response comes back with
   `configuration = None` and `requirements = None` — the keys are present but null, so
   attribute access raises `AttributeError` on `None` rather than returning empty. This
   is why every Account read in the codebase funnels through `connect.retrieve_account()`,
   and why **`notification.fetch_related_object()` must never be used**: it issues the
   bare GET and cannot pass params.
2. **Two different things are called `card_payments`.**
   - `configuration.merchant.capabilities.card_payments` (`:1830`) — *"Allow the merchant
     to collect card payments."* This is the capability, and the selling gate.
   - `configuration.merchant.card_payments` (`:2180`) — *"Card payments settings."*
     Unrelated AVS/CVC decline configuration.

   Reading the wrong one produces no error, just a permanently wrong answer.

### 3d. The AccountLink response

`_account_link.py:105-129`.

```jsonc
{
  "object": "v2.core.account_link",
  "account": "acct_...",
  "created": "2026-09-11T04:00:00.000Z",
  "expires_at": "2026-09-11T04:05:00.000Z",
  "livemode": false,
  "url": "https://connect.stripe.com/...",
  "use_case": { "type": "account_onboarding", "account_onboarding": { ... } }
}
```

We read **`url` only**. Note `expires_at` exists and we deliberately do not store it —
see §6.2.

---

## 4. `connect.py` vs `handlers.py`

Two files, two directions. `connect.py` is everything **we say to Stripe**;
`handlers.py` is everything **Stripe says to us**. The dependency runs one way only:
`handlers` imports `connect`, never the reverse.

```
                       ┌──────────────────┐
  onboarding.py ──────▶│                  │
                       │   connect.py     │─────▶ Stripe API
  handlers.py   ──────▶│  (no DB writes)  │
                       └──────────────────┘

  Stripe ──▶ stripeWebhooks.py ──▶ handlers.py ──▶ AppUser rows
                (transport)         (DB writes)
```

### 4.1 `connect.py` — outbound

Four functions, zero database writes. It reads `user.email` / `username` / `id` to build
a request but never saves anything. Follows the `accounts/clerk.py` convention:
module-level client, free functions, no class wrapper.

> The module is **not** named `billing/stripe.py` — that would shadow the pip package.

| Function | Call |
|---|---|
| `create_connected_account(user)` | `POST /v2/core/accounts` |
| `retrieve_account(account_id)` | `GET /v2/core/accounts/{id}` |
| `merchant_status(account)` | pure — digs the status out of a response |
| `create_onboarding_link(id, *, use_case_type)` | `POST /v2/core/account_links` |

Load-bearing details:

- **`MERCHANT_INCLUDE`** is passed on *both* create and retrieve. See §3c trap 1.
- **`include` on the create call** means the create response already carries the initial
  capability status, so onboarding seeds `card_payments_status` with no second round-trip.
- **`metadata={"app_user_id": str(user.id)}`** is written on create and read only by
  `handlers._adopt_by_metadata`. It is the recovery channel for Flow F (§9).
- **`use_case_type` is repeated as a dict key.** Stripe's schema is
  `use_case: {type: "account_onboarding", account_onboarding: {...}}` — the discriminator
  value is also the nested key name, hence the dynamic `use_case_type: {...}` key.

### 4.2 `handlers.py` — inbound

Five handlers, one dispatch dict, one shared convergence function, one recovery helper.
This is the only webhook-side writer of `AppUser`.

**`account_id_for(notification)`** — called by the *view*, before dispatch, to populate
`StripeEvent.stripe_account_id`. Per-type by necessity; see §3a.1.

**`refresh_card_payments_status(account_id)`** — the workhorse; four of the five handlers
are one line calling it.

```
connect.retrieve_account(account_id)      ← always refetch
  → connect.merchant_status(account)
  → AppUser by stripe_account_id
      → miss? _adopt_by_metadata()
  → AppUser.objects.filter(pk=...).update(card_payments_status=status)
```

**Why it always refetches instead of reading the payload:** a thin event carries no status
at all. There is nothing absolute to copy out of the body, so "write absolute state from
the event" is not an available option. Writing Stripe's state *at fetch time* converges
regardless of the order events arrive in.

A narrow interleave remains — A fetches, B fetches, B writes, A writes stale. It
self-heals on the next event; closing it would cost a version column. Documented at
`handlers.py:52-54`, deliberately not engineered around.

The write is a targeted `.update()` rather than `user.save()`, which would write back
every field on a row a concurrent request may have changed.

---

## 5. Statuses

`CardPaymentsStatus` (`accounts/models.py:7-13`) mirrors Stripe's
`Literal["active", "pending", "restricted", "unsupported"]` **verbatim** — values are
assigned straight from the API response, so they must not diverge.

| Value | Meaning |
|---|---|
| `NULL` | no connected account yet (our value, not Stripe's) |
| `pending` | Stripe is processing |
| `restricted` | requirements outstanding |
| `unsupported` | capability not available — **see below** |
| `active` | may sell |

`AppUser.can_sell` (`accounts/models.py:38-42`) is the single definition of the gate.
Checkout must reuse it rather than comparing the status string again.

### 5.1 `unsupported` is not necessarily terminal

Worth stating plainly because it is easy to assume otherwise. Recoverability is **not**
expressed by the status — it lives in `status_details[].resolution`, whose SDK docstring
is *"Machine-readable code explaining how to make the Capability active"*:

| `resolution` | Recoverable? |
|---|---|
| `provide_info` | yes — collect more information |
| `contact_stripe` | yes — via Stripe support |
| `no_resolution` | **no** — genuinely terminal |

So a seller at `unsupported` + `unsupported_business` + `provide_info` has an open,
fixable account. We currently store no `status_details`, so we cannot distinguish these
cases — which is the root of **gap 1** (§12).

---

## 6. Onboarding flow

`POST /billing/onboarding/` (`billing/urls.py`, name `stripe-onboarding`).

Takes **no body** — the seller is `request.user`. Accepting an account id would be an
IDOR. Authentication is DRF's project-wide default (`ClerkMiddlewareAuthentication` +
`IsClerkAuthenticated`, `core/settings.py:81-86`), so no per-view decorator is needed.

Always returns the same shape, so the frontend has one code path:

```jsonc
{ "url": "https://connect.stripe.com/..." | null,
  "stripe_account_id": "acct_..." | null,
  "card_payments_status": "restricted" | null }
```

### 6.1 Sequence

```
 Frontend                Django                        Stripe
    │                       │                             │
    │──POST /billing/onboarding/──▶                       │
    │                       │                             │
    │                  can_sell? ──yes──▶ 200 {url: null} │   (Flow C)
    │                  closed?   ──yes──▶ 409             │   (Flow D)
    │                       │                             │
    │              ┌── transaction.atomic ──┐             │
    │              │ SELECT ... FOR UPDATE  │             │   serialises Flow E
    │              │                        │──create────▶│
    │              │                        │◀─acct_+status (include=)
    │              │ save id + status       │             │
    │              └── COMMIT ──────────────┘             │
    │                       │                             │
    │                       │──account_links.create──────▶│   (outside the lock)
    │◀──200 {url, acct_, status}                          │
    │                       │                             │
    │──redirect to connect.stripe.com────────────────────▶│
    │                       │                             │
    │                       │◀─[requirements].updated ────│  ─┐
    │                       │──retrieve_account──────────▶│   │ converge
    │                       │◀─capability_status_updated ─│   │ card_payments_status
    │                       │──retrieve_account──────────▶│  ─┘
    │                       │                             │
    │◀──browser redirect to return_url────────────────────│
    │                       │◀─account_link.returned ─────│
    │                       │──fetch_event───────────────▶│
    │                       │──retrieve_account──────────▶│
```

> **The browser redirect and the `account_link.returned` webhook are independent.** The
> landing page at `/onboarding/stripe/return` must **not** assume the status is already
> `active` — it must re-read the seller's status (or poll), because the webhook may not
> have landed yet.

### 6.2 Why links are minted on demand and never stored

Every POST returns a *different* URL for the *same* account. There is deliberately no
in-flight-link column, because:

- links are single-use and short-lived, so a stored value is always either already
  consumed or about to expire;
- validating a stored link costs the same API call as minting a fresh one;
- Stripe's `refresh_url` contract explicitly expects you to generate a new link with the
  same parameters.

Minting is not a mutation of our state, which is why it happens *outside* the lock — and
why double-clicking the button is idempotent by construction.

---

## 7. Webhook flow

`POST /webhooks/stripe/platform/` → `billing/views/stripeWebhooks.py`.

The route lives in `core/urls.py`, not `billing/urls.py`, and the `webhooks/` prefix is
**load-bearing**: `accounts/middleware.py:14` short-circuits that prefix to
`AnonymousUser` and skips Clerk auth. Moving it under `billing/` would re-arm the
middleware and break the endpoint.

```
  request
    │
    ├─▶ parse_event_notification(body, sig header, STRIPE_WEBHOOK_SECRET)
    │       ├─ SignatureVerificationError ──▶ 400   (also covers a missing header)
    │       └─ ValueError ─────────────────▶ 200   (malformed, or a v1 snapshot body)
    │
    ├─▶ handlers.account_id_for(notification)        per-type, no network call
    │
    ├─▶ INSERT StripeEvent (unique on stripe_event_id)
    │       └─ IntegrityError ─────────────▶ 200   (duplicate delivery)
    │
    ├─▶ handlers.handler_for(type)
    │       ├─ None ──────────────▶ stamp processed_at ──▶ 200
    │       └─ raises ────────────▶ record repr(exc) in .error ──▶ 500 (Stripe retries)
    │
    └─▶ stamp processed_at, clear error ──▶ 200
```

### 7.1 Why malformed input returns 200

A retry replays the identical bytes and fails identically. A non-2xx would only buy a
multi-day backoff on the **whole endpoint**, delaying every subsequent valid event. So an
unprocessable payload is recorded-and-acknowledged, not rejected.

### 7.2 Two ordering invariants that look like mistakes

**INSERT before dispatch.** Stripe reuses the `evt_` id across retries and dashboard
resends. The unique index on `stripe_event_id` is an idempotency gate *only because the
INSERT precedes the side effects*. Reordering them turns it into decoration.

**No `@transaction.atomic` on the view.** `ATOMIC_REQUESTS` is unset, so the `StripeEvent`
row commits immediately and survives a handler exception — which is what lets the (future)
retry sweep find it, and what makes the 500 path meaningful. Wrapping the view would roll
the row back together with the handler.

Both are commented in the source, because both read as omissions.

---

## 8. Subscribed event types

| Type | Account id from | Action |
|---|---|---|
| `v2.core.account[configuration.merchant].capability_status_updated` | `related_object.id` | refetch + write status |
| `v2.core.account[requirements].updated` | `related_object.id` | refetch + write status |
| `v2.core.account_link.returned` | `fetch_event().data.account_id` | backfill row's account id, then refetch + write |
| `v2.core.account.closed` | `related_object.id` | write `unsupported`, no refetch |
| `v2.core.event_destination.ping` | — (`related_object` is `ed_...`) | explicit no-op |

Notes:

- **`[requirements].updated` has nothing to store** — we keep no requirements column. It
  is handled because requirements moving is the leading indicator that the capability is
  about to follow; its value is as a *refresh trigger*, not as a payload.
- **`account.closed` does not refetch** (terminal) and deliberately **leaves
  `stripe_account_id` in place** — clearing it would lose the audit link and let the
  seller mint a second account.
- **`ping` gets an explicit no-op handler** so a dashboard connection test is not recorded
  as an unknown type.
- **Unhandled types are recorded and 200'd.** This is why `StripeEvent.type` has no
  `choices=` — the table is the record of everything Stripe sends, and
  `handlers._HANDLERS` is the separate source of truth for what we act on.

**Deliberately not subscribed:** `v2.core.account.created` (we create accounts ourselves
and already have the response), `v2.core.account.updated` (too broad — the capability and
requirements events are the ones carrying signal), the `[configuration.customer]` and
`[configuration.recipient]` variants (we apply neither configuration), and
`v2.core.account_person.*`.

---

## 9. Flow catalogue

| | Trigger | Path | End state |
|---|---|---|---|
| **A** | First-time seller POSTs | no account → lock → create → persist → mint `account_onboarding` link | `acct_` + initial status stored, URL returned |
| **B** | Resume / double-click | `stripe_account_id` set, not active → mint `account_update` link | new URL, **same** account |
| **C** | Already selling | `can_sell` | 200 with `url: null` |
| **D** | Closed account | status is `unsupported` | 409, no link minted |
| **E** | Two concurrent POSTs | second blocks on `select_for_update`, re-reads inside the lock, sees the id, takes B | exactly one account created |
| **F** | Webhook beats our own create response | no row matches `stripe_account_id` → `_adopt_by_metadata` reads `metadata.app_user_id` | seller adopted, status written |
| **G** | Event for an account we've never seen | no match, no usable metadata → handler returns `None` | recorded, no-op, **200** (retrying won't help) |
| **H** | Ping / unknown type | no-op handler, or no handler at all | row persisted, `processed_at` stamped, 200 |

Two implementation notes worth preserving:

- **Flow A/B/C/D ordering.** The early checks read `request.user` (fast path, possibly
  stale); the actual decision reads the `select_for_update` row. That is intentional —
  the locked read is the authoritative one.
- **Flow F and `metadata`.** `Account.metadata` is an `UntypedStripeObject`, **not a
  dict**, so calling `.get()` on it raises `"'get' is a dict method, but a StripeObject is
  not a dict"`. That turned the unmatched-account case into a 500/retry loop in live
  testing. It is now `getattr(account.metadata, "app_user_id", None)` at `handlers.py:33`.

---

## 10. Configuration

Settings, all `os.environ[...]` with no defaults (`core/settings.py:35-41`):

```
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET            # platform endpoint signing secret
STRIPE_CONNECT_WEBHOOK_SECRET    # reserved; endpoint not built (see §1.1)
FRONTEND_URL                     # refresh_url / return_url base
```

Only `sk_test_` keys belong in `.env`. No secret values appear in this document.

### 10.1 Dashboard event destination

| Setting | Value |
|---|---|
| Endpoint | `https://<host>/webhooks/stripe/platform/` |
| Scope | **Your account** |
| Payload style | **Thin** |
| Events | the five in §8 |

> **Scope is the counter-intuitive one.** `v2.core.account.*` events describe *connected*
> accounts but are delivered under the **Your account** scope, not "Connected accounts".
> Per Stripe's docs: *"For events triggered by connected accounts, v2 Events use the Your
> account scope, while v1 Events use the Connected accounts scope."*

Putting the signing secret in the wrong variable produces a 400 that reads exactly like a
code bug. Check this first when signature verification fails.

---

## 11. Verification status

**Verified** (signed synthetic events via the Django test client, plus one live account):

- ping → 200, row written with `stripe_account_id` **NULL**
- replayed `evt_` id → 200, still exactly one row
- tampered signature → 400, no row
- missing `Stripe-Signature` header entirely → 400
- v1 snapshot body posted to the thin endpoint → 200
- unhandled event type → 200 with `processed_at` stamped
- live `capability_status_updated` against a sandbox account → wrote
  `card_payments_status = "restricted"`, `can_sell = False` (this is what validated the
  `include=` handling end to end)
- event for an unmatched account → 200, no `error`

**Not yet exercised:**

- `POST /billing/onboarding/` with a real Clerk bearer token
- `account_link.returned` — notable because it is the one type whose account-id path
  differs (§3b), so it has never been run against real Stripe output
- `account.closed`

> `stripe trigger` has **no v2 account fixtures** — only the v1 `account.updated`. Real
> API writes are the only way to drive v2 account events, which is why the three above
> remain outstanding.

Observed vs predicted: the initial status after account creation was **`restricted`**, not
the `pending` originally assumed.

---

## 12. Known gaps

### Gap 1 — `unsupported` is overloaded, and it can lock a seller out *(highest priority)*

Two independent writers mean different things by the same value:

- `handlers.py:92` writes `unsupported` as a **local invention** meaning "account closed".
- `handlers.py:67` writes **whatever Stripe reports**, which can legitimately be
  `unsupported` on an open, fixable account (§5.1).

`onboarding.py` then returns 409 for both. So a seller at `unsupported` + `provide_info`
— open account, recoverable — is permanently locked out with *"This Stripe account is
closed"* and can never obtain a link to fix it.

**Fix:** stop overloading the status. Add `stripe_account_closed = BooleanField(default=False)`
on `AppUser`, set it from the real signal `Account.closed` (`_account.py:4392`), gate the
409 on that boolean, and let `card_payments_status` remain a faithful mirror of Stripe —
`unsupported` then becomes just another not-yet-active value that still gets an
`account_update` link.

### Gap 2 — adoption can silently drop a status write

If the Flow F webhook's adoption `UPDATE` blocks on the row lock Flow A holds, then by the
time it runs `stripe_account_id` is already set, so
`filter(pk=..., stripe_account_id__isnull=True)` matches zero rows, `_adopt_by_metadata`
returns `None`, and the status write is discarded — while the event is still recorded as
successfully processed. Self-heals on the next event, but silently.

**Fix:** on a zero-row update, re-check whether that user already holds *this* account id
and proceed if so, instead of bailing.

### Gap 3 — no retry sweeper

`StripeEvent.error` is written but never read, and `idx_stripe_event_unprocessed` exists
for a sweeper that does not exist. Once Stripe exhausts its own retries, failures
accumulate invisibly. This is the natural next ticket.

### Gap 4 — the Connect endpoint

Required before any payment work. See §1.1.

### Smaller

- `Plan.stripe_price_id` (`products/models.py:72`) lacks `unique=True`; STRIPE.md §3
  specifies the constraint but no migration enforces it.
- Plans created before onboarding completes need a Stripe backfill — plausibly triggered
  by the capability event reaching `active`.
- `accounts/middleware.py:48-49` assigns a possibly-`None` `create_clerk_user()` result
  straight to `request.user`.
- `accounts/middleware.py:14` has a dead `or request.path.startswith('/webhooks/clerk')`
  clause, fully subsumed by the preceding check.
- `__pycache__/*.pyc` files are tracked in git.
