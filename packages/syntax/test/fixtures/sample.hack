<?hh
namespace App;
use App\Store;
class Cart extends Base implements Shape {
  public function total(string $x, int ...$xs): int { $s = new Store(); $s->save($x); return \App\helper($x); }
}
function top(int $a): void { Cart::make(); }
