from rest_framework import serializers
from store.models import StoreFront, Page, PageBlock
from s3.models import Blob
from s3.serializers import BlobSerializer
from accounts.models import AppUser
from accounts.serializers import AppUserSerializer

class PageSummarySerializer(serializers.ModelSerializer):
    logo_image = BlobSerializer(read_only=True)
    class Meta:
        model = Page
        fields = ['id', 'title', 'slug', 'logo_image']
        read_only_fields = ['id', 'slug']

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
    
    class Meta:
        model = StoreFront
        fields = [
            "id", "title", "description", "slug", "theme", "style",
            "logo_image", "banner_image", "owner",
            "logo_image_id", "banner_image_id",
            "created_at", "updated_at",
            "homepage"
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

    class Meta:
        model = StoreFront
        fields = [
            "id", "title", "description", "slug", "theme", "style",
            "logo_image", "banner_image", "owner",
            "logo_image_id", "banner_image_id",
            "created_at", "updated_at",
            "pages", "homepage"
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']

class PageBlockSerializer(serializers.ModelSerializer):
    resolved_content = serializers.SerializerMethodField()

    def get_resolved_content(self, obj):
        # lazy imports to avoid store <-> products circular import
        from products.models import Product
        from products.serializers import ProductSummarySerializer

        kind = obj.kind
        content = obj.content or {}

        if kind == 'product':
            product_id = content.get('product_id')
            if not product_id:
                return None
            product = Product.objects.filter(pk = product_id).first()
            return ProductSummarySerializer(product, context=self.context).data if product else None
        
        if kind == 'media':
            media = Blob.objects.filter(pk = content.get('media_id')).first()
            return BlobSerializer(media, context=self.context).data if media else None
        
        if kind == 'gallery':
            medias = Blob.objects.filter(pk__in = content.get('gallery_ids', [])).all()
            return BlobSerializer(medias, many=True, context=self.context).data if medias else None
        
        if kind == 'slideshow':
            slideshows = Blob.objects.filter(pk__in = content.get('slideshow_ids', [])).all()
            return BlobSerializer(slideshows, many=True, context=self.context).data if slideshows else None
        
        if kind == 'text':
            return content
        
        return None
    
    page_id = serializers.PrimaryKeyRelatedField(
        queryset=Page.objects.all(), source="page", write_only=True,
    )
             

            
    class Meta:
        model = PageBlock
        fields = ['id', 'kind', 'content', 'style', 'layout', 'page', 'created_at', 'updated_at', 'resolved_content', 'page_id']
        read_only_fields = ['id', 'created_at', 'updated_at']

class PageSerializer(serializers.ModelSerializer):
    logo_image = BlobSerializer(read_only=True)
    storefront = StoreFrontSerializer(read_only=True)
    blocks = PageBlockSerializer(many=True, read_only=True)

    logo_image_id = serializers.PrimaryKeyRelatedField(
        queryset=Blob.objects.all(), source="logo_image", write_only=True,
        required=False, allow_null=True,
    )
    storefront_id = serializers.PrimaryKeyRelatedField(
        queryset=StoreFront.objects.all(), source="storefront", write_only=True,
    )

    class Meta:
        model = Page
        fields = [
            "id", "title", "slug",
            "logo_image", "storefront", "blocks",
            "logo_image_id", "storefront_id",
            "created_at", "updated_at",
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']

