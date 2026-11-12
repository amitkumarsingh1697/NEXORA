`include "defs.vh"
module counter #(parameter W = 8) (input clk, input [W-1:0] d, output reg [W-1:0] q);
  adder #(.W(W)) u_add (.a(d), .b(q), .s(q));
  function automatic [W-1:0] inc(input [W-1:0] x);
    inc = x + 1;
  endfunction
  task reset_t; begin q <= 0; end endtask
  always @(posedge clk) q <= inc(d);
endmodule
package pkg; endpackage
import pkg::*;
class Base; endclass
class Cart extends Base;
  int total;
  function int add(int x); return helper(x); endfunction
endclass
interface bus_if; logic v; endinterface
class C extends B implements I;
  function new(int a); super.new(); endfunction
  task run(input int x, output int y); obj.go(x); y = pkg::f(x); $display("x"); endtask
endclass
module top; C c; initial c = new(1); endmodule
