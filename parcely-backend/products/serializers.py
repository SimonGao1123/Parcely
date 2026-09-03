from rest_framework import serializers
from products.models import Plan, Product
from s3.models import Blob
from s3.serializers import BlobSerializer
from store.models import StoreFront
from store.serializers import StoreFrontSerializer

class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'product'] # cant change product id, can only change other fields

# NOT NEEDED CURRENTLY, DEPRECATED
class ProductSerializer(serializers.ModelSerializer):
    display_image = BlobSerializer(read_only=True)
    storefront = StoreFrontSerializer(read_only=True)
    plans = PlanSerializer(many=True, read_only=True)

    display_image_id = serializers.PrimaryKeyRelatedField(
        queryset=Blob.objects.all(), source="display_image", write_only=True,
        required=False, allow_null=True,
    )

    class Meta:
        model = Product
        fields = [
            'id',
            'name',
            'description',
            'is_subscription',
            'max_capacity',
            'display_image',
            'storefront',
            'plans',
            'is_active',
            'display_image_id',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

class ProductSummarySerializer(serializers.ModelSerializer): # for display in pageblocks
    display_image = BlobSerializer(read_only=True)
    plans = PlanSerializer(many=True, read_only=True)

    display_image_id = serializers.PrimaryKeyRelatedField(
        queryset=Blob.objects.all(), source="display_image", write_only=True,
        required=False, allow_null=True,
    )
    
    class Meta:
        model = Product
        fields = ['id', 'name', 'description', 'is_subscription', 'max_capacity', 'display_image', 'plans', 'storefront', 'is_active', 'created_at', 'updated_at', 'display_image_id']
        read_only_fields = ['id', 'created_at', 'updated_at', 'storefront']

class ProductCartItemSerializer(serializers.ModelSerializer):
    display_image = BlobSerializer(read_only=True)
    class Meta:
        model = Product
        fields = ['id', 'name', 'description', 'is_subscription', 'max_capacity', 'display_image', 'storefront', 'is_active', 'created_at', 'updated_at', 'display_image_id']
        read_only_fields = ['id', 'created_at', 'updated_at', 'storefront']
class PlanCartItemSerializer(serializers.ModelSerializer):
    product = ProductCartItemSerializer(read_only = True)
    # instead of going to products then plans, going from plan to product so ensure product serializer doesn't have circular ref to plans
    # also don't need storefront since when we are serializing our cart we get storefront
    class Meta:
        model = Plan
        fields = ['id', 'title', 'price_cents', 'product', 'billing_interval', 'billing_interval_count', 'trial_period_days']
        read_only_fields = ['id', 'created_at', 'updated_at', 'product']