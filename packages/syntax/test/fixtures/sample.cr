require "./store"
module App
  class Cart < Base
    include Comparable(Cart)
    def initialize(@items : Array(Int32)); end
    def total(x : Int32, y = 2) : Int32
      @store.save(x)
      Helper.sum(x) + helper(x)
    end
  end
end
