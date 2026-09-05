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
        # product is read only and set by create_product_page — a page cannot be
        # attached to a product after the fact. Non-null marks a product page,
        # which the navbar skips and the products tab lists instead.
        fields = ['id', 'title', 'slug', 'logo_image', 'logo_image_id', 'storefront', 'product']
        read_only_fields = ['id', 'slug', 'storefront', 'product'] # storefront must be read only, cannot update a page to a diff storefront

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
            "id", "title", "description", "slug", "theme", "style", "currency",
            "logo_image", "banner_image", "owner",
            "logo_image_id", "banner_image_id",
            "created_at", "updated_at", "is_draft", 
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
            "id", "title", "description", "slug", "theme", "style", "currency",
            "logo_image", "banner_image", "owner",
            "logo_image_id", "banner_image_id",
            "created_at", "updated_at", "is_draft",
            "pages", "homepage", "homepage_id"
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']

class PageBlockSerializer(serializers.ModelSerializer):
    resolved_content = serializers.SerializerMethodField()

    def get_resolved_content(self, obj):
        products = self.context.get('products', {})
        blobs = self.context.get('blobs', {})
        pages = self.context.get('pages', {})

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
        # the target's slug is resolved here rather than stored on the block, so
        # renaming a page can never leave a link pointing at a dead URL
        if kind == 'link':
            page = pages.get(content.get('page_id'))
            media = blobs.get(content.get('media_id'))
            return {
                'page': PageSummarySerializer(page, context=self.context).data if page else None,
                'media': BlobSerializer(media, context=self.context).data if media else None,
                'text': content.get('text'),
            }
        # unresolvable entries stay in place as their raw id, so positions line up
        # with content[*_ids] and the client can see which ones are gone
        if kind == 'gallery':
            return [
                BlobSerializer(blobs[i], context=self.context).data if i in blobs else i
                for i in content.get('gallery_ids', [])
            ]
        if kind == 'slideshow':
            return [
                BlobSerializer(blobs[i], context=self.context).data if i in blobs else i
                for i in content.get('slideshow_ids', [])
            ]
        return None
            
    class Meta:
        model = PageBlock
        fields = ['id', 'kind', 'content', 'style', 'layout', 'page', 'created_at', 'updated_at', 'resolved_content']
        read_only_fields = ['id', 'created_at', 'updated_at', 'page']


class BlockLayoutItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    # plain JSONField: the shape is enforced by normalize_page_block_layout in the
    # view, which is the same pydantic pass PageBlock.save() would have run
    layout = serializers.JSONField()


class PageLayoutSerializer(serializers.Serializer):
    """Payload for repositioning several blocks in one request.

    Layout is the only block field with a page-wide invariant (no two blocks may
    overlap), so it's the only one that can't be updated a block at a time —
    rearrangements pass through intermediate states that overlap.
    """
    blocks = BlockLayoutItemSerializer(many=True)


class PageBlockBatchSerializer(serializers.Serializer):
    """Everything one editing session changed, as a single payload.

    Shape only. `creates` and `updates` stay opaque because the real validation
    is PageBlockSerializer and PageBlock.save(), which the view runs per item —
    restating those rules here would only let the two drift apart.

    Every key is optional: a session that merely dragged a block sends layout
    alone.
    """
    deletes = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
    layout = BlockLayoutItemSerializer(many=True, required=False, default=list)
    updates = serializers.ListField(child=serializers.JSONField(), required=False, default=list)
    creates = serializers.ListField(child=serializers.JSONField(), required=False, default=list)


class PageSerializer(serializers.ModelSerializer):
    logo_image = BlobSerializer(read_only=True)
    # storefront = StoreFrontSummarySerializer(read_only=True) unecessary currently
    blocks = PageBlockSerializer(many=True, read_only=True)

    logo_image_id = serializers.PrimaryKeyRelatedField(
        queryset=Blob.objects.all(), source="logo_image", write_only=True,
        required=False, allow_null=True,
    )

    is_homepage = serializers.SerializerMethodField()

    def get_is_homepage(self, obj):
        return obj.storefront.homepage.id == obj.id if obj.storefront.homepage else False
    
    # no storefront_id, we add from url path with slug (storefront_slug)
    class Meta:
        model = Page
        fields = [
            "id", "title", "slug", "is_homepage",
            "logo_image", "blocks",
            "logo_image_id",
            "created_at", "updated_at", "storefront", "product"
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at', 'storefront', 'product']

