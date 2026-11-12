import gleam/io
import app/store.{type Store, save}
pub type Cart { Cart(total: Int) }
pub type Id = Int
pub fn total(c: Cart, x: Int) -> Int {
  let s = store.new()
  save(s, c)
  io.println("x")
  helper(x)
}
fn helper(a) { a }
pub const limit: Int = 3
