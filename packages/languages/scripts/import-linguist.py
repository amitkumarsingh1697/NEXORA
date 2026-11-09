#!/usr/bin/env python3
"""Maintainer tool: turn GitHub Linguist's languages.yml into data/linguist.json.

Usage: python3 scripts/import-linguist.py <languages.yml> <version>
Download the input from
https://raw.githubusercontent.com/github-linguist/linguist/<version>/lib/linguist/languages.yml
Only identification fields are kept (name, type, group, extensions, filenames, interpreters).
Linguist is MIT licensed; see data/LINGUIST-LICENSE.
"""
import json
import sys

import yaml

src, version = sys.argv[1], sys.argv[2]
with open(src, encoding="utf-8") as f:
    langs = yaml.safe_load(f)
out = []
for name, v in sorted(langs.items()):
    entry = {"name": name, "type": v["type"]}
    for key in ("group", "extensions", "filenames", "interpreters", "aliases"):
        if v.get(key):
            entry[key] = v[key]
    out.append(entry)
doc = {
    "source": "https://github.com/github-linguist/linguist/blob/%s/lib/linguist/languages.yml" % version,
    "version": version,
    "languages": out,
}
with open("data/linguist.json", "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    f.write("\n")
print("wrote %d languages" % len(out))
