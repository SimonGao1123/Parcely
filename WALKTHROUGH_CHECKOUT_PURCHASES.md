# Checkout, Purchases and Seller Orders: a code walkthrough

A guide to read side by side with the code. It covers every uncommitted change on `sprint_1`
(`git status`) and the whole of `billing/webhooks/payment_events.py`, including the parts that
were already in commit `ae4f912`, because every purchase ends up there.

**How to read it**
- Parts 1 and 2 go file by file, in the order data flows: the models, then who the buyer is,
  then the call to Stripe, the webhook, the read endpoints, and finally the frontend that
  calls them. Within a file, functions are in source order.
- Each file section opens with **Where it fits**, then explains every function.
- Part 3 traces the common flows end to end across files.
- Part 4 covers the edge cases, and Part 5 the known gaps.
- `NEW` marks an added file or function, `CHANGED` an edited one, and `CONTEXT` code that was
  already there and that you need in order to follow the rest.

Paths are relative to `parcely-backend/` or `parcely-frontend/`.

---

## Part 0: The big picture

```
                 ┌──────────── Next.js (server components + server actions) ─────────────┐
 Browser ──────▶ │ pages read httpOnly cookies, forward them to Django as headers        │
 (no tokens      │   buyer_session_<slug>    → X-Buyer-Session      (checkout scope)     │
  in JS)         │   purchases_session_<slug>→ X-Purchases-Session  (purchases scope)    │
                 │   public_session_id       → X-Public-Cart-ID     (guest cart)         │
                 │   Clerk session           → Authorization: Bearer (signed-in user)    │
                 └───────────────────────────────┬───────────────────────────────────────┘
                                                 ▼
 Django ── send-otp / verify-email ── mints a signed token (one OTP, two possible scopes)
        ── checkout/session | subscription ── creates a Stripe Checkout Session ──▶ Stripe page
        ◀── Stripe Connect webhook (payment_events.py) writes Payment / Order / Subscription
        ── purchases/*  (buyer reads)      dashboard/*  (seller reads + remove/unblock)
```

**Four ideas carry everything:**
1. **A `Customer` is per seller.** `(seller, email)` is unique. The same person buying from
   three sellers is three Customer rows, and every Payment, Order and Subscription hangs off
   one of them. That is what "a purchase has a seller id" means: `x.customer.seller`.
2. **The OTP proves an email at one seller.** It is exchanged for a signed, stateless token
   (`django.core.signing`, 60 minutes) under one of two **scopes**: `checkout`, which can
   start a checkout, or `purchases`, which can read history. A different salt per scope means
   neither token passes the other's signature check.
3. **Nothing is written when the buyer clicks Pay.** Rows only appear once Stripe's webhook
   says money moved (or a trial started). The success page and Purchases lists only read.
4. **Subscriptions never touch the cart.** A one-time product goes to the cart and a cart
   checkout (payment mode). A subscription product goes to `/{slug}/subscribe/{planId}` and a
   subscription checkout (subscription mode, one plan, capacity reserved).

---

# Part 1: Backend (`parcely-backend/`)

## 1.1 Data model

### `accounts/models.py`: `Customer.blocked_at` (CHANGED) and migration `accounts/migrations/0006_customer_blocked_at.py` (NEW)
**Where it fits:** this is how a seller's "Remove customer" works. A Customer row can never
be deleted, because Payment, Order and Subscription all point at it with `on_delete=PROTECT`,
so removal is a flag instead.
- `blocked_at = DateTimeField(null=True)`. When set, checkout returns 403 (see 1.4). The
  buyer can still verify and view their history. Unblocking clears it.
- It sits on the per-seller Customer, so a block covers **every storefront that seller owns**.

### `billing/models.py`: `Payment.card_brand` and `Payment.card_last4` (CHANGED) and migration `billing/migrations/0005_payment_card_brand_payment_card_last4.py` (NEW)
**Where it fits:** these fill the "Visa •••• 4242" shown on receipts and subscriptions.
Fulfilment copies them from the charge (`_card_for`, in 1.5).
- Both are nullable. They are null on a $0 trial invoice, which has no charge, and whenever
  the Stripe lookup failed. The card is display-only, so it never blocks fulfilment.

**CONTEXT: the other billing models you need in mind**

| Model | One row = | Key columns |
|---|---|---|
| `Payment` | one movement of money | `customer`, `amount_cents`, `currency`, one or more of `stripe_checkout_session_id` (`cs_`), `stripe_payment_intent_id` (`pi_`), `stripe_invoice_id` (`in_`). Each of those three ids has a partial unique index, which is the idempotency gate. **No status column**: a row only exists once paid. |
| `Order` | one billed line on a Payment | `payment`, `plan`, `quantity`, `unit_price_cents`, `plan_name_snapshot`, `customer` (denormalized), `subscription` (null for one-time lines) |
| `Subscription` | one Stripe **subscription item** (`si_`), not one `sub_` | `stripe_subscription_item_id` (unique), `stripe_subscription_id` (shared by items), `status` (Stripe's value verbatim), `plan`, `product` (denormalized for the unique constraint), `current_period_end`, `trial_end`, `cancel_at_period_end`, `ended_at`, `over_capacity`. The constraint `uniq_subscription_customer_product_live` allows one live subscription per customer and product. |
| `SubscriptionCheckout` | a capacity **reservation** while a buyer is on Stripe's page | `customer`, `plan`, `expires_at` (30 min), `stripe_checkout_session_id` |

- `LIVE_SUBSCRIPTION_STATUSES` = active, trialing, past_due, unpaid.
- `ENDED_SUBSCRIPTION_STATUSES` = canceled, incomplete_expired.

A renewal keeps the **same** Subscription row (same `si_`). It only adds a new Payment, with
one Order linked to that Subscription.

---

## 1.2 Buyer identity: OTP to a scoped token

### `accounts/buyer_session.py` (CHANGED)
**Where it fits:** every guest-facing endpoint asks this module "which Customer is this
request?". Checkout views use the checkout scope; the storefront purchases views use the
purchases scope.

- **Constants**
  - Pre-existing: `BUYER_SESSION_SALT`, `BUYER_SESSION_MAX_AGE = 3600`, `BUYER_SESSION_HEADER = "X-Buyer-Session"`.
  - NEW: `CHECKOUT_SCOPE = "checkout"`, `PURCHASES_SCOPE = "purchases"`, `PURCHASES_SESSION_HEADER = "X-Purchases-Session"`.
- **`_SALTS`** (NEW) maps scope to salt.
  - Checkout keeps the **original** salt, so tokens issued before this change still work.
  - Purchases uses `"accounts.buyer_session.purchases"`.
  - Why salts rather than a `"scope"` field in the payload: if some view forgets to check the
    scope, a different salt still fails the signature. The safe outcome happens by default.
- **`issue_buyer_token(customer, scope="checkout")`** (CHANGED, added `scope`) signs
  `{customer_id, seller_id}`. The token is signed, not encrypted, so it carries ids only.
- **`read_buyer_customer(token, storefront, scope="checkout")`** (CHANGED, added `scope`):
  1. No token → `None`.
  2. `signing.loads` with the scope's salt and `max_age=3600`. A bad signature or an expired
     token → `None`. The two cases aren't told apart on purpose.
  3. It re-reads `Customer` with `seller_id = storefront.owner_id`. A valid token for seller A
     sent to seller B's storefront → `None`.
- **`buyer_from_request(request, storefront)`** (CONTEXT) reads the `X-Buyer-Session`
  header with the checkout scope.
- **`purchases_buyer_from_request(request, storefront)`** (NEW) reads the
  `X-Purchases-Session` header with the purchases scope.

### `accounts/serializers.py`: `VerifyEmailSerializer.purpose` (CHANGED)
- `ChoiceField(["checkout", "purchases"], default="checkout")`. Old callers that send no
  `purpose` behave exactly as before.
- Any other value → 400.

### `accounts/views.py`
**Where it fits:** this is the only place a token is minted. Both endpoints are mounted
under `storefronts/<slug>/checkout/` (`billing/checkout_urls.py`), and the purchases flow
reuses them too.

**`SendOTPEmailAPIView.post`** (CONTEXT, unchanged) handles `POST …/send-otp/ {email}`:
1. Loads the storefront: it must be non-draft, otherwise 404. `seller = storefront.owner`.
2. If you are signed in, the email must be **your** Clerk email. Otherwise 403 `{"error": …}`.
3. If the email belongs to *any* AppUser and you aren't signed in as them, 403
   `{"detail": "Sign in to verify this email address."}`. Guests can't act as an account.
   (The frontend tells this 403 apart by its `detail` key.)
4. In a transaction, it marks earlier unconsumed codes for that email and seller as consumed,
   then creates an `EmailVerification` holding an HMAC of a 6-digit code. It lives 10 minutes
   (`OTP_TTL`).
5. Sends the email **after** commit, through Django 6 `MAILERS`, which writes to a file locally.
6. Returns `{expires_at}`.

**`VerifyEmailAPIView.post`** (CHANGED) handles `POST …/verify-email/ {email, code, purpose}`:
1. Runs the same two 403 gates as send-otp.
2. Inside `transaction.atomic()`:
   - Takes `select_for_update` on the newest live code row. No row → 400.
   - On a wrong code it increments `attempts`; at 3 (`MAX_ATTEMPTS`) it deletes the row
     ("Max attempts reached"). Otherwise 400 "Invalid code".
   - On a match it sets `consumed_at`.
3. Gets or creates `Customer(seller, email)` and links `user` only when the verified email is
   the signed-in user's own (`link_user`). It never takes over a row already linked to
   someone else. The savepoint plus IntegrityError retry guards the
   `uniq_customer_seller_user` race.
4. **CHANGED:** `cart_data` is only computed when `purpose == "checkout"`. `find_cart`
   (which takes row locks and may claim or merge a guest cart) is skipped for purchases.
5. Returns `{buyer_session: issue_buyer_token(customer, purpose), expires_in: 3600, cart}`.
   The token is minted after commit.

---

## 1.3 Capacity shown on products

### `products/serializers.py`: `ProductSummarySerializer.spots_left` (CHANGED)
**Where it fits:** page blocks get products through this serializer (via
`PageDetailAPIView`), and so does the new public plan endpoint (1.4). The frontend's "3 of
10 spots left" and "Sold out" read this field.
- `get_spots_left(obj)`:
  - Returns `None` unless the product is a subscription with a `max_capacity`.
  - Otherwise returns `max(0, max_capacity - consumed_capacity(obj))`.
  - `consumed_capacity` comes from `billing/capacity.py` and is imported lazily inside the
    method, because `billing` already imports `products.models` (a cycle).

**CONTEXT: `billing/capacity.py`**, the rule spots_left mirrors:
- `consumed_capacity(product, exclude_customer=None)` = live subscribers + **unexpired reservations**.
- `claim(customer, plan)`:
  - Locks the Product row and refuses with `CapacityFull` if consumed ≥ max, *excluding this
    buyer's own reservation*.
  - Otherwise it returns the buyer's existing live reservation untouched, revives a lapsed
    one, or creates a new one.
- `release(reservation)` deletes it. `attach_session(reservation, cs_id)` stores the session id.

> ⚠ `spots_left` does **not** exclude the viewer's own reservation, while `claim` does. See Part 5, gap #1.

---

## 1.4 Starting a checkout

### `billing/stripe_checkout.py` (CHANGED: one line, plus CONTEXT)
**Where it fits:** the checkout views (below) call into this module, and it is the only one
that creates Checkout Sessions. Every call is made **on the seller's connected account**
(`stripe_account=acct_…`): these are direct charges.

- **`ensure_stripe_customer(customer, storefront)`** (CONTEXT) lazily creates `cus_…` on the
  seller's account the first time this buyer checks out, and saves `Customer.stripe_customer_id`.
- **`_create(...)`** (CONTEXT) adds the common parameters:
  - `customer`
  - `success_url = {FRONTEND}/{slug}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
    (Stripe fills in the id)
  - the default `cancel_url = {FRONTEND}/{slug}/cart`
  - then `**params` overrides those defaults.
- **`create_cart_session(...)`** (CONTEXT):
  - `mode=payment`, one line per cart item, using `stripe_price_id`.
  - Metadata `{customer_id, cart_id, storefront_id}`.
  - Idempotency key `cart-{id}-{hash of contents}`, so a double click returns the same session.
- **`create_subscription_session(...)`** (CHANGED):
  - `mode=subscription`, one line at quantity 1.
  - Metadata `{customer_id, plan_id, product_id, storefront_id, reservation_id}`, on both the
    session and `subscription_data`, so renewal invoices carry it too.
  - `trial_period_days` when the plan has one.
  - `expires_at` = the reservation's deadline.
  - Idempotency key `sub-{reservation}-{deadline}`.
  - **NEW:** `cancel_url = {FRONTEND}/{slug}/subscribe/{plan.id}`, so backing out of Stripe
    returns to the subscribe page, not to a cart the buyer never used. The reservation is
    left standing, so Continue → `claim` returns the same reservation → same idempotency key
    → Stripe returns the **same** open session.

### `billing/views/checkout.py`
**Where it fits:** these are the HTTP endpoints the frontend's `lib/api/checkout/*` calls,
all under `storefronts/<slug>/checkout/`.

**`_BuyerCheckoutAPIView._storefront_and_buyer`** (CHANGED) is the gate both "create
session" endpoints share. It returns `(storefront, customer, error_response)`:
1. A non-draft storefront, otherwise 404.
2. `buyer_from_request`, the **checkout** scope. `None` → 401 "Verify your email before checking out."
3. **NEW:** `customer.blocked_at` set → **403** "You can't purchase from this store." It's
   403 rather than 401 because verifying again can't lift a block.
4. The seller can't sell yet → 409.

**`CreateCheckoutSessionAPIView.post`** (CONTEXT) handles `POST session/`:
1. Runs the gate.
2. `find_cart` (an atomic block, because it locks rows) → 404 if there's no cart, 400 if it's
   empty, 409 if any item lacks a price.
3. `create_cart_session`. A StripeError → 502.
4. Stores `Cart.stripe_checkout_session_id` and returns `{url, session_id}`.

**`CreateSubscriptionCheckoutSessionAPIView.post`** (CONTEXT) handles `POST subscription/ {plan_id}`:
1. Runs the gate, then validates the plan.
   - It must belong to this storefront, otherwise 404.
   - The product must be active and a subscription, otherwise 400.
   - The plan must have a price, otherwise 409.
2. The buyer must not already hold a live subscription to this product, otherwise 409 "already subscribed".
3. `capacity.claim` inside an atomic block. `CapacityFull` → 400 "No spots left".
4. `create_subscription_session` runs **outside** the lock. A StripeError → `release` the reservation and return 502.
5. `attach_session`, then return `{url, session_id}`.

**`CheckoutPlanAPIView.get`** (NEW) handles `GET plans/<plan_id>/`, AllowAny:
- The plan must be in this storefront, the storefront non-draft, and the product active and a
  subscription. Anything else → 404.
- Returns `{plan_id, product: ProductSummarySerializer}`, including `spots_left` and every
  plan. It exists because the subscribe page is public, and the only product list endpoint
  is owner-only.

**`CheckoutBuyerAPIView.get`** (NEW) handles `GET buyer/`:
- The frontend can't decode or check the token's expiry itself, so it asks this endpoint.
- A valid checkout token → `{email, blocked}`. Otherwise **401**.
- This is what lets the cart and subscribe pages show "Checking out as …" instead of asking
  for a code again.

**`CheckoutSessionStatusAPIView.get`** (NEW) handles `GET sessions/<session_id>/`. It powers the success page.
1. A checkout-scope buyer with a `stripe_customer_id`, otherwise 404.
2. The id must start with `cs_`, otherwise 404.
3. Retrieves the session from Stripe **on the seller's account**.
   - InvalidRequestError (no such session) → 404.
   - Any other StripeError → 502.
4. **Ownership check:** `session.customer != customer.stripe_customer_id` → 404. This is the
   same response as "doesn't exist", so a leaked or guessed `cs_` reveals nothing.
5. Computes `fulfilled`, meaning the webhook has already written our rows:
   - subscription mode: a `Subscription` exists for this customer with
     `stripe_subscription_id = session.subscription`
   - payment mode: a `Payment` exists with `stripe_checkout_session_id = session.id`
6. Returns `{mode, status, payment_status, amount_total, currency, fulfilled}`.

### `billing/checkout_urls.py` (CHANGED)
Adds `buyer/`, `plans/<int:plan_id>/` and `sessions/<str:session_id>/` next to the
existing `send-otp/`, `verify-email/`, `session/` and `subscription/`.

---

## 1.5 The webhook: `billing/webhooks/payment_events.py` (whole file)

**Where it fits:**
- Stripe sends **v1 snapshot** events from connected accounts to `POST /webhooks/stripe/connect/`.
- `billing/webhooks/views.py::stripe_connect_webhook` checks the signature, then
  `_record_and_dispatch` inserts a `StripeEvent` row first (keyed on the unique `evt_` id),
  then calls `payment_events.handler_for(event.type)(parsed_event, stripe_event_row)`.
- When a handler raises, the error is stored on the row and the webhook answers 500, so
  Stripe redelivers. A redelivery of an unprocessed event is dispatched again, so **every
  handler must be idempotent**.
- The `event` argument the handlers receive is our `StripeEvent` row. That is why they read
  `event.stripe_account_id`.

**Two rules for the whole module (docstring, lines 1–18):**
1. **Don't raise for data that will never arrive** (a forged id, a deleted plan). Log and
   return; raising would loop the redelivery. Only raise for transient faults (a Stripe 5xx,
   a deadlock).
2. **Scope every lookup to `event.account`.** A seller can create sessions on their own
   account with any metadata they like, so `metadata.customer_id` is never trusted alone.

### Lookup helpers (lines 50–126)
| Function | Does | Why |
|---|---|---|
| `_meta(obj, key)` | `obj.metadata.key` or `None` | `metadata` is a StripeObject, and `.get()` raises on it |
| `_ts(value)` | unix → aware UTC datetime, `None`-safe | |
| `_customer_for(customer_id, account_id, stripe_customer_id)` | The Customer with that pk **and** `seller.stripe_account_id == account_id`. If a `cus_` is given, it must also equal `customer.stripe_customer_id`. Otherwise `None` | Metadata is attacker-controlled. The join pins it to the signing account, and the `cus_` match pins it to the actual payer. |
| `_customer_by_stripe_id(cus, account_id)` | Fallback lookup by `cus_` on that account | Renewals whose metadata is stale |
| `_plan_by_price(price_id, account_id)` | The Plan with that `stripe_price_id`, owned by that account | Main path |
| `_plan_by_metadata(plan_id, account_id)` | The Plan from `price.metadata.plan_id` | Survives a price edit: the old archived `price_` still carries `plan_id` |
| `_cart_for(cart_id, account_id)` | The Cart scoped to that account | |

### Subscriptions (lines 132–234)
**`_sync_subscription(stripe_sub, account_id, customer)`** is the heart of every
subscription write. It is **absolute, not a delta**: whatever order the events arrive in, the
result is "the rows now equal Stripe's current state".
1. `items = stripe_sub["items"].data`. It uses bracket access because `.items` is the dict method.
2. **Retire removed items:** any *live* local row on this `sub_` whose `si_` is no longer in
   the list → `canceled`, `ended_at=now`. A plan swap replaces the item (a new `si_`), and the
   old row would otherwise block the new one under `uniq_subscription_customer_product_live`.
3. For each item, it resolves the plan (by price, then by metadata) and `update_or_create`s on
   `stripe_subscription_item_id`. It copies `status`, the price and currency,
   `current_period_end` (from the **item**, as of stripe 15.6.1), `cancel_at_period_end` and
   `trial_end`. `ended_at` is set only when the status is terminal, because `clean()` enforces
   that.
4. Returns the synced rows.

Shape read: `stripe_sub = {id, status, customer, metadata, cancel_at_period_end, trial_end,
ended_at, canceled_at, items: {data: [{id: si_, current_period_end, price: {id, unit_amount,
currency, metadata: {plan_id}}}]}}`

Other functions here:
- **`_retrieve_subscription(sub_id, account_id)`** fetches the `sub_` from Stripe on the seller's account.
- **`mark_subscription_ended(stripe_sub)`** (NEW, factored out of `handle_subscription_deleted`):
  - Sets `status = stripe_sub.status` and `ended_at = ended_at or canceled_at or now` on
    **every** row with that `sub_`.
  - Shared by the `customer.subscription.deleted` webhook and the seller's Remove action
    (1.6), which writes the result immediately. Both write the same values, so whichever
    lands second changes nothing.
- **`_card_for(payment_intent_id, account_id)`** (NEW):
  - Calls `payment_intents.retrieve(pi, {"expand": ["latest_charge"]})` on the seller's
    account and reads `latest_charge.payment_method_details.card.{brand, last4}`.
  - `(None, None)` when there's no pi, on any `StripeError` (logged, **never raises**), or
    when the method wasn't a card.
  - Always called **before** `transaction.atomic()`, to keep network calls out of row locks.

### Orders (lines 240–253)
- **`_order_defaults(plan, quantity, unit_price_cents, description, price_id)`** builds the
  Order fields. Quantity is at least 1, and `plan_name_snapshot` comes from the Stripe line
  description, so old receipts keep their name if the product is renamed later.
- **`_write_order(payment, customer, subscription=None, **defaults)`** is `Order.objects.create`.

### Checkout sessions (lines 259–373)
**`_fulfil_cart_session(session, account_id)`** handles **payment mode**:
1. `_customer_for(metadata.customer_id, account, session.customer)`. `None` → log and return.
2. `line_items.list(session.id)`. Line items aren't on the webhook payload, so they're fetched
   here, outside the transaction. A StripeError **propagates** on purpose: it's transient.
3. **NEW:** `_card_for(session.payment_intent)`.
4. `atomic`:
   - `Payment.get_or_create(stripe_checkout_session_id=cs_)`, which is the idempotency gate.
     If the row already exists, return. That covers `completed` and `async_payment_succeeded`
     both arriving for one payment.
   - One Order per line. An unresolvable plan logs and skips only that line, so
     `sum(orders) ≠ amount` becomes the reconciliation alarm.
   - Empties the cart: deletes its **items** (keeping the Cart row) and nulls
     `cart.stripe_checkout_session_id`.

Shape read: `session = {id, mode, customer: cus_, payment_status, amount_total, currency,
payment_intent: pi_, subscription: sub_|null, metadata: {customer_id, cart_id, storefront_id}}`.
Each line is `{price: {id, unit_amount, metadata.plan_id}, quantity, description}`.

**`_fulfil_subscription_session(session, account_id)`** handles **subscription mode**. It writes **no Payment**: `invoice.paid` does that.
1. No `session.subscription` → return.
2. Resolves the customer: by metadata, falling back to the `cus_`.
3. Retrieves the `sub_`.
4. `atomic`: `_sync_subscription`, **then** deletes the `SubscriptionCheckout` reservation
   for this `cs_`. Doing both in one transaction means the slot is never free between
   "reservation gone" and "subscription row exists".

The remaining handlers:
- **`handle_checkout_session_completed(event_obj, event)`** does nothing unless
  `payment_status ∈ {paid, no_payment_required}`:
  - `no_payment_required` is a trial start.
  - `complete` + `unpaid` is a delayed payment method, which is fulfilled later by
    `async_payment_succeeded`.
  - Otherwise it branches on `mode`.
- **`handle_checkout_session_async_payment_failed`** only logs. Nothing was written, and the
  cart is left intact so the buyer can retry.
- **`handle_checkout_session_expired`** deletes the reservation for that `cs_` (freeing the
  slot early) and clears `Cart.stripe_checkout_session_id`.

### Invoices (lines 379–518)
Helpers that read the nested invoice shape:
- `_invoice_subscription_id(inv)` → `inv.parent.subscription_details.subscription`
- `_invoice_subscription_metadata(inv, key)` → `inv.parent.subscription_details.metadata[key]`.
  This is `subscription_data.metadata`, frozen onto **every** invoice, including renewals
  months later.
- `_invoice_payment_intent(inv)` → `inv.payments.data[0].payment.payment_intent`. It's `None`
  on a $0 trial invoice.
- `_line_subscription_item(line)` → `line.parent.subscription_item_details.subscription_item` (`si_`)
- `_line_price_id(line)` → `line.pricing.price_details.price`

**`handle_invoice_paid`** handles the first invoice and **every renewal**:
1. Resolves the customer: by invoice metadata plus `cus_`, falling back to `cus_` alone.
2. Collects the `si_` ids from the lines and loads the known Subscriptions. **Only if some
   are missing**, meaning this first invoice arrived before `customer.subscription.created`,
   does it retrieve the `sub_` and `_sync_subscription`. Renewals cost no extra call.
3. **NEW:** `_card_for(payment_intent_id)`.
4. `atomic`:
   - `Payment.get_or_create(stripe_invoice_id=in_)` with `amount_paid`, the pi and the card.
     An existing row → return.
   - One Order per line, linked to its Subscription. The plan comes from the subscription,
     falling back to the price. The unit price is `line.amount // quantity`, which is exact
     until discounts or proration exist.

**`handle_invoice_payment_failed`** writes no Payment. It retrieves the `sub_` and syncs, so
the status becomes whatever Stripe moved it to (`past_due`, `unpaid`, …).

### Subscription lifecycle and dispatch (lines 524–578)
- `_handle_subscription_event` covers `customer.subscription.created` and `.updated`: it
  resolves the customer and calls `_sync_subscription(event_obj)`. Renewal dates, trial→active,
  `cancel_at_period_end` and plan swaps all arrive here.
- `handle_subscription_deleted` → `mark_subscription_ended`. The rows are kept, because
  receipts point at them.
- `_on_object(handler)` adapts `(event, row)` → `(event.data.object, row)`.
- `_HANDLERS` maps the **9** subscribed event types; `handler_for(type)` looks them up.
  Unknown types get `None`: the row is recorded and the webhook answers 200.

---

## 1.6 Reading purchases (buyer and seller)

### `billing/serializers.py` (NEW)
**Where it fits:** these are read-only shapes shared by the buyer's Purchases views and the
seller dashboard. The frontend types in `types/purchases.ts` and `types/dashboard.ts` mirror
them one to one.

| Serializer | Output | Notes |
|---|---|---|
| `_StorefrontRefSerializer` | `{title, slug}` | |
| `_CustomerRefSerializer` | `{id, email}` | seller views only |
| `OrderLineSerializer` | `{id, plan_name_snapshot, quantity, unit_price_cents}` | |
| `PaymentSerializer` (a "receipt") | `{id, created_at, amount_cents, currency, card_brand, card_last4, kind, storefront, orders[]}` | `get_kind`: has a `cs_` → `"one_time"`, otherwise `"subscription"`. Subscription money only arrives on invoices. `get_storefront`: from the **first** order's `plan.product.storefront`, read from the prefetch with no extra query. One Payment is always from a single storefront. `None` if there are no orders. |
| `SubscriptionSerializer` | `{id, status, product_name, plan{id,title,billing_interval,billing_interval_count,trial_period_days}, unit_price_cents, currency, current_period_end, trial_end, cancel_at_period_end, ended_at, created_at, storefront, card_brand, card_last4}` | `get_plan` returns exactly what `lib/price.ts` formats. `_latest_payment` is the first prefetched order's payment (ordered newest first), so the card is whatever paid most recently. |
| `SellerPaymentSerializer` / `SellerSubscriptionSerializer` | the above plus `customer{id,email}` | |
| `SellerCustomerSerializer` | `{id, email, created_at, blocked_at, payment_count, total_spent_cents, live_subscription_count, seller_live_subscription_count}` | The counts are annotations from the view. All but the last are **for this storefront**. The last spans **all the seller's stores**, because that's how many subscriptions a removal cancels. |

### `billing/views/purchases.py` (NEW): the buyer's view
**Where it fits:** two entry points onto the same lists.
- `billing/purchases/{subscriptions,orders}/` is signed-in only and covers **all sellers**.
  This is the main site's `/purchases`.
- `storefronts/<slug>/purchases/{subscriptions,orders}/` covers **one seller**, signed in or
  by purchases token. This is the storefront's `/{slug}/purchases`.

The functions:
- **`signed_in_customers(user)`** = `Customer.filter(Q(user=user) | Q(email__iexact=user.email))`.
  The email branch catches guest purchases made before the account existed, which were never
  linked. Clerk has verified that email.
- **`payments_for(customers)`** → Payments for those customers, prefetching `orders →
  plan → product → storefront` ordered by id, sorted newest first. This is the shape
  `PaymentSerializer` needs with no N+1 queries.
- **`subscriptions_for(customers)`** → Subscriptions with `plan` and `product.storefront`
  joined, prefetching `orders → payment` newest first (for the card). It annotates
  `_ended` (0 if live, 1 otherwise) and orders by `_ended, -created_at`, so **live ones come first**.
- **`MySubscriptionsAPIView`** and **`MyPaymentsAPIView`** are `ListAPIView`s using the
  default `IsClerkAuthenticated`, so a guest gets 401/403.
- **`_StorePurchasesAPIView`** (base, AllowAny):
  - `_customers()`:
    1. A non-draft storefront, otherwise 404.
    2. **Signed in** → `signed_in_customers(user).filter(seller=storefront.owner)`. The guest
       token is ignored.
    3. Otherwise → `purchases_buyer_from_request` (purchases scope), giving that **one**
       Customer, or `None`.
  - `list()` returns **401** `{"detail": "Verify your email to see your purchases."}` when
    `_customers()` gives `None`. Otherwise it stashes the queryset and paginates (10 per page).
- **`StoreSubscriptionsAPIView`** and **`StorePaymentsAPIView`** are the concrete subclasses.

The checkout token is **never** accepted here, because `purchases_buyer_from_request` uses
the purchases salt.

### `billing/views/dashboard.py` (NEW): the seller's view of one storefront
**Where it fits:** this backs the storefront settings "Orders" tab. Every view uses the
default `IsClerkAuthenticated` and starts from `_owned_storefront`, so a non-owner gets
**404**, the same convention as `products/views.py` and the frontend's `requireStorefrontOwner`.

- **`_owned_storefront(request, kwargs)`** = `get_object_or_404(StoreFront, slug=…, owner=request.user)`.
- **`StoreOrdersAPIView`**: Payments of this seller's customers that have **at least one
  Order on a plan of this storefront**, using `pk__in` a values subquery, which avoids
  `.distinct()` duplicates. `select_related("customer")` supplies the buyer email.
- **`StoreSubscriptionsAPIView`**: Subscriptions with `product__storefront = sf`.
  `?status=live` or `?status=ended` filters; with neither, it returns all, live first.
- **`_count(queryset)`** builds a correlated `COUNT` subquery wrapped in `Coalesce(…, 0)`.
  Subqueries, not `Count()` over joins, so the per-customer figures don't multiply when
  payments and subscriptions are both joined.
- **`_customers_of(storefront)`**: the seller's Customers that have (Exists) an Order on this
  storefront **or** (Exists) a Subscription on it, annotated with:
  - `payment_count`: that customer's Payments touching this store
  - `total_spent_cents`: the Sum of their `amount_cents`
  - `live_subscription_count`: live subscriptions on this store
  - `seller_live_subscription_count`: live subscriptions across **all** the seller's stores

  Ordered newest customer first.
- **`StoreCustomersAPIView`** lists `_customers_of(sf)`.
- **`_customer_response(sf, id)`** re-reads one annotated row and returns it serialized. It's
  used after remove and unblock so the UI gets fresh counts.
- **`RemoveCustomerAPIView.post`** handles `POST customers/<id>/remove/`:
  1. Checks the storefront is owned, and that the Customer has `pk=id` and **`seller=request.user`**
     (otherwise 404, so you can't remove another seller's buyer).
  2. **Blocks first** (`blocked_at = now` if not already set), so no checkout can start while
     the cancels run.
  3. For each distinct live `stripe_subscription_id` of this customer, across **all** the
     seller's stores, calls `subscriptions.cancel(sub_id)` on the seller's account:
     - On success → `mark_subscription_ended(result)`, so the UI is right before the webhook arrives.
     - On `InvalidRequestError` (usually already cancelled at Stripe) → retrieve it. If its
       status is terminal, mark it ended. Otherwise count it as a failure.
     - On any other `StripeError` → a failure.
  4. If anything failed → **502** "Blocked, but N subscription(s) could not be cancelled. Try
     again." The block stays. A retry only touches subscriptions that are still live.
  5. Otherwise returns the refreshed customer row.
- **`UnblockCustomerAPIView.post`** clears `blocked_at` and returns the row. It doesn't
  resubscribe anyone.

### URL wiring
- `billing/purchases_urls.py` (NEW) is mounted at `storefronts/<slug>/`. It holds
  `purchases/orders/`, `purchases/subscriptions/`, `dashboard/orders/`,
  `dashboard/subscriptions/`, `dashboard/customers/`, `dashboard/customers/<id>/remove/` and
  `dashboard/customers/<id>/unblock/`.
- `billing/urls.py` (CHANGED) adds `billing/purchases/orders/` and `billing/purchases/subscriptions/`.
- `store/urls.py` (CHANGED) adds `path('<str:storefront_slug>/', include(purchases_urls))`.

**Full endpoint table**

| Method and path | Who | Returns |
|---|---|---|
| POST `storefronts/<slug>/checkout/send-otp/` | anyone (gated) | `{expires_at}` |
| POST `…/checkout/verify-email/` | anyone (gated) | `{buyer_session, expires_in, cart}` |
| GET `…/checkout/buyer/` | checkout token | `{email, blocked}` / 401 |
| GET `…/checkout/plans/<id>/` | public | `{plan_id, product}` / 404 |
| POST `…/checkout/session/` | checkout token + cart | `{url, session_id}` |
| POST `…/checkout/subscription/` `{plan_id}` | checkout token | `{url, session_id}` |
| GET `…/checkout/sessions/<cs_>/` | checkout token, owner of the session | status / 404 |
| GET `billing/purchases/{orders,subscriptions}/` | Clerk | paginated |
| GET `storefronts/<slug>/purchases/{orders,subscriptions}/` | Clerk **or** purchases token | paginated / 401 |
| GET `storefronts/<slug>/dashboard/{orders,subscriptions,customers}/` | Clerk, owner | paginated / 404 |
| POST `…/dashboard/customers/<id>/{remove,unblock}/` | Clerk, owner | customer row / 404 / 502 |

---

# Part 2: Frontend (`parcely-frontend/`)

**Conventions to keep in mind:**
- Everything talks to Django **server-side** through `lib/api.server.ts::apiFetch`, which
  adds the Clerk `Authorization: Bearer` header when signed in, plus any headers passed in.
  Guest tokens live in **httpOnly cookies** that Next.js reads and forwards as headers, so
  the browser's JS never sees a token and CORS isn't involved.
- `'use server'` files export only async actions the client can call. Plain helper modules
  (like `buyerSession.ts` and `codeError.ts`) are deliberately **not** `'use server'`, or
  their functions would become publicly callable actions.
- Next 16 specifics: `params` and `searchParams` are Promises, `cookies()` is async,
  `redirect()` works by throwing (so it's never inside a try), and `refresh()` from
  `next/cache` re-renders the current route after an action.

## 2.1 Types and price helpers
- `types/checkout.ts` (NEW): `BuyerPurpose`, `SendCodeResult`, `VerifyCodeResult`,
  `CheckoutBuyer`, `CheckoutPlan` and `CheckoutSessionStatus`, each mirroring the matching
  backend response.
- `types/purchases.ts` (NEW): `StorefrontRef`, `OrderLine`, `Receipt`, `SubscriptionStatus`
  and `PurchasedSubscription`, mirroring `billing/serializers.py`.
- `types/dashboard.ts` (NEW): `CustomerRef`, `SellerReceipt`, `SellerSubscription` and `SellerCustomer`.
- `types/product.ts` (CHANGED): `spots_left?: number | null`. It's optional because cart
  summaries don't carry it.
- `lib/price.ts` (CHANGED): `PlanPricing` is now `Pick<Plan, "title" | "price_cents" |
  "billing_interval" | "billing_interval_count">`, so `planName` and `planIntervalPhrase`
  accept a purchase record's slimmer `plan` object.

## 2.2 `lib/api/checkout/`: the buyer's credentials and checkout calls

**`buyerSession.ts`** (NEW, a plain server module) is the single place cookie names and header names live.
- Cookie names:
  - `buyer_session_<slug>` → header `X-Buyer-Session`
  - `purchases_session_<slug>` → header `X-Purchases-Session`
- One cookie per **storefront and purpose**: the frontend only knows slugs, while the token
  is per seller.
- Functions:
  - `cookieName(slug, purpose)` builds the name.
  - `hasBuyerCookie(slug, purpose)` checks whether the cookie exists, without a network call.
  - `buyerHeaders(slug, purpose)` → `{Header: token}` or `{}`.
  - `cartHeaders()` → `{X-Public-Cart-ID: public_session_id}`, the guest cart token.
  - `setBuyerCookie(slug, purpose, token, maxAge)` sets it httpOnly, `sameSite: lax`, secure
    in production, with `maxAge = expires_in` (3600) so the cookie expires with the token.
    It only works inside an action.
  - `clearBuyerCookie(slug, purpose)` deletes it.

**`codeError.ts`** (NEW, plain):
- Type `CodeError = {error, signInRequired?}`.
- `codeErrorFrom(response, fallback)` sets `signInRequired` when the response is a 403 **with
  a `detail` key**, which is the "this email belongs to an account" gate. The other 403
  (signed in as a different email) uses `error`.

**`sendCode.ts`** (NEW action): `sendCode(slug, email)` → POST send-otp → `{expires_at}` or `CodeError`.

**`verifyCode.ts`** (NEW action): `verifyCode(slug, email, code, purpose)`
1. POST verify-email with `{email, code, purpose}` and the cart header.
2. On error → `CodeError`.
3. On success → `setBuyerCookie(slug, purpose, buyer_session, expires_in)`.
4. If the returned cart has a fresh `public_session_id`, it stores that cookie too (the same
   rule as `createCartItem`).
5. `refresh()` → the page re-renders past the form. Returns `null`.

**`forgetBuyer.ts`** (NEW action): `forgetBuyer(slug, purpose)` clears that cookie and calls
`refresh()`. This is the "Not you?" / "Sign out" button. There's nothing to revoke on the
server, because the token is stateless.

**`getBuyer.ts`** (NEW fetcher, wrapped in React `cache`): `getBuyer(slug)`
- No checkout cookie → `null` without a request.
- Otherwise GET `checkout/buyer/` → `CheckoutBuyer` or `null` (expired or invalid).

**`getCheckoutPlan.ts`** (NEW fetcher, `cache`): `getCheckoutPlan(slug, planId)` → GET
`plans/<id>/`. Any failure → `notFound()`, so the subscribe page 404s for drafts, inactive
products, one-time products and bad ids.

**`getCheckoutSession.ts`** (NEW fetcher): `getCheckoutSession(slug, sessionId)` → GET
`sessions/<id>/` with the checkout header → status or `null`. Every failure is `null`, which
matches the backend's single 404.

**`startCheckout.ts`** (NEW actions):
- `start(slug, path, body?)` (internal) POSTs `checkout/<path>/` with the checkout header and the cart header.
  - **401** → clear the checkout cookie, `refresh()`, and return `{error, needsVerification: true}`.
    The token expired between page load and click, so the page shows the email form again.
  - Any other non-2xx → `{error}` via `errorFrom`: already subscribed, no spots, blocked, empty cart.
  - OK → `redirect(url)` to Stripe's hosted page.
- `startCartCheckout(slug)` → `start(slug, "session")`.
- `startSubscriptionCheckout(slug, planId)` → `start(slug, "subscription", {plan_id})`.

## 2.3 Checkout UI (`app/(storefront)/_components/checkout/`)
- **`themedStyles.ts`** (NEW): `PRIMARY_CLASS`/`PRIMARY_STYLE` use the storefront's own
  `--sf-fg`/`--sf-bg` colours, and `INPUT_CLASS`. Checkout surfaces sit on themed pages.
- **`emailVerification.tsx`** (NEW, client), the shared OTP form for **both** purposes.
  - Props: `storefrontSlug`, `purpose`, `defaultEmail`, `lockEmail`.
  - State: `email`, `code`, `step` (`"email"` | `"code"`), `expiresAt`, `error`, `signInRequired`.
  - `send()` → `sendCode`. On error, shows it and maybe sets `signInRequired`. On success,
    stores `expiresAt`, clears the code and moves to the `"code"` step.
  - `verify()` → `verifyCode(…, purpose)`. On success there's nothing to do, because the
    action's `refresh()` re-renders the parent past this form.
  - Render:
    - The email input is disabled when locked, at the code step, or while pending.
    - At the code step, a 6-digit numeric input (with `autoComplete="one-time-code"`) shows
      "expires at hh:mm".
    - On `signInRequired` it shows a **`<SignInButton mode="modal">`**. It's a modal, never a
      redirect, so the buyer stays on the storefront.
    - Buttons: Send code / Verify, Resend code, and "Use a different email" (hidden when locked).
  - `formatTime(iso)` uses the browser locale. It only runs client-side after a send, so it
    can't cause a hydration mismatch.
- **`checkoutPanel.tsx`** (NEW, client), the last step before Stripe for both flows.
  - Props: `target` (`{kind: "cart"}` | `{kind: "subscription", planId}`), `buyer` (from
    `getBuyer`), `signedInEmail` (from `getMe`), and `unavailable` (e.g. sold out).
  - `verified` = there's a buyer **and** (signed out **or** `buyer.email ===
    signedInEmail.toLowerCase()`). A guest token left over under a different email doesn't
    count once you're signed in.
  - **Not verified** → "Confirm your email" plus `EmailVerification purpose="checkout"`. When
    signed in, the email is prefilled and **locked**: the backend only accepts the account's
    own email, and the OTP is still required.
  - **Verified** → "Checking out as {email}" (plus "Not you?" → `forgetBuyer` when signed
    out), then one of:
    - `buyer.blocked` → "You can't purchase from this store."
    - `unavailable` → that message
    - otherwise **Continue to payment** → `proceed()` → `startCartCheckout` or
      `startSubscriptionCheckout`. If the action returns at all, the redirect didn't happen,
      so its `error` is shown.
- **`subscribeButton.tsx`** (NEW, no directive, rendered inside the client ProductBlock): a
  `Link` to `/{slug}/subscribe/{planId}`. When `soldOut`, a disabled "Sold out" span instead.
- **`spotsLeft.tsx`** (NEW, no directive, used from both server and client): renders nothing
  when `spots_left` or `max_capacity` is null, otherwise "No spots left" or "3 of 10 spots left".
- **`pendingRefresher.tsx`** (NEW, client): `router.refresh()` every 2 s; after 30 s it stops
  and shows "taking longer than usual … will appear in Purchases shortly". When the page
  becomes `fulfilled` it stops rendering this component, which unmounts it and ends the polling.

### Pages and edits that use them
- **`app/(storefront)/_components/pageblock/blocks/productBlock.tsx`** (CHANGED):
  - Subscription products show a trial pill (a ternary, so `0` never renders as text),
    `SpotsLeft`, and `SubscribeButton` (`soldOut = spots_left === 0`).
  - One-time products show `AddToCartButton` with the quantity input.
  - **This is the front-end "cart refuses subscriptions" guard.** The real guard is the
    backend's cart validation.
- **`app/(storefront)/[storefrontSlug]/(public)/cart/page.tsx`** (CHANGED): also fetches
  `getBuyer` and `getMe` in the same `Promise.all`, and renders
  `<CheckoutPanel target={{kind:"cart"}} …>` under the total.
- **`…/(public)/subscribe/[planId]/page.tsx`** (NEW), the "subscription cart" with one item.
  - `Promise.all(getStorefrontDetails, getCheckoutPlan, getBuyer, getMe)`.
  - Picks the plan from `product.plans` by `plan_id`, and shows the name, price and interval,
    the trial note and `SpotsLeft`.
  - `<CheckoutPanel target={{kind:"subscription", planId}} unavailable={spots_left===0 ? "full" : null}>`.
  - It is also Stripe's **`cancel_url`** for subscriptions.
- **`…/(public)/checkout/success/page.tsx`** (NEW), Stripe's **`success_url`**:
  1. No `session_id` → `notFound()`.
  2. `getCheckoutSession`, and computes `landing = orderPages(storefront)[0]` for "Continue shopping".
  3. Branches:

     | Session | Page |
     |---|---|
     | `null` (no cookie, expired, not yours, bad id) | "Thank you … will appear in Purchases shortly" (generic) |
     | `status !== "complete"` | "Checkout not completed … you haven't been charged" |
     | `payment_status === "unpaid"` | "Payment processing" (delayed method) |
     | complete and paid | "Thank you for your order" / "You're subscribed", "You paid $X" or "Your free trial has started". Then `fulfilled ? "added to your Purchases" : <PendingRefresher/>` |

  4. The links are "View purchases" → `/{slug}/purchases` and "Continue shopping".

## 2.4 Buyer Purchases

### Data: `lib/api/purchases/getPurchases.ts` (NEW)
- `PurchaseKind = "subscriptions" | "orders"`; `PurchasePage` is the union of the two paginated shapes.
- `read(path, headers)`:
  - **401 or 403 → `null`**, meaning "not allowed": the page shows a gate, not an error.
  - Any other failure → `{error}`.
  - OK → JSON.
- `getMyPurchases(kind, page)` → `billing/purchases/<kind>/?page=`, using the Clerk header only.
- `getStorePurchases(slug, kind, page)` → `storefronts/<slug>/purchases/<kind>/` with the
  **purchases** cookie header, plus Clerk if signed in. The backend prefers Clerk.

### Shared display (`components/purchases/`, `components/linkTabs.tsx`)
- **`format.ts`**:
  - `formatDate` (pinned to en-US).
  - `cardLabel(brand, last4)` → "Visa •••• 4242", or null when there's no last4.
  - `subscriptionPrice(sub)` → "$10.00 every month".
  - `subscriptionTimeline(sub)`, the one date that matters right now:
    - canceled or expired → "Ended {date}"
    - past_due or unpaid → "Payment overdue …"
    - trialing → "Trial ends {date}", with ", then it ends" if `cancel_at_period_end`
    - otherwise → "Renews {date}", or "Ends {date}" if `cancel_at_period_end`
  - `subscriptionStatus(sub)` → `{label, tone}` from the `STATUS` map:
    - Active and Trial → good
    - Past due, Unpaid and Incomplete → warn
    - Paused, Ended and Expired → muted
- **`statusBadge.tsx`**: a pill with fixed colours per tone (not themed, so a warning always reads as one).
- **`subscriptionCard.tsx`**: product, "plan · price", badge, an optional store link
  (`showStorefront`), the timeline, the card, and an `aside` slot that the seller view uses
  for "Buyer: email".
- **`receiptCard.tsx`**: date, "One-time purchase" or "Subscription payment", the "Paid"
  badge and total, each line (name × qty and its total), an optional store link, the card,
  and `aside`.
- **`pager.tsx`**:
  - `Pager` renders ← Newer / Older → links from DRF's `next` and `previous`, and nothing
    when everything fits on one page.
  - `pageParam(value)` turns `?page=` into an integer ≥ 1.
- **`purchaseList.tsx`**: the body of one subtab. It shows the error, an empty state ("No
  subscriptions yet."), or the cards plus the `Pager`.
- **`components/linkTabs.tsx`**: route-based tabs (`{href, label, active}[]`). `themed` swaps
  the stone chips for storefront colours.
- **`components/purchasesLink.tsx`**: a "Purchases" link to `/{slug}/purchases`. It's
  `hidden` on drafts, where the navbar's `cartCount === null`.

### Storefront Purchases (`/{slug}/purchases`)
- `…/(public)/purchases/page.tsx` redirects to `…/purchases/subscriptions`.
- `…/purchases/subscriptions/page.tsx` and `…/purchases/orders/page.tsx` are thin pages that
  pass `kind` and `page` to the view below.
- **`app/(storefront)/_components/purchases/storePurchasesView.tsx`** (NEW, server):
  - `Promise.all(getStorefrontDetails, getMe, getStorePurchases)`. A draft → `notFound()`.
  - **`data === null`** → the gate: "Confirm your email" + `EmailVerification
    purpose="purchases"` + "Have a Parcely account? Sign in" (modal).
  - Otherwise: themed tabs (Subscriptions | Orders), then "Signed in as {email}" when signed
    in or `SignOutPurchasesButton` when a guest, then `PurchaseList` with
    `showStorefront={false}`, since it's all one store.
- **`signOutPurchasesButton.tsx`** (NEW, client): "Not you? Sign out" → `forgetBuyer(slug, "purchases")`.

### Platform Purchases (`/purchases`)
- `app/(main)/purchases/page.tsx` redirects to `/purchases/subscriptions`.
- `…/subscriptions/page.tsx` and `…/orders/page.tsx` are thin pages.
- **`app/(main)/_components/myPurchasesView.tsx`** (NEW, server):
  - `getMe()`. Signed in → `SignedIn`; signed out → `SignedOut`.
  - `SignedIn`: `getMyPurchases`, then stone `LinkTabs`, then `PurchaseList` with
    `showStorefront`, so each card links to its store. `null` here means the Clerk session
    lapsed mid-render, shown as "Your session expired" rather than an empty list.
  - `SignedOut`: a sign-in modal button, plus a note that guest purchases are on each store's Purchases page.

### Navigation
- `components/homeNavbar.tsx` (CHANGED) adds a "Purchases" button → `/purchases`.
- The 5 themed navbars (`app/(storefront)/_components/storefront/themed/{artist,contemporary,minimalist,professional,timeless}.tsx`,
  CHANGED) each add `<PurchasesLink slug hidden={cartCount === null} className=…/>` before
  `CartLink`, reusing that theme's link classes.

## 2.5 Seller Orders tab
- **`app/(storefront)/_components/editor/settingsTabs.tsx`** (CHANGED) adds `"orders"` to the
  `SettingsTab` union and the `TABS` list.
- **`lib/api/dashboard/getDashboard.ts`** (NEW fetchers):
  - `read<T>(path, fallback)` → `Paginated<T>` or `{error}`.
  - `query(params)` builds the search string, dropping `undefined` and `page=1`.
  - `getStoreOrders(slug, page)`, `getStoreSubscriptions(slug, status, page)` and `getStoreCustomers(slug, page)`.
- **`lib/api/dashboard/customerActions.ts`** (NEW actions):
  - `removeCustomer(slug, id)` POSTs `remove/` and **always** calls `refresh()`. Even a 502
    may have blocked the buyer and cancelled some subscriptions, so the list must show it.
    Returns `{error}` or null.
  - `unblockCustomer(slug, id)` POSTs `unblock/` and refreshes on success.
- **`app/(storefront)/[storefrontSlug]/(editor)/orders/page.tsx`** (NEW):
  - Awaits `params` and `searchParams`, then **`requireStorefrontOwner(slug)`**, which 404s
    for non-owners.
  - Parses `?view=orders|subscriptions|customers` (default orders), `?status=live|ended` and `?page=`.
  - Renders `StoreOrdersView`.
- **`app/(storefront)/_components/editor/orders/storeOrdersView.tsx`** (NEW, server):
  - `href({view, status, page})` builds `/{slug}/orders?…` and drops the defaults.
  - Layout: "← Back to settings", `SettingsTabs active="orders"`, then `LinkTabs` for the
    Orders, Subscriptions and Customers views. On Subscriptions, an All / Live / Ended filter.
  - Each view awaits its fetcher and passes the result to `Section<T>`, which handles the
    error, the empty state, the list and the pager:
    - Orders → `ReceiptCard` with `aside = <Buyer email>`
    - Subscriptions → `SubscriptionCard` with `aside = <Buyer email>`
    - Customers → `CustomerTable`
- **`customerTable.tsx`** (NEW): one row per customer with:
  - the email and an Active/Blocked badge
  - "N orders · $X spent · N live subscriptions" (this store)
  - "Customer since … · blocked …"
  - `CustomerActions`
- **`customerActions.tsx`** (NEW, client):
  - Blocked → **Unblock**.
  - Otherwise **Remove**, which arms a confirm step: "Cancels N live subscription(s) and
    blocks future purchases across all your stores", using `seller_live_subscription_count`,
    with **Keep** and **Confirm remove** buttons.
  - `run(action)` wraps a transition that disarms the confirm and shows any error.

---

# Part 3: Common flows, end to end

### Flow A: Guest buys one-time items (cart)
1. The product page's `ProductBlock` shows `AddToCartButton`, because the product isn't a
   subscription. Adding creates a guest cart, with the `public_session_id` cookie storing
   its token.
2. `/{slug}/cart`: the cart page runs `getBuyer`. With no `buyer_session_<slug>` cookie it
   gets `null`, so `CheckoutPanel` shows `EmailVerification purpose="checkout"`.
3. **Send code** → `sendCode` → `SendOTPEmailAPIView`. This passes because the email isn't an
   account email and the buyer isn't signed in. The code row is created and the email
   written to the MAILERS file.
4. **Verify** → `verifyCode` → `VerifyEmailAPIView`:
   - It consumes the code and gets or creates `Customer(seller, email)`.
   - `find_cart` uses `X-Public-Cart-ID`.
   - It returns the checkout token, which is stored in `buyer_session_<slug>` (1 h), and calls
     `refresh()`.
5. The page re-renders. `getBuyer` → `GET buyer/` → `{email, blocked:false}`, so the panel
   shows "Checking out as … · Not you?" and **Continue to payment**.
6. Click → `startCartCheckout` → `CreateCheckoutSessionAPIView`:
   - The gate passes, `find_cart` runs, and `ensure_stripe_customer` creates `cus_` on the
     seller's account.
   - `create_cart_session` → `{url}`.
   - The action calls `redirect(url)` and the browser goes to Stripe.
7. The buyer pays. Stripe sends `checkout.session.completed` (payment mode, `paid`) and
   redirects the browser to `/{slug}/checkout/success?session_id=cs_…`.
8. The success page → `getCheckoutSession` → `CheckoutSessionStatusAPIView`. The session
   belongs to this buyer. If the webhook hasn't landed yet it reports `fulfilled:false`, so
   the page shows "You paid $X" and `PendingRefresher` starts.
9. Meanwhile the webhook runs `_fulfil_cart_session`:
   - It resolves the customer through metadata, the account and `cus_`, fetches the line
     items, and reads the card.
   - In one transaction it writes the Payment (`cs_`, `pi_`, card), one Order per line, and
     empties the cart.
10. The next refresh sees `fulfilled:true` → "It's been added to your Purchases" and polling stops.

### Flow B: Signed-in buyer, cart
Same as A, except:
- `CheckoutPanel` gets `signedInEmail`. The email is prefilled and **locked**, and the OTP is
  still required.
- `VerifyEmailAPIView` links `Customer.user = you`.
- A leftover guest token under another email doesn't count (`verified` compares emails).
- There's no "Not you?" link, because you're signed in.

### Flow C: Subscription with capacity and a trial
1. `ProductBlock` for a subscription shows the trial pill, "2 of 2 spots left" and
   **Subscribe**, which links to `/{slug}/subscribe/{planId}`. There's no add-to-cart.
2. The subscribe page loads `getCheckoutPlan` (public) along with the buyer and `me`, and
   renders the summary and `CheckoutPanel target=subscription`.
3. Verify (as in Flow A) → **Continue** → `startSubscriptionCheckout` →
   `CreateSubscriptionCheckoutSessionAPIView`:
   - The gate passes, the plan is valid, and the buyer isn't already subscribed.
   - `claim` locks the Product, checks capacity, and creates a `SubscriptionCheckout` (30 min).
   - `create_subscription_session` (trial, `expires_at`, `cancel_url` back to the subscribe page).
   - `attach_session`, then the action redirects to Stripe.
   - The product now reads "1 of 2 spots left" to everyone: the reservation counts.
4. **If the buyer clicks back on Stripe**, they land on `/{slug}/subscribe/{planId}`. The
   reservation is still live, so Continue → `claim` returns the same reservation → the same
   idempotency key → Stripe returns the **same open session**.
5. **The buyer completes it.** Stripe fires these events in any order; each converges on the
   same rows:
   - `checkout.session.completed` (`no_payment_required` for a trial, `paid` otherwise) →
     `_fulfil_subscription_session` → retrieve the `sub_` → `_sync_subscription` writes the
     `Subscription` (si_, `trialing`/`active`) and **deletes the reservation** in the same
     transaction.
   - `customer.subscription.created` → `_sync_subscription`, which writes the same values.
   - `invoice.paid` (the first invoice, $0 on a trial) → if the `si_` is unknown, it syncs
     first. Then it writes `Payment(in_)`, with no pi on a trial so the card is null, plus
     one `Order` linked to the Subscription.
6. Success page: subscription mode is `fulfilled` once a Subscription row exists for that
   `sub_` → "You're subscribed" / "Your free trial has started".
7. Capacity is now 1 live subscriber + 0 reservations → "1 of 2". When full → "Sold out" on
   the block, and the subscribe page shows "This subscription is full right now."

### Flow D: Renewals and lifecycle (webhook only, no user action)
| Stripe does | Event | Our effect |
|---|---|---|
| Period renews and charges | `invoice.paid` | New `Payment(in_, pi_, card)` and one `Order` → **same** Subscription row. `customer.subscription.updated` also arrives and moves `current_period_end`. |
| Trial ends and converts | `customer.subscription.updated` + `invoice.paid` | status `trialing` → `active`, plus the first paid Payment |
| Renewal card fails | `invoice.payment_failed` | Retrieve and sync → `past_due` (later `unpaid` or `canceled`). No Payment. |
| Buyer or seller schedules a cancel at period end | `.updated` | `cancel_at_period_end=true` → the UI shows "Ends {date}" |
| Subscription ends | `customer.subscription.deleted` | `mark_subscription_ended` → `canceled` and `ended_at`. The rows and receipts are kept. |
| Plan swapped on the same sub | `.updated` | The old `si_` row is retired (canceled) and the new `si_` row is created |
| Abandoned session expires | `checkout.session.expired` | Reservation deleted (slot freed), cart's session id cleared |

### Flow E: Guest views purchases on a storefront
1. `/{slug}/purchases` redirects to `/{slug}/purchases/subscriptions`.
2. `StorePurchasesView` → `getStorePurchases`. There's no Clerk login and no
   `purchases_session_<slug>`, so the backend `_customers()` gives `None` → **401** → `null`.
3. The page shows the gate: `EmailVerification purpose="purchases"`.
4. Send code (same endpoint) → Verify with `purpose: "purchases"`. The backend skips
   `find_cart` and signs with the **purchases salt**. The token is stored in
   `purchases_session_<slug>` and the page refreshes.
5. `X-Purchases-Session` is now sent. `purchases_buyer_from_request` → that one Customer
   (this seller only) → the paginated list.
6. The tabs switch between `…/subscriptions` and `…/orders`, re-fetching with the same cookie
   for up to an hour. "Not you? Sign out" deletes the cookie, so the gate is shown again.

### Flow F: Signed-in buyer views purchases
- **On a storefront** (`/{slug}/purchases`): the backend uses Clerk:
  `signed_in_customers(you).filter(seller=owner)`. No gate. The header shows "Signed in as …".
- **Platform-wide** (`/purchases`): `billing/purchases/<kind>/` →
  `signed_in_customers(you)`, every seller. Each card links to its store.
- **Signed out on `/purchases`**: a sign-in modal plus the "use the store's page" hint.

### Flow G: Seller dashboard, then Remove and Unblock
1. Settings → **Orders** tab → `/{slug}/orders`. `requireStorefrontOwner` lets only the owner
   through. The default view, Orders, calls `getStoreOrders` → `StoreOrdersAPIView`
   (owner-checked again) → receipts with "Buyer: email".
2. **Subscriptions** view (`?view=subscriptions[&status=live|ended]`) → subscription cards with the buyer.
3. **Customers** view → `_customers_of` → the table with per-store counts.
4. **Remove** → confirm ("Cancels 2 live subscriptions …") → `removeCustomer` → `RemoveCustomerAPIView`:
   - It blocks the customer, cancels each live `sub_` at Stripe, and marks them ended locally.
   - It returns the row and the page refreshes: the badge reads **Blocked**, and the
     subscriptions show Ended.
   - The later `customer.subscription.deleted` webhook rewrites the same values.
5. The blocked buyer then tries to check out:
   - `getBuyer` returns `blocked:true`, so the panel says "You can't purchase from this store."
   - If they somehow POST anyway → 403.
   - Their Purchases pages still work.
6. **Unblock** → `blocked_at=null`. They can buy again; nothing is resubscribed.

---

# Part 4: Specific edge cases

### Identity and OTP
| Case | What happens | Where |
|---|---|---|
| A guest types an email that belongs to a Parcely account | send-otp returns 403 `{detail}` → `signInRequired` → the Clerk **modal** sign-in button | `SendOTPEmailAPIView`, `codeErrorFrom`, `emailVerification.tsx` |
| Signed in, a different email is submitted | 403 `{error}`. In the UI the email field is locked, so normally unreachable | both OTP views |
| Wrong code | 400 "Invalid code". At 3 attempts the row is deleted and a new code is needed | `VerifyEmailAPIView` |
| Code older than 10 min | No live row → 400 | `OTP_TTL` |
| Resend | The earlier code is consumed; only the newest works | send-otp |
| Checkout token used on the purchases endpoints, or the reverse | Signature fails (different salt) → treated as no token | `buyer_session._SALTS` |
| Token from seller A's store used at seller B's | `read_buyer_customer` filters `seller_id=storefront.owner_id` → `None` | |
| Two storefronts of the **same** seller | Separate cookies per slug, so the buyer verifies once per store, but the Customer row is the same | `buyerSession.ts` |
| Token expires (60 min) while on the cart or subscribe page | Continue → 401 → the action clears the cookie and refreshes → the email form comes back with "Your verification expired" | `startCheckout.ts` |
| Leftover guest checkout token, then the buyer signs in as another email | `verified` is false, so they verify as themselves | `checkoutPanel.tsx` |

### Checkout
| Case | What happens |
|---|---|
| Adding a subscription plan to the cart | The UI has no button; the backend cart validation rejects it anyway |
| Already subscribed to the product (any plan of it) | 409 "You are already subscribed to X", shown under the button |
| Last spot taken between page load and click | `claim` → `CapacityFull` → 400 "No spots left" |
| Double-clicking Continue | The same idempotency key → the same Stripe session |
| Stripe API down when creating a session | 502. The subscription path releases the reservation immediately |
| Cancelling on Stripe (subscription) | Back to the subscribe page; the reservation is kept for its 30 min; Continue resumes the same session. (But see gap #1.) |
| Cancelling on Stripe (cart) | Back to `/cart`, cart intact |
| Store not onboarded to Stripe | 409 "This store cannot accept payments yet." |
| Blocked customer | `GET buyer/` → `blocked:true` → message instead of the button; POST → 403 |
| Draft store | Every buyer endpoint 404s; `PurchasesLink` is hidden |

### Success page
| Case | What happens |
|---|---|
| No `?session_id` | 404 |
| Guessed or someone else's `cs_` | Backend 404 (ownership check) → generic "Thank you … will appear in Purchases" |
| Cookie gone (another browser, or more than 60 min on Stripe's page) | Same generic message. Fulfilment still happens via the webhook. |
| Webhook slower than the redirect | "Confirming your payment…", polling every 2 s, giving up at 30 s with a reassurance message |
| Delayed payment method | "Payment processing". Fulfilled later by `async_payment_succeeded` |
| Trial | "Your free trial has started — nothing was charged today." |

### Webhook / fulfilment
| Case | What happens |
|---|---|
| The same event delivered twice | The `StripeEvent` unique id; a processed event → 200 without re-running |
| `completed` and `async_payment_succeeded` for one payment | `Payment.get_or_create(cs_)` → the second returns early |
| First `invoice.paid` arrives before `subscription.created` | Unknown `si_` → retrieve and sync, then write the Payment and Order |
| Forged metadata naming another seller's customer | `_customer_for` joins on `event.account` and checks `cus_` → `None` → logged, no write |
| Price edited after purchase (old `price_` archived) | `_plan_by_metadata(price.metadata.plan_id)` still resolves |
| Plan deleted / unresolvable line | That line is skipped and logged; the Payment stands (sum ≠ amount is the alarm) |
| Card lookup fails | Payment written with a null card; a warning is logged |
| `$0` trial invoice | Payment with `in_` only, `amount 0`, no card; one Order at unit 0 |
| Subscription written into an already-full product (a race) | Row written with `over_capacity=True`; never refused after payment |

### Purchases
| Case | What happens |
|---|---|
| Signed in, but the guest purchase used a different email | Not shown: the signed-in path matches only `user=you` or your primary Clerk email, and the guest gate is never shown while signed in. Sign out and use the store's OTP, or verify that email while signed in to link it (only possible if it's your account's email). |
| Clerk account with a secondary email | Only the primary `AppUser.email` is matched |
| A payment with no Orders (every line unresolvable) | `storefront` is `null`; the card renders without a store link |
| Cancelled subscription | Shown after live ones, badge "Ended", "Ended {date}" |
| A blocked buyer opens Purchases | Works normally |

### Seller dashboard
| Case | What happens |
|---|---|
| Non-owner opens `/{slug}/orders` or calls `dashboard/*` | 404 (frontend `requireStorefrontOwner`, backend `owner=request.user`) |
| Remove a customer of a different seller via a crafted id | `Customer(pk, seller=request.user)` → 404 |
| Stripe cancel fails midway | 502; the block stays; cancelled ones stay cancelled; Remove again finishes the rest |
| Subscription already cancelled at Stripe, our row not yet updated | cancel → InvalidRequestError → retrieve → terminal → marked ended, not a failure |
| Customer with subscriptions at the seller's **other** store | Those are cancelled too, and the confirm text says so (`seller_live_subscription_count`) |
| Unblock | Only clears the flag; old subscriptions stay ended |

### Routing
- `subscribe`, `checkout`, `purchases` and `orders` are now **reserved slugs** under
  `/{storefrontSlug}/`, alongside `cart`, `products` and `settings`. A storefront page with one
  of those slugs is shadowed by the static route.

---

# Part 5: Known gaps and follow-ups (not fixed)

1. **The buyer's own reservation makes the last spot look sold out to them.** `spots_left`
   counts every unexpired reservation, while `claim()` excludes the caller's own.
   - Example: on a product with one spot, the buyer who reserved it and backs out of Stripe
     returns to the subscribe page.
   - The page shows "full" (`unavailable` hides Continue) and the product block shows "Sold
     out", for up to 30 minutes.
   - So the "Continue resumes the same session" path from Flow C step 4 only works while
     other spots remain.
   - Fix: when there's a checkout token, have the plan endpoint (or `getBuyer`) report
     `spots_left` excluding that customer, or don't hide Continue on the subscribe page and
     let `claim` decide.
2. **No `account_id is None` guard in fulfilment.** A platform event delivered to the Connect
   endpoint would run the handlers with `None`. The lookups then match nothing (so no harm),
   but it's noise.
3. **The invoice path has no plan-by-metadata fallback.** If a line has no subscription and
   its price was archived, it is dropped (`_plan_by_price` only).
4. **`_sync_subscription` on `subscription.updated` isn't wrapped in `atomic`.** The retire
   step and the upserts could commit separately if it fails midway.
5. **The Connect endpoint must be subscribed to all 9 events** in `_HANDLERS`, especially
   `customer.subscription.updated`, or renewal dates and cancel-at-period-end never update.
6. **`Customer.default_pm_brand` and `default_pm_last4` are never written.** The card now
   lives on Payment.
7. **No buyer-side cancel or card change.** By design, the purchases token is read-only; that
   would need a fresh OTP or Clerk.
8. **Not verified end to end against Stripe test mode.** That needs a published storefront,
   Clerk and `stripe listen --forward-connect-to localhost:8000/webhooks/stripe/connect/`.

---

## Appendix: cookies and headers

| Cookie (httpOnly) | Set by | Header sent to Django | Read by |
|---|---|---|---|
| `buyer_session_<slug>` | `verifyCode(purpose="checkout")` | `X-Buyer-Session` | `getBuyer`, `startCheckout`, `getCheckoutSession` → checkout views |
| `purchases_session_<slug>` | `verifyCode(purpose="purchases")` | `X-Purchases-Session` | `getStorePurchases` → `_StorePurchasesAPIView` |
| `public_session_id` | cart actions, `verifyCode` | `X-Public-Cart-ID` | `find_cart` (cart, checkout, verify) |
| Clerk session | Clerk | `Authorization: Bearer` (`apiFetch`) | every view; `request.user` |
