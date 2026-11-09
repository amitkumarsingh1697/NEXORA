#include <stdio.h>
#include "store.h"

struct item {
    int qty;
};

typedef struct cart {
    struct item *items;
} cart_t;

static int helper(int n);

int add(cart_t *c, const char *sku, int qty) {
    check(sku);
    int total = helper(qty);
    store_save(sku);
    printf("%s", sku);
    return total;
}

static int helper(int n) {
    return n * 2;
}
