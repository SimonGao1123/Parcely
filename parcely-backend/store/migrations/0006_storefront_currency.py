from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('store', '0005_backfill_product_pages'),
    ]

    operations = [
        migrations.AddField(
            model_name='storefront',
            name='currency',
            field=models.CharField(choices=[('usd', 'USD'), ('eur', 'EUR'), ('cad', 'CAD')], default='usd', max_length=3),
        ),
    ]
