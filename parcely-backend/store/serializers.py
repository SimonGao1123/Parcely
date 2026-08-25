from rest_framework import serializers
from store.models import StoreFront, Page, PageBlock
from s3.models import Blob
from s3.serializers import BlobSerializer
from accounts.models import AppUser
from accounts.serializers import AppUserSerializer

class PageSummarySerializer(serializers.ModelSerializer):
    logo_image = BlobSerializer(read_only=True)
    logo_image_id = serializers.PrimaryKeyRelatedField(
        queryset=Blob.objects.all(), source="logo_image", write_only=True,
        required=False, allow_null=True,
    )
    
    class Meta:
        model = Page
        fields = ['id', 'title', 'slug', 'logo_image', 'logo_image_id', 'storefront_id']
        read_only_fields = ['id', 'slug', 'storefront_id'] # storefront must be read only, cannot update a page to a diff storefront

class StoreFrontSummarySerializer(serializers.ModelSerializer):
    # just doesn't include all pages, only includes homepage summary
    logo_image = BlobSerializer(read_only=True)
    banner_image = BlobSerializer(read_only=True)
    owner = AppUserSerializer(read_only=True)
    logo_image_id = serializers.PrimaryKeyRelatedField(
        queryset=Blob.objects.all(), source="logo_image", write_only=True,
        required=False, allow_null=True,
    )
    banner_image_id = serializers.PrimaryKeyRelatedField(
        queryset=Blob.objects.all(), source="banner_image", write_only=True,
        required=False, allow_null=True,
    )
    
    homepage = PageSummarySerializer(read_only=True) # so we can automatically navigate to homepage with the slug
    homepage_id = serializers.PrimaryKeyRelatedField(
        queryset=Page.objects.all(), source="homepage", write_only=True,
        required=False, allow_null=True,
    )
    
    class Meta:
        model = StoreFront
        fields = [
            "id", "title", "description", "slug", "theme", "style",
            "logo_image", "banner_image", "owner",
            "logo_image_id", "banner_image_id",
            "created_at", "updated_at",
            "homepage", "homepage_id"
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']

# use when actually opening a SPECIFIC storefront, so pages can be populated in the navbar
class StoreFrontSerializer(serializers.ModelSerializer):
    logo_image = BlobSerializer(read_only=True)
    banner_image = BlobSerializer(read_only=True)
    owner = AppUserSerializer(read_only=True)
    pages = PageSummarySerializer(many=True, read_only=True)

    logo_image_id = serializers.PrimaryKeyRelatedField(
        queryset=Blob.objects.all(), source="logo_image", write_only=True,
        required=False, allow_null=True,
    )
    banner_image_id = serializers.PrimaryKeyRelatedField(
        queryset=Blob.objects.all(), source="banner_image", write_only=True,
        required=False, allow_null=True,
    )
    
    homepage = PageSummarySerializer(read_only=True) # so we can automatically navigate to homepage with the slug

    homepage_id = serializers.PrimaryKeyRelatedField(
        queryset=Page.objects.all(), source="homepage", write_only=True,
        required=False, allow_null=True,
    )

    class Meta:
        model = StoreFront
        fields = [
            "id", "title", "description", "slug", "theme", "style",
            "logo_image", "banner_image", "owner",
            "logo_image_id", "banner_image_id",
            "created_at", "updated_at",
            "pages", "homepage", "homepage_id"
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']

class PageBlockSerializer(serializers.ModelSerializer):
    resolved_content = serializers.SerializerMethodField()

    def get_resolved_content(self, obj):
        products = self.context.get('products', {})
        blobs = self.context.get('blobs', {})

        kind = obj.kind
        content = obj.content or {}

        if kind == 'text':
            return content
        if kind == 'product':
            product = products.get(content.get('product_id'))
            if not product:
                return None
            from products.serializers import ProductSummarySerializer # lazy import to avoid circular import
            return ProductSummarySerializer(product, context=self.context).data
        if kind == 'media':
            media = blobs.get(content.get('media_id'))
            return BlobSerializer(media, context=self.context).data if media else None
        if kind == 'gallery':
            items = [blobs[i] for i in content.get('gallery_ids', []) if i in blobs]
            return BlobSerializer(items, many=True, context=self.context).data
        if kind == 'slideshow':
            items = [blobs[i] for i in content.get('slideshow_ids', []) if i in blobs]
            return BlobSerializer(items, many=True, context=self.context).data
        return None
            
    class Meta:
        model = PageBlock
        fields = ['id', 'kind', 'content', 'style', 'layout', 'page', 'created_at', 'updated_at', 'resolved_content']
        read_only_fields = ['id', 'created_at', 'updated_at', 'page']

class PageSerializer(serializers.ModelSerializer):
    logo_image = BlobSerializer(read_only=True)
    storefront = StoreFrontSummarySerializer(read_only=True)
    blocks = PageBlockSerializer(many=True, read_only=True)

    logo_image_id = serializers.PrimaryKeyRelatedField(
        queryset=Blob.objects.all(), source="logo_image", write_only=True,
        required=False, allow_null=True,
    )
    
    # no storefront_id, we add from url path with slug (storefront_slug)
    class Meta:
        model = Page
        fields = [
            "id", "title", "slug",
            "logo_image", "storefront", "blocks",
            "logo_image_id",
            "created_at", "updated_at",
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']

