#include <vector>
#include "store.hpp"

namespace shop {

class Cart : public Base {
public:
    explicit Cart(Store& store) : store_(store) {}
    int add(const std::string& sku, int qty = 1);
    bool check(const std::string& sku) const { return !sku.empty(); }
private:
    Store& store_;
};

int Cart::add(const std::string& sku, int qty) {
    this->check(sku);
    int total = helper(qty);
    store_.save(sku);
    return std::max(total, 0);
}

int helper(int n) { return Counter().next(n); }

}  // namespace shop
