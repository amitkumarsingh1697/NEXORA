package com.shop.cart

import com.shop.store.Store
import kotlin.math.max as maximum

class Cart(private val store: Store) : Base(), Saver {
    fun add(sku: String, qty: Int = 1): Int {
        check(sku)
        val total = helper(qty)
        store.save(sku)
        return maximum(total, 0)
    }

    private fun check(sku: String) = sku.isNotEmpty()

    companion object {
        fun empty(): Cart? = null
    }
}

fun helper(n: Int, vararg rest: String): Int = Counter().next(n)

interface Saver {
    fun save(sku: String)
}

object Registry {
    fun get(): Cart? = null
}

enum class Color { RED, GREEN }

data class Pair(val a: Int, val b: Int)
