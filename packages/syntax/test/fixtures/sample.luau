local Store = require(script.Parent.Store)
local Cart = {}
function Cart.new(items: {number}): Cart return setmetatable({}, Cart) end
function Cart:total(x: number, ...): number self.store:save(x) return helper(x) end
local function helper(x: number) return x end
