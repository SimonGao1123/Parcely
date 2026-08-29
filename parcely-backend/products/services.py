from store.models import BlockType, Page, PageBlock

# Top-left, matching DEFAULT_SPANS.product on the frontend: a product sits
# image-left / details-right, so it needs to be wide. The owner is free to move
# or resize it afterwards - this is only where it lands.
PRODUCT_BLOCK_LAYOUT = {
    "desktop": {"row_start": 0, "col_start": 0, "row_span": 4, "col_span": 8},
    "tablet": None,
    "mobile": None,
}


def create_product_page(product) -> Page:
    """Give a freshly created product its own page, showing the product.

    The title is copied once, at creation. The page is editable like any other
    afterwards, so renaming the product later deliberately leaves it alone.
    """
    page = Page.objects.create(
        storefront=product.storefront,
        title=product.name,
        product=product,
    )
    # style omitted so the model default (all-null overrides) applies
    PageBlock.objects.create(
        page=page,
        kind=BlockType.PRODUCT,
        content={"product_id": product.id},
        layout=PRODUCT_BLOCK_LAYOUT,
    )
    return page
