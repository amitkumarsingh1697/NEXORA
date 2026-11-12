const std = @import("std");
const store = @import("store.zig");

pub const Cart = struct {
    items: u32,

    pub fn add(self: *Cart, sku: []const u8, qty: u32) u32 {
        self.check(sku);
        const total = helper(qty);
        store.save(sku);
        return total;
    }

    fn check(self: *Cart, sku: []const u8) void {
        _ = self;
        _ = sku;
    }
};

fn helper(n: u32) u32 {
    return n * 2;
}
