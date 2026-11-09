#!/usr/bin/env bash
source ./lib/common.sh
. "$HOME/.profile"

build() {
  local target="$1"
  check "$target"
  make -C "$target" all
}

function check {
  test -d "$1" || die "missing $1"
}

build "$@"
