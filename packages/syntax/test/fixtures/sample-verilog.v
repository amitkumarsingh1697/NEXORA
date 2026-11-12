`include "defs.vh"
module counter #(parameter W = 8) (input clk, input [W-1:0] d, output reg [W-1:0] q);
  adder #(.W(W)) u_add (.a(d), .b(q), .s(q));
  function automatic [W-1:0] inc(input [W-1:0] x);
    inc = x + 1;
  endfunction
  task reset_t; begin q <= 0; end endtask
  always @(posedge clk) q <= inc(d);
endmodule
