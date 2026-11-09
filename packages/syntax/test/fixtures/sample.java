package com.shop.cart;

import java.util.List;
import com.shop.store.Store;

public class Cart extends Base implements Saver {
    private final Store store;

    public Cart(Store store) {
        this.store = store;
    }

    public int add(String sku, int qty) {
        this.check(sku);
        int total = helper(qty);
        store.save(sku);
        return total + Util.count(List.of(sku));
    }

    private static int helper(int n) {
        return new Counter().next(n);
    }

    interface Inner { void run(); }
    enum Color { RED, GREEN }
}
