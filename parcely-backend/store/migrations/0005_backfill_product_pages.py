from django.db import migrations
from django.utils.text import slugify

from store.constants import RESERVED_PAGE_SLUGS

# Kept in step with products.services.PRODUCT_BLOCK_LAYOUT, but spelled out
# rather than imported: a migration has to keep describing the past even after
# that constant moves on.
PRODUCT_BLOCK_LAYOUT = {
    "desktop": {"row_start": 0, "col_start": 0, "row_span": 4, "col_span": 8},
    "tablet": None,
    "mobile": None,
}

DEFAULT_BLOCK_STYLE = {
    "background_color": None,
    "font_family": None,
    "font_scale": None,
    "font_color": None,
    "line_spacing": None,
    "alignment": "left",
    "padding": None,
}


def page_slug(Page, storefront_id, title):
    # Page._generate_slug in miniature. Historical models have no custom save(),
    # so the collision loop has to be repeated here.
    base = slugify(title)[:250] or "page"
    slug = base
    n = 1
    while slug in RESERVED_PAGE_SLUGS or Page.objects.filter(slug=slug, storefront_id=storefront_id).exists():
        n += 1
        slug = f"{base}-{n}"
    return slug


def create_product_pages(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Page = apps.get_model("store", "Page")
    PageBlock = apps.get_model("store", "PageBlock")

    for product in Product.objects.filter(page__isnull=True).iterator():
        page = Page.objects.create(
            storefront_id=product.storefront_id,
            title=product.name,
            slug=page_slug(Page, product.storefront_id, product.name),
            product=product,
        )
        PageBlock.objects.create(
            page=page,
            kind="product",
            content={"product_id": product.id},
            style=DEFAULT_BLOCK_STYLE,
            layout=PRODUCT_BLOCK_LAYOUT,
        )


def delete_product_pages(apps, schema_editor):
    # The pages are only reachable through the products tab, so removing them
    # returns the storefront to exactly where it started.
    apps.get_model("store", "Page").objects.filter(product__isnull=False).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('store', '0004_page_product_alter_pageblock_kind'),
    ]

    operations = [
        migrations.RunPython(create_product_pages, delete_product_pages),
    ]
