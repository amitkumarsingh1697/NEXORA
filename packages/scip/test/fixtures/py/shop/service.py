import json

from .models import ConnectionError, Order, parse


def checkout(raw: str) -> int:
    order = parse(raw)
    order.save()
    data = json.dumps({"total": order.total()})
    if not data:
        raise ConnectionError("empty")
    return len(data)


def make() -> Order:
    return Order()
