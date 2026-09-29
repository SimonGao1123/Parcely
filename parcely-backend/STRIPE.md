# Stripe Integration

What exists today and why it is shaped this way. Design that has not been built is
out of scope here — where a decision is settled but unwritten, it is marked.

```
BUILT                                      NOT BUILT
─────────────────────────────────          ──────────────────────────────
Connect onboarding (Accounts v2)           Read endpoints (no serializers.py)
Platform webhook  (v2 thin events)         Success-page session lookup
Connect webhook   (v1, fulfilling)         Subscription cancellation
Catalog sync      (Plan → prod_ + price_)  Frontend checkout (no is_subscription
Email OTP + buyer session token              branch — add-to-cart 400s on plans)
Checkout endpoints (cart + subscription)   Customer Portal / manage purchases
Fulfilment handlers (9 events)             Real email backend (console only)
Capacity reservation (SubscriptionCheckout) Platform revenue (no application fee)
Payment / Subscription / Order models      Tax, refunds, disputes
```

Nothing below has been exercised against live Stripe test mode end to end. The
handlers are verified by construction and against synthetic payloads; scenarios
1–4 and 9–10 of the fulfilment plan remain unrun.

Companion docs carry the implementation detail and the open-gap lists:

- **`STRIPE_INIT_INTEGRATION.md`** — onboarding, the platform endpoint, v2 thin
  event shapes, account statuses. Authoritative for anything account-lifecycle.
- **`STRIPE_CATALOG_SYNC.md`** — `products/stripe_catalog.py`, the Connect
  endpoint's origins, and the numbered list of known vulnerabilities still open.

---

## Core assumptions

1. **Stripe Connect with Accounts v2.** Sellers are connected accounts created via
   `POST /v2/core/accounts`. The v1 `type: "express" | "standard" | "custom"`
   model is deprecated and Stripe errors on it for new integrations.
2. **The seller is an `AppUser`, not a `StoreFront`.** A seller is a legal entity
   that gets paid; one person running three storefronts is one connected account.
3. **Direct charges.** The seller is merchant of record, and is therefore liable
   for disputes and refunds. The buyer's statement shows the seller's descriptor.
4. **Every buyer verifies their email.** One-time purchases included. There is no
   unverified purchase path.
5. **A Clerk account is optional.** Login is not required to buy. It only links
   existing `Customer` rows to an `AppUser`.

### Connected account configuration — one-way door

```
dashboard                                    "full"
defaults.responsibilities.fees_collector     "stripe"
defaults.responsibilities.losses_collector   "stripe"
configuration.merchant.capabilities          card_payments
```

`defaults.responsibilities` **cannot be changed after the merchant configuration
is applied.** Changing it means re-onboarding every seller.

`full` rather than `express` for two reasons. Parcely is an e-commerce enabler —
sellers run their own stores and own their buyers — which is the SaaS shape, not
the marketplace shape. And `express` combined with `losses_collector: "stripe"`
is rejected by the API outright.

Selling is gated on `configuration.merchant.capabilities.card_payments.status ==
"active"`, mirrored locally as `AppUser.card_payments_status`. `charges_enabled`
and `payouts_enabled` are deprecated v1 fields and are not read.

---

## 1. Two object graphs

There is a local graph and a Stripe graph, and they are not the same shape. The
mapping between them is the whole integration.

### 1.1 Local models

Relationships only — field lists live in `models.py` and drift if duplicated.

```
CATALOG                                  IDENTITY
StoreFront ──► Product ──► Plan          AppUser ──► Customer
 (currency)   (is_subscription,           (seller)    (verified email;
               max_capacity)                           cus_ minted lazily)
                                              │ owner
CART — one-time lines ONLY                    ▼
Cart ──► CartItem ──► Plan                StoreFront
         CartItem.clean() refuses a plan whose product is_subscription

IN FLIGHT
SubscriptionCheckout ──► Customer, Plan   a buyer on Stripe's page holding a
                                          capacity slot; expires_at IS the release

MONEY — written by webhooks only, after the money has moved
                                              cardinalities
    Payment ◄──── Order ────► Plan            1 Payment : N Order
   (money only,     │                         1 Order   : 0–1 Subscription
    no status)      └──► Subscription ──► Plan
                         (maps to si_,        1 Subscription : N Order
                          not sub_)             one per billed period

    Customer is a direct FK on all four, so "this buyer's history"
    is one indexed read rather than a join through Payment.

INFRASTRUCTURE
StripeEvent  webhook idempotency (stripe_event_id UNIQUE)
EmailVerification  issues the OTP; the view returns a signed header
                   token on success, not a session cookie (§4)
```

Four things in that diagram are load-bearing and easy to misread:

- **`Order` is one billed line on one `Payment`**, not one shopping action. It
  covers one-time lines and subscription lines alike, so a renewal is a `Payment`
  carrying a single `Order`. Because every line has a row,
  `sum(unit_price_cents × quantity) == payment.amount_cents` holds for every
  payment with no special case — including a $0 trial period, which is recorded
  rather than inferred from an amount of zero.
- **`Payment` has no `status`.** Rows exist only for money that moved. A failed
  renewal would need a row carrying the same `stripe_invoice_id` as the retry that
  later succeeds, colliding with the unique index. Failures stay legible through
  `StripeEvent` and `Subscription.status`.
- **`Subscription` maps to a Stripe `SubscriptionItem` (`si_`)**, not a
  `Subscription` (`sub_`). See §3.3.
- **`SubscriptionCheckout` is not money.** It is a lease on a capacity slot,
  CASCADE on both FKs where the money graph is PROTECT, and it is deleted the
  moment the subscription it was holding a seat for is written.

### 1.2 Stripe-side objects

Everything below the `Account` line lives **inside one connected account**. Two
sellers means two disjoint copies of this tree. One seller's three storefronts
share a single tree.

```
Account (acct_...)                       ← one per SELLER (AppUser)
│
├── Product (prod_...)                   ← one per PLAN, pushed by us
│     └── Price (price_...)  IMMUTABLE   ← one per plan revision
│
├── Customer (cus_...)                   ← one per (seller, verified email)
│     │
│     ├── PaymentMethod (pm_...)         ← saved card
│     │
│     ├── Subscription (sub_...)         ← at most ONE per Checkout Session
│     │     └── SubscriptionItem (si_...) ──► Price
│     │           ↑ N possible per sub_; today always 1. This is the level
│     │             we mirror. See §3.3.
│     │
│     └── Invoice (in_...)               ← generated per cycle by Stripe
│           └── PaymentIntent (pi_...)
│                 └── Charge (ch_...)
│                       ├── Refund (re_...)
│                       └── Dispute (dp_...)
│
└── CheckoutSession (cs_...)             ← how every purchase starts
      └── PaymentIntent (pi_...)
            └── Charge (ch_...)
```

The chain matters because each link is a different state machine:

```
Subscription (sub_)   the agreement — a schedule, holds no money
Invoice (in_)         the bill — line items, what is owed
PaymentIntent (pi_)   the attempt — 3DS, retries
Charge (ch_)          the movement — refunds and disputes attach here
```

One-time payments skip the top two entirely; Stripe creates no invoice for a
`mode: "payment"` session. And **a trialing subscription's first invoice is $0,
marked `paid`, and has no PaymentIntent at all** — a handler that assumes
`invoice.payments` is populated crashes on every trial signup.
`_invoice_payment_intent()` in `billing/webhooks/fulfilment.py` returns `None`
there by design.

Three structural facts that drive the rest of this document:

- **`Customer` and `PaymentMethod` are scoped to a single account.** A card saved
  with seller A is not usable with seller B. The same human buying from two
  sellers is genuinely two `cus_...` objects, and **Stripe has no merge API.**
- **`Price` is immutable.** Editing a price means creating a new `Price` and
  archiving the old one. Existing subscribers keep billing on the old one.
- **Invoices and Checkout render the Product name, never the Price.** This is the
  entire reason for the mapping in §2.

### SDK note — fields removed in `stripe==15.6.1`

Anything written against older examples will break. Verified against the
installed package, not the docs:

```
invoice.subscription     GONE → invoice.parent.subscription_details.subscription
invoice.charge           GONE
invoice.payment_intent   GONE → invoice.payments.data[0].payment.payment_intent
```

`current_period_end` likewise moved off `Subscription` onto `SubscriptionItem`.

Two more that cost real debugging time:

- **`Session.line_items` is `Optional` and absent from the webhook payload.** It
  must be fetched: `_client.v1.checkout.sessions.line_items.list(...)`. There is
  no `list_line_items` method on the service — it is the `line_items` sub-service.
- **`metadata` is a `StripeObject`, not a dict.** `.get()` raises on it. Use
  `getattr(obj.metadata, key, None)`; `_meta()` wraps this.

---

## 2. Catalog: `Plan` → Stripe `Product` + `Price`

| Local model | Stripe object | ID field | Source of truth |
|---|---|---|---|
| `AppUser` (seller) | `Account` v2 | `stripe_account_id` | Stripe |
| `Product` | — | — | local only |
| `Plan` | `Product` + `Price` | `stripe_product_id`, `stripe_price_id` | **us** (push) |
| `Customer` | `Customer` | `stripe_customer_id` | **us** (push, lazy) |
| `Subscription` | **`SubscriptionItem`** | `stripe_subscription_item_id` | Stripe (webhook) |
| `Payment` | `CheckoutSession` / `Invoice` / `PaymentIntent` | three nullable columns | Stripe (webhook) |
| `Order` | invoice or session **line item** | `stripe_price_id` snapshot | Stripe (webhook) |
| `SubscriptionCheckout` | `CheckoutSession` | `stripe_checkout_session_id` | **us** (local lease) |
| `StripeEvent` | `Event` | `stripe_event_id` | Stripe |

Rule of thumb: **catalog flows out, money flows in.** We own Product/Price/Customer
and push changes to Stripe. Stripe owns anything with a payment state, and we only
learn about it through webhooks — never by trusting a browser callback.

Each **`Plan`** becomes its own Stripe Product paired with one Price. The Parcely
`Product` is never pushed; it stays local as grouping and display metadata.

```
Parcely                    Stripe                          Buyer's receipt
─────────────────          ────────────────────────        ────────────────────
Product "Coffee"    ──►    (not synced)
  Plan Small $15    ──►    Product "Coffee — Small"  ──►   Coffee — Small   $15
                             + Price $15/mo
  Plan Large $25    ──►    Product "Coffee — Large"  ──►   Coffee — Large   $25
```

The obvious alternative — Parcely `Product` → Stripe `Product`, `Plan` → `Price` —
is functionally correct but makes every receipt line read `Coffee`, because **the
Price name is never displayed** and `Price.nickname` is dashboard-internal. Two
plans under one product would produce indistinguishable receipts and no per-plan
revenue breakdown in the seller's dashboard. Both options cost two ID columns; this
one just puts them on `Plan`.

Currency comes from the **storefront**, not the plan. Stripe rejects
mixed-currency invoices, so that centralization is load-bearing, not cosmetic.

`is_subscription` has no Stripe counterpart. `max_capacity` has none either —
**Stripe will happily oversell** — so the seat check is enforced entirely locally,
inside the checkout transaction and before Stripe is called. See §3.4.

**`product.display_image` is deliberately not pushed** as `images[0]`. Blob URLs
are presigned S3 links that expire in 50 minutes, which would rot silently on old
receipts. Full mapping tables live in `STRIPE_CATALOG_SYNC.md` §2.

### 2.1 Price immutability — why rows snapshot

```
Plan.price_cents 1000 ──► 1200
    │
    ├─ create NEW  price_...B  (unit_amount 1200, same prod_...)
    ├─ archive OLD price_...A  (active = false)
    └─ Plan.stripe_price_id = price_...B

    existing Subscriptions keep billing on price_...A  ← intentional
    new checkouts use price_...B
```

This is why `Order` and `Subscription` snapshot **both** `unit_price_cents` and
`stripe_price_id`, and why `Order` snapshots the name. Reading any of it through
the `Plan` FK would render last month's purchase at today's price and today's
name. The Stripe **Product** is mutable, so name edits are plain updates — which
is exactly the drift the snapshot guards against.

It is also why plan resolution during fulfilment has a second tier. A renewal
billed against the archived `price_...A` no longer matches `Plan.stripe_price_id`.
`products/stripe_catalog.py` stamps `plan_id` into every Price's metadata, and
archiving preserves metadata, so `_plan_by_metadata()` still resolves it. See §5.4.

---

## 3. Checkout

Every purchase goes through a **Checkout Session** created on the seller's
connected account — not the Payment Element. Raw PaymentIntents are reserved for
off-session charges.

Never pass `payment_method_types`. Omitting it enables dynamic payment methods,
which Stripe selects and ranks per buyer; hardcoding `["card"]` silently disables
everything else.

### 3.1 Two endpoints, and why they are not one

```
POST storefronts/<slug>/checkout/session/        the cart    → mode: "payment"
POST storefronts/<slug>/checkout/subscription/   one plan    → mode: "subscription"
```

**Subscriptions never enter the cart.** `CartItem.clean()` refuses any plan whose
product is `is_subscription`, so a cart is by construction a bag of one-time lines
and the cart endpoint is unconditionally `mode: "payment"`.

The split is not stylistic. Folded into one endpoint, a single recurring item in a
five-item cart drags the whole cart into `mode: "subscription"` and puts the other
four lines on the first invoice — different tax treatment, different refund path,
and a `Payment` that arrives as `in_` instead of `cs_`. Keeping them apart also
means the cart path has no capacity check, no trial and no reservation, because
**the subscription endpoint is the only one that can oversell anything.**

Both share `_BuyerCheckoutAPIView`, which resolves the storefront, re-reads the
`Customer` scoped to that storefront's owner (never trusting the token payload),
and refuses a seller whose `can_sell` is false.

### 3.2 One session, one Payment

A cart is always single-storefront, so it never spans two connected accounts.

```
mode: "payment"        the cart, one-time lines only
    100 line items max
    no invoice created → Payment carries cs_ (and pi_), never in_
    written by checkout.session.completed

mode: "subscription"   exactly one plan today (see 3.3)
    20 recurring + 20 one-time line items max
    one-time lines would ride the FIRST INVOICE ONLY
    → Payment carries in_ (+ pi_, unless the invoice is $0)
    written by invoice.paid — NOT by checkout.session.completed
```

`cs_` and `in_` therefore never appear together on one `Payment` row: a
subscription-mode payment is written from `invoice.paid`, and an Invoice does not
name the session that started it.

`pi_` is stored on the payment-mode row even though `cs_` already identifies it,
because **a refund or dispute names the PaymentIntent, never the session.**

### 3.3 Why `Subscription` maps to `si_`

**A Checkout Session creates at most one Stripe Subscription.** N recurring items
do not produce N `sub_` objects — Stripe merges them into one `sub_` with N
`SubscriptionItem`s. That is Stripe's behaviour, not a choice.

Today the subscription endpoint accepts exactly one plan, so every `sub_` has
exactly one `si_`. The `si_` mapping is still the right key, for two reasons that
do not depend on multi-item carts:

```
cart: Plan A monthly, Plan B monthly, Plan C yearly   ← hypothetical
   └─► ONE sub_ ──┬── si_1 ──► price_A     ┐ aligned periods →
                  ├── si_2 ──► price_B     ┘ one combined invoice
                  └── si_3 ──► price_C     ← diverges → its own invoice
```

First, a plan swap within one product replaces the `si_` while keeping the `sub_`,
so keying on `sub_` would collide on the `(customer, product)` live-uniqueness
constraint. Second, it costs nothing to be right now and would be a migration
later. `stripe_subscription_id` is stored but **deliberately not unique**, since
every item of one subscription shares it.

Mixed intervals are supported under `billing_mode: flexible`, which is now the
Checkout default — an earlier draft of this document claimed otherwise. Stripe
emits a combined invoice when item periods align and separate invoices when they
diverge, so each divergent item reaches us as its own `invoice.paid` → its own
`Payment` → its own `Order`.

There is no `quantity` on `Subscription`: `CartItem.clean()` caps subscription
plans at 1, so the column would be the constant 1 on every row.

### 3.4 Capacity — the reservation, and why a lock is not enough

`billing/capacity.py`. `max_capacity` counts live subscribers **plus buyers
currently sitting on Stripe's hosted page**.

```
                  ┌── live_subscriber_count(product)   Subscription rows
consumed = sum ───┤
                  └── reserved_count(product)          SubscriptionCheckout rows
                                                       WHERE expires_at > now()
```

The risky window is not between two concurrent requests — it is between checkout
and payment. A slot is consumed when the webhook writes the `Subscription`, but
checked when the session is created, and a buyer can sit on Stripe's page for half
an hour. **Locking the `Product` row alone does nothing**: two transactions would
serialize, both read the same live count, both pass, because neither writes
anything the other could observe. So the reservation is the write, and the lock
guards it.

```
RESERVATION_TTL = 30 min   ─── must equal the session's expires_at.
                               Stripe's floor is 30 min; a longer local lease
                               would hold a slot after the session died.
```

Three details that are easy to get wrong:

- **Expiry is the entire release mechanism.** `reserved_count` filters on
  `expires_at > now()`, so a lapsed reservation stops counting by itself. Nothing
  sweeps the table.
- **A live claim is handed back untouched, never extended.** Its deadline is sent
  to Stripe under an idempotency key; pushing it forward on a double-click would
  change the parameters behind a key Stripe has already seen, and Stripe rejects
  the replay rather than returning the session it already made.
- **The buyer's own reservation is excluded from their own check**, or a
  `max_capacity=1` product would look full to the very person holding its last
  slot the moment they retried.

The release happens in the **same transaction** as the `Subscription` write.
Releasing separately opens a window where the slot is free and the row consuming
it is not yet committed — another buyer claims a seat already sold.

---

## 4. Buyer identity

The identity is a **verified email**. An `AppUser` is an optional link on top of
it. Verification is required for every purchase.

```
① BUY (no account)      email ──► 6-digit code ──► verified
                             └─ Customer(seller, user=NULL, email_verified_at)
                                stripe_customer_id stays NULL — cus_ is minted
                                lazily at Checkout Session time, to keep a
                                network call out of a lock-holding transaction

② LINK (optional, later) Clerk-verified email == Customer.email
                             └─ Customer.user = AppUser   ← plain FK set
                                NO Stripe merge needed; subscriptions, cards
                                and invoice history carry over untouched
```

Step ② is why the verification gate earns its friction. **Stripe has no API to
merge two `Customer` objects.** An unverified throwaway customer would leave a
buyer who later signs up holding two `cus_...` on one seller — split cards, split
invoice history, permanently. The claim query filters on `user__isnull=True`,
which makes it idempotent and stops a second account stealing a linked row.

**Never branch before verification.** Replying "no orders found" before the code
is checked turns the form into an oracle for who has bought from that storefront.
Always send, always verify, then render an empty page if there is nothing.

**No magic links.** A token in a URL leaks through access logs, `Referer` headers
and forwarded mail, and is consumed by corporate link scanners before the buyer
clicks. Losing an OTP email is never a lockout — a new code can be requested.

### 4.1 Buyer session — a signed header token, not a cookie

`accounts/buyer_session.py`. `django.core.signing` with a dedicated salt and a
60-minute max age. **No `BuyerSession` table.**

```
X-Buyer-Session: <signing.dumps({"customer_id", "seller_id"})>
```

Cookies were rejected: DRF here has no `SessionAuthentication`, so its views are
effectively csrf_exempt and a cookie credential would need CSRF plumbing,
`SameSite`/`Secure` config, and would still break on seller custom domains. The
cart app had already set the precedent with `X-Public-Cart-ID`. The frontend calls
Django server-side from Next, holding the token in an httpOnly cookie and
forwarding it as a header, so CORS never applies to it.

No table because the token's only power is creating a Checkout Session for its own
`Customer`, and the card is entered on Stripe's hosted page — so a stolen token
buys *for* the victim rather than from them.

The signature proves we minted the token, **not** that we minted it for this
seller, so `read_buyer_customer` matches `seller_id` against the `Customer` row
rather than trusting the payload. One seller's token cannot transact on another's
storefront.

**The token must never be accepted by a "manage purchases" flow** — cancelling a
subscription, swapping a card, reading invoices. Those are real privileges and
need a revocable credential or a fresh OTP. This is the single line that makes the
no-table choice safe.

**`EMAIL_BACKEND` is unset.** OTPs are logged to the console. A provider has to be
wired up before checkout can ship.

---

## 5. Webhooks

Two endpoints, because the **signing secret and the event version differ** — not
because one endpoint cannot serve many connected accounts. It can.

```
billing/webhooks/
    views.py               both endpoints — verify, record, dispatch
    account_lifecycle.py   platform registry (5) — writes AppUser
    fulfilment.py          connect registry  (9) — writes the money graph
```

```
/webhooks/stripe/platform/     v2 THIN events, platform secret
    parse_event_notification() — rejects v1 bodies
    thin events carry no top-level account;
    account_lifecycle.account_id_for() digs the acct_ out per event type
    └─ v2.core.account[configuration.merchant].capability_status_updated
       v2.core.account[requirements].updated
       v2.core.account_link.returned
       v2.core.account.closed          ──► AppUser.card_payments_status
       v2.core.event_destination.ping  ──► explicit no-op

/webhooks/stripe/connect/      v1 SNAPSHOT events, connect secret
    construct_event() — v1 events name the account directly on event.account
    9 handlers, listed in §5.2
```

The registries are deliberately **not** merged. v2 type strings look like
`v2.core.account.closed` and v1 ones like `account.updated`; one namespace holding
both invites reading a v1 event as its v2 near-namesake, and the payload shapes
are unrelated.

### 5.1 `_record_and_dispatch` and the retry path

Both endpoints share it. The `StripeEvent` row is inserted **before** dispatching,
so the unique index on `stripe_event_id` is an idempotency gate rather than
decoration. It is deliberately not wrapped in `transaction.atomic` — `ATOMIC_REQUESTS`
is unset, so the row commits immediately and survives a handler exception, which is
the whole point. An outer transaction would roll it back together with the failing
handler and lose the diagnostic.

**A redelivery re-dispatches unless the event actually finished.** This was a real
bug: the `except IntegrityError: return 200` arm answered 200 for every retry,
including retries of events whose handler had raised — so the retry that existed
to recover the failure discarded it instead, and a raising handler was a permanent
silent drop.

```
1st delivery   handler raises   → error set, processed_at NULL, 500
2nd delivery   IntegrityError   → processed_at is NULL → RE-DISPATCH → 200
3rd delivery   IntegrityError   → processed_at set     → 200, no re-run
```

This is why handlers must be idempotent, and why they must **return cleanly rather
than raise** for data that will never arrive (forged metadata, a deleted plan).
Raising now loops that event until Stripe gives up. Raising is reserved for faults
a retry can actually fix — a Stripe 5xx, a deadlock.

Malformed bodies return **200**, not 4xx. A retry replays identical bytes and
fails identically, so a non-2xx would only buy a multi-day backoff on the whole
endpoint.

### 5.2 The nine Connect events

Configured in the Stripe Dashboard; nothing in code registers them. `enabled_events`
**replaces** the array on update, so the full list must be passed.

```
checkout.session.completed          mode=payment      → Payment + Orders + clear cart
                                    mode=subscription → sync Subscription,
                                                        release reservation, NO Payment
checkout.session.async_payment_succeeded  same payment-mode path, deduped on cs_
checkout.session.async_payment_failed     nothing — log, leave the cart for a retry
checkout.session.expired                  delete the reservation, null the cart's cs_
invoice.paid                              Payment(in_, pi_) + one Order per line
invoice.payment_failed                    refetch + sync (→ past_due/unpaid). No Payment
customer.subscription.created             sync
customer.subscription.updated             sync
customer.subscription.deleted             status=canceled, ended_at. NEVER delete the row
```

`customer.subscription.deleted` must not delete: `Order.subscription` is PROTECT,
and the orders are the billing history.

`payment_intent.*` stays excluded. It carries no line items and so cannot build
`Order` rows — its only job was flipping `Payment.status`, which no longer exists —
and it arrives under a different `evt_`, so the `StripeEvent` index would not
dedupe it against the `checkout.session.*` event for the same money.

`customer.subscription.created` is needed because making subscription creation
depend on `invoice.paid` is a bet on the trial invoice, and a free trial goes
straight to `trialing`. It races `invoice.paid` for the same `si_`, which
`_sync_subscription`'s `update_or_create` on `stripe_subscription_item_id` makes
safe in either order.

`checkout.session.completed` fires in subscription mode too and **must not write a
Payment there** — that money arrives as `invoice.paid`, which is also the only
event carrying `si_`. Fulfilling on both would double-write.

### 5.3 Cross-tenant scoping — the real threat

A connected account can create Checkout Sessions **on its own account with
arbitrary metadata**, and those events arrive here correctly signed. Trusting
`metadata.customer_id` on its own would let one seller write a `Payment` against
another seller's `Customer`.

Every lookup is scoped to `event.account`, and `_customer_for` applies two
independent checks:

```
1. join Customer → seller__stripe_account_id == event.account
2. compare Customer.stripe_customer_id == the cus_ named on the event
```

Check 2 catches a seller naming a `Customer` that is genuinely theirs while the
Stripe customer on the event is not. A guard that fails logs a warning and
**returns** — never raises, per §5.1.

### 5.4 Ordering, resolution, and the one refetch

**Events arrive out of order.** `_sync_subscription` writes Stripe's current state
absolutely rather than applying a delta, which makes it order-independent: whichever
of `.created` / `.updated` / `invoice.paid` lands first produces the same rows, and
a late duplicate overwrites with identical values. Never derive state by
incrementing from the current row — write `current_period_end = <value from the
event>`, never `+= interval`.

`invoice.paid` can land before `customer.subscription.created`, and `Order` cannot
be written without its `Subscription` (PROTECT, plus `Order.clean()` requires the
plans to match). So: **if any line's `si_` has no local row, refetch the
subscription and sync it first.** The refetch is gated on that miss, so renewals —
the overwhelming majority — cost no extra call.

Plan resolution is three account-scoped tiers:

```
1. Plan.stripe_price_id == price_id
2. price.metadata.plan_id                    ← survives an archive-and-replace (§2.1)
3. invoice lines only: line.parent.subscription_item_details.subscription_item
                                             → the local Subscription's plan
```

All three failing means the plan is gone but the buyer has paid. **Write the
`Payment`, skip that `Order`, log an error.** `Order.plan` is non-nullable, so the
alternative is discarding the payment record entirely. This breaks
`sum(orders) == amount_cents` for that row, which is the correct alarm — the
reconciliation query *is* the detector.

**Amounts.** Checkout lines use `price.unit_amount × quantity` (exact). Invoice
lines use `line.amount // line.quantity`, because the invoice does not restate a
unit price — exact today, and the first discount or proration is what will make it
drift.

**Fulfilment happens on webhooks only.** The browser's success callback is not a
fulfilment signal — a buyer can close the tab before it fires, and it can be forged.

### 5.5 Idempotency raises `ValidationError`, not `IntegrityError`

`Payment`, `Subscription`, `Order` and `SubscriptionCheckout` all call
`full_clean()` in `save()`, and Django ≥4.1 runs `validate_constraints()` inside
`full_clean()`. So:

```
Payment.objects.create(...)        → ValidationError   (full_clean runs first)
Payment.objects.bulk_create([...]) → IntegrityError    (straight to Postgres)
```

`_record_and_dispatch` catches `IntegrityError` for the `StripeEvent` dedupe, which
still works because that row is written without `full_clean()`. Fulfilment handlers
use `get_or_create` on the Stripe id instead, which is index-backed and also gives
the `if not created: return` that makes `completed` → `async_payment_succeeded`
safe: distinct `evt_`s, same `cs_`, second one no-ops.

---

## 6. Constraints

```
AppUser:
  stripe_account_id UNIQUE WHERE NOT NULL

Plan:
  UNIQUE (product, billing_interval, billing_interval_count, price_cents)
  stripe_price_id   UNIQUE WHERE NOT NULL
  stripe_product_id UNIQUE WHERE NOT NULL   ← 1:1 by construction; catches a
                                              resync bug before two plans start
                                              overwriting each other's name

Customer:
  UNIQUE (seller, email)                      ← the real identity
  UNIQUE (seller, user) WHERE user NOT NULL   ← mirrors the Cart idiom

Payment:
  customer NOT NULL                           ← every purchase is verified
  UNIQUE (stripe_checkout_session_id) WHERE NOT NULL  ┐ three idempotency
  UNIQUE (stripe_payment_intent_id)   WHERE NOT NULL  ┤ gates, one per
  UNIQUE (stripe_invoice_id)          WHERE NOT NULL  ┘ arrival shape
  CHECK  at least one of the three is non-null
      ← a row naming no Stripe object cannot be reconciled against anything

Subscription:
  stripe_subscription_item_id UNIQUE      ← the natural key, never null
  stripe_subscription_id      INDEXED, NOT unique
  UNIQUE (customer, product) WHERE status IN (active, trialing, past_due, unpaid)
      ← partial on purpose: an unconditional unique would let a cancelled row
        occupy the slot forever and permanently bar a resubscribe.
        Keyed on product, not plan, so a plan swap inside one product collides —
        which is why _sync_subscription retires vanished si_ rows BEFORE
        inserting the replacement.

SubscriptionCheckout:
  UNIQUE (customer, plan)                 ← lapsed rows included, so a returning
                                            buyer reuses their own dead row rather
                                            than leaving one per abandoned attempt.
                                            Cannot be narrowed to live rows only:
                                            Postgres will not index on now().
  INDEX (expires_at)
  CASCADE on both FKs                     ← intent, not money

Order:
  payment NOT NULL                        ← written after money moves, never before
  CHECK quantity >= 1                     ← PositiveIntegerField permits 0

StripeEvent:
  UNIQUE (stripe_event_id)
```

`on_delete=PROTECT` throughout the money graph. `Subscription.plan` in particular
**must** be PROTECT: archiving a Stripe Price does not stop an existing
subscription, so deleting the `Plan` would leave renewals billing against a
`price_` that resolves to nothing locally. The delete has to fail instead.

Cross-row rules live in `clean()`, since they are not expressible as CHECKs:

- `Order.customer` must equal `payment.customer`, and if `subscription` is set it
  must match on both customer and plan.
- `Subscription.plan.product.is_subscription` must be true, and `ended_at` may
  only be set once status is `canceled` or `incomplete_expired`. This is why
  `_sync_subscription` sets `ended_at` conditionally on `ENDED_SUBSCRIPTION_STATUSES`
  rather than copying it across unconditionally.

`email_verified_at` is what makes account-less checkout safe, **not** the presence
of an `AppUser`. Because an unverified email can never reach a `cus_...`, nobody
can type someone else's address and inherit their saved cards or subscriptions.
This is the same hazard `Cart.clean()` already guards against when it refuses to
let a cart carry both a user and a session token.

---

## 7. Money movement

Direct charges on the connected account:

```
buyer's card
    │
    ▼
Charge on acct_seller              ← funds land in the seller's balance
    │
    └─ remainder ────────────────► seller balance ──► payout
```

Because `fees_collector` is `"stripe"`, Stripe bills its processing fees directly
to the seller, not to Parcely. Because the charge lives on the seller's account,
**the seller is liable for disputes and refunds**.

Stripe's fee is ~2.9% + $0.30 per charge, plus ~0.5% Stripe Billing on recurring.
The fixed $0.30 is what makes cheap subscriptions expensive: a $3/mo plan pays an
effective ~13%. It is also why a multi-plan cart must not become one charge per
plan — splitting a 3-item cart burns an extra $0.60 and puts three lines on the
buyer's statement for zero benefit.

**Parcely currently takes no cut.** `application_fee_amount` and
`application_fee_percent` appear nowhere in the codebase. Platform revenue is a
separate mechanism from `responsibilities` and has not been wired up.

---

## 8. Known gaps in this layer

Ordered by what blocks a working checkout. The catalog-specific list lives in
`STRIPE_CATALOG_SYNC.md` §8.

1. **No read endpoints.** `billing/` has no `serializers.py` and no view reads
   `Order`, `Payment` or `Subscription`. Nothing can show a buyer what they bought.
2. **No success-page data source.** `success_url` is
   `/{slug}/checkout/success?session_id=…`, but no endpoint resolves a `cs_`, and
   the buyer typically lands there *before* the webhook fires — it needs a pending
   state, not just a lookup.
3. **Frontend has no `is_subscription` branch.** `addToCartButton.tsx:28`
   unconditionally calls `createCartItem`, which now 400s on any recurring plan
   since `CartItem.clean()` started rejecting them. This is a live bug, not a gap.
4. **No cancellation.** Nothing calls `subscriptions.cancel`, and §4.1 forbids the
   buyer token from authorising it — this needs a real credential first.
5. **Refunds and disputes are unmodelled.** `Payment` has no status column by
   design, so there is nowhere to record them.
6. **A Stripe-side item removal silently ends a subscription locally.**
   `_sync_subscription` marks rows whose `si_` vanished as `canceled`. Correct for
   a plan swap, but indistinguishable from a seller removing an item in the
   dashboard, and nothing records which it was.
7. **Ops:** the Connect endpoint is subscribed to 7 events and needs the 9 in §5.2;
   the URL is still ngrok; and `sync_stripe_catalog` needs a run to backfill plans
   whose `stripe_price_id` is null.
