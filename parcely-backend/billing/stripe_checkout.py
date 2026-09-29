"""Creates the Checkout Session a buyer pays on.

Mirrors products.stripe_catalog: this module talks to Stripe, the view owns HTTP and
validation. Direct charges, so everything is created on the seller's connected account -
that is where the Prices live, and a customer minted on the platform account cannot pay
for them.

Two entry points rather than one, because the two purchases are genuinely different calls:
a cart is many one-time lines in payment mode, a subscription is exactly one recurring line
in subscription mode with a trial. Folded together, a single recurring item dragged a
five-item cart into subscription mode and put the rest on an invoice.

Nothing here writes a Payment or an Order. Money has not moved when a session is created;
those rows belong to the webhook handlers.
"""

import hashlib

from django.conf import settings

from billing.connect import _client


def _account_id(storefront) -> str:
    return storefront.owner.stripe_account_id


def ensure_stripe_customer(customer, storefront) -> str:
    """The buyer's cus_ on this seller's account, created on first checkout.

    Deliberately lazy: a Customer row is written the moment an email is verified, and most
    of those never buy anything. Minting the Stripe object here keeps the connected
    account free of rows for people who only ever typed in an address.
    """
    if customer.stripe_customer_id:
        return customer.stripe_customer_id

    stripe_customer = _client.v1.customers.create(
        {
            "email": customer.email,
            "metadata": {
                "customer_id": str(customer.id),
                "seller_id": str(customer.seller_id),
            },
        },
        {"stripe_account": _account_id(storefront)},
    )
    customer.stripe_customer_id = stripe_customer.id
    customer.save(update_fields=["stripe_customer_id", "updated_at"])
    return stripe_customer.id


def _create(*, customer, storefront, params, idempotency_key):
    """Fill in the parts both kinds of session share and make the call."""
    account_id = _account_id(storefront)

    params = {
        "customer": ensure_stripe_customer(customer, storefront),
        # The literal braces are Stripe's placeholder - it substitutes the real id on
        # redirect, so this must not be interpolated here.
        "success_url": (
            f"{settings.FRONTEND_URL}/{storefront.slug}/checkout/success"
            "?session_id={CHECKOUT_SESSION_ID}"
        ),
        "cancel_url": f"{settings.FRONTEND_URL}/{storefront.slug}/cart",
        **params,
    }

    return _client.v1.checkout.sessions.create(
        params,
        {"stripe_account": account_id, "idempotency_key": idempotency_key},
    )


def create_cart_session(*, customer, cart, items, storefront):
    """A one-time purchase of everything in the cart.

    Always payment mode: the cart refuses subscription plans, so no line here can be
    recurring. No expires_at either - nothing is reserved, so there is no local deadline to
    keep a session in step with, and Stripe's 24-hour default costs nothing.
    """
    # From stripe_price_id, never price_cents. The Price is what Stripe will actually
    # charge, so totalling anything else here would show the buyer one number and bill
    # another.
    line_items = [
        {"price": item.plan.stripe_price_id, "quantity": item.quantity}
        for item in items
    ]

    # Scoped to the cart's contents so a double-clicked button returns the session Stripe
    # already made instead of minting a second one. Changing the cart legitimately produces
    # a new key.
    fingerprint = ";".join(f"{i.plan_id}x{i.quantity}" for i in items)
    digest = hashlib.sha256(fingerprint.encode()).hexdigest()[:32]

    return _create(
        customer=customer,
        storefront=storefront,
        params={
            "mode": "payment",
            "line_items": line_items,
            "metadata": {
                "customer_id": str(customer.id),
                "cart_id": str(cart.id),
                "storefront_id": str(storefront.id),
            },
        },
        idempotency_key=f"cart-{cart.id}-{digest}",
    )


def create_subscription_session(*, customer, plan, storefront, reservation):
    """A single subscription, bought directly rather than through a cart.

    `reservation` is the capacity claim already written for this buyer. Its deadline is the
    session's expires_at rather than a fresh clock reading: that value is sent under an
    idempotency key, and Stripe rejects a replayed key whose parameters have shifted.
    """
    metadata = {
        "customer_id": str(customer.id),
        "plan_id": str(plan.id),
        "product_id": str(plan.product_id),
        "storefront_id": str(storefront.id),
        "reservation_id": str(reservation.id),
    }

    subscription_data = {"metadata": metadata}
    if plan.trial_period_days:
        # Per-item trials do not exist; this applies to the whole subscription. With one
        # plan per session there is nothing left for it to disagree with.
        subscription_data["trial_period_days"] = plan.trial_period_days

    return _create(
        customer=customer,
        storefront=storefront,
        params={
            "mode": "subscription",
            # Quantity is always 1 - a buyer may hold only one live subscription per
            # product, so two of the same seat is not something that can be sold.
            "line_items": [{"price": plan.stripe_price_id, "quantity": 1}],
            "metadata": metadata,
            "subscription_data": subscription_data,
            # Stripe defaults this to 24 hours, which would hold a capacity slot for a day
            # after the buyer wandered off. Kept in step with the local reservation.
            "expires_at": int(reservation.expires_at.timestamp()),
        },
        # The deadline is in the key, not merely in the parameters: a lapsed reservation
        # that was reused gets a fresh key, so Stripe mints a new session rather than
        # handing back the expired one it made half an hour ago.
        idempotency_key=f"sub-{reservation.id}-{int(reservation.expires_at.timestamp())}",
    )
