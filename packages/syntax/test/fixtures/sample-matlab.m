classdef Cart < handle & Base
  properties
    total = 0
  end
  methods
    function obj = Cart(a)
      obj.total = a;
    end
    function r = add(obj, x, varargin)
      s = Store();
      s.save(x);
      r = helper(x);
    end
  end
end
function y = helper(x)
  y = disp(x);
end
import pkg.sub.*
x = 1;
