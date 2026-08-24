from rest_framework import serializers
from store.models import StoreFront, Page, PageBlock
from s3.models import Blob
from s3.serializers import BlobSerializer
from accounts.models import AppUser
from accounts.serializers import AppUserSerializer

class StoreFrontSerializer(serializers.ModelSerializer):
    logo_image = BlobSerializer(read_only=True)
    banner_image = BlobSerializer(read_only=True)
    owner = AppUserSerializer(read_only=True)

    owner_id = serializers.PrimaryKeyRelatedField(
        queryset=AppUser.objects.all(), source="owner", write_only=True,
    )
    logo_image_id = serializers.PrimaryKeyRelatedField(
        queryset=Blob.objects.all(), source="logo_image", write_only=True,
        required=False, allow_null=True,
    )
    banner_image_id = serializers.PrimaryKeyRelatedField(
        queryset=Blob.objects.all(), source="banner_image", write_only=True,
        required=False, allow_null=True,
    )

    class Meta:
        model = StoreFront
        fields = [
            "id", "title", "description", "slug", "theme", "style",
            "logo_image", "banner_image", "owner",
            "owner_id", "logo_image_id", "banner_image_id",
            "created_at", "updated_at",
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']

class PageBlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = PageBlock
        fields = ['id', 'kind', 'content', 'style', 'layout', 'page', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

class PageSerializer(serializers.ModelSerializer):
    logo_image = BlobSerializer(read_only=True)
    storefront = StoreFrontSerializer(read_only=True)
    blocks = PageBlockSerializer(many=True, read_only=True)

    logo_image_id = serializers.PrimaryKeyRelatedField(
        queryset=Blob.objects.all(), source="logo_image", write_only=True,
        required=False, allow_null=True,
    )

    class Meta:
        model = Page
        fields = [
            "id", "title", "slug",
            "logo_image", "storefront", "blocks",
            "logo_image_id",
            "created_at", "updated_at",
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']
