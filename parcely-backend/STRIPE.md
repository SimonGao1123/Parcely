# Stripe Integration Design

Status: **design only — no Stripe code exists yet.** `accounts/models.py` still
carries the placeholder TODO. Sandbox is provisioned, Stripe CLI installed, and
Accounts v2 creation has been verified end to end against Parcely's exact config.

## Core assumptions

1. **Stripe Connect with Accounts v2.** Sellers are connected accounts created via
   `POST /v2/core/accounts`. The v1 `type: "express" | "standard" | "custom"`
   model is deprecated and Stripe now errors on it for new integrations.
2. **The seller is an `AppUser`, not a `StoreFront`.** A seller is a legal entity
   that gets paid; one person running three storefronts is one connected account.
3. **Direct charges.** The seller is merchant of record. Parcely's cut is an
   application fee.
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

Gate selling on `configuration.merchant.capabilities.card_payments.status ==
"active"`. `charges_enabled` and `payouts_enabled` are deprecated v1 fields.

---

## 1. Two object graphs

There is a local graph and a Stripe graph, and they are not the same shape. The
mapping between them is the whole integration.

### 1.1 Local models

```
IDENTITY                                      CATALOG
══════════════════════════                    ══════════════════════════════

┌────────────────────────────┐   owner   ┌────────────────────────────┐
│ AppUser                    │──────────►│ StoreFront                 │
│   clerk_id                 │           │   currency                 │
│   email                    │           └─────────────┬──────────────┘
│   stripe_account_id   ★NEW │                         │ storefront
│   card_payments_status★NEW │                         ▼
└──────────┬─────────────────┘           ┌────────────────────────────┐
           │ seller                      │ Product                    │
           │                             │   is_subscription          │
           │        ┌────────────────────│   max_capacity             │
           │        │                    │   NOT SYNCED TO STRIPE     │
           │        │                    └─────────────┬──────────────┘
           │ user   │                                  │ product
           │ (NULL- │                                  ▼
           │  ABLE) │                    ┌────────────────────────────┐
           │        │                    │ Plan                       │
           ▼        ▼                    │   price_cents              │
┌────────────────────────────┐           │   billing_interval         │
│ Customer              ★NEW │           │   billing_interval_count   │
│   seller  ──► AppUser      │           │   trial_period_days        │
│   user    (nullable)       │           │   stripe_product_id   ★NEW │
│   email                    │           │   stripe_price_id     ★NEW │
│   email_verified_at        │           └──────┬──────────────┬──────┘
│   stripe_customer_id       │                  │              │
│   default_pm_brand         │            plan  │              │ plan
│   default_pm_last4         │                  │              │
└───┬────────────────────┬───┘                  │              │
    │ customer           │ customer             │              │
    ▼                    ▼                      │              │
```

```
PURCHASE (one-time)              RECURRING                 CART (pre-purchase)
═══════════════════════          ══════════════════        ═══════════════════

┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│ Order           ★NEW │  │ Subscription    ★NEW │  │ Cart                 │
│   ONE PER PLAN       │  │   ONE PER PLAN       │  │   storefront         │
│   plan ──────────────┼┐ │   customer           │  │   user     (nullable)│
│   quantity           ││ │   plan ──────────────┼┐ │   public_session_id  │
│   unit_price_cents   ││ │   stripe_sub_id      ││ └──────────┬───────────┘
│      (SNAPSHOT)      ││ │   status             ││            │ cart
│   stripe_price_id    ││ │   current_period_end ││            ▼
│      (SNAPSHOT)      ││ │   cancel_at_period_  ││ ┌──────────────────────┐
│   payment ───────┐   ││ │     end              ││ │ CartItem             │
└──────────────────┼───┘│ │   unit_price_cents   ││ │   plan ──────────────┼┐
                   │    │ │      (SNAPSHOT)      ││ └──────────────────────┘│
     N Orders ─────┤    │ │   stripe_price_id    ││                         │
     share ONE     │    │ │      (SNAPSHOT)      ││                         │
     Payment       │    │ └──────────┬───────────┘│                         │
                   │    └────────────┼────────────┴─────────────────────────┘
                   ▼                 │ subscription   (all point to Plan)
    ┌────────────────────────────────┐│ (1 Subscription : N Payments)
    │ Payment                   ★NEW │◄┘
    │   customer      NOT NULL       │
    │   kind: onetime | recurring    │
    │   subscription    (nullable)   │  set iff kind = recurring
    │   stripe_checkout_session_id   │  (nullable — renewals have none)
    │   stripe_payment_intent_id     │
    │   stripe_invoice_id (nullable) │
    │   amount_cents, currency       │
    │   status                       │
    └────────────────────────────────┘
      one row per CHARGE — initial AND every renewal.
      Grouping entity for one-time purchases:
      a 3-plan cart = 3 Order rows, 1 Payment, 1 charge.

INFRASTRUCTURE
══════════════
┌──────────────────────────┐   ┌──────────────────────────────┐
│ StripeEvent         ★NEW │   │ EmailVerification       ★NEW │
│   stripe_event_id UNIQUE │   │   email, seller              │
│   stripe_account_id      │   │   code_hash, expires_at      │
│   type, processed_at     │   │   consumed_at, attempts      │
└──────────────────────────┘   └──────────────────────────────┘
   webhook idempotency          issues the OTP at checkout AND
                                on return. No second credential
                                type: on success the view sets
                                request.session["customer_id"].
```

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
│     ├── PaymentMethod (pm_...)         ← saved card. attached = reusable
│     │     └── invoice_settings.default_payment_method
│     │
│     ├── Subscription (sub_...)         ← one per Plan (see §4)
│     │     └── SubscriptionItem (si_...) ──► Price
│     │           ↑ Stripe allows many; we always create exactly one,
│     │             so we don't mirror this table locally
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

Three structural facts that drive the rest of this document:

- **`Customer` and `PaymentMethod` are scoped to a single account.** A card saved
  with seller A is not usable with seller B. The same human buying from two
  sellers is genuinely two `cus_...` objects, and **Stripe has no merge API.**
- **`Price` is immutable.** Editing a price means creating a new `Price` and
  archiving the old one. Existing subscribers keep billing on the old one.
- **Invoices and Checkout render the Product name, never the Price.** This is the
  entire reason for the mapping in §2.1.

---

## 2. Mapping table

| Local model | Stripe object | ID field | Created by | Source of truth |
|---|---|---|---|---|
| `AppUser` (seller) | `Account` v2 | `stripe_account_id` | Connect onboarding | Stripe |
| `Product` | — | — | — | local only |
| `Plan` | `Product` + `Price` | `stripe_product_id`, `stripe_price_id` | us, on save | **us** (push) |
| `Customer` | `Customer` | `stripe_customer_id` | us, after verification | **us** (push) |
| — (card) | `PaymentMethod` | not stored; brand/last4 cached | Stripe-hosted Checkout | Stripe (pull) |
| `Subscription` | `Subscription` | `stripe_subscription_id` | Checkout Session | Stripe (webhook) |
| `Order` | line item | `stripe_price_id` snapshot | us, at checkout | **us** |
| `Payment` | `PaymentIntent` / `Invoice` | `stripe_payment_intent_id`, `stripe_invoice_id` | Stripe | Stripe (webhook) |
| `StripeEvent` | `Event` | `stripe_event_id` | Stripe | Stripe |

`Order` has **no** Stripe counterpart. Stripe has no concept of an order — it has
charges. `Order` is purely ours: the record of *what was bought*. `Payment` is the
record of *money moving*, and it is the only one of the two that mirrors a Stripe
object.

Note the cardinalities run in opposite directions, which is why one table can't
serve both:

```
one-time    N Order ──────────► 1 Payment      (one charge, many plans)
recurring   1 Subscription ◄─── N Payment      (one plan, many renewals)
```

There is deliberately **no separate "checkout" table**. A cart containing both
kinds produces one `Payment` plus N `Subscription`s with nothing tying them
together. The only thing that costs is the ability to say "show me that one
checkout," and a buyer asking that really wants their receipts — a `Payment`
query.

Rule of thumb: **catalog flows out, money flows in.** We own Product/Price/Customer
and push changes to Stripe. Stripe owns anything with a payment state, and we only
learn about it through webhooks — never by trusting a browser callback.

### 2.1 `Plan` → Stripe `Product` + `Price`

Each **`Plan`** becomes its own Stripe Product paired with one Price. The Parcely
`Product` is never pushed to Stripe; it stays local as grouping and display
metadata.

```
Parcely                    Stripe                          Buyer's receipt
─────────────────          ────────────────────────        ────────────────────
Product "Coffee"    ──►    (not synced)
  Plan Small $15    ──►    Product "Coffee — Small"  ──►   Coffee — Small   $15
                             + Price $15/mo
  Plan Large $25    ──►    Product "Coffee — Large"  ──►   Coffee — Large   $25
```

The alternative — Parcely `Product` → Stripe `Product`, `Plan` → `Price` — is the
obvious mapping and is functionally correct, but every line item on every receipt
would read `Coffee`, because **the Price name is never displayed** and
`Price.nickname` is dashboard-internal. Two plans under one product produce
indistinguishable receipts and no per-plan revenue breakdown in the seller's
dashboard.

Both options cost the same: two ID columns either way, no extra tables. This one
just puts `stripe_product_id` on `Plan` instead of `Product`.

Cost of this choice: monthly and annual variants of the same tier appear as two
Stripe Products rather than one Product with two Prices. That's a deviation from
Stripe's tier-vs-variant guidance, accepted because the schema has no way to
distinguish a tier from a billing variant, and the consequence is cosmetic.

| Local | Stripe Product |
|---|---|
| `"{product.name} — {plan.title}"`, or `product.name` if `title` is null | `name` |
| `product.description` | `description` |
| `product.display_image` (Blob URL) | `images[0]` |
| `product.is_active` | `active` |

| Local | Stripe Price |
|---|---|
| `price_cents` | `unit_amount` |
| `product.storefront.currency` | `currency` |
| `billing_interval` | `recurring.interval` |
| `billing_interval_count` | `recurring.interval_count` |
| `plan.stripe_product_id` | `product` |
| `trial_period_days` | *not on Price* — passed at Checkout Session create |

`product.is_subscription` has no Stripe counterpart. In Stripe the distinction
lives on the Price (`recurring` set or not). Our model forbids mixing kinds under
one product, which is a local constraint — `Product.clean()` already blocks
flipping the flag under existing plans.

`max_capacity` is likewise ours alone. Stripe will happily oversell; the seat
check has to happen in our checkout transaction before we call Stripe.

Currency comes from the **storefront**, not the plan. That centralization is what
makes a cart total a plain sum and guarantees every line item on a Stripe invoice
shares a currency. Stripe rejects mixed-currency invoices, so this invariant is
load-bearing, not cosmetic.

### 2.2 The immutability problem

Editing `Plan.price_cents` cannot update the Stripe Price:

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
`stripe_price_id`. Reading price through the `Plan` FK would render last month's
purchase at today's price, and would lose track of which Stripe Price an existing
subscriber is actually billed on.

Archived prices stay readable forever in Stripe, so nothing breaks — but our rows
have to remember which one they used. The Stripe **Product** is mutable, so name
and description edits are plain updates.

---

## 3. Constraints

```
AppUser:
  stripe_account_id UNIQUE WHERE NOT NULL

Plan:
  stripe_price_id   UNIQUE WHERE NOT NULL

Customer:
  UNIQUE (seller, email)                      ← the real identity
  UNIQUE (seller, user) WHERE user NOT NULL   ← mirrors the Cart idiom
  CHECK  email_verified_at IS NOT NULL        ← never mint cus_ unverified

Subscription:
  customer NOT NULL
  UNIQUE (customer, plan) WHERE status IS ACTIVE
      ← one live subscription per plan; re-subscribing after cancel is a new row

Payment:
  customer NOT NULL                           ← every purchase is verified
  CHECK (kind = 'recurring') = (subscription IS NOT NULL)
      ← a column check, because "does an Order point at me" is not expressible
        as one. This is the weaker replacement for a true XOR.
  UNIQUE (stripe_payment_intent_id) WHERE NOT NULL   ← webhook replay safety

StripeEvent:
  UNIQUE (stripe_event_id)
```

`Payment.customer` is **NOT NULL** because verification is required for every
purchase, one-time included. There is no guest-payment path and no second claim
query.

`email_verified_at` is what makes account-less checkout safe, **not** the presence
of an `AppUser`. Because an unverified email can never reach a `cus_...`, nobody
can type someone else's address and inherit their saved cards or subscriptions —
and nobody receives an itemised receipt for a purchase they didn't make.

This is the same hazard `Cart.clean()` already guards against: it refuses to let a
cart have both a user and a session token, so a shared browser can't replay a
token into a signed-in user's cart. The verification gate is that rule applied to
payment identity.

---

## 4. Checkout

Every purchase goes through a **Checkout Session** created on the seller's
connected account. Raw PaymentIntents are reserved for off-session charges.

```
cart ──► verify email (§5) ──► resolve Customer ──► Checkout Session ──► redirect
                                                                            │
                                     fulfilment happens ONLY on webhook ◄───┘
```

Never pass `payment_method_types`. Omitting it enables dynamic payment methods,
which Stripe selects and ranks per buyer; hardcoding `["card"]` silently disables
everything else.

### 4.1 Splitting a cart

All one-time items collapse into **one** charge. Each subscription plan becomes
its **own** Stripe Subscription.

```
Cart (always single-storefront → never splits across connected accounts)
├── Plan A   one-time    $20 ×2
├── Plan B   one-time    $15 ×1
└── Plan C   monthly     $10 ×1
         │
         ├─ ALL one-time items ──► one Payment ──► one charge  $55
         │                            Order(A, ×2, $20) ┐ both point
         │                            Order(B, ×1, $15) ┘ at that Payment
         │
         └─ subscription plan ──► its own Stripe Subscription
                  Subscription(customer, Plan C) ──► sub_1   $10/mo
```

**Row count and charge count are independent.** One `Order` row per plan is
correct — it is what lets each line carry its own quantity and price snapshot.
What must *not* happen is one charge per plan. Stripe's fee has a fixed
per-charge component (~$0.30 US) on top of the percentage, so splitting a 3-item
cart into 3 charges burns an extra $0.60 and puts 3 lines on the buyer's
statement for zero benefit.

### 4.2 Session mode

```
subscriptions in cart │ mode           │ one-time items
──────────────────────┼────────────────┼──────────────────────────────
        0             │ "payment"      │ line_items on the session
        1             │ "subscription" │ line_items on the first invoice
        2+            │ BLOCKED at cart level
```

**A Checkout Session creates at most one Subscription.** A cart with two
subscription plans cannot be one session. The options are N sequential redirects
(bad — buyers abandon mid-cart, leaving a half-purchased cart), or one session
followed by off-session subscription creation using the saved card (which risks
`incomplete` subscriptions when a later charge triggers 3DS).

**Proposed:** cap the cart at one subscription per checkout, enforced in
`CartItem.clean()` alongside the existing quantity cap. This makes every cart map
to exactly one session and removes the failure mode entirely. Buying two
different subscriptions from one storefront in a single checkout is rare enough
that the constraint is close to free.

⚠ **Not yet verified against the docs.** Confirm that `mode: "subscription"`
accepts one-time line items on the first invoice before relying on this.

### 4.3 Why subscriptions do not merge

Stripe *would* allow two monthly plans to share one Subscription as two line
items, saving a charge. We deliberately don't, because **cancellation lifecycle
is per-plan.** A subscriber cancelling one while keeping the other is routine, and
on a grouped subscription that becomes an item-removal with proration rather than
a plain cancel. Independent trials, capacity checks, and `cancel_at_period_end`
all have the same problem.

This also means `Subscription` is exactly the join table between `Customer` and
`Plan` — no line-item table beneath it. `CartItem.clean()` already caps
subscription quantity at 1, so there was never a quantity to store.

Regardless of preference, Stripe will not merge **different intervals** into one
Subscription, and will not merge across **different connected accounts**. The
latter is already impossible here — `Cart`'s per-storefront unique constraints
guarantee a cart never spans two sellers. That constraint is load-bearing for
payments; keep it.

---

## 5. Buyer identity and lifecycle

The identity is a **verified email**. An `AppUser` is an optional link on top of
it. Verification is required for every purchase.

```
① BUY (no account) — one-time or subscription, same gate
   anon browses ──► adds to Cart (public_session_id)
        │
        ▼ checkout
   enter email ──► 6-digit code ──► verified ═══╗
                                                ║  gate
   ╔════════════════════════════════════════════╝
   ║ Customer(seller, user=NULL, email, email_verified_at=now)
   ║   └─ Stripe Customer created on the seller's connected account
   ║ Checkout Session ──► card entered ──► PaymentMethod attached
   ║ webhook ──► Payment / Subscription rows
   ╚════════════════════════════════════════════════════════════

② RETURN, months later, cookies cleared
   "Manage purchases" ──► enter email ──► code ──► session cookie
        └─ resolves (seller, email) ──► same Customer row
             └─ Stripe Customer Portal: cancel / swap card / invoices

③ LINK AN ACCOUNT (optional, any time)
   signs up via Clerk, Clerk-verified email == Customer.email
        └─ Customer.user = AppUser        ← plain FK set, same row
             └─ NO Stripe merge needed. Subscriptions, cards,
                invoice history all carry over untouched.
```

Step ③ is why the verification gate earns its friction. **Stripe has no API to
merge two `Customer` objects.** If buyers got an unverified throwaway customer, a
buyer who later signed up would end up with two `cus_...` on one seller — split
cards, split invoice history, permanently. Verifying up front makes the upgrade a
metadata update on a row that already exists.

The claim query on sign-in matches every Clerk-verified email on the new account
against `Customer(email=…, user__isnull=True)`. The `user__isnull` filter is what
makes it idempotent and stops a second account stealing an already-linked row.

**No magic links.** Step ② was originally a tokenised link emailed to the buyer.
It was cut: OTP already does the job, and a token in a URL leaks through access
logs, `Referer` headers and forwarded mail — and gets consumed by corporate link
scanners (Outlook Safe Links, Proofpoint) before the buyer ever clicks, so a
single-use link is often already dead on arrival. A 6-digit code has none of
those failure modes. Losing an email is never a lockout, because the mailbox is
the credential and a new code can always be requested.

Step ② reuses `EmailVerification` unchanged — same table, same endpoints, same
`(email, seller)` key. Both paths grant an identical session, so there is no
privilege difference and no `purpose` column. Only the post-verification redirect
differs.

**Never branch before verification.** Checking whether an email has a `Customer`
and replying "no orders found" turns the form into an oracle for who has bought
from that storefront. Always send the code, always verify, then render an empty
account page if there is nothing. Rate-limit code *requests* per address and per
IP: the endpoint is unauthenticated and sends mail, so uncapped it is a relay for
spamming arbitrary inboxes. `EmailVerification.attempts` caps wrong-code
guessing, which is a different limit.

The gate also means `public_session_id` is never load-bearing for a purchase. It
scopes the cart only; the moment money is involved, identity moves to the verified
email. A cleared cookie loses a cart, never a subscription.

**Prerequisite: Parcely has no email backend.** `core/settings.py` defines no
`EMAIL_BACKEND`. A provider must be wired up before any checkout can ship.

### 5.1 Buyer session

No custom token model. `django.contrib.sessions` is installed and
`SessionMiddleware` is active (`core/settings.py:93`), and its cookie already is
an opaque server-side, revocable, expiring credential — writing another would be
reimplementing it with fewer eyes on it.

```python
request.session.cycle_key()                    # session fixation — see below
request.session["customer_id"] = customer.id
```

```python
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30
SESSION_SAVE_EVERY_REQUEST = True   # sliding expiry
SESSION_COOKIE_SECURE = True        # NOT the default
SESSION_COOKIE_SAMESITE = "Lax"
# SESSION_COOKIE_DOMAIN: leave unset — see below
```

`cycle_key()` is required because Parcely does not use `django.contrib.auth` for
buyers, so nothing rotates the key for free. Without it an attacker can plant a
known `sessionid`, wait for the victim to verify, and inherit the session.

Leaving `SESSION_COOKIE_DOMAIN` unset scopes the cookie to the exact host, so
`maya.parcely.com` and `devon.parcely.com` get separate sessions automatically —
the per-seller isolation that `Customer` already implies. Setting it to
`.parcely.com` would share one session across every storefront, which is a
cross-merchant leak. The `customer.seller_id == storefront.owner_id` check stays
as defence in depth, but the cookie scope does the real work.

**No refresh tokens.** They exist to work around unrevocable stateless JWTs;
these are server-side rows that can be deleted. A lapsed session recovers through
the same OTP flow, so there is no second code path.

Two consequences of buyers being cookie-authenticated while sellers are
header-authenticated via Clerk:

- **CSRF becomes live.** Bearer tokens are not sent automatically, so Clerk
  endpoints are structurally immune; cookies are. `CsrfViewMiddleware` is already
  enabled (`core/settings.py:95`) and will reject buyer POSTs — cancellation
  above all — until the token is plumbed through the frontend.
- **Cross-origin needs care.** `CORS_ALLOW_CREDENTIALS = True` plus
  `credentials: "include"`. `SameSite` is judged on registrable domain, not port,
  so `localhost:3000 → localhost:8000` is same-site and works in dev. In
  production, proxy buyer requests through Next.js route handlers so the browser
  only talks to the storefront origin; that keeps the cookie first-party even on
  custom domains. `SameSite=None` is not a fallback — Safari ITP blocks it
  silently. If the proxy is rejected and the deployment ends up genuinely
  cross-site, buyer auth moves to an opaque header token and a token model
  returns in that form.
- SSR gotcha: `fetch` from a Next.js server component does not inherit browser
  cookies. Forward the header explicitly or buyer pages render logged-out.

---

## 6. Webhooks

> **Superseded by [STRIPE_INIT_INTEGRATION.md](STRIPE_INIT_INTEGRATION.md) for the
> platform endpoint.** The implemented endpoint is `/webhooks/stripe/platform/` and
> consumes v2 *thin* events, not the v1 `account.updated` described below. Thin events
> carry no top-level `account` field, so the `Stripe-Account` header discussed in this
> section is not how the seller is resolved. The Connect endpoint below is still accurate
> as a design, but is **not yet implemented**.

Connect needs **two endpoints with different signing secrets.** Under direct
charges, payment events fire on the *connected* account and arrive on the Connect
endpoint. Account lifecycle events arrive on the platform endpoint.

```
Stripe ──► /webhooks/stripe/          (platform)
             └─ account.updated  ──► AppUser.card_payments_status

Stripe ──► /webhooks/stripe/connect/  (connected accounts)
             │
             ├─ verify signature
             ├─ read Stripe-Account header ──► resolve seller
             ├─ INSERT StripeEvent(stripe_event_id) ── conflict? → 200, drop
             │
             ├─ checkout.session.completed         ──┐ fulfil only when
             ├─ checkout.session.async_payment_...  ─┤ payment_status != "unpaid"
             ├─ checkout.session.async_payment_failed
             │
             ├─ payment_intent.succeeded      ──► Payment(onetime)   status=paid
             ├─ payment_intent.payment_failed ──► Payment(onetime)   status=failed
             ├─ invoice.paid                  ──► Payment(recurring) status=paid
             │                                    Subscription.current_period_end
             │                                      = event's period_end (NOT +=)
             ├─ invoice.payment_failed        ──► Payment(recurring) status=failed
             │                                    Subscription.status = past_due
             ├─ customer.subscription.updated ──► sync status / cancel_at_period_end
             ├─ customer.subscription.deleted ──► Subscription.status = canceled
             └─ payment_method.attached       ──► cache brand / last4
```

Every branch that moves money lands in **`Payment`**, by two different routes:

- **One-time.** `Payment` is created at checkout in `pending`, because the `Order`
  rows need something to point at. The webhook flips its status and fills in the
  PaymentIntent id.
- **Renewals.** The webhook creates the `Payment` outright — nothing local
  initiated it, Stripe just billed the card on schedule.

Either way it is the same table, so "show me this customer's receipts" is one
query and reconciling against Stripe is a diff rather than an audit.

**Fulfilment happens here only.** The browser's success callback is not a
fulfilment signal — a buyer can close the tab before it fires, and it can be
forged.

`checkout.session.completed` fires while the session may still be **unpaid** for
delayed-notification payment methods. Fulfilling on that event alone grants access
to payments that later fail, and never fulfils the ones that eventually succeed.
Check `payment_status` and handle the `async_payment_*` pair.

`StripeEvent` with a unique `stripe_event_id` is not optional. Stripe redelivers
any event that doesn't get a 2xx, so without the dedupe insert a retried
`invoice.paid` writes a duplicate `Payment`.

Events arrive **out of order.** Never derive state by incrementing from the
current row — hence `current_period_end = <value from event>` rather than
`+= interval`. Write the state the event describes and ignore events older than
what is stored. Append-only `Payment` rows are immune to this by construction,
which is a large part of why they beat mutating a status field.

---

## 7. Money movement

Direct charges on the connected account, platform cut as an application fee:

```
buyer's card
    │
    ▼
Charge on acct_seller              ← funds land in the seller's balance
    │
    ├─ application_fee ──────────► Parcely balance
    └─ remainder ────────────────► seller balance ──► payout
```

- One-time: `application_fee_amount` on the Checkout Session's payment intent data.
- Recurring: `application_fee_percent` on the Subscription — it applies to every
  future invoice automatically, so renewals don't need us in the loop.

Because `fees_collector` is `"stripe"`, Stripe bills its processing fees directly
to the seller, not to Parcely. Because the charge lives on the seller's account,
**the seller is liable for disputes and refunds**, and the buyer's statement shows
the seller's descriptor, not Parcely's.

Stripe's fee is ~2.9% + $0.30 per charge, plus ~0.5% Stripe Billing on recurring.
The fixed $0.30 is what makes cheap subscriptions expensive: a $3/mo plan pays an
effective ~13%.

---

## 8. Implementation order

1. **Plumbing.** `stripe` dependency, `requirements.txt`, four settings keys,
   `billing` app, one client module pinning the API version.
2. **Seller onboarding.** `AppUser.stripe_account_id` + `card_payments_status`,
   v2 account creation, AccountLink, status refresh, selling gate.
3. **Webhook infrastructure.** `StripeEvent`, signature verification, both
   endpoints. `account.updated` is the first consumer.
4. **Catalog sync.** `Plan.stripe_product_id` / `stripe_price_id`, push-on-save,
   archive-and-recreate on price edits (§2.2).
5. **Email backend + verification.** Provider, `EmailVerification`, OTP endpoints.
   Blocks everything below.
6. **`Customer`** + buyer session (OTP → `request.session`) + the Clerk
   claim-on-signin hook.
7. **One-time checkout.** Checkout Session `mode: "payment"`, `Order`, `Payment`,
   fulfilment webhooks.
8. **Subscriptions.** `mode: "subscription"`, `Subscription`, lifecycle webhooks,
   Customer Portal.
9. **Tax.**

Steps 1–7 are worth shipping and testing on their own: that is a complete
one-time-purchase store. Subscriptions before working webhooks would mean
silently losing every renewal.

---

## 9. Open decisions

- **Mixed cart** (§4.2). Cap at one subscription per checkout — needs doc
  confirmation that one-time line items ride on a subscription session's first
  invoice.
- **Tax.** `automatic_tax` collects nothing and raises no error until the seller
  has an active registration in the buyer's jurisdiction. Needs a product
  decision before real money moves.
- **Refunds.** No local model. `Refund` hangs off `Payment` (the row with the
  `pi_...`), but seller liability under §7 means the seller may issue refunds in
  their own Stripe dashboard without telling us — so this is webhook-driven, not
  UI-driven.
- **Failed-renewal policy.** Stripe's dunning settings decide when `past_due`
  becomes `canceled`. Needs a decision on grace period and whether access is cut
  at `past_due` or at `canceled`.
- **`max_capacity` enforcement.** The seat check must happen inside the checkout
  transaction, before calling Stripe. Racing checkouts can oversell otherwise.
- **Plan deletion.** `Plan` is `on_delete=CASCADE` from `Product`. Deleting a plan
  with live subscribers needs a guard — the Stripe Subscription would keep billing
  after our row disappeared.
- **Physical fulfilment.** No `requires_shipping` flag or address storage. Checkout
  Sessions can collect shipping addresses natively if needed.
- **Multiple storefronts, one seller.** A buyer purchasing from two storefronts
  owned by the same seller now correctly shares one `Customer` and one saved card.
  Confirm this is desired — it means storefront A's checkout can show a card saved
  at storefront B.
- **Storefront domain topology.** §5.1 assumes buyer requests are proxied through
  Next.js so the session cookie stays first-party. If storefronts stay on
  `*.parcely.com` subdomains, plain CORS works too. Custom domains without the
  proxy force buyer auth to a header token instead of a cookie — decide before
  building the account page.
- **Shipping notifications.** A seller-triggered "your order shipped" email needs
  one field, `Payment.fulfilled_at` — `Payment` is the right grain because one
  checkout and one renewal each map to one shipment, whereas `Order` is per-plan
  and would fire three emails for one box. No send-log table until bounce state is
  needed in a query; the mail provider's dashboard covers debugging until then.
