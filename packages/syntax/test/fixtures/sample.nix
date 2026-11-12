{ pkgs ? import <nixpkgs> {}, lib, ... }:
let
  helper = x: x + 1;
  mkCart = { name, total ? 0 }: { inherit name total; };
  util = import ./util.nix { inherit lib; };
in {
  cart = mkCart { name = "a"; };
  value = helper 2;
  pkg = pkgs.callPackage ./pkg.nix {};
  joined = lib.strings.concatStringsSep "," [ "a" ];
}
