from django.db import models

from store.models import StoreFront
from common.models import TimestampedModel
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from s3.models import Blob
class Currency(models.TextChoices): # can be expanded to include other currencies
    USD = "usd", "USD"
    EUR = "eur", "EUR"
    CAD = "cad", "CAD"
    

class BillingInterval(models.TextChoices):
    DAY = "day", "Day"
    WEEK = "week", "Week"
    MONTH = "month", "Month"
    YEAR = "year", "Year"

# Create your models here.

class Product(TimestampedModel):
    storefront = models.ForeignKey(StoreFront, on_delete=models.CASCADE, related_name="products")
    currency = models.CharField(max_length=3, choices=Currency.choices)
    
    is_subscription = models.BooleanField(default=True)

    name = models.CharField(max_length=255)
    description = models.TextField()

    is_active = models.BooleanField(default=True)

    max_capacity = models.IntegerField(validators=[MinValueValidator(1)], null=True, blank=True) # only for subscriptions, optional

    display_image = models.ForeignKey(Blob, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    def clean(self):
        super().clean()
        if not self.is_subscription and self.max_capacity is not None:
            raise ValidationError("Max capacity is only allowed for subscriptions")
    
    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

class Plan(TimestampedModel):
    title = models.CharField(max_length=255, null=True, blank=True)

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="plans")
    price_cents = models.PositiveIntegerField()

    billing_interval = models.CharField(max_length=255, choices=BillingInterval.choices, null=True, blank=True)
    billing_interval_count = models.PositiveIntegerField(validators=[MinValueValidator(1)], null=True, blank=True)

    trial_period_days = models.PositiveIntegerField(null=True, blank=True)

    def clean(self):
        super().clean()
        if self.product.is_subscription and (self.billing_interval is None or self.billing_interval_count is None):
            raise ValidationError("Billing interval and interval count are required for subscriptions")
        if not self.product.is_subscription and self.trial_period_days is not None:
            raise ValidationError("Trial period is only allowed for subscriptions")
        if not self.product.is_subscription and (self.billing_interval is not None or self.billing_interval_count is not None):
            raise ValidationError("Billing interval is only allowed for subscriptions")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)
    
    class Meta:
        unique_together = ("product", "billing_interval", "billing_interval_count", "price_cents")

