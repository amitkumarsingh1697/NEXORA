package app;
import app.Store;
class Cart extends Base implements Shape {
  public function new() { super(); }
  public function total(x:String, ?y:Int):Int { var s = new Store(); s.save(x); return helper(x); }
}
import haxe.ds.*;
import a.B as C;
interface Shape extends Base { function area():Float; }
enum Color { Red; Green; }
typedef P = { x:Int };
class M { static function main() { trace("x"); Std.parseInt("1"); a.b.c(); } var z:Int = 3; }
