module cart

import os
import app.store as st

struct Cart {
mut:
	items []int
}

interface Shape {
	area() f64
}

enum Color {
	red
	green
}

pub fn (c Cart) total(x int) int {
	s := st.new_store()
	s.save(x)
	return helper(x)
}

fn helper(a int, rest ...int) int {
	println(a)
	return a
}
