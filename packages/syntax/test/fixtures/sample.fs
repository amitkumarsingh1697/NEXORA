module Shop.Cart

open System
open Shop.Store

type Cart(store: Store) =
    member this.Add(sku: string, qty: int) : int =
        this.Check(sku)
        let total = helper qty
        store.Save(sku)
        total
    member this.Check(sku: string) = sku.Length > 0

let helper (n: int) : int = n * 2

type Color = Red | Green
