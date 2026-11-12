import std/strutils, os
from app/store import Store
type
  Cart* = ref object of Base
    total: int
  Color = enum red, green
proc newCart*(a: int, b = 2): Cart =
  result = Cart(total: a)
  echo a
proc total(c: Cart, xs: varargs[int]): int =
  let s = newStore()
  s.save(c)
  helper(c)
method area(s: Shape): float {.base.} = 0.0
func pure(x: int): int = x + 1
template t(x: untyped) = discard
macro m(x: untyped): untyped = discard
iterator items(c: Cart): int = yield 1
