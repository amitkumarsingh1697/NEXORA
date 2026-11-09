defmodule Shop.Cart do
  alias Shop.Store
  import Enum, only: [map: 2]
  require Logger

  defstruct items: []

  def add(cart, sku, qty \\ 1) do
    check(sku)
    total = helper(qty)
    Store.save(sku)
    {cart, total}
  end

  defp check(sku), do: String.length(sku) > 0

  defp helper(n) when is_integer(n) do
    n * 2
  end
end
