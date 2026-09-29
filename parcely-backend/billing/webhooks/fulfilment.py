"""Turns Connect payment events into Payment / Order / Subscription rows.

These are v1 *snapshot* events, so `event.data.object` is the whole object and nothing
here needs a refetch to read state - the one exception is §5's missing-subscription case,
where the invoice names a sub_ we have never seen.

Two rules the whole module is built on:

Never raise for data that will never arrive. A forged metadata id or a deleted Plan is
not a transient fault, and billing.webhooks.views now re-dispatches unprocessed events
on redelivery, so raising would loop that event until Stripe gives up. Log and
return. Raising is reserved for faults a retry can actually fix - a Stripe 5xx, a deadlock.

Scope every lookup to event.account. A connected account can create Checkout Sessions on
itself with arbitrary metadata, and those events arrive here correctly signed. Trusting
metadata.customer_id on its own would let one seller write a Payment against another
seller's Customer.
"""

import logging
from datetime import datetime
from datetime import timezone as dt_timezone

from django.db import transaction
from django.utils import timezone

from accounts.models import Customer
from billing.connect import _client
from billing.models import (
    ENDED_SUBSCRIPTION_STATUSES,
    LIVE_SUBSCRIPTION_STATUSES,
    Order,
    Payment,
    Subscription,
    SubscriptionCheckout,
    SubscriptionStatus,
)
from cart.models import Cart, CartItem
from products.models import Plan

logger = logging.getLogger(__name__)

# A session is fulfillable on either. `no_payment_required` is not an edge case: a
# subscription that starts in trial bills 0, so Stripe never asks for money at all.
# Gating on `status == "complete"` instead would fulfil unpaid delayed-payment sessions.
PAYABLE_STATUSES = frozenset({"paid", "no_payment_required"})


def _meta(obj, key):
    """metadata is a StripeObject, not a dict - .get() raises on it."""
    metadata = getattr(obj, "metadata", None)
    if metadata is None:
        return None
    return getattr(metadata, key, None)


def _ts(value):
    if value is None:
        return None
    return datetime.fromtimestamp(value, tz=dt_timezone.utc)


def _customer_for(customer_id, account_id, stripe_customer_id=None):
    """The buyer, or None if the event does not prove they belong to this seller.

    Two checks, because metadata alone is attacker-controlled. The join to
    stripe_account_id pins the Customer to the account that signed the event, and
    comparing stripe_customer_id catches a seller naming a Customer that is genuinely
    theirs while the Stripe customer on the event is not.
    """
    if not customer_id:
        return None
    customer = (
        Customer.objects.select_related("seller")
        .filter(pk=customer_id, seller__stripe_account_id=account_id)
        .first()
    )
    if customer is None:
        return None
    if stripe_customer_id and customer.stripe_customer_id != stripe_customer_id:
        logger.warning(
            "Customer %s does not own stripe customer %s", customer_id, stripe_customer_id
        )
        return None
    return customer


def _customer_by_stripe_id(stripe_customer_id, account_id):
    """Fallback for renewals, whose metadata may predate a seller's re-onboarding."""
    if not stripe_customer_id:
        return None
    return Customer.objects.filter(
        stripe_customer_id=stripe_customer_id, seller__stripe_account_id=account_id
    ).first()


def _plan_by_price(price_id, account_id):
    if not price_id:
        return None
    return Plan.objects.select_related("product").filter(
        stripe_price_id=price_id,
        product__storefront__owner__stripe_account_id=account_id,
    ).first()


def _plan_by_metadata(plan_id, account_id):
    """Second tier, and the one that survives a price edit.

    products.stripe_catalog stamps plan_id onto every Price, and archiving a Price to
    replace it leaves that metadata intact - so a line billed against the superseded
    price_ still resolves after Plan.stripe_price_id has moved on.
    """
    if not plan_id:
        return None
    return Plan.objects.select_related("product").filter(
        pk=plan_id, product__storefront__owner__stripe_account_id=account_id
    ).first()


def _cart_for(cart_id, account_id):
    if not cart_id:
        return None
    return Cart.objects.filter(
        pk=cart_id, storefront__owner__stripe_account_id=account_id
    ).first()


# --------------------------------------------------------------------------- subscriptions


def _sync_subscription(stripe_sub, account_id, customer):
    """Write Stripe's current state for every item on a subscription.

    Absolute rather than a delta, which is what makes it order-independent: whichever of
    customer.subscription.created / .updated / invoice.paid arrives first produces the
    same rows, and a late duplicate overwrites with identical values.
    """
    items = list(stripe_sub["items"].data)
    live_item_ids = {item.id for item in items}

    # An item removed from the subscription (a plan swap, or cancelling one plan of
    # several) leaves a local row that still occupies its customer+product slot. Retiring
    # it first is what lets the replacement item insert without tripping
    # uniq_subscription_customer_product_live.
    Subscription.objects.filter(
        stripe_subscription_id=stripe_sub.id, status__in=LIVE_SUBSCRIPTION_STATUSES
    ).exclude(stripe_subscription_item_id__in=live_item_ids).update(
        status=SubscriptionStatus.CANCELED, ended_at=timezone.now()
    )

    synced = []
    for item in items:
        plan = _plan_by_price(item.price.id, account_id) or _plan_by_metadata(
            _meta(item.price, "plan_id"), account_id
        )
        if plan is None:
            logger.error(
                "No plan for price %s on subscription %s", item.price.id, stripe_sub.id
            )
            continue

        status = stripe_sub.status
        subscription, _ = Subscription.objects.update_or_create(
            stripe_subscription_item_id=item.id,
            defaults={
                "customer": customer,
                "plan": plan,
                "product": plan.product,
                "stripe_subscription_id": stripe_sub.id,
                "status": status,
                "unit_price_cents": item.price.unit_amount or 0,
                "stripe_price_id": item.price.id,
                "currency": item.price.currency,
                "current_period_end": _ts(getattr(item, "current_period_end", None)),
                "cancel_at_period_end": bool(stripe_sub.cancel_at_period_end),
                "trial_end": _ts(stripe_sub.trial_end),
                # clean() rejects ended_at on a status that is not terminal, so this
                # cannot be copied across unconditionally.
                "ended_at": (
                    _ts(stripe_sub.ended_at or stripe_sub.canceled_at)
                    if status in ENDED_SUBSCRIPTION_STATUSES
                    else None
                ),
            },
        )
        synced.append(subscription)
    return synced


def _retrieve_subscription(subscription_id, account_id):
    return _client.v1.subscriptions.retrieve(
        subscription_id, {}, {"stripe_account": account_id}
    )


# --------------------------------------------------------------------------- orders


def _order_defaults(plan, quantity, unit_price_cents, description, price_id):
    return {
        "plan": plan,
        "quantity": max(quantity or 1, 1),
        "unit_price_cents": unit_price_cents,
        "plan_name_snapshot": description,
        "stripe_price_id": price_id,
    }


def _write_order(payment, customer, subscription=None, **defaults):
    Order.objects.create(
        payment=payment, customer=customer, subscription=subscription, **defaults
    )


# --------------------------------------------------------------------------- checkout


def _fulfil_cart_session(session, account_id):
    """A payment-mode session: one Payment, one Order per line, cart emptied."""
    customer = _customer_for(
        _meta(session, "customer_id"), account_id, session.customer
    )
    if customer is None:
        logger.warning("Unresolvable customer on session %s", session.id)
        return

    # line_items is not on the webhook payload - it only exists when expanded, so it has
    # to be fetched even though every other field arrived with the event. A StripeError
    # here propagates on purpose: that is transient, and the retry path recovers it.
    lines = _client.v1.checkout.sessions.line_items.list(
        session.id, {"limit": 100}, {"stripe_account": account_id}
    )

    with transaction.atomic():
        payment, created = Payment.objects.get_or_create(
            stripe_checkout_session_id=session.id,
            defaults={
                "customer": customer,
                "amount_cents": session.amount_total or 0,
                "currency": session.currency,
                # Free, and the only handle a refund will have - charge.refunded names
                # the payment intent, never the session.
                "stripe_payment_intent_id": session.payment_intent,
            },
        )
        if not created:
            # checkout.session.completed and async_payment_succeeded are distinct evt_
            # ids describing one payment, so the second must not re-run any of this.
            return

        for line in lines.data:
            price = line.price
            plan = _plan_by_price(price.id, account_id) or _plan_by_metadata(
                _meta(price, "plan_id"), account_id
            )
            if plan is None:
                # The buyer has already paid, so the Payment stands and only this line is
                # lost. That deliberately breaks sum(orders) == amount_cents, which is
                # the reconciliation alarm rather than a silent hole.
                logger.error("No plan for price %s on session %s", price.id, session.id)
                continue
            _write_order(
                payment,
                customer,
                **_order_defaults(
                    plan, line.quantity, price.unit_amount or 0, line.description, price.id
                ),
            )

        cart = _cart_for(_meta(session, "cart_id"), account_id)
        if cart is not None:
            # Items, not the Cart row: find_cart reuses it, and
            # unique_session_cart_per_storefront makes recreating it fragile.
            CartItem.objects.filter(cart=cart).delete()
            Cart.objects.filter(pk=cart.pk).update(stripe_checkout_session_id=None)


def _fulfil_subscription_session(session, account_id):
    """A subscription-mode session writes no Payment - invoice.paid does that.

    What it owns is the reservation. The Subscription is synced here first and released in
    the same transaction, because releasing on its own would free the slot before the row
    that consumes it exists, letting a racing buyer claim a seat already sold.
    """
    if not session.subscription:
        return

    customer = _customer_for(
        _meta(session, "customer_id"), account_id, session.customer
    ) or _customer_by_stripe_id(session.customer, account_id)
    if customer is None:
        logger.warning("Unresolvable customer on subscription session %s", session.id)
        return

    stripe_sub = _retrieve_subscription(session.subscription, account_id)

    with transaction.atomic():
        _sync_subscription(stripe_sub, account_id, customer)
        SubscriptionCheckout.objects.filter(
            stripe_checkout_session_id=session.id
        ).delete()


def handle_checkout_session_completed(event_obj, event) -> None:
    session = event_obj
    if session.payment_status not in PAYABLE_STATUSES:
        # `complete` only means the buyer finished the form. A delayed payment method
        # lands here still unpaid and is fulfilled later by async_payment_succeeded.
        return
    if session.mode == "subscription":
        _fulfil_subscription_session(session, event.stripe_account_id)
    else:
        _fulfil_cart_session(session, event.stripe_account_id)


def handle_checkout_session_async_payment_failed(event_obj, event) -> None:
    # Nothing to undo - no Payment was written, and the cart is deliberately left intact
    # so the buyer can retry with another method.
    logger.info("Async payment failed for session %s", event_obj.id)


def handle_checkout_session_expired(event_obj, event) -> None:
    session = event_obj
    SubscriptionCheckout.objects.filter(
        stripe_checkout_session_id=session.id
    ).delete()
    Cart.objects.filter(stripe_checkout_session_id=session.id).update(
        stripe_checkout_session_id=None
    )


# --------------------------------------------------------------------------- invoices


def _invoice_subscription_id(invoice):
    parent = getattr(invoice, "parent", None)
    details = getattr(parent, "subscription_details", None) if parent else None
    return getattr(details, "subscription", None) if details else None


def _invoice_subscription_metadata(invoice, key):
    """subscription_data.metadata, frozen onto the invoice at finalization.

    Present on renewals too, which is what lets a cycle invoice resolve its buyer without
    depending on the Checkout Session that started the subscription months earlier.
    """
    parent = getattr(invoice, "parent", None)
    details = getattr(parent, "subscription_details", None) if parent else None
    if details is None:
        return None
    return _meta(details, key)


def _invoice_payment_intent(invoice):
    """A $0 trial invoice is paid without a PaymentIntent, so this is often None."""
    payments = getattr(invoice, "payments", None)
    if payments is None or not payments.data:
        return None
    payment = getattr(payments.data[0], "payment", None)
    return getattr(payment, "payment_intent", None) if payment else None


def handle_invoice_paid(event_obj, event) -> None:
    invoice = event_obj
    account_id = event.stripe_account_id

    customer = _customer_for(
        _invoice_subscription_metadata(invoice, "customer_id"), account_id, invoice.customer
    ) or _customer_by_stripe_id(invoice.customer, account_id)
    if customer is None:
        logger.warning("Unresolvable customer on invoice %s", invoice.id)
        return

    lines = list(invoice.lines.data)
    subscription_id = _invoice_subscription_id(invoice)

    # Only the first invoice of a subscription can find its items missing, and only when
    # it beats customer.subscription.created. Gating the refetch means renewals - almost
    # every invoice - cost no extra call.
    by_item = {}
    if subscription_id:
        item_ids = {
            sid
            for sid in (_line_subscription_item(line) for line in lines)
            if sid
        }
        known = Subscription.objects.filter(stripe_subscription_item_id__in=item_ids)
        by_item = {s.stripe_subscription_item_id: s for s in known}
        if item_ids - set(by_item):
            stripe_sub = _retrieve_subscription(subscription_id, account_id)
            for synced in _sync_subscription(stripe_sub, account_id, customer):
                by_item[synced.stripe_subscription_item_id] = synced

    with transaction.atomic():
        payment, created = Payment.objects.get_or_create(
            stripe_invoice_id=invoice.id,
            defaults={
                "customer": customer,
                "amount_cents": invoice.amount_paid or 0,
                "currency": invoice.currency,
                "stripe_payment_intent_id": _invoice_payment_intent(invoice),
            },
        )
        if not created:
            return

        for line in lines:
            item_id = _line_subscription_item(line)
            subscription = by_item.get(item_id) if item_id else None
            price_id = _line_price_id(line)

            plan = None
            if subscription is not None:
                plan = subscription.plan
            if plan is None:
                plan = _plan_by_price(price_id, account_id)
            if plan is None:
                logger.error("No plan for line on invoice %s", invoice.id)
                continue

            quantity = line.quantity or 1
            _write_order(
                payment,
                customer,
                subscription=subscription,
                **_order_defaults(
                    plan,
                    quantity,
                    # The invoice states a line total, not a unit price. Exact while
                    # nothing discounts or prorates; the first coupon is what will make
                    # sum(orders) drift from amount_cents.
                    (line.amount or 0) // quantity,
                    line.description,
                    price_id,
                ),
            )


def _line_subscription_item(line):
    parent = getattr(line, "parent", None)
    details = getattr(parent, "subscription_item_details", None) if parent else None
    return getattr(details, "subscription_item", None) if details else None


def _line_price_id(line):
    pricing = getattr(line, "pricing", None)
    details = getattr(pricing, "price_details", None) if pricing else None
    return getattr(details, "price", None) if details else None


def handle_invoice_payment_failed(event_obj, event) -> None:
    """No Payment - money did not move. The subscription's status is the record."""
    invoice = event_obj
    account_id = event.stripe_account_id
    subscription_id = _invoice_subscription_id(invoice)
    if not subscription_id:
        return

    customer = _customer_for(
        _invoice_subscription_metadata(invoice, "customer_id"), account_id, invoice.customer
    ) or _customer_by_stripe_id(invoice.customer, account_id)
    if customer is None:
        logger.warning("Unresolvable customer on failed invoice %s", invoice.id)
        return

    # The invoice carries the failure, not the resulting status - only the subscription
    # knows whether Stripe moved to past_due or gave up entirely.
    stripe_sub = _retrieve_subscription(subscription_id, account_id)
    _sync_subscription(stripe_sub, account_id, customer)


# --------------------------------------------------------------------------- subscription lifecycle


def _handle_subscription_event(event_obj, event) -> None:
    stripe_sub = event_obj
    account_id = event.stripe_account_id

    customer = _customer_for(
        _meta(stripe_sub, "customer_id"), account_id, stripe_sub.customer
    ) or _customer_by_stripe_id(stripe_sub.customer, account_id)
    if customer is None:
        logger.warning("Unresolvable customer on subscription %s", stripe_sub.id)
        return

    _sync_subscription(stripe_sub, account_id, customer)


def handle_subscription_deleted(event_obj, event) -> None:
    """Terminal. The rows stay - Order.subscription is PROTECT, and deleting them would
    take the buyer's receipts with them."""
    stripe_sub = event_obj
    ended = _ts(stripe_sub.ended_at or stripe_sub.canceled_at) or timezone.now()
    Subscription.objects.filter(stripe_subscription_id=stripe_sub.id).update(
        status=stripe_sub.status, ended_at=ended
    )


def _on_object(handler):
    """Adapt to the dispatch signature.

    views.py passes the whole v1 Event, but every handler here wants the object it
    describes. Unwrapping once keeps `.data.object` out of nine function bodies.
    """

    def dispatch(notification, event):
        return handler(notification.data.object, event)

    dispatch.__name__ = handler.__name__
    return dispatch


_HANDLERS = {
    "checkout.session.completed": _on_object(handle_checkout_session_completed),
    # Same handler: a delayed method reaches `paid` only here, and the get_or_create on
    # cs_ makes the pair safe when both arrive.
    "checkout.session.async_payment_succeeded": _on_object(
        handle_checkout_session_completed
    ),
    "checkout.session.async_payment_failed": _on_object(
        handle_checkout_session_async_payment_failed
    ),
    "checkout.session.expired": _on_object(handle_checkout_session_expired),
    "invoice.paid": _on_object(handle_invoice_paid),
    "invoice.payment_failed": _on_object(handle_invoice_payment_failed),
    "customer.subscription.created": _on_object(_handle_subscription_event),
    "customer.subscription.updated": _on_object(_handle_subscription_event),
    "customer.subscription.deleted": _on_object(handle_subscription_deleted),
}


def handler_for(event_type: str):
    return _HANDLERS.get(event_type)
