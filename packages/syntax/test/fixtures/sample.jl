module Shop

using LinearAlgebra
import Base: show

struct Cart
    items::Vector{String}
end

abstract type Saver end

function add(c::Cart, sku::String, qty::Int=1)::Int
    check(sku)
    total = helper(qty)
    Base.push!(c.items, sku)
    return total
end

helper(n::Int) = n * 2

end
