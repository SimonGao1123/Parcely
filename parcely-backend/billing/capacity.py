"""Capacity accounting for products that cap how many subscribers they take.

`billing.models.has_capacity_for` answers the loose question - is there room right now,
counting only people who have paid. This module answers the strict one, which also counts
buyers currently on Stripe's hosted page holding a slot.

The distinction exists because the risky window is not between two concurrent requests, it
is between checkout and payment. A slot is consumed when the webhook writes the
Subscription, but checked when the session is created, and a buyer can sit on Stripe's page
for half an hour. Locking the Product row during checkout does nothing on its own: two
transactions would serialize, both read the same live count, and both pass, because neither
writes anything the other could observe. So the reservation is the write, and the lock
guards it.

Only subscriptions reach here. One-time products have no max_capacity and no Subscription
rows, and the cart no longer accepts subscription plans, so a cart never consumes capacity.
"""

from datetime import timedelta

from django.utils import timezone

from billing.models import SubscriptionCheckout, live_subscriber_count
from products.models import Product

# Matched to the expires_at passed when creating the Checkout Session, whose floor Stripe
# sets at 30 minutes. The two must agree: a longer reservation holds a slot after the
# session Stripe will honour has already died.
RESERVATION_TTL = timedelta(minutes=30)


class CapacityFull(Exception):
    """Raised by claim() when the product has no room left for this buyer."""

    def __init__(self, product):
        self.product = product
        super().__init__(f"{product.name} is full")


def reserved_count(product, exclude_customer=None) -> int:
    """Slots held by buyers mid-checkout.

    Expiry is the whole release mechanism - a lapsed reservation falls out of this filter
    on its own, so nothing has to sweep the table.
    """
    reservations = SubscriptionCheckout.objects.filter(
        plan__product=product, expires_at__gt=timezone.now()
    )
    if exclude_customer is not None:
        reservations = reservations.exclude(customer=exclude_customer)
    return reservations.count()


def consumed_capacity(product, exclude_customer=None) -> int:
    return live_subscriber_count(product) + reserved_count(product, exclude_customer)


def claim(customer, plan) -> SubscriptionCheckout:
    """Hold a slot in this plan's product for this customer, or raise CapacityFull.

    Must be called inside a transaction: the Product row is locked here and has to stay
    locked until the reservation below is committed, or a simultaneous checkout reads the
    count before this one writes.
    """
    product = Product.objects.select_for_update().get(pk=plan.product_id)

    # The buyer's own live reservation is excluded, or a max_capacity=1 product would look
    # full to the very person holding its last slot the moment they retried.
    if product.max_capacity is not None and (
        consumed_capacity(product, exclude_customer=customer) >= product.max_capacity
    ):
        raise CapacityFull(product)

    now = timezone.now()
    reservation = SubscriptionCheckout.objects.filter(
        customer=customer, plan=plan
    ).first()

    if reservation is None:
        return SubscriptionCheckout.objects.create(
            customer=customer, plan=plan, expires_at=now + RESERVATION_TTL
        )

    # A live claim is handed back untouched rather than extended. Its deadline becomes the
    # session's expires_at, which is sent under an idempotency key - pushing the deadline
    # forward on a double click would change the parameters behind a key Stripe has already
    # seen, and Stripe rejects the retry instead of returning the session it already made.
    if reservation.expires_at > now:
        return reservation

    # Lapsed, so the row is reused rather than a second one written. The old session id
    # goes with it: that session has expired at Stripe too and must not be handed out again.
    reservation.expires_at = now + RESERVATION_TTL
    reservation.stripe_checkout_session_id = None
    reservation.save(
        update_fields=["expires_at", "stripe_checkout_session_id", "updated_at"]
    )
    return reservation


def release(reservation) -> None:
    """Give the slot back immediately rather than leaving it held for the full TTL."""
    SubscriptionCheckout.objects.filter(pk=reservation.pk).delete()


def attach_session(reservation, session_id: str) -> None:
    SubscriptionCheckout.objects.filter(pk=reservation.pk).update(
        stripe_checkout_session_id=session_id
    )
