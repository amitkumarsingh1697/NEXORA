using Gtk;
namespace App {
  public class Cart : Base, Shape {
    public int total(string x, int y = 2) { var s = new Store(); s.save(x); return helper(x); }
    public Cart() {}
  }
  public interface Shape : Object { public abstract int area(); }
}
struct Point { public int x; }
enum Color { RED }
public delegate void Cb(int a);
class A { public string name { get; set; } public signal void changed(); construct {} public static void run(params string[] args) { var c = new Cart(); c.total("a"); App.Cart.make(1); } }
