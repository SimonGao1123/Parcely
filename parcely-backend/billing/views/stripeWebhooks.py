import json

import stripe
from django.conf import settings
from django.db import IntegrityError
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from billing import handlers
from billing.connect import _client
from billing.models import StripeEvent


def _record_and_dispatch(raw_body, *, event_id, event_type, account_id, parsed, handler):
    """Record the event, run its handler, and answer Stripe.

    Shared by both endpoints because everything below the parse is identical and is
    also the part that is easy to get subtly wrong - the two views must not drift
    apart here. `parsed` is a v2 notification on the platform endpoint and a v1
    snapshot Event on the Connect one; only the handler it is passed to cares.

    Deliberately not wrapped in transaction.atomic. ATOMIC_REQUESTS is unset, so the
    StripeEvent row below commits immediately and survives a handler exception -
    which is what lets the retry sweep find it. An outer transaction would roll the
    row back with the handler and reduce the unique constraint from an idempotency
    gate to decoration.
    """
    try:
        # Insert before dispatching: Stripe reuses the evt_ id across retries and
        # dashboard resends, so the unique index is an idempotency gate only because
        # it precedes the side effects.
        event = StripeEvent.objects.create(
            stripe_event_id=event_id,
            stripe_account_id=account_id,
            type=event_type,
            payload=json.loads(raw_body),
        )
    except IntegrityError:
        return HttpResponse(status=200)

    if handler is not None:
        try:
            handler(parsed, event)
        except Exception as exc:
            # Broad on purpose: record the diagnostic before telling Stripe to retry,
            # which propagating would lose to Django's 500 handler.
            event.error = repr(exc)
            event.save(update_fields=["error", "updated_at"])
            return HttpResponse(status=500)

    event.processed_at = timezone.now()
    event.error = None
    event.save(update_fields=["processed_at", "error", "updated_at"])
    return HttpResponse(status=200)


@csrf_exempt
@require_POST
def stripe_platform_webhook(request):
    """Events about the platform's own account and its connected accounts' lifecycle.

    v2 thin events, which carry no top-level account - handlers.account_id_for digs
    the acct_ out of the payload per event type.
    """
    try:
        notification = _client.parse_event_notification(
            request.body,
            request.headers.get('stripe-signature'),
            settings.STRIPE_WEBHOOK_SECRET,
        )
    except stripe.SignatureVerificationError:
        return HttpResponse("invalid signature", status=400)
    except ValueError:
        # Malformed, or a v1 snapshot body on the thin endpoint. A retry replays the
        # identical bytes and fails identically, so a non-2xx would only buy a
        # multi-day backoff on the whole endpoint.
        return HttpResponse("unprocessable payload", status=200)

    return _record_and_dispatch(
        request.body,
        event_id=notification.id,
        event_type=notification.type,
        account_id=handlers.account_id_for(notification),
        parsed=notification,
        handler=handlers.handler_for(notification.type),
    )


@csrf_exempt
@require_POST
def stripe_connect_webhook(request):
    """Payment events fired on sellers' connected accounts.

    A separate endpoint from the platform one for two reasons, neither of which is
    account scoping: the signing secret differs, and a route can only verify against
    one. And these are v1 *snapshot* events, which parse_event_notification rejects -
    hence construct_event, and hence a separate handler registry keyed on v1 type
    strings so that `account.updated` can never be confused with `v2.core.account.*`.

    Nothing is fulfilled here yet. Order / Payment / Subscription do not exist, so
    this records payloads and nothing else - which is what lets those models be
    designed against real data instead of guessed shapes.
    """
    try:
        event = _client.construct_event(
            request.body,
            request.headers.get('stripe-signature'),
            settings.STRIPE_CONNECT_WEBHOOK_SECRET,
        )
    except stripe.SignatureVerificationError:
        return HttpResponse("invalid signature", status=400)
    except ValueError:
        return HttpResponse("unprocessable payload", status=200)

    return _record_and_dispatch(
        request.body,
        event_id=event.id,
        event_type=event.type,
        # v1 events name the account directly, so there is no per-type digging here.
        # None when Stripe delivers a platform event to this endpoint.
        account_id=event.account,
        parsed=event,
        handler=handlers.connect_handler_for(event.type),
    )
