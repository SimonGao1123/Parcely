# Catalog sync + Connect webhook — implementation notes

Covers pushing the catalog to Stripe (`products/stripe_catalog.py`) and the
Connect-scoped webhook endpoint. Both shipped 2026-09-16.

`STRIPE.md` was revised on 2026-09-20 and now agrees with this file. It carries the
design rationale; this one carries the implementation detail and the open-gap list
in §8.

---

## 1. Model changes

### `products/models.py` — `Plan.Meta.constraints`

Two partial unique constraints, migration
`products/migrations/0004_plan_uniq_plan_stripe_price_id_and_more.py` (applied).

```python
UniqueConstraint(fields=["stripe_price_id"],
                 condition=Q(stripe_price_id__isnull=False),
                 name="uniq_plan_stripe_price_id")
UniqueConstraint(fields=["stripe_product_id"],
                 condition=Q(stripe_product_id__isnull=False),
                 name="uniq_plan_stripe_product_id")
```

**Partial** because both columns are null until the plan is pushed, and a plain unique
index would make the nulls collide on some backends and not others. `STRIPE.md` §6 asks
only for the price constraint; the product one is added because the mapping is 1:1 by
construction (each `Plan` gets its own Stripe Product), so two rows sharing a `prod_`
means a resync bug — and without the constraint those two plans would silently overwrite
each other's name on every product rename.

The columns themselves (`products/models.py:71-72`) already existed from migration `0003`.
Nothing wrote them before this work, which is what made every plan unsellable.

**No new tables.** `Order` / `Payment` / `Subscription` are still absent and deliberately
out of scope — see §6.

---

## 2. Services — `products/stripe_catalog.py` (new)

The only module that talks to Stripe about the catalog. Reuses `billing.connect._client`,
the single client in the process.

**Deliberately not in `Plan.save()`.** Both `Product.save()` and `Plan.save()` call
`full_clean()`, so a network call placed there would fire on every implicit save and on
cascade deletes. `billing/views/onboarding.py` already set the convention that Stripe
calls happen in the view.

### Mapping (`STRIPE.md` §2)

| Local | Stripe |
|---|---|
| `Plan` | one Product **plus** one Price |
| `Product` | never pushed — grouping/display metadata only |
| `Plan.title` | folded into the Stripe Product name: `"Coffee — Small"` |
| `StoreFront.currency` | `price.currency` |
| `Product.is_subscription` | presence of `price.recurring` |
| `Plan.trial_period_days` | **not** on the Price — passed at Checkout Session creation, see below |
| `Product.display_image` | **omitted**, see §7.1 |

The obvious mapping (Product→Product, Plan→Price) was rejected: the Price name is never
rendered on a receipt and `nickname` is dashboard-internal, so two plans under one product
would produce indistinguishable receipts.

`recurring` takes `interval` (required, `day`/`week`/`month`/`year` — identical to our
`BillingInterval` choices) and `interval_count` (optional). Two notes, both verified
against `stripe==15.6.1`'s `PriceCreateParamsRecurring`:

- **`recurring.trial_period_days` does exist**, contrary to an earlier comment here. It is
  still left unset, but for a different reason than "it isn't a field": it applies only to
  subscriptions created with the legacy `trial_from_plan=true`. Setting it on the Price
  would look correct and silently do nothing. Checkout passes
  `subscription_data.trial_period_days` instead.
- **`interval_count` has a Stripe ceiling** of 3 years / 36 months / 156 weeks. `Plan`
  validates only `MinValueValidator(1)` — see §8.13.

### Public surface

| Function | Behaviour |
|---|---|
| `create_plan_objects(plan)` | `products.create` then `prices.create`, assigns both ids, **does not save** — the caller owns the transaction |
| `update_plan_product(plan)` | plain update; the Stripe Product is mutable |
| `replace_plan_price(plan)` | create new Price, repoint, then archive the old one |
| `archive_plan_objects(account_id, prod_id, price_id)` | takes ids, not a `Plan`, because the row is usually already deleted |
| `resync_product(product)` | fan-out to every child plan's Stripe Product |
| `child_stripe_ids(product)` | read the children **before** a cascade delete |

### Load-bearing details

- **`_account_id()` raises `StripeAccountMissing` on a null `stripe_account_id`.** This is
  the cross-tenant guard. Passing `stripe_account=None` to Stripe does not error — it
  creates the object on the **platform** account, silently putting one seller's catalog in
  the shared one. `StoreFront.save()` gates on `can_sell` so this is near-impossible, but
  the column is nullable and the failure is invisible.
- **Price edits archive-and-recreate** (`STRIPE.md` §2.1). Stripe Prices are immutable.
  Archiving rather than deleting is what keeps existing subscribers billing at the amount
  they agreed to — which is also why `Order` and `Subscription` must snapshot
  `stripe_price_id` rather than reading through the FK.
- **Archive order is price first, then product.** Archiving the Product while its Price is
  still active leaves a window in which a checkout can start on a price about to be
  orphaned.
- **Archive, never delete.** Stripe refuses to delete objects that have been used, and an
  archived Price stays readable so old invoices still render.
- **`_price_idempotency_key(plan)`** = `plan.id` + the price-defining tuple. A retry after
  a failed `COMMIT` returns the Price Stripe already made instead of minting a second; a
  genuine price edit still gets a new one. (Product creation has no such key — see §6.2.)
- **`_metadata()`** writes `plan_id` / `product_id` / `storefront_id` onto both objects,
  mirroring the `app_user_id` already on connected accounts. This is the only handle on an
  object orphaned by a rollback, and the precondition for any future sweep script.
- **`child_stripe_ids()` exists because Django's cascade collector never calls
  `Plan.delete()`.** Deleting a `Product` drops the plan rows without giving any per-row
  hook a chance to read the ids, so they must be pulled into memory first.

---

## 3. Views — `products/views.py`

### Failure semantics

Stripe calls run **inside** `transaction.atomic()`, and a failure fails the request.

```python
class StripeUnavailable(APIException):   # 502
class SellerNotOnboarded(APIException):  # 409

@contextmanager
def stripe_guard():  # StripeAccountMissing -> 409, StripeError -> 502
```

The two failure directions are not symmetric:

- **DB commits, Stripe fails** → a `Plan` that renders as sellable with a null
  `stripe_price_id`. Silent, and the **buyer** discovers it at checkout.
- **Stripe succeeds, DB rolls back** → an orphan `prod_`/`price_` nothing references.
  Garbage, not corruption, invisible to buyers.

Prefer the orphan. This also matches `billing/views/onboarding.py`, which already calls
Stripe inside `atomic()` before writing the returned id.

Rejected: best-effort sync with lazy backfill at checkout. It moves a seller-fixable
failure onto the buyer at the moment money is involved, and adds two Stripe round trips to
the most latency-sensitive request in the system.

### Change detection

```python
def _snapshot(model, pk, fields):
    return model.objects.filter(pk=pk).values(*fields).first() or {}
```

Read **before** `serializer.save()`. DRF assigns onto `serializer.instance` in place, so a
read afterwards compares the new value to itself and every check comes back equal. An
`__init__`-based `_original_*` snapshot was rejected — it costs memory on every queryset
row, including the read paths that never sync.

### Hook points

| View | Stripe work |
|---|---|
| `ProductListCreateAPIView.perform_create` | **none** — the local Product is never pushed, and a new product has no plans |
| `ProductUpdateAPIView.perform_update` | `resync_product` **only if** `name`/`description`/`is_active` changed (`PRODUCT_SYNC_FIELDS`) |
| `ProductDeleteAPIView.perform_destroy` | `child_stripe_ids` → `instance.delete()` → archive each |
| `PlanCreateAPIView.perform_create` | `create_plan_objects` then `save(update_fields=[...])` |
| `PlanUpdateAPIView.perform_update` | `replace_plan_price` if `PRICE_FIELDS` changed, **elif** title changed → `update_plan_product` |
| `PlanDeleteAPIView.perform_destroy` | capture ids → delete → archive |

The product fan-out is gated because the Stripe Product name, description and active flag
all derive from the local `Product`; without the gate a PATCH of `max_capacity` or
`display_image_id` would cost one round trip per child plan.

The `elif` on plan update is intentional: a price change already rewrites the Price, and
the Product name only moves with `title`, so the two branches are mutually exclusive.

`PLAN_WRITE_SELECT_RELATED = ('product__storefront__owner',)` was added so resolving the
connected account id costs no extra query.

---

## 4. Serializers — `products/serializers.py`

`PlanSerializer` previously used `fields = '__all__'`. Replaced with an explicit list that
**omits `stripe_product_id` and `stripe_price_id` entirely**. Impact in §5.1.

`read_only_fields` could not fix this: under `'__all__'` the fields are still *rendered*,
and the leak was the larger half of the problem.

---

## 5. Webhooks — `billing/webhooks/views.py`, `billing/webhooks/account_lifecycle.py`, `core/urls.py`

New route `webhooks/stripe/connect/` next to the existing `webhooks/stripe/platform/`.

### Why a second endpoint at all

Not account scoping. `STRIPE_INIT_INTEGRATION.md` §1.2 establishes that one endpoint
already receives events for every connected account. The two real reasons:

1. **The signing secret differs**, and a route verifies against exactly one.
   `STRIPE_CONNECT_WEBHOOK_SECRET` was already required by `core/settings.py` and
   referenced nowhere — it was the placeholder for this.
2. **The event version differs.** Under direct charges, payment events fire on the
   connected account as **v1 snapshot events**, which `parse_event_notification` rejects.
   Hence `construct_event`.

A v1 Event carries a top-level `.account`, so `account_id=event.account` is a plain read —
no analogue to the per-type digging `handlers.account_id_for()` does for v2 thin events.

### `_record_and_dispatch(...)`

Extracted so the two views differ in exactly two expressions (the parse call and the
secret). Everything below the parse is the subtle part and must not drift:

- **Insert before dispatch.** Stripe reuses the `evt_` id across retries and dashboard
  resends, so the unique index is an idempotency gate *only because* it precedes the side
  effects. `IntegrityError` → `200`.
- **Handler exception** → record `error`, return `500` so Stripe retries.
- **No `transaction.atomic`, on purpose.** `ATOMIC_REQUESTS` is unset, so the `StripeEvent`
  row commits immediately and survives a handler exception — which is what lets a retry
  sweep find it. An outer transaction would roll the row back together with the handler and
  reduce the unique constraint from an idempotency gate to decoration.
- **`ValueError` → `200`.** A retry replays identical bytes and fails identically, so a
  non-2xx would only buy a multi-day backoff on the whole endpoint.

### The Connect registry — separate, and empty *at the time of this step*

Separate from the platform registry because those keys are v2 type strings; one shared
namespace invites reading v1 `account.updated` as `v2.core.account.*` — two payload shapes
behind names differing by a prefix. That separation still holds, and is now expressed as
two modules rather than two dicts in one file.

It was left **empty** at this step because fulfilment needs `Order` / `Payment` /
`Subscription`, which did not exist yet. An unhandled type falls through to being recorded
with `processed_at` set, so the endpoint was **observe-only** on purpose: it captured real
payloads, which is what made those models designable against observed data instead of
guessed shapes.

> **Superseded 2026-09-24.** The registry now holds nine handlers in
> `billing/webhooks/fulfilment.py`, and the module layout moved —
> `billing/handlers.py` → `billing/webhooks/account_lifecycle.py`,
> `billing/views/stripeWebhooks.py` → `billing/webhooks/views.py`.
> `STRIPE.md` §5 is authoritative for the current shape.

`evt_` ids are globally unique across both endpoints, so one unique index serves both.

---

## 6. Management command — `products/management/commands/sync_stripe_catalog.py`

Backfills plans created before the sync existed. `--dry-run` currently reports **3 pending:
18, 19, 21**.

Not a data migration: migrations should not make network calls, and this needs to survive
partial failure and stay re-runnable. Each plan gets its **own** `transaction.atomic()` so
one seller's Stripe outage does not roll back the plans already pushed.

Counts `skipped` separately from `failed` — a seller who never finished onboarding is not
an error, but the plan stays unsellable until they do.

---

## 7. Vulnerabilities fixed

### 7.1 `PlanSerializer` made Stripe ids writable and public *(money bug)*

`fields = '__all__'` meant `stripe_price_id` was accepted on plan create and update. A
seller could point a plan at any Price on their account while leaving `price_cents`
untouched. The cart totals `price_cents` (`cart/serializers.py:57`) but a Checkout Session
builds `line_items` from `stripe_price_id` — **the buyer would be charged an amount
different from the one displayed**, with the receipt matching the charge, not the cart.

It was also a read leak: `ProductSummarySerializer` nests `PlanSerializer` into page
blocks and `store/views/page.py:31` is `AllowAny`, so both ids were served unauthenticated
to anyone loading a public storefront.

**Fixed** by an explicit field list omitting both columns.

### 7.2 A null `stripe_account_id` would write to the platform account

Stripe treats an absent `stripe_account` as "use the platform account" rather than an
error. Without the guard, a seller whose onboarding had not written the column would have
had their catalog created in the shared platform account — cross-tenant data placement
that no error surfaces. **Fixed** by `_account_id()` raising `StripeAccountMissing` → 409.

### 7.3 No uniqueness on `stripe_price_id`

`STRIPE.md` §6 requires it; there was no constraint. Two plans sharing a `price_` means
fulfilment cannot resolve an incoming `invoice.paid` to one plan. **Fixed** by the partial
constraints in §1.

### 7.4 Every existing plan was silently unsellable

Nothing wrote the id columns, so `line_items` could not be built for any plan while the UI
rendered all of them as buyable. **Fixed** by the sync plus the backfill command — though
see §8.6, the *signal* is still missing.

---

## 8. Vulnerabilities and gaps still present

### 8.1 `StoreFront.currency` is a price-defining field on a different model *(unguarded, money)*

`price.currency` is baked in at Price creation, and currency is immutable on a Stripe
Price. Nothing in the storefront-update path notices, so editing `StoreFront.currency`
leaves every descendant Price denominated in the **old** currency while the cart renders
totals labelled with the new one. The buyer is charged in a currency they were not shown.

Fix is either forbidding the edit once any descendant plan has a `stripe_price_id`, or
fanning out storefront-wide. **Undecided — the highest-value item left.**

### 8.2 Commit window: Product creation has no idempotency key

`_price_idempotency_key` covers `prices.create`, but `products.create` in
`create_plan_objects` is sent without one. If the transaction fails to commit *after*
Stripe responded, the seller's retry mints a **second** Stripe Product. Harmless to
buyers (orphans are inert and identifiable by `metadata.plan_id`) but it accumulates, and
there is no sweep script.

### 8.3 Partial archive on a failed delete leaves an inactive Price on a live Plan

In `perform_destroy` the row is deleted first and the Stripe calls follow. If
`prices.update(active=False)` succeeds and `products.update` then fails, `stripe_guard`
rolls the delete back — restoring a `Plan` row that renders as sellable but points at an
**archived** Price. Checkout then fails for the buyer. Narrow, but it is the one path where
the rollback does not actually restore consistency.

### 8.4 A deleted `Plan` does not stop existing subscriptions

Archiving a Stripe Price has no effect on subscriptions already billing against it, so a
later `invoice.paid` will carry a `price_` that resolves to no local row. The fix is not a
soft-delete column — **`Subscription.plan` must be `on_delete=PROTECT`** when that model
lands, turning the delete into a 409. **Done** — see `STRIPE.md` §6.

### ~~8.5 Payment events are recorded but never fulfilled~~ — closed 2026-09-24

Was: the Connect registry was empty by design, so a completed payment produced a
`StripeEvent` row and **no `Order`**.

Now: nine handlers in `billing/webhooks/fulfilment.py` write `Payment`, `Order` and
`Subscription`, clear the cart and release capacity reservations. See `STRIPE.md` §5.

Still open underneath it: **nothing reads those rows back.** `billing/` has no
`serializers.py`, so a buyer still cannot see what they bought — the record exists, the
endpoint does not.

### 8.6 No "not sellable" signal in the API

Now that `PlanSerializer` omits both id columns (correctly), nothing tells the frontend a
plan was never synced. A plan skipped by the backfill because the seller is not onboarded
looks identical to a healthy one. A derived read-only boolean would close this without
re-exposing the ids.

### 8.7 `StripeEvent.payload` accumulates buyer PII

The full verified body is stored as JSON — email, billing address, card last4 — unencrypted
and readable from Django admin. No retention policy, no redaction. This gets materially
worse if the Connect endpoint is subscribed to `*` in the dashboard (see §9), which would
funnel every `charge.*`, `payout.*`, `balance.*` and `radar.*` event into an unbounded
JSONField.

### 8.8 Concurrent price edits can leave an extra active Price

`perform_update` does not lock the row. Two simultaneous PATCHes each create a Price and
each archive what they read as the old one; last writer wins the FK and the loser's Price
stays **active** and unreferenced. Requires a `select_for_update()` to close.

### 8.9 Long transactions across N network calls

Product update and product delete hold a transaction open across one Stripe round trip per
child plan. Fine at current catalog sizes; this is the specific line that, when crossed,
justifies a job queue.

### 8.10 Empty string vs null on the id columns

The constraints are conditioned on `isnull=False`, so two rows holding `""` would collide
and raise `IntegrityError` on save. Nothing writes `""` today — `stripe_catalog` always
writes a real id, and the serializer no longer accepts the field — but the backfill command
filters for it defensively, which implies the state is considered reachable.

### 8.11 Draft storefronts sync

Products under `is_draft=True` storefronts push to Stripe like any other, so Stripe holds
catalog for stores that were never published. Harmless, noisy.

### 8.12 Platform events delivered to the Connect endpoint record a null account

`event.account` is `None` for a platform-level v1 event. It is recorded rather than
rejected. Not exploitable — the signature still had to verify against the Connect secret —
but the row is unattributable.

### 8.13 `billing_interval_count` has no upper bound locally

Stripe caps a recurring interval at 3 years (36 months, 156 weeks); `Plan` validates only
`MinValueValidator(1)`. A seller entering `interval=month, interval_count=99` passes
`full_clean()` and is rejected by Stripe, which — thanks to the fail-the-request semantics
— rolls back cleanly and leaves no bad state. So this is a **UX** gap, not a correctness
one: the seller gets a generic 502 "Stripe rejected the catalog change" instead of being
told the number is too large. A `MaxValueValidator` per interval unit would move the error
to the form field where it belongs. None of the three existing plans are affected.

---

## 8b. Step-8 models — superseded

The `Order` / `Payment` / `Subscription` decisions drafted here on 2026-09-19 were
revised during implementation (2026-09-20) and the models have shipped. Four of
them are now wrong and were removed rather than left to mislead:

- `Payment` has no `subscription` FK — the link is `Payment → Order → Subscription`.
- `Order` covers subscription lines too, so the reconciliation formula is a plain
  `sum(unit_price_cents × quantity) == payment.amount_cents`.
- `Subscription` maps to a Stripe **SubscriptionItem**, not a Subscription, because
  one Checkout Session creates at most one `sub_` holding N items.
- The Connect event list changed: `payment_intent.*` and `payment_method.attached`
  are out, `customer.subscription.created` is in.

**`STRIPE.md` §1, §3, §5.1 and §6 now describe the shipped models and the event
subscriptions.** It was revised on 2026-09-20 and no longer disagrees with this file.

Of the two gaps flagged from that draft, one has since closed:

- ~~**`max_capacity` can oversell.**~~ Closed 2026-09-24. `SubscriptionCheckout`
  reserves the slot when the session is created, under a `select_for_update` on the
  `Product` row, and `billing/capacity.py` counts reservations alongside live
  subscribers. The reservation's 30-minute TTL matches the session's `expires_at`,
  and the release happens in the same transaction as the `Subscription` write.
  `STRIPE.md` §3.4 explains why locking alone was not sufficient.
- **Refunds have no local model.** Still open. `charge.refunded` and
  `charge.dispute.created` have nowhere to write, so subscribing to them now would
  only accumulate unhandled `StripeEvent` rows.

---

## 9. Manual follow-ups (not code)

1. **Run `manage.py sync_stripe_catalog`** against real Stripe to backfill plans 18, 19, 21.
   Until then those three are unbuyable.
2. **Subscribe the Connect endpoint in the Stripe dashboard to an explicit event list, not
   `*`** — `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `payment_method.attached`. See §8.7 for why the wildcard is not neutral.

---

## 10. Verification performed

No test suite exists (every `tests.py` is an empty placeholder), so both features were
verified with ad-hoc scripts run under `parcely-backend/.venv/bin/python`.

- **Catalog — 40/40.** Stripe call parameters, the change-detection gates, archive
  ordering, rollback on `StripeError`, serializer field list, and both constraints, using a
  fake Stripe client and `transaction.set_rollback(True)`. Leftover rows after rollback: 0.
- **Webhook — 17/17.** Signature verification, idempotent replay of the same `evt_`,
  rejection of a body signed with the *other* endpoint's secret, malformed-payload
  absorption, `405` on GET, cross-endpoint isolation, and the empty registry falling
  through to `processed_at`. Cleanup verified: leftover 0.
- `manage.py check` clean; `makemigrations --check --dry-run` → "No changes detected".

The **live** paths — a real Stripe connected account, `stripe listen
--forward-connect-to`, and an actual test payment — have **not** been exercised. Every
Stripe interaction above was against a fake client.
