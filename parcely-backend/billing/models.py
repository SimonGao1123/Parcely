from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from common.models import TimestampedModel
from accounts.models import Customer
from products.models import Plan, Product
from store.models import Currency
# Create your models here.


class StripeEvent(TimestampedModel):
    stripe_event_id = models.CharField(max_length=255, unique=True, db_index=True)
    stripe_account_id = models.CharField(max_length=255, null=True, blank=True) # null means platform's own event
    # Intentionally unconstrained: this is the record of everything Stripe sends,
    # including types we do not handle. billing.webhooks handler maps are the list of
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


class Payment(TimestampedModel):
    """One movement of money, written by a webhook handler only once it has moved.

    The Stripe ids are the shapes money arrives in:
        cs_ + pi_   payment-mode checkout - Stripe creates no invoice
        in_ + pi_   any subscription invoice, first or renewal
        in_ only    a $0 trial invoice - paid, but there is no PaymentIntent

    pi_ is stored on the payment-mode row even though cs_ already identifies it: a refund
    or dispute names the PaymentIntent, never the session.

    cs_ and in_ never appear together: a subscription-mode Payment is written by
    invoice.paid, and an Invoice does not name the session that started it.

    There is no status column. A failed renewal would have to carry the same
    stripe_invoice_id as the successful retry that follows it, colliding with the
    unique index; failures are legible from StripeEvent and Subscription.status.
    """
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="payments")

    # Positive rather than >= 1: a trialing subscription's first invoice is genuinely 0,
    # and a pure-subscription cart on trial returns no_payment_required with a 0 total.
    amount_cents = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, choices=Currency.choices)

    stripe_checkout_session_id = models.CharField(max_length=255, null=True, blank=True)
    stripe_payment_intent_id = models.CharField(max_length=255, null=True, blank=True)
    stripe_invoice_id = models.CharField(max_length=255, null=True, blank=True)

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    class Meta:
        constraints = [
            # All three are idempotency gates: Stripe redelivers events, and a replayed
            # checkout.session.completed or invoice.paid must not mint a second row.
            # Partial because most rows are null on any given column.
            models.UniqueConstraint(
                fields=["stripe_checkout_session_id"],
                condition=models.Q(stripe_checkout_session_id__isnull=False),
                name="uniq_payment_checkout_session",
            ),
            models.UniqueConstraint(
                fields=["stripe_payment_intent_id"],
                condition=models.Q(stripe_payment_intent_id__isnull=False),
                name="uniq_payment_intent",
            ),
            models.UniqueConstraint(
                fields=["stripe_invoice_id"],
                condition=models.Q(stripe_invoice_id__isnull=False),
                name="uniq_payment_invoice",
            ),
            # A row naming no Stripe object cannot be reconciled against anything.
            models.CheckConstraint(
                condition=(
                    models.Q(stripe_checkout_session_id__isnull=False)
                    | models.Q(stripe_payment_intent_id__isnull=False)
                    | models.Q(stripe_invoice_id__isnull=False)
                ),
                name="payment_has_a_stripe_id",
            ),
        ]
        indexes = [models.Index(fields=["customer", "-created_at"])]


class SubscriptionStatus(models.TextChoices):
    """Mirrors Stripe's subscription status verbatim - values are assigned straight
    from the API response, so they must not diverge."""
    ACTIVE = "active", "Active"
    TRIALING = "trialing", "Trialing"
    PAST_DUE = "past_due", "Past due"
    CANCELED = "canceled", "Canceled"
    UNPAID = "unpaid", "Unpaid"
    INCOMPLETE = "incomplete", "Incomplete"
    INCOMPLETE_EXPIRED = "incomplete_expired", "Incomplete expired"
    PAUSED = "paused", "Paused"


# The statuses that occupy a customer's slot for a plan. `unpaid` counts because Stripe
# has stopped collecting but has not cancelled - the agreement still exists.
LIVE_SUBSCRIPTION_STATUSES = [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.TRIALING,
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.UNPAID,
]

ENDED_SUBSCRIPTION_STATUSES = [
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.INCOMPLETE_EXPIRED,
]


class Subscription(TimestampedModel):
    """One plan a customer is subscribed to.

    Maps to a Stripe *SubscriptionItem*, not a Subscription. A Checkout Session creates
    at most one sub_, so a cart holding three recurring plans comes back as one sub_ with
    three items. Keying on si_ is what keeps one row per plan, so cancelling a single plan
    removes one item rather than tearing down the others.
    """
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="subscriptions")

    # PROTECT, not CASCADE: archiving a Stripe Price does not stop an existing
    # subscription, so deleting the Plan would leave renewals billing against a price_
    # that resolves to nothing here. The delete has to fail instead.
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="subscriptions")

    # Denormalized from plan.product. A customer may hold only one live subscription per
    # product, and Django cannot traverse a relation inside a UniqueConstraint, so the
    # column has to be on the row for the database to enforce that at all. clean() fills
    # it from the plan and rejects a mismatch.
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="subscriptions")

    # Deliberately not unique - every item of one Stripe subscription shares this.
    stripe_subscription_id = models.CharField(max_length=255, db_index=True)
    # The natural key. Never null, so a plain unique rather than a partial one.
    stripe_subscription_item_id = models.CharField(max_length=255, unique=True)

    status = models.CharField(max_length=32, choices=SubscriptionStatus.choices)

    # No quantity column: a subscription checkout sends exactly one line at quantity 1, so
    # the value would be the constant 1 on every row.

    # The *current* binding. Per-period history lives in the Order rows instead, which is
    # what keeps a past receipt honest after a price change.
    unit_price_cents = models.PositiveIntegerField()
    stripe_price_id = models.CharField(max_length=255)
    currency = models.CharField(max_length=3, choices=Currency.choices)

    # Read from sub.items.data[n].current_period_end - as of stripe 15.6.1 this lives on
    # SubscriptionItem and is no longer present on Subscription.
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    trial_end = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    # Set when the row is written into a product that was already full. Recorded rather
    # than refused because this runs in a webhook, after the buyer has paid - raising
    # would 500, and Stripe would redeliver the same event for days while the buyer stayed
    # charged with nothing to show for it. Checkout is the gate; this is the record that
    # the gate was raced.
    over_capacity = models.BooleanField(default=False)

    def clean(self):
        super().clean()
        if self.plan_id and not self.plan.product.is_subscription:
            raise ValidationError(
                "A subscription requires a plan whose product is a subscription"
            )
        if self.plan_id and self.product_id != self.plan.product_id:
            raise ValidationError("Subscription product must be the plan's product")
        if self.ended_at is not None and self.status not in ENDED_SUBSCRIPTION_STATUSES:
            raise ValidationError("ended_at is only set once the subscription has ended")

    def save(self, *args, **kwargs):
        # Before full_clean, not inside clean(): clean_fields() runs first and would
        # reject the null while clean() was still waiting for its turn to fill it.
        if self.product_id is None and self.plan_id:
            self.product_id = self.plan.product_id
        self.full_clean()
        if self._state.adding:
            self.over_capacity = not has_capacity_for(self.product)
        return super().save(*args, **kwargs)

    class Meta:
        constraints = [
            # Scoped to the product, not the plan: holding the monthly and the yearly plan
            # of one product at the same time is the same double-subscription this is meant
            # to forbid.
            #
            # Partial on purpose. An unconditional unique would let a cancelled row keep
            # occupying the slot forever, permanently barring a resubscribe.
            models.UniqueConstraint(
                fields=["customer", "product"],
                condition=models.Q(status__in=LIVE_SUBSCRIPTION_STATUSES),
                name="uniq_subscription_customer_product_live",
            ),
        ]
        indexes = [models.Index(fields=["customer", "status"])]


def live_subscriber_count(product) -> int:
    """How many of this product's capacity slots are taken by paying subscribers.

    Counts rows rather than distinct customers because uniq_subscription_customer_product_live
    already makes those the same number.

    Only live statuses count. Including cancelled rows would mean every cancellation
    permanently burned a slot and a full product could never refill.
    """
    return Subscription.objects.filter(
        product=product, status__in=LIVE_SUBSCRIPTION_STATUSES
    ).count()


def has_capacity_for(product) -> bool:
    """Whether the product has room, ignoring in-flight checkouts.

    billing.capacity.consumed_capacity is the stricter version that also counts spots
    held by buyers currently on Stripe's page - use that one before creating a session.
    """
    return (
        product.max_capacity is None
        or live_subscriber_count(product) < product.max_capacity
    )


class SubscriptionCheckout(TimestampedModel):
    """A subscription checkout in flight - this customer is on Stripe's page holding a slot.

    A row rather than columns on Customer because a buyer may legitimately have two of
    these open for two different products. Columns would let the second silently overwrite
    the first while the first session was still payable, which is the oversell the
    reservation exists to close.

    CASCADE on both, unlike Subscription: this records an intent, not money that moved, so
    deleting the plan may take its abandoned reservations with it.
    """
    customer = models.ForeignKey(
        Customer, on_delete=models.CASCADE, related_name="subscription_checkouts"
    )
    plan = models.ForeignKey(Plan, on_delete=models.CASCADE, related_name="checkouts")

    # Null between reserving and Stripe answering. The future
    # checkout.session.completed / .expired handler releases the slot by this id.
    stripe_checkout_session_id = models.CharField(max_length=255, null=True, blank=True)

    # Expiry is the release mechanism: billing.capacity.reserved_count filters on it, so a
    # lapsed reservation stops counting on its own and needs no sweep job.
    expires_at = models.DateTimeField()

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.customer.email} -> {self.plan} until {self.expires_at}"

    class Meta:
        # One row per buyer per plan, lapsed or live, so a returning buyer reuses their own
        # dead row instead of leaving one behind per abandoned attempt. Cannot be narrowed
        # to live rows only - Postgres will not index a condition involving now().
        unique_together = ("customer", "plan")
        indexes = [models.Index(fields=["expires_at"])]


class Order(TimestampedModel):
    """One billed line on one Payment.

    Covers one-time lines and subscription lines alike - a renewal is a Payment carrying a
    single Order. Because every line has a row,
    sum(unit_price_cents * quantity) == payment.amount_cents holds for every payment with
    no special case, including a $0 trial period, which is recorded rather than inferred
    from an amount of zero.

    Written after the money moves, never before, so payment is NOT NULL.
    """
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="orders")

    # Null means a one-time line. Set means this line billed one period of that plan.
    # Always populated at insert: the handler that builds these reads si_ off
    # invoice.lines[].parent.subscription_item_details, so the Subscription exists first.
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        related_name="orders",
        null=True,
        blank=True,
    )

    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="orders")
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])

    # From the Stripe line item's description, not plan.product.name - that is what stops
    # old receipts drifting when resync_product renames the Stripe Product.
    plan_name_snapshot = models.CharField(max_length=255, null=True, blank=True)
    unit_price_cents = models.PositiveIntegerField()

    stripe_price_id = models.CharField(max_length=255, null=True, blank=True)

    # Denormalized from payment.customer so order history is one indexed read.
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="orders")

    def clean(self):
        super().clean()
        if self.payment_id and self.customer_id != self.payment.customer_id:
            raise ValidationError("Order customer must match the payment's customer")
        if self.subscription_id:
            if self.subscription.customer_id != self.customer_id:
                raise ValidationError(
                    "Order subscription must belong to the same customer"
                )
            if self.subscription.plan_id != self.plan_id:
                raise ValidationError(
                    "Order subscription must be for the same plan as the order"
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    class Meta:
        constraints = [
            # PositiveIntegerField permits 0.
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1),
                name="order_quantity_positive",
            ),
        ]
        indexes = [
            models.Index(fields=["customer", "-created_at"]),
            models.Index(fields=["subscription", "-created_at"]),
        ]
