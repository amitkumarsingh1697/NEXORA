import os
from .store import Store, load as load_store
from typing import Optional


class Base:
    pass


class Cart(Base):
    """A shopping cart."""

    def __init__(self, store: Store, owner: str = "me") -> None:
        self.store = store
        self.items: list[str] = []

    def add(self, sku: str, qty: int = 1) -> Optional[int]:
        self._check(sku)
        total = helper(qty)
        self.store.save(sku)
        return os.getpid() + total

    def _check(self, sku):
        return len(sku) > 0


def helper(n: int, *args, **kwargs) -> int:
    load_store("x")
    return n * 2


async def main():
    c = Cart(Store())
    await c.add("a")
