using System;
using Shop.Store;

namespace Shop.Cart
{
    public class Cart : Base, ISaver
    {
        private readonly Store _store;

        public Cart(Store store) { _store = store; }

        public int Add(string sku, int qty = 1)
        {
            this.Check(sku);
            var total = Helper(qty);
            _store.Save(sku);
            return Math.Max(total, 0);
        }

        private bool Check(string sku) => sku.Length > 0;

        private static int Helper(int n) => new Counter().Next(n);

        public string Name { get; set; }
    }

    public interface ISaver { void Save(string sku); }
    public enum Color { Red, Green }
    public struct Point { public int X; }
    public record Pair(int A, int B);
}
