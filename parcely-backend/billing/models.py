from django.db import models
from common.models import TimestampedModel
# Create your models here.


class StripeEvent(TimestampedModel):
    stripe_event_id = models.CharField(max_length=255, unique=True, db_index=True)
    stripe_account_id = models.CharField(max_length=255, null=True, blank=True) # null means platform's own event
    # Intentionally unconstrained: this is the record of everything Stripe sends,
    # including types we do not handle. billing.handlers._HANDLERS is the list of
    # types we act on.
    type = models.CharField(max_length=255)
    payload = models.JSONField()
    processed_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(null=True, blank=True) # possible error, for retry sweep possibly implement later

    class Meta:
        indexes = [
            models.Index(fields=["stripe_account_id", "processed_at"]),
            # Partial index over the unprocessed backlog only - the retry sweep is
            # the sole query on this column, and it looks for NULLs.
            models.Index(
                fields=["created_at"],
                condition=models.Q(processed_at__isnull=True),
                name="idx_stripe_event_unprocessed",
            )
        ]