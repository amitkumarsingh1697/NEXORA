require 'json'
require_relative 'store'

module Shop
  class Cart < Base
    include Logs

    def initialize(store)
      @store = store
    end

    def add(sku, qty = 1)
      check(sku)
      total = helper(qty)
      @store.save(sku)
      Util.count(total)
    end

    def self.build
      new(Store.new)
    end

    private

    def check(sku)
      !sku.empty?
    end
  end
end

def helper(n)
  n * 2
end
