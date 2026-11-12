import 'package:app/store.dart';
import 'cart.dart' as c;
abstract class Shape { double area(); }
class Circle extends Shape with Mix implements Comparable<Circle> {
  final double r;
  Circle(this.r);
  Circle.unit() : r = 1;
  @override
  double area() => 3.14 * r * r;
  static int count(List<int> xs, {int min = 0}) { return xs.where((x) => x > min).length; }
  set radius(double v) {}
  int get size => 1;
}
enum Color { red, green }
mixin Mix {}
extension on String { int twice() => length * 2; }
typedef Fn = int Function(int);
int top(int a, [int b = 2]) { final s = Store(); s.save(a); print(c.total()); return helper(a); }
