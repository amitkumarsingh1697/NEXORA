from django.db import models


class Timestamped(models.Model):
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True


class Customer(Timestamped):
    email = models.EmailField(max_length=254, unique=True)
    name = models.CharField("full name", max_length=100, null=True, blank=True)


class Order(Timestamped):
    number = models.CharField(max_length=20, primary_key=True)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="orders")
    referrer = models.ForeignKey("self", null=True, on_delete=models.SET_NULL)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tags = models.ManyToManyField("Tag")

    class Meta:
        db_table = "shop_orders"


class Tag(models.Model):
    label = models.SlugField(db_column="tag_label")


class VipCustomer(Customer):
    level = models.IntegerField(default=1)


class CustomerProxy(Customer):
    class Meta:
        proxy = True
