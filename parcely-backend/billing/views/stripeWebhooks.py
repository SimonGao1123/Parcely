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


@csrf_exempt
@require_POST
def stripe_platform_webhook(request):
    # Deliberately not wrapped in transaction.atomic. ATOMIC_REQUESTS is unset, so
    # the StripeEvent row below commits immediately and survives a handler
    # exception - which is what lets the retry sweep find it. An outer transaction
    # would roll the row back with the handler and reduce the unique constraint from
    # an idempotency gate to decoration.
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

    try:
        # Insert before dispatching: Stripe reuses the evt_ id across retries and
        # dashboard resends, so the unique index is an idempotency gate only because
        # it precedes the side effects.
        event = StripeEvent.objects.create(
            stripe_event_id=notification.id,
            stripe_account_id=handlers.account_id_for(notification),
            type=notification.type,
            payload=json.loads(request.body),
        )
    except IntegrityError:
        return HttpResponse(status=200)

    handler = handlers.handler_for(notification.type)
    if handler is not None:
        try:
            handler(notification, event)
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
