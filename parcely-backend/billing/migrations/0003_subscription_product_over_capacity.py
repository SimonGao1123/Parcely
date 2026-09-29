import django.db.models.deletion
from django.db import migrations, models


def backfill_product(apps, schema_editor):
    """Fill the denormalized product from each subscription's plan.

    A no-op on an empty table, but the field is altered to NOT NULL immediately after,
    so this has to run for the migration to be replayable against real data.
    """
    Subscription = apps.get_model("billing", "Subscription")
    Plan = apps.get_model("products", "Plan")
    # A subquery rather than F("plan__product_id") - update() refuses to traverse a join.
    Subscription.objects.filter(product__isnull=True).update(
        product_id=models.Subquery(
            Plan.objects.filter(pk=models.OuterRef("plan_id")).values("product_id")[:1]
        )
    )


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0002_payment_subscription_order_and_more'),
        ('products', '0004_plan_uniq_plan_stripe_price_id_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='subscription',
            name='product',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='subscriptions',
                to='products.product',
            ),
        ),
        migrations.RunPython(backfill_product, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='subscription',
            name='product',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='subscriptions',
                to='products.product',
            ),
        ),
        migrations.AddField(
            model_name='subscription',
            name='over_capacity',
            field=models.BooleanField(default=False),
        ),
        # Strictly stronger than the constraint it replaces, so this fails if any customer
        # already holds live subscriptions to two plans of one product. Resolving that is a
        # product decision about which survives, not something to guess here.
        migrations.RemoveConstraint(
            model_name='subscription',
            name='uniq_subscription_customer_plan_live',
        ),
        migrations.AddConstraint(
            model_name='subscription',
            constraint=models.UniqueConstraint(
                condition=models.Q(('status__in', ['active', 'trialing', 'past_due', 'unpaid'])),
                fields=('customer', 'product'),
                name='uniq_subscription_customer_product_live',
            ),
        ),
    ]
