from s3.models import Blob
from store.models import Page


def block_reference_context(blocks, storefront) -> dict:
    """Build the {'products', 'blobs', 'pages'} context PageBlockSerializer.get_resolved_content reads.

    Scoping mirrors the write-time rules in validate_page_block_content: a
    reference that was valid when written but has since been moved or reassigned
    drops out and resolves to None, same as a deleted one. PageDetailAPIView is
    public, so it can't trust the ids in content on their own.
    """
    product_ids: set[int] = set()
    blob_ids: set[int] = set()
    page_ids: set[int] = set()

    for block in blocks:
        content = block.content or {}
        kind = block.kind
        if kind == 'product':
            pid = content.get('product_id')
            if pid:
                product_ids.add(pid)
        elif kind == 'media':
            mid = content.get('media_id')
            if mid:
                blob_ids.add(mid)
        elif kind == 'gallery':
            blob_ids.update(content.get('gallery_ids', []))
        elif kind == 'slideshow':
            blob_ids.update(content.get('slideshow_ids', []))
        elif kind == 'link':
            pid = content.get('page_id')
            if pid:
                page_ids.add(pid)
            mid = content.get('media_id')
            if mid:
                blob_ids.add(mid)

    products = {}
    if product_ids:
        from products.models import Product  # lazy: products imports store models
        products = {
            p.pk: p
            for p in Product.objects.filter(id__in=product_ids, storefront=storefront)
        }

    # only query if there is something to fetch - avoids empty in() queries
    blobs = (
        {
            b.pk: b
            for b in Blob.objects.filter(id__in=blob_ids, uploader_id=storefront.owner_id)
        }
        if blob_ids else {}
    )

    # select_related because PageSummarySerializer renders logo_image
    pages = (
        {
            p.pk: p
            for p in Page.objects.select_related('logo_image').filter(
                id__in=page_ids, storefront=storefront,
            )
        }
        if page_ids else {}
    )

    return {'products': products, 'blobs': blobs, 'pages': pages}
