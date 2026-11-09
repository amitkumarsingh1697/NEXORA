package shop.cart

import shop.store.Store
import scala.util.{Try, Success}

class Cart(store: Store) extends Base with Saver {
  def add(sku: String, qty: Int = 1): Int = {
    check(sku)
    val total = helper(qty)
    store.save(sku)
    total
  }
  private def check(sku: String): Boolean = sku.nonEmpty
}

object Cart {
  def helper(n: Int): Int = new Counter().next(n)
}

trait Saver { def save(sku: String): Unit }
