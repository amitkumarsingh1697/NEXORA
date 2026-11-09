use std::collections::HashMap;
mod util;
use crate::store::{Store, load as load_store};

pub struct Cart {
    store: Store,
}

pub trait Saver {
    fn save(&self, sku: &str) -> bool;
}

impl Cart {
    pub fn new(store: Store) -> Self {
        Cart { store }
    }

    pub fn add(&mut self, sku: &str, qty: u32) -> Option<u32> {
        self.check(sku);
        let total = helper(qty);
        self.store.save(sku);
        Store::count(total)
    }

    fn check(&self, sku: &str) -> bool { !sku.is_empty() }
}

pub fn helper(n: u32) -> u32 {
    load_store("x");
    n * 2
}

enum Color { Red, Green }
