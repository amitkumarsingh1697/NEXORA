library ieee;
use ieee.std_logic_1164.all;
entity counter is
  generic (W : integer := 8);
  port (clk : in std_logic; q : out std_logic_vector(W-1 downto 0));
end entity counter;
architecture rtl of counter is
  signal r : integer;
  function inc(x : integer) return integer is
  begin
    return x + 1;
  end function;
  procedure reset(signal s : out integer) is begin s <= 0; end procedure;
begin
  u_add : entity work.adder port map (a => clk, s => q);
  u2 : adder port map (a => clk);
  process (clk) begin r <= inc(r); reset(r); end process;
end architecture rtl;
package util is
  component adder port (a : in std_logic); end component;
end package;
