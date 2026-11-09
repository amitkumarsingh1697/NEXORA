<?php
namespace Shop\Cart;

use Shop\Store\Store;
require_once 'helpers.php';

class Cart extends Base implements Saver
{
    private Store $store;

    public function __construct(Store $store) { $this->store = $store; }

    public function add(string $sku, int $qty = 1): ?int
    {
        $this->check($sku);
        $total = helper($qty);
        $this->store->save($sku);
        return Util::count($total);
    }

    private function check($sku) { return strlen($sku) > 0; }
}

function helper(int $n): int { return (new Counter())->next($n); }

interface Saver { public function save(string $sku): void; }
trait Logs { function log() {} }
