from accounts.models import AppUser, CardPaymentsStatus
from billing import connect

CAPABILITY_STATUS_UPDATED = "v2.core.account[configuration.merchant].capability_status_updated"
REQUIREMENTS_UPDATED = "v2.core.account[requirements].updated"
ACCOUNT_LINK_RETURNED = "v2.core.account_link.returned"
ACCOUNT_CLOSED = "v2.core.account.closed"
EVENT_DESTINATION_PING = "v2.core.event_destination.ping"

# Only these three carry the account id on related_object. account_link.returned has
# no related_object at all, and ping's related_object is an event destination
# (ed_...), so reading it generically would write a non-account id into the column.
_ACCOUNT_ID_ON_RELATED_OBJECT = frozenset({
    CAPABILITY_STATUS_UPDATED,
    REQUIREMENTS_UPDATED,
    ACCOUNT_CLOSED,
})


def account_id_for(notification) -> str | None:
    """Account id available without a network call. account_link.returned resolves
    its own inside the handler, so a failed fetch lands on the retry path with the
    StripeEvent row already committed."""
    if notification.type in _ACCOUNT_ID_ON_RELATED_OBJECT:
        return notification.related_object.id
    return None


def _adopt_by_metadata(account) -> AppUser | None:
    """Recover the seller when a webhook beats our accounts.create() response to the
    database."""
    # metadata is a StripeObject, not a dict - .get() raises on it.
    app_user_id = getattr(account.metadata, "app_user_id", None)
    if not app_user_id:
        return None
    try:
        adopted = AppUser.objects.filter(
            pk=app_user_id, stripe_account_id__isnull=True
        ).update(stripe_account_id=account.id)
    except (ValueError, TypeError):
        return None
    if not adopted:
        return None
    return AppUser.objects.filter(pk=app_user_id).first()


def refresh_card_payments_status(account_id: str) -> AppUser | None:
    """Converge the local status with Stripe's.

    The refetch is the out-of-order defence: a thin event carries no status at all,
    so there is nothing absolute to copy out of it. Writing Stripe's state at fetch
    time converges regardless of the order events arrive in. A narrow interleave
    remains (A fetches, B fetches, B writes, A writes stale); it self-heals on the
    next event, and closing it would cost a version column.
    """
    account = connect.retrieve_account(account_id)
    status = connect.merchant_status(account)

    user = AppUser.objects.filter(stripe_account_id=account_id).first()
    if user is None:
        user = _adopt_by_metadata(account)
        if user is None:
            return None

    # Targeted UPDATE rather than user.save(), which would write back every field on
    # a row a concurrent request may have changed.
    AppUser.objects.filter(pk=user.pk).update(card_payments_status=status)
    return user


def handle_capability_status_updated(notification, event) -> None:
    refresh_card_payments_status(event.stripe_account_id)


def handle_requirements_updated(notification, event) -> None:
    # Nothing to store from the payload - we keep no requirements column. The value
    # of this handler is as a refresh trigger: requirements moving is the leading
    # indicator that the capability is about to follow.
    refresh_card_payments_status(event.stripe_account_id)


def handle_account_link_returned(notification, event) -> None:
    account_id = notification.fetch_event().data.account_id
    event.stripe_account_id = account_id
    event.save(update_fields=["stripe_account_id", "updated_at"])
    refresh_card_payments_status(account_id)


def handle_account_closed(notification, event) -> None:
    # Terminal, so no refetch. stripe_account_id is deliberately left in place -
    # clearing it would lose the audit link and let the seller mint a second account.
    AppUser.objects.filter(stripe_account_id=event.stripe_account_id).update(
        card_payments_status=CardPaymentsStatus.UNSUPPORTED
    )


def handle_ping(notification, event) -> None:
    """Explicit no-op so a connection test is not recorded as an unknown type."""


_HANDLERS = {
    CAPABILITY_STATUS_UPDATED: handle_capability_status_updated,
    REQUIREMENTS_UPDATED: handle_requirements_updated,
    ACCOUNT_LINK_RETURNED: handle_account_link_returned,
    ACCOUNT_CLOSED: handle_account_closed,
    EVENT_DESTINATION_PING: handle_ping,
}


def handler_for(event_type: str):
    return _HANDLERS.get(event_type)
