from typing import overload


class ConnectionError(Exception):
    """Shadows the builtin of the same name."""


class Base:
    def save(self) -> None:
        pass


class Order(Base):
    def total(self) -> int:
        return 1


@overload
def parse(value: None) -> None: ...
@overload
def parse(value: str) -> Order: ...
def parse(value):
    if value is None:
        return None
    return Order()


class Draft:
    def save(self) -> None:
        pass

    def total(self) -> int:
        return 0
