-module(cart).
-behaviour(gen_server).
-export([run/1, total/2]).
-import(lists, [sum/1]).
-include("records.hrl").
-record(item, {name, qty}).
-spec run(integer()) -> ok.
run(X) -> helper(X), store:save(X), ?MODULE:total(X, 1).
total(A, B) when A > 0 -> sum([A, B]);
total(_, _) -> 0.
