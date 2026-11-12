local json = require("json")
local store = require "shop.store"

local Cart = {}
Cart.__index = Cart

function Cart.new(owner)
  local self = setmetatable({}, Cart)
  self.owner = owner
  return self
end

function Cart:add(sku, qty)
  self:check(sku)
  local total = helper(qty)
  store.save(sku)
  return total
end

local function helper(n, ...)
  return n * 2
end
