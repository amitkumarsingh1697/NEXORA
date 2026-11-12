from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("shop", "0001_initial")]

    operations = [
        migrations.CreateModel(
            name="Note",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("body", models.TextField()),
                ("order", models.ForeignKey(on_delete=models.deletion.CASCADE, to="shop.order")),
            ],
        ),
        migrations.AddField(
            model_name="customer",
            name="phone",
            field=models.CharField(max_length=30, null=True),
        ),
    ]
