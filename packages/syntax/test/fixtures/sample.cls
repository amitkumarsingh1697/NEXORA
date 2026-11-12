public with sharing class Cart extends Base implements Shape {
  private Store store = new Store();
  public Integer total(String x, List<Integer> xs) { store.save(x); return Helper.sum(xs); }
  public Cart() { super(); }
}
