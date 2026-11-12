import Foundation
import UIKit
protocol Shape { func area() -> Double }
class Circle: Base, Shape {
  var r: Double
  init(r: Double) { self.r = r }
  func area() -> Double { return 3.14 * r * r }
  static func make(_ x: Int, label y: String = "a") -> Circle { return Circle(r: 1) }
}
struct Point { let x: Int; func moved(by d: Int) -> Point { return Point(x: x + d) } }
enum Color { case red, green }
extension Circle { func twice() -> Double { area() * 2 } }
func top(a: Int, b: Int...) -> Int { let s = Store(); s.save(a); print(helper(a)); return a }
