from django.db import models
from common.models import TimestampedModel
from django.core.exceptions import ValidationError
from datetime import datetime, timedelta
from django.utils import timezone
# Create your models here.


class CardPaymentsStatus(models.TextChoices):
    """Mirrors Stripe's card_payments capability status verbatim - values are
    assigned straight from the API response, so they must not diverge."""
    ACTIVE = "active", "Active"
    PENDING = "pending", "Pending"
    RESTRICTED = "restricted", "Restricted"
    UNSUPPORTED = "unsupported", "Unsupported"


class AppUser(TimestampedModel):
    email = models.EmailField(unique=True, db_index=True)
    clerk_id = models.CharField(max_length=255, unique=True, db_index=True)
    username = models.CharField(max_length=255, unique=True, db_index=True)
    first_name = models.CharField(max_length=255)
    last_name = models.CharField(max_length=255)
    profile_picture = models.URLField(blank=True, null=True)

    stripe_account_id = models.CharField(max_length=255, blank=True, null=True, unique=True)

    # Null until a connected account exists - distinct from all four Stripe values.
    card_payments_status = models.CharField(
        max_length=255, blank=True, null=True, choices=CardPaymentsStatus.choices
    )

    # Cleared instead of deleting when Clerk sends user.deleted for a seller who
    # still has Customers - PROTECT would otherwise make the webhook retry forever.
    is_active = models.BooleanField(default=True)

    is_authenticated = True
    is_anonymous = False

    @property
    def can_sell(self) -> bool:
        """The single definition of the selling gate - checkout must reuse this
        rather than comparing the status string again."""
        return self.card_payments_status == CardPaymentsStatus.ACTIVE

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'

class Customer(TimestampedModel):
    user = models.ForeignKey(AppUser, on_delete=models.SET_NULL, related_name="buyer_profiles", null=True, blank=True) # possibly anon 

    seller = models.ForeignKey(AppUser, on_delete=models.PROTECT, related_name="customers") # customer must be scoped to a seller

    email = models.EmailField()

    email_verified_at = models.DateTimeField()

    stripe_customer_id = models.CharField(max_length=255, unique=True, null=True, blank=True)

    default_pm_brand = models.CharField(max_length=32, null=True, blank=True)
    default_pm_last4 = models.CharField(max_length=4, null=True, blank=True) # will be null initially since create customer row
    # BEFORE stripe is called

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["seller", "email"], name="uniq_customer_seller_email"),
            models.UniqueConstraint(fields=["seller", "user"], condition=models.Q(user__isnull=False), name="uniq_customer_seller_user"),
        ]

OTP_TTL = timedelta(minutes=10)


def default_expiration_time() -> datetime:
    return timezone.now() + OTP_TTL

class EmailVerification(TimestampedModel):
    email = models.EmailField()

    seller = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="+")

    code_hash = models.CharField(max_length=64)

    expires_at = models.DateTimeField(default=default_expiration_time)

    consumed_at = models.DateTimeField(null=True, blank=True)

    attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        indexes = [models.Index(fields=["email", "seller", "-created_at"])]