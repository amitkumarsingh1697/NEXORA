module app.cart;
import std.stdio;
import app.store : Store;
class Cart : Base, Shape {
  int total(string x, int[] xs...) { auto s = new Store(); s.save(x); return helper(x); }
  this(int a) {}
}
struct Point { int x; }
int top(int a) { writeln(a); return a; }
interface Shape { double area(); }
enum Color { Red, Green }
template Foo(T) { T get(T a) { return a; } }
union U { int a; float b; }
void main() { import std.conv : to; auto c = new Cart(1); c.total("a"); Cart.make!int(2); x.y.z(); }
