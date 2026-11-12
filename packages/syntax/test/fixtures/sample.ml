open Printf
module M = Map.Make(String)

type cart = { items : string list }

let helper (n : int) : int = n * 2

let add (c : cart) (sku : string) ?(qty = 1) () =
  check sku;
  let total = helper qty in
  Store.save sku;
  total

module Registry = struct
  let get () = None
end
