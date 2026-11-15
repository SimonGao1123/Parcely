"""Read-only shapes of what a buyer bought, shared by the buyer's Purchases views and the
seller's dashboard. Nothing here writes: every row is the webhook's to create.
"""

from rest_framework import serializers

from billing.models import Order, Payment, Subscription


class _StorefrontRefSerializer(serializers.Serializer):
    title = serializers.CharField()
    slug = serializers.CharField()


class _CustomerRefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    email = serializers.EmailField()


class OrderLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = ["id", "plan_name_snapshot", "quantity", "unit_price_cents"]
        read_only_fields = fields


class PaymentSerializer(serializers.ModelSerializer):
    """One receipt - a single movement of money and the lines it paid for."""

    kind = serializers.SerializerMethodField()
    storefront = serializers.SerializerMethodField()
    orders = OrderLineSerializer(many=True, read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id", "created_at", "amount_cents", "currency", "card_brand", "card_last4",
            "kind", "storefront", "orders",
        ]
        read_only_fields = fields

    def get_kind(self, obj):
        # A cs_ is only ever on a cart purchase; subscription money arrives on invoices.
        return "one_time" if obj.stripe_checkout_session_id else "subscription"

    def get_storefront(self, obj):
        # Payment carries no storefront of its own. Every line of one payment is from the
        # same one - a cart belongs to one storefront, a subscription to one plan - so the
        # first line answers for all of them. Reads the prefetch rather than querying.
        orders = obj.orders.all()
        if not orders:
            return None
        return _StorefrontRefSerializer(orders[0].plan.product.storefront).data


class SubscriptionSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    plan = serializers.SerializerMethodField()
    storefront = serializers.SerializerMethodField()
    card_brand = serializers.SerializerMethodField()
    card_last4 = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = [
            "id", "status", "product_name", "plan", "unit_price_cents", "currency",
            "current_period_end", "trial_end", "cancel_at_period_end", "ended_at",
            "created_at", "storefront", "card_brand", "card_last4",
        ]
        read_only_fields = fields

    def get_plan(self, obj):
        # The pricing fields lib/price.ts formats from, so the frontend names the plan
        # the same way the storefront did when it was sold.
        plan = obj.plan
        return {
            "id": plan.id,
            "title": plan.title,
            "billing_interval": plan.billing_interval,
            "billing_interval_count": plan.billing_interval_count,
            "trial_period_days": plan.trial_period_days,
        }

    def get_storefront(self, obj):
        return _StorefrontRefSerializer(obj.product.storefront).data

    def _latest_payment(self, obj):
        # Orders are prefetched newest first, so the card is whatever paid most recently.
        for order in obj.orders.all():
            return order.payment
        return None

    def get_card_brand(self, obj):
        payment = self._latest_payment(obj)
        return payment.card_brand if payment else None

    def get_card_last4(self, obj):
        payment = self._latest_payment(obj)
        return payment.card_last4 if payment else None


class SellerPaymentSerializer(PaymentSerializer):
    customer = _CustomerRefSerializer(read_only=True)

    class Meta(PaymentSerializer.Meta):
        fields = PaymentSerializer.Meta.fields + ["customer"]
        read_only_fields = fields


class SellerSubscriptionSerializer(SubscriptionSerializer):
    customer = _CustomerRefSerializer(read_only=True)

    class Meta(SubscriptionSerializer.Meta):
        fields = SubscriptionSerializer.Meta.fields + ["customer"]
        read_only_fields = fields


class SellerCustomerSerializer(serializers.Serializer):
    """A buyer as one storefront sees them. The counts are annotated by the view and are
    scoped to that storefront, even though the Customer row spans the seller's stores."""

    id = serializers.IntegerField()
    email = serializers.EmailField()
    created_at = serializers.DateTimeField()
    blocked_at = serializers.DateTimeField(allow_null=True)
    payment_count = serializers.IntegerField()
    total_spent_cents = serializers.IntegerField()
    live_subscription_count = serializers.IntegerField()
    # Across every storefront, because that is how many a removal would cancel.
    seller_live_subscription_count = serializers.IntegerField()
