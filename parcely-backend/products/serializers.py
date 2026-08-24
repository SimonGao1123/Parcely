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
        read_only_fields = ['id', 'created_at', 'updated_at']

class ProductSerializer(serializers.ModelSerializer):
    display_image = BlobSerializer(read_only=True)
    storefront = StoreFrontSerializer(read_only=True)
    plans = PlanSerializer(many=True, read_only=True)

    storefront_id = serializers.PrimaryKeyRelatedField(
        queryset=StoreFront.objects.all(), source="storefront", write_only=True,
    )
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
            'currency',
            'is_active',
            'storefront_id',
            'display_image_id',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

class ProductSummarySerializer(serializers.ModelSerializer): # for display in pageblocks
    display_image = BlobSerializer(read_only=True)
    plans = PlanSerializer(many=True, read_only=True)
    
    class Meta:
        model = Product
        fields = ['id', 'name', 'description', 'is_subscription', 'max_capacity', 'display_image', 'plans', 'storefront', 'currency', 'is_active']
        read_only_fields = ['id']