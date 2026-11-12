package shop.cart

import shop.store.Store

class Cart extends Base implements Saver {
    Store store

    int add(String sku, int qty = 1) {
        this.check(sku)
        def total = helper(qty)
        store.save(sku)
        return total
    }

    private boolean check(String sku) { sku.length() > 0 }

    static int helper(int n) { new Counter().next(n) }
}

def build() {
    new Cart(store: new Store())
}
