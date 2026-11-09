#!/usr/bin/env bash
# Regenerates src/builtins.json: method names of each dynamic language's built-in types, read
# from the interpreter itself (python3, ruby). Calls of these names on an untyped receiver are
# never linked to a repository method by name alone.
set -euo pipefail
cd "$(dirname "$0")/.."
py=$(python3 -I -c "
import io, json
names=set()
for t in (str,bytes,bytearray,list,dict,set,frozenset,tuple,int,float,complex,object,io.TextIOWrapper,io.BytesIO,io.StringIO):
    names|={n for n in dir(t) if not n.startswith('_')}
print(json.dumps(sorted(names)))")
rb=$(ruby -e 'require "json"; require "set"; require "monitor"; require "stringio"; c=[Object,Kernel,BasicObject,String,Array,Hash,Enumerable,Enumerator,Integer,Float,Numeric,Symbol,NilClass,TrueClass,Comparable,IO,File,Range,Proc,Struct,Time,Regexp,MatchData,Set,Thread,Thread::Mutex,Thread::Queue,Monitor,StringIO,Exception]; puts JSON.generate(c.flat_map{|k| k.instance_methods + k.private_instance_methods(false)}.map(&:to_s).uniq.sort)')
printf '{\n  "source": "python3 %s; ruby %s",\n  "Python": %s,\n  "Ruby": %s\n}\n' "$(python3 -V | cut -d" " -f2)" "$(ruby -e 'print RUBY_VERSION')" "$py" "$rb" > src/builtins.json
npx prettier --write src/builtins.json >/dev/null
