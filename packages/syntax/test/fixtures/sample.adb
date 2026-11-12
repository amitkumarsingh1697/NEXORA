with Ada.Text_IO; use Ada.Text_IO;
with App.Store;
package body Cart is
   type Point is record
      X : Integer;
   end record;
   type Shape is tagged null record;
   type Box is new Shape with null record;
   function Total (C : Cart_Type; X : Integer := 2) return Integer is
      S : App.Store.Store;
   begin
      App.Store.Save (S, X);
      Put_Line ("x");
      return Helper (X);
   end Total;
   procedure Reset (C : in out Cart_Type) is
   begin
      Clear;
   end Reset;
end Cart;
