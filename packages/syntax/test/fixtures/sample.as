package app {
  import app.Store;
  public class Cart extends Base implements Shape {
    public function Cart() { super(); }
    public function total(x:String, ...rest):int { var s:Store = new Store(); s.save(x); return helper(x); }
  }
}
