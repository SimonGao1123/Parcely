from django.db import migrations


def backfill_storefront_currency(apps, schema_editor):
    """Lift each storefront's currency off the products it already has.

    Products in one storefront could previously disagree; the first one wins,
    which keeps a single-currency storefront (every real one) exactly as its
    owner set it. Storefronts with no products keep the model default.
    """
    Product = apps.get_model('products', 'Product')
    StoreFront = apps.get_model('store', 'StoreFront')

    seen = set()
    for storefront_id, currency in Product.objects.order_by('id').values_list('storefront_id', 'currency'):
        if storefront_id in seen:
            continue
        seen.add(storefront_id)
        StoreFront.objects.filter(pk=storefront_id).update(currency=currency)


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0001_initial'),
        ('store', '0006_storefront_currency'),
    ]

    operations = [
        migrations.RunPython(backfill_storefront_currency, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='product',
            name='currency',
        ),
    ]
