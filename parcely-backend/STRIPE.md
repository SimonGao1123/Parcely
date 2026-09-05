# Stripe Integration Design

Status: **design only — no Stripe code exists yet.** `subscriptions/` is an empty
scaffold and `accounts/models.py` still carries the placeholder TODO.

## Core assumption

Storefront owners are sellers who receive money, so this is **Stripe Connect**.
Each `StoreFront` maps to a connected account, and charges are **direct charges**
on that account with the platform cut taken as an application fee.

Everything below follows from that. If Parcely ever collects centrally and pays
out separately, most of the scoping rules here get simpler and this doc needs a
rewrite.

---

## 1. Two object graphs

There is a local graph and a Stripe graph, and they are not the same shape. The
mapping between them is the whole integration.

### 1.1 Local models

```
IDENTITY                                    CATALOG
════════════════════════                    ══════════════════════════════

┌──────────────────────┐    owner    ┌────────────────────────────┐
│ AppUser              │────────────►│ StoreFront                 │
│   clerk_id           │             │   currency                 │
│   email              │             │   stripe_account_id   ★NEW │
└──────────┬───────────┘             └─────────────┬──────────────┘
           │                                       │ storefront
           │ user (NULLABLE)                       ▼
           │                         ┌────────────────────────────┐
           │                         │ Product                    │
           │                         │   is_subscription          │
           │                         │   stripe_product_id   ★NEW │
           │                         └─────────────┬──────────────┘
           │                                       │ product
           │                                       ▼
           │                         ┌────────────────────────────┐
           │                         │ Plan                       │
           │                         │   price_cents              │
           │                         │   billing_interval         │
           │                         │   billing_interval_count   │
           │                         │   trial_period_days        │
           │                         │   stripe_price_id     ★NEW │
           │                         └──────┬──────────────┬──────┘
           │                                │              │
           ▼                          plan  │              │ plan
┌────────────────────────────┐              │              │
│ Customer              ★NEW │              │              │
│   storefront               │              │              │
│   user         (nullable)  │              │              │
│   email                    │              │              │
│   email_verified_at        │              │              │
│   stripe_customer_id       │              │              │
│   default_pm_brand         │              │              │
│   default_pm_last4         │              │              │
└───┬────────────────────┬───┘              │              │
    │ customer           │ customer         │              │
    ▼                    ▼                  │              │
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
    ┌──────────────────────────────┐ │  (1 Subscription : N Payments)
    │ Payment                 ★NEW │◄┘
    │   customer                   │
    │   kind: onetime | recurring  │
    │   subscription   (nullable)  │   set iff kind = recurring
    │   stripe_payment_intent_id   │
    │   stripe_invoice_id (null)   │
    │   amount_cents, currency     │
    │   email  (snapshot)          │
    │   status                     │
    └──────────────────────────────┘
      one row per CHARGE — initial AND every renewal.
      This is the grouping entity for one-time purchases:
      a 3-plan cart = 3 Order rows, 1 Payment, 1 PaymentIntent.

INFRASTRUCTURE
══════════════
┌──────────────────────────┐   ┌──────────────────────────────┐
│ StripeEvent         ★NEW │   │ CustomerAccessToken     ★NEW │
│   stripe_event_id UNIQUE │   │   customer                   │
│   stripe_account_id      │   │   token_hash, expires_at     │
│   type, processed_at     │   │   consumed_at                │
└──────────────────────────┘   └──────────────────────────────┘
   webhook idempotency            magic-link / OTP for anon access
```

### 1.2 Stripe-side objects

Everything below the `Account` line lives **inside one connected account**. Two
storefronts means two disjoint copies of this tree.

```
Account (acct_...)                       ← one per StoreFront
│
├── Product (prod_...)                   ← catalog, pushed by us
│     └── Price (price_...)  IMMUTABLE   ← one per Plan revision
│
├── Customer (cus_...)                   ← one per (storefront, verified email)
│     │
│     ├── PaymentMethod (pm_...)         ← the saved card. attached = reusable
│     │     └── invoice_settings.default_payment_method
│     │
│     ├── Subscription (sub_...)         ← one per Plan (see §4)
│     │     └── SubscriptionItem (si_...) ──► Price
│     │           ↑ Stripe allows many; we always create exactly one,
│     │             so we don't mirror this table locally
│     │
│     └── Invoice (in_...)               ← generated per cycle by Stripe
│           ├── InvoiceItem (ii_...)     ← one-time add-ons on first invoice
│           └── PaymentIntent (pi_...)
│                 └── Charge (ch_...)
│                       ├── Refund (re_...)
│                       └── Dispute (dp_...)
│
└── PaymentIntent (pi_...)               ← standalone, cart with NO subscription
      └── Charge (ch_...)
```

Two structural facts that drive the rest of this document:

- **`Customer` and `PaymentMethod` are scoped to a single account.** A card saved
  on storefront A is not usable on storefront B. The same human subscribing to
  two storefronts is genuinely two `cus_...` objects.
- **`Price` is immutable.** Editing a price means creating a new `Price` and
  archiving the old one. Existing subscribers keep billing on the old one.

---

## 2. Mapping table

| Local model | Stripe object | ID field | Created by | Source of truth |
|---|---|---|---|---|
| `StoreFront` | `Account` | `stripe_account_id` | Connect onboarding | Stripe |
| `Product` | `Product` | `stripe_product_id` | us, on save | **us** (push) |
| `Plan` | `Price` | `stripe_price_id` | us, on save | **us** (push) |
| `Customer` | `Customer` | `stripe_customer_id` | us, after email verification | **us** (push) |
| — (card) | `PaymentMethod` | not stored; brand/last4 cached | Stripe.js in browser | Stripe (pull) |
| `Subscription` | `Subscription` | `stripe_subscription_id` | us, at checkout | Stripe (webhook) |
| `Order` | line item on the PI | `stripe_price_id` snapshot | us, at checkout | **us** |
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

There is deliberately **no separate "checkout" table** above these. A cart
containing both kinds produces one `Payment` plus N `Subscription`s with nothing
tying them together. That's fine — the only thing it costs is the ability to say
"show me that one checkout," and a buyer asking that really wants their receipts,
which is a `Payment` query.

Rule of thumb: **catalog flows out, money flows in.** We own Product/Price/Customer
and push changes to Stripe. Stripe owns anything with a payment state, and we only
learn about it through webhooks — never by trusting a browser callback.

### 2.1 Field-level: `Product` → Stripe `Product`

| Local | Stripe |
|---|---|
| `name` | `name` |
| `description` | `description` |
| `is_active` | `active` |
| `display_image` (Blob URL) | `images[0]` |
| `is_subscription` | *no equivalent* — see below |
| `max_capacity` | *no equivalent* — enforced locally |

`is_subscription` has no Stripe counterpart. In Stripe the distinction lives on
the `Price` (`recurring` set or not), and a single Stripe Product can carry both
kinds. Our model forbids that mix, which is a local constraint we enforce
ourselves — `Product.clean()` already blocks flipping the flag under existing
plans.

`max_capacity` is likewise ours alone. Stripe will happily oversell; the seat
check has to happen in our checkout transaction before we call Stripe.

### 2.2 Field-level: `Plan` → Stripe `Price`

| Local | Stripe |
|---|---|
| `price_cents` | `unit_amount` |
| `product.storefront.currency` | `currency` |
| `billing_interval` | `recurring.interval` |
| `billing_interval_count` | `recurring.interval_count` |
| `product.stripe_product_id` | `product` |
| `trial_period_days` | *not on Price* — passed at `Subscription` create |
| `title` | `nickname` |

Currency comes from the **storefront**, not the plan — that centralization is what
makes a cart total a plain sum and guarantees every line item on a Stripe invoice
shares a currency. Stripe rejects mixed-currency invoices, so this invariant is
load-bearing, not cosmetic.

`Plan.unique_together = (product, billing_interval, billing_interval_count,
price_cents)` is already almost exactly the identity of a Stripe Price, which
makes the mapping close to 1:1.

### 2.3 The immutability problem

Editing `Plan.price_cents` cannot update the Stripe Price. The sequence is:

```
Plan.price_cents 1000 ──► 1200
    │
    ├─ create NEW  price_...B  (unit_amount 1200)
    ├─ archive OLD price_...A  (active = false)
    └─ Plan.stripe_price_id = price_...B

    existing Subscriptions keep billing on price_...A  ← intentional
    new checkouts use price_...B
```

This is why `Order` and `Subscription` snapshot **both** `unit_price_cents`
and `stripe_price_id`. Reading price through the `Plan` FK would render last
month's purchase at today's price, and would lose track of which Stripe Price an
existing subscriber is actually being billed on.

Archived prices stay readable forever in Stripe, so nothing breaks — but our rows
have to remember which one they used.

---

## 3. Constraints

```
Customer:
  UNIQUE (storefront, email)                     ← the real identity
  UNIQUE (storefront, user) WHERE user NOT NULL  ← mirrors the Cart idiom
  CHECK   email_verified_at IS NOT NULL          ← never mint cus_ unverified

Subscription:
  customer NOT NULL          (guest is fine — guest ≠ unidentified)
  UNIQUE (customer, plan) WHERE status IS ACTIVE
      ← one live subscription per plan; re-subscribing after cancel is a new row

Payment:
  customer NOT NULL for recurring; NULL allowed for one-time guest purchases
  CHECK (kind = 'recurring') = (subscription IS NOT NULL)
      ← a column check, because "does an Order point at me" is not expressible
        as one. This is the weaker replacement for a true XOR.
  UNIQUE (stripe_payment_intent_id)                 ← webhook replay safety

StripeEvent:
  UNIQUE (stripe_event_id)
```

`email_verified_at` is what makes anonymous checkout safe, **not** the presence of
an `AppUser`. Because an unverified email can never reach a `cus_...`, nobody can
type someone else's address and inherit their saved cards or subscriptions.

This is the same hazard `Cart.clean()` already guards against — it refuses to let
a cart have both a user and a session token, so a shared browser can't replay a
token into a signed-in user's cart. The verification gate is that rule applied to
payment identity.

---

## 4. Checkout: splitting a cart

All one-time items collapse into **one** charge. Each subscription plan becomes
its **own** Stripe Subscription.

```
Cart (always single-storefront → never splits across connected accounts)
├── Plan A   one-time    $20 ×2
├── Plan B   one-time    $15 ×1
├── Plan C   monthly     $10 ×1
├── Plan D   monthly     $ 5 ×1
└── Plan E   yearly      $99 ×1
         │
         ├─ ALL one-time items ──► one Payment ──► one PaymentIntent  $55
         │                            Order(A, ×2, $20) ┐ both point
         │                            Order(B, ×1, $15) ┘ at that Payment
         │
         └─ EACH subscription plan ──► its own Stripe Subscription
                  Subscription(customer, Plan C) ──► sub_1   $10/mo
                  Subscription(customer, Plan D) ──► sub_2   $ 5/mo
                  Subscription(customer, Plan E) ──► sub_3   $99/yr

   4 charges at checkout, then 2 recurring streams ($15/mo, $99/yr).
```

### Row count and charge count are independent

This is the easy thing to conflate. **One `Order` row per plan is correct** — it
is what lets each line carry its own quantity and price snapshot. What must *not*
happen is one PaymentIntent per plan.

Stripe's fee has a fixed per-charge component (~$0.30 in the US) on top of the
percentage. Splitting a 3-item cart into 3 PaymentIntents burns an extra $0.60 and
puts 3 lines on the buyer's statement, for zero benefit. Many `Order` rows, one
`Payment`, one charge.

### Why subscriptions do not

Stripe *would* allow monthly Plan C and monthly Plan D to share one Subscription
as two line items, saving a charge. We deliberately don't, because
**cancellation lifecycle is per-plan.** A subscriber canceling C while keeping D
is routine, and on a grouped subscription that becomes an item-removal with
proration rather than a plain cancel. Independent trials, capacity checks, and
`cancel_at_period_end` all have the same problem.

The cost is one extra charge per additional subscription plan, and a statement
line per plan. Worth it.

This also means `Subscription` is exactly the join table between `Customer` and
`Plan` — no line-item table beneath it. `CartItem.clean()` already caps
subscription quantity at 1, so there was never a quantity to store anyway.

### What Stripe will not merge regardless

- **Different intervals cannot share a Subscription.** Even if we wanted grouping,
  monthly and yearly are necessarily separate `sub_...` objects.
- **Different connected accounts cannot share a charge.** Not a problem here:
  `Cart`'s `unique_user_cart_per_storefront` / `unique_session_cart_per_storefront`
  constraints already guarantee a cart never spans two sellers. That constraint is
  load-bearing for payments — keep it.

---

## 5. Anonymous subscriber lifecycle

Anonymous subscriptions are supported. The identity is a **verified email**, and
an `AppUser` is an optional link on top of it.

```
① SUBSCRIBE (no account)
   anon browses ──► adds monthly Plan to Cart (public_session_id)
        │
        ▼ checkout
   enter email ──► 6-digit code ──► verified ═══╗
                                                ║  gate
   ╔════════════════════════════════════════════╝
   ║ Customer(storefront, user=NULL, email, email_verified_at=now)
   ║   └─ Stripe Customer created on the storefront's connected account
   ║ PaymentElement ──► PaymentMethod attached + set as default
   ║ Subscription created ──► sub_...
   ╚════════════════════════════════════════════════════════════

② RETURN, months later, cookies cleared
   "Manage subscription" ──► enter email ──► code ──► CustomerAccessToken
        └─ resolves (storefront, email) ──► same Customer row
             └─ cancel / swap card / view invoices

③ UPGRADE TO ACCOUNT (optional, any time)
   signs up via Clerk, Clerk-verified email == Customer.email
        └─ Customer.user = AppUser        ← plain FK set, same row
             └─ NO Stripe merge needed. Subscription, cards,
                invoice history all carry over untouched.
```

Step ③ is the reason the verification gate is worth its friction. **Stripe has no
API to merge two `Customer` objects.** If guests got an unverified throwaway
customer, a guest who later signed up would end up with two `cus_...` on one
storefront — split cards, split invoice history, permanently. Verifying up front
means guest-to-account is a metadata update on a row that already exists.

The gate also means `public_session_id` is never load-bearing for a subscription.
It scopes the cart only; the moment money is involved, identity moves to the
verified email. A cleared cookie loses a cart, never a subscription.

---

## 6. Webhooks

```
Stripe ──► /webhooks/stripe/
             │
             ├─ verify signature (per connected account secret)
             ├─ read Stripe-Account header ──► resolve StoreFront
             ├─ INSERT StripeEvent(stripe_event_id) ── conflict? → 200, drop
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

Every branch that moves money lands in **`Payment`**, but by two different routes:

- **One-time.** `Payment` is created at checkout in `pending`, because the `Order`
  rows need something to point at. The webhook only flips its status.
- **Renewals.** The webhook creates the `Payment` outright — nothing local
  initiated it, Stripe just billed the card on schedule.

Either way it is the same table, so "show me this customer's receipts" is one
query and reconciling against Stripe is a diff rather than an audit.

Fulfillment happens **here only.** The browser's success callback is not a
fulfillment signal — a user can close the tab before it fires, and it can be
forged.

`StripeEvent` with a unique `stripe_event_id` is not optional. Stripe redelivers
any event that doesn't get a 2xx, so without the dedupe insert a retried
`invoice.paid` writes a duplicate `Payment`.

Events arrive **out of order.** Never derive state by incrementing from the current
row — hence `current_period_end = <value from event>` rather than `+= interval`.
Write the state the event describes and ignore events older than what's stored.
Append-only `Payment` rows are immune to this by construction, which is a large
part of why they beat mutating a status field.

---

## 7. Money movement

Direct charges on the connected account, platform cut as an application fee:

```
buyer's card
    │
    ▼
Charge on acct_storefront          ← funds land in the seller's balance
    │
    ├─ application_fee ──────────► platform balance
    └─ remainder ────────────────► seller balance ──► payout
```

- One-time: `application_fee_amount` on the PaymentIntent.
- Recurring: `application_fee_percent` on the Subscription — it applies to every
  future invoice automatically, so renewals don't need us in the loop.

Because the charge lives on the seller's account, **the seller is liable for
disputes and refunds**, and the buyer's statement shows the seller's descriptor,
not Parcely's.

---

## 8. Implementation order

1. `stripe_account_id` on `StoreFront` + Connect onboarding flow.
2. `stripe_product_id` / `stripe_price_id` + push-on-save, including the
   archive-and-recreate path for price edits (§2.3).
3. `Customer` + email verification (OTP) + `CustomerAccessToken`.
4. `Payment` + `Order` (one row per plan, all sharing one PaymentIntent).
5. Webhook endpoint + `StripeEvent` dedupe. **Before** any subscription work —
   renewals arrive only by webhook, so subscriptions are unusable without this.
6. `Subscription` (one per plan) + the cart split in §4.

Steps 1–5 are worth shipping and testing on their own: that is a complete
one-time-purchase store. Subscriptions before working webhooks would mean
silently losing every renewal.

---

## 9. Open decisions

- **Product-level tax.** Nothing in the schema handles tax. Stripe Tax is per
  connected account and needs seller registration data we don't collect yet.
- **Refunds.** No local model. `Refund` hangs off `Payment` (that is the row with
  the `pi_...`), but the seller-liability question in §7 should be settled first.
- **Failed-renewal policy.** Stripe's dunning settings decide when `past_due`
  becomes `canceled`. Needs a product decision on grace period and whether
  storefront access is cut at `past_due` or at `canceled`.
- **`max_capacity` enforcement.** The seat check must happen inside the checkout
  transaction, before calling Stripe. Racing checkouts can oversell otherwise, and
  Stripe won't stop it.
- **Plan deletion.** `Plan` is `on_delete=CASCADE` from `Product`. Deleting a plan
  with live subscribers needs a guard — the Stripe Subscription would keep billing
  after our row disappeared.
