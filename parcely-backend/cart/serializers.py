from rest_framework import serializers

from accounts.serializers import AppUserSerializer
from products.models import Plan
from products.serializers import PlanCartItemSerializer
from store.serializers import StoreFrontSummarySerializer

from .models import Cart, CartItem


class CartItemSerializer(serializers.ModelSerializer):
    plan = PlanCartItemSerializer(read_only=True)
    plan_id = serializers.PrimaryKeyRelatedField(
        queryset=Plan.objects.all(), source="plan", write_only=True,
    )

    class Meta:
        model = CartItem
        fields = ['id', 'plan', 'plan_id', 'quantity', 'cart', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'cart']
        # never need to JUST serialize a single cart item, always serialize the entire cart so no
        # circular refs

    # The model rejects a cross-storefront plan too, but only at save time and as
    # a non-field error. Catching it here names the offending field.
    def validate_plan_id(self, plan):
        storefront = self.context["storefront"]
        if plan.product.storefront_id != storefront.id:
            raise serializers.ValidationError("Plan does not belong to this storefront.")
        if not plan.product.is_active:
            raise serializers.ValidationError("This product is not for sale.")
        # Same reasoning as the cross-storefront rule above: the model refuses this too,
        # but as a non-field error at save time.
        if plan.product.is_subscription:
            raise serializers.ValidationError(
                "Subscriptions are bought directly, not through the cart."
            )
        return plan


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    storefront = StoreFrontSummarySerializer(read_only=True)
    user = AppUserSerializer(read_only=True)

    total_cents = serializers.SerializerMethodField()

    # a plain sum: every plan in the cart is priced in the storefront's single
    # currency. doesnt consider tax yet
    def get_total_cents(self, obj):
        return sum(item.plan.price_cents * item.quantity for item in obj.items.all())

    class Meta:
        model = Cart
        # public_session_id is returned so the caller can store it — it is the
        # only way back to this cart.
        fields = ['id', 'storefront', 'user', 'items', 'total_cents', 'created_at', 'updated_at', 'public_session_id']
        read_only_fields = ['id', 'created_at', 'updated_at', 'public_session_id']
