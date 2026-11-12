package main
import "core:fmt"
import st "store"
Cart :: struct { items: []int }
total :: proc(c: ^Cart, x: int) -> int { st.save(x); return helper(x) }
main :: proc() { fmt.println(total(nil, 1)) }
