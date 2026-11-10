#!/usr/bin/env node
// Generated from packages/languages (src/cli/inventory.ts) by `pnpm --filter @nexora/languages build`. Do not edit.
// Language identification data: GitHub Linguist languages.yml (MIT licence, see packages/languages/data/LINGUIST-LICENSE).
import { closeSync, lstatSync, openSync, readFileSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
var linguist_default = {
	source: "https://github.com/github-linguist/linguist/blob/v9.7.0/lib/linguist/languages.yml",
	version: "v9.7.0",
	languages: [
		{
			"name": "1C Enterprise",
			"type": "programming",
			"extensions": [".bsl", ".os"]
		},
		{
			"name": "2-Dimensional Array",
			"type": "data",
			"extensions": [".2da"]
		},
		{
			"name": "4D",
			"type": "programming",
			"extensions": [".4dm"]
		},
		{
			"name": "ABAP",
			"type": "programming",
			"extensions": [".abap"]
		},
		{
			"name": "ABAP CDS",
			"type": "programming",
			"extensions": [".asddls"]
		},
		{
			"name": "ABNF",
			"type": "data",
			"extensions": [".abnf"]
		},
		{
			"name": "AGS Script",
			"type": "programming",
			"extensions": [".asc", ".ash"],
			"aliases": ["ags"]
		},
		{
			"name": "AIDL",
			"type": "programming",
			"extensions": [".aidl"],
			"interpreters": ["aidl"]
		},
		{
			"name": "AL",
			"type": "programming",
			"extensions": [".al"]
		},
		{
			"name": "ALGOL",
			"type": "programming",
			"extensions": [".alg"]
		},
		{
			"name": "AMPL",
			"type": "programming",
			"extensions": [".ampl", ".mod"]
		},
		{
			"name": "ANTLR",
			"type": "programming",
			"extensions": [".g4"]
		},
		{
			"name": "API Blueprint",
			"type": "markup",
			"extensions": [".apib"]
		},
		{
			"name": "APL",
			"type": "programming",
			"extensions": [".apl", ".dyalog"],
			"interpreters": [
				"apl",
				"aplx",
				"dyalog"
			]
		},
		{
			"name": "ASL",
			"type": "programming",
			"extensions": [".asl", ".dsl"]
		},
		{
			"name": "ASN.1",
			"type": "data",
			"extensions": [".asn", ".asn1"]
		},
		{
			"name": "ASP.NET",
			"type": "programming",
			"extensions": [
				".asax",
				".ascx",
				".ashx",
				".asmx",
				".aspx",
				".axd"
			],
			"aliases": ["aspx", "aspx-vb"]
		},
		{
			"name": "ATS",
			"type": "programming",
			"extensions": [
				".dats",
				".hats",
				".sats"
			],
			"aliases": ["ats2"]
		},
		{
			"name": "ActionScript",
			"type": "programming",
			"extensions": [".as"],
			"aliases": [
				"actionscript 3",
				"actionscript3",
				"as3"
			]
		},
		{
			"name": "Ada",
			"type": "programming",
			"extensions": [
				".adb",
				".ada",
				".ads"
			],
			"aliases": ["ada95", "ada2005"]
		},
		{
			"name": "Adblock Filter List",
			"type": "data",
			"extensions": [".txt"],
			"aliases": [
				"ad block filters",
				"ad block",
				"adb",
				"adblock"
			]
		},
		{
			"name": "Adobe Font Metrics",
			"type": "data",
			"extensions": [".afm"],
			"aliases": [
				"acfm",
				"adobe composite font metrics",
				"adobe multiple font metrics",
				"amfm"
			]
		},
		{
			"name": "Agda",
			"type": "programming",
			"extensions": [".agda"]
		},
		{
			"name": "Aiken",
			"type": "programming",
			"extensions": [".ak"]
		},
		{
			"name": "Aleo",
			"type": "programming",
			"extensions": [".aleo"]
		},
		{
			"name": "Alloy",
			"type": "programming",
			"extensions": [".als"]
		},
		{
			"name": "Alpine Abuild",
			"type": "programming",
			"group": "Shell",
			"filenames": ["APKBUILD"],
			"aliases": ["abuild", "apkbuild"]
		},
		{
			"name": "Altium Designer",
			"type": "data",
			"extensions": [
				".OutJob",
				".PcbDoc",
				".PrjPCB",
				".SchDoc"
			],
			"aliases": ["altium"]
		},
		{
			"name": "AngelScript",
			"type": "programming",
			"extensions": [".as", ".angelscript"]
		},
		{
			"name": "Answer Set Programming",
			"type": "programming",
			"extensions": [".lp"],
			"interpreters": ["clingo"]
		},
		{
			"name": "Ant Build System",
			"type": "data",
			"filenames": ["ant.xml", "build.xml"]
		},
		{
			"name": "Antlers",
			"type": "markup",
			"extensions": [
				".antlers.html",
				".antlers.php",
				".antlers.xml"
			]
		},
		{
			"name": "ApacheConf",
			"type": "data",
			"extensions": [".apacheconf", ".vhost"],
			"filenames": [
				".htaccess",
				"apache2.conf",
				"httpd.conf"
			],
			"aliases": ["aconf", "apache"]
		},
		{
			"name": "Apex",
			"type": "programming",
			"extensions": [
				".cls",
				".apex",
				".trigger"
			]
		},
		{
			"name": "Apollo Guidance Computer",
			"type": "programming",
			"group": "Assembly",
			"extensions": [".agc"]
		},
		{
			"name": "AppleScript",
			"type": "programming",
			"extensions": [".applescript", ".scpt"],
			"interpreters": ["osascript"],
			"aliases": ["apples", "osascript"]
		},
		{
			"name": "Arc",
			"type": "programming",
			"extensions": [".arc"]
		},
		{
			"name": "AsciiDoc",
			"type": "prose",
			"extensions": [
				".asciidoc",
				".adoc",
				".asc"
			]
		},
		{
			"name": "AspectJ",
			"type": "programming",
			"extensions": [".aj"]
		},
		{
			"name": "Assembly",
			"type": "programming",
			"extensions": [
				".asm",
				".a51",
				".i",
				".inc",
				".nas",
				".nasm",
				".s"
			],
			"aliases": ["asm", "nasm"]
		},
		{
			"name": "Astro",
			"type": "markup",
			"extensions": [".astro"]
		},
		{
			"name": "Asymptote",
			"type": "programming",
			"extensions": [".asy"],
			"interpreters": ["asy"]
		},
		{
			"name": "Augeas",
			"type": "programming",
			"extensions": [".aug"]
		},
		{
			"name": "AutoHotkey",
			"type": "programming",
			"extensions": [
				".ahk",
				".ah1",
				".ah2",
				".ahkl"
			],
			"aliases": ["ahk"]
		},
		{
			"name": "AutoIt",
			"type": "programming",
			"extensions": [".au3"],
			"aliases": [
				"au3",
				"AutoIt3",
				"AutoItScript"
			]
		},
		{
			"name": "Avro IDL",
			"type": "data",
			"extensions": [".avdl"]
		},
		{
			"name": "Awk",
			"type": "programming",
			"extensions": [
				".awk",
				".auk",
				".gawk",
				".mawk",
				".nawk"
			],
			"interpreters": [
				"awk",
				"gawk",
				"mawk",
				"nawk"
			]
		},
		{
			"name": "B",
			"type": "programming",
			"extensions": [".b"]
		},
		{
			"name": "B (Formal Method)",
			"type": "programming",
			"extensions": [".mch"]
		},
		{
			"name": "B4X",
			"type": "programming",
			"extensions": [".bas"],
			"aliases": ["basic for android"]
		},
		{
			"name": "BAML",
			"type": "programming",
			"extensions": [".baml"]
		},
		{
			"name": "BASIC",
			"type": "programming",
			"extensions": [".bas"]
		},
		{
			"name": "BBCode",
			"type": "markup",
			"extensions": [".bbcode"]
		},
		{
			"name": "BIRD2",
			"type": "data",
			"filenames": ["bird.conf"],
			"aliases": ["bird", "bird3"]
		},
		{
			"name": "BQN",
			"type": "programming",
			"extensions": [".bqn"]
		},
		{
			"name": "Ballerina",
			"type": "programming",
			"extensions": [".bal"]
		},
		{
			"name": "Batchfile",
			"type": "programming",
			"extensions": [".bat", ".cmd"],
			"filenames": ["gradlew.bat", "mvnw.cmd"],
			"aliases": [
				"bat",
				"batch",
				"dosbatch",
				"winbatch"
			]
		},
		{
			"name": "Beef",
			"type": "programming",
			"extensions": [".bf"]
		},
		{
			"name": "Befunge",
			"type": "programming",
			"extensions": [".befunge", ".bf"]
		},
		{
			"name": "Berry",
			"type": "programming",
			"extensions": [".be"],
			"aliases": ["be"]
		},
		{
			"name": "BibTeX",
			"type": "markup",
			"group": "TeX",
			"extensions": [".bib", ".bibtex"]
		},
		{
			"name": "BibTeX Style",
			"type": "programming",
			"extensions": [".bst"]
		},
		{
			"name": "Bicep",
			"type": "programming",
			"extensions": [".bicep", ".bicepparam"]
		},
		{
			"name": "Bikeshed",
			"type": "markup",
			"extensions": [".bs"]
		},
		{
			"name": "Bison",
			"type": "programming",
			"group": "Yacc",
			"extensions": [".bison"]
		},
		{
			"name": "BitBake",
			"type": "programming",
			"extensions": [
				".bb",
				".bbappend",
				".bbclass",
				".inc"
			]
		},
		{
			"name": "Blade",
			"type": "markup",
			"extensions": [".blade", ".blade.php"]
		},
		{
			"name": "BlitzBasic",
			"type": "programming",
			"extensions": [".bb", ".decls"],
			"aliases": [
				"b3d",
				"blitz3d",
				"blitzplus",
				"bplus"
			]
		},
		{
			"name": "BlitzMax",
			"type": "programming",
			"extensions": [".bmx"],
			"aliases": ["bmax"]
		},
		{
			"name": "Blueprint",
			"type": "markup",
			"extensions": [".blp"],
			"aliases": ["blp"]
		},
		{
			"name": "Bluespec",
			"type": "programming",
			"extensions": [".bsv"],
			"aliases": ["bluespec bsv", "bsv"]
		},
		{
			"name": "Bluespec BH",
			"type": "programming",
			"group": "Bluespec",
			"extensions": [".bs"],
			"aliases": ["bh", "bluespec classic"]
		},
		{
			"name": "Boo",
			"type": "programming",
			"extensions": [".boo"]
		},
		{
			"name": "Boogie",
			"type": "programming",
			"extensions": [".bpl"],
			"interpreters": ["boogie"]
		},
		{
			"name": "Brainfuck",
			"type": "programming",
			"extensions": [".b", ".bf"]
		},
		{
			"name": "BrighterScript",
			"type": "programming",
			"extensions": [".bs"]
		},
		{
			"name": "Brightscript",
			"type": "programming",
			"extensions": [".brs"]
		},
		{
			"name": "Browserslist",
			"type": "data",
			"filenames": [".browserslistrc", "browserslist"]
		},
		{
			"name": "Bru",
			"type": "markup",
			"extensions": [".bru"]
		},
		{
			"name": "BuildStream",
			"type": "data",
			"extensions": [".bst"]
		},
		{
			"name": "C",
			"type": "programming",
			"extensions": [
				".c",
				".cats",
				".h",
				".h.in",
				".idc"
			],
			"interpreters": ["tcc"]
		},
		{
			"name": "C#",
			"type": "programming",
			"extensions": [
				".cs",
				".cake",
				".cs.pp",
				".csx",
				".linq"
			],
			"aliases": [
				"csharp",
				"cake",
				"cakescript"
			]
		},
		{
			"name": "C++",
			"type": "programming",
			"extensions": [
				".cpp",
				".c++",
				".cc",
				".cp",
				".cppm",
				".cxx",
				".h",
				".h++",
				".hh",
				".hpp",
				".hxx",
				".inc",
				".inl",
				".ino",
				".ipp",
				".ixx",
				".re",
				".tcc",
				".tpp",
				".txx"
			],
			"aliases": ["cpp"]
		},
		{
			"name": "C-ObjDump",
			"type": "data",
			"extensions": [".c-objdump"]
		},
		{
			"name": "C2hs Haskell",
			"type": "programming",
			"group": "Haskell",
			"extensions": [".chs"],
			"aliases": ["c2hs"]
		},
		{
			"name": "C3",
			"type": "programming",
			"extensions": [".c3"]
		},
		{
			"name": "CAP CDS",
			"type": "programming",
			"extensions": [".cds"],
			"aliases": ["cds"]
		},
		{
			"name": "CIL",
			"type": "data",
			"extensions": [".cil"]
		},
		{
			"name": "CLIPS",
			"type": "programming",
			"extensions": [".clp"]
		},
		{
			"name": "CMake",
			"type": "programming",
			"extensions": [".cmake", ".cmake.in"],
			"filenames": ["CMakeLists.txt"]
		},
		{
			"name": "COBOL",
			"type": "programming",
			"extensions": [
				".cob",
				".cbl",
				".ccp",
				".cobol",
				".cpy"
			]
		},
		{
			"name": "CODEOWNERS",
			"type": "data",
			"filenames": ["CODEOWNERS"]
		},
		{
			"name": "COLLADA",
			"type": "data",
			"extensions": [".dae"]
		},
		{
			"name": "CQL",
			"type": "programming",
			"extensions": [".cql"]
		},
		{
			"name": "CSON",
			"type": "data",
			"extensions": [".cson"]
		},
		{
			"name": "CSS",
			"type": "markup",
			"extensions": [".css"]
		},
		{
			"name": "CSV",
			"type": "data",
			"extensions": [".csv"]
		},
		{
			"name": "CUE",
			"type": "programming",
			"extensions": [".cue"]
		},
		{
			"name": "CWeb",
			"type": "programming",
			"extensions": [".w"]
		},
		{
			"name": "Cabal Config",
			"type": "data",
			"extensions": [".cabal"],
			"filenames": ["cabal.config", "cabal.project"],
			"aliases": ["Cabal"]
		},
		{
			"name": "Caddyfile",
			"type": "data",
			"extensions": [".caddyfile"],
			"filenames": ["Caddyfile"],
			"aliases": ["Caddy"]
		},
		{
			"name": "Cadence",
			"type": "programming",
			"extensions": [".cdc"]
		},
		{
			"name": "Cairo",
			"type": "programming",
			"group": "Cairo",
			"extensions": [".cairo"]
		},
		{
			"name": "Cairo Zero",
			"type": "programming",
			"group": "Cairo",
			"extensions": [".cairo"]
		},
		{
			"name": "CameLIGO",
			"type": "programming",
			"group": "LigoLANG",
			"extensions": [".mligo"]
		},
		{
			"name": "Cangjie",
			"type": "programming",
			"extensions": [".cj"]
		},
		{
			"name": "Cap'n Proto",
			"type": "programming",
			"extensions": [".capnp"]
		},
		{
			"name": "Carbon",
			"type": "programming",
			"extensions": [".carbon"]
		},
		{
			"name": "CartoCSS",
			"type": "programming",
			"extensions": [".mss"],
			"aliases": ["Carto"]
		},
		{
			"name": "Ceylon",
			"type": "programming",
			"extensions": [".ceylon"]
		},
		{
			"name": "Chapel",
			"type": "programming",
			"extensions": [".chpl"],
			"aliases": ["chpl"]
		},
		{
			"name": "Charity",
			"type": "programming",
			"extensions": [".ch"]
		},
		{
			"name": "Checksums",
			"type": "data",
			"extensions": [
				".crc32",
				".md2",
				".md4",
				".md5",
				".sha1",
				".sha2",
				".sha224",
				".sha256",
				".sha256sum",
				".sha3",
				".sha384",
				".sha512"
			],
			"filenames": [
				"MD5SUMS",
				"SHA1SUMS",
				"SHA256SUMS",
				"SHA256SUMS.txt",
				"SHA512SUMS",
				"checksums.txt",
				"cksums",
				"md5sum.txt"
			],
			"aliases": [
				"checksum",
				"hash",
				"hashes",
				"sum",
				"sums"
			]
		},
		{
			"name": "ChucK",
			"type": "programming",
			"extensions": [".ck"]
		},
		{
			"name": "Circom",
			"type": "programming",
			"extensions": [".circom"]
		},
		{
			"name": "Cirru",
			"type": "programming",
			"extensions": [".cirru"]
		},
		{
			"name": "Clarion",
			"type": "programming",
			"extensions": [".clw"]
		},
		{
			"name": "Clarity",
			"type": "programming",
			"extensions": [".clar"]
		},
		{
			"name": "Classic ASP",
			"type": "programming",
			"extensions": [".asp"],
			"aliases": ["asp"]
		},
		{
			"name": "Clean",
			"type": "programming",
			"extensions": [".icl", ".dcl"]
		},
		{
			"name": "Click",
			"type": "programming",
			"extensions": [".click"]
		},
		{
			"name": "Clojure",
			"type": "programming",
			"extensions": [
				".clj",
				".bb",
				".boot",
				".cl2",
				".cljc",
				".cljs",
				".cljs.hl",
				".cljscm",
				".cljx",
				".hic"
			],
			"filenames": ["riemann.config"],
			"interpreters": ["bb"]
		},
		{
			"name": "Closure Templates",
			"type": "markup",
			"extensions": [".soy"],
			"aliases": ["soy"]
		},
		{
			"name": "Cloud Firestore Security Rules",
			"type": "data",
			"filenames": ["firestore.rules"]
		},
		{
			"name": "Clue",
			"type": "programming",
			"extensions": [".clue"]
		},
		{
			"name": "CoNLL-U",
			"type": "data",
			"extensions": [".conllu", ".conll"],
			"aliases": ["CoNLL", "CoNLL-X"]
		},
		{
			"name": "CodeQL",
			"type": "programming",
			"extensions": [".ql", ".qll"],
			"aliases": ["ql"]
		},
		{
			"name": "CoffeeScript",
			"type": "programming",
			"extensions": [
				".coffee",
				"._coffee",
				".cake",
				".cjsx",
				".coffee.erb",
				".iced"
			],
			"filenames": ["Cakefile"],
			"interpreters": ["coffee"],
			"aliases": ["coffee", "coffee-script"]
		},
		{
			"name": "ColdFusion",
			"type": "programming",
			"extensions": [".cfm", ".cfml"],
			"aliases": [
				"cfm",
				"cfml",
				"coldfusion html"
			]
		},
		{
			"name": "ColdFusion CFC",
			"type": "programming",
			"group": "ColdFusion",
			"extensions": [".cfc"],
			"aliases": ["cfc"]
		},
		{
			"name": "Common Lisp",
			"type": "programming",
			"extensions": [
				".lisp",
				".asd",
				".cl",
				".l",
				".lsp",
				".ny",
				".podsl",
				".sexp"
			],
			"interpreters": [
				"lisp",
				"sbcl",
				"ccl",
				"clisp",
				"ecl"
			],
			"aliases": ["lisp"]
		},
		{
			"name": "Common Workflow Language",
			"type": "programming",
			"extensions": [".cwl"],
			"interpreters": ["cwl-runner"],
			"aliases": ["cwl"]
		},
		{
			"name": "Component Pascal",
			"type": "programming",
			"extensions": [".cp", ".cps"]
		},
		{
			"name": "Cooklang",
			"type": "markup",
			"extensions": [".cook"]
		},
		{
			"name": "Cool",
			"type": "programming",
			"extensions": [".cl"]
		},
		{
			"name": "Cpp-ObjDump",
			"type": "data",
			"extensions": [
				".cppobjdump",
				".c++-objdump",
				".c++objdump",
				".cpp-objdump",
				".cxx-objdump"
			],
			"aliases": ["c++-objdump"]
		},
		{
			"name": "Creole",
			"type": "prose",
			"extensions": [".creole"]
		},
		{
			"name": "Crystal",
			"type": "programming",
			"extensions": [".cr"],
			"interpreters": ["crystal"]
		},
		{
			"name": "Csound",
			"type": "programming",
			"extensions": [".orc", ".udo"],
			"aliases": ["csound-orc"]
		},
		{
			"name": "Csound Document",
			"type": "programming",
			"extensions": [".csd"],
			"aliases": ["csound-csd"]
		},
		{
			"name": "Csound Score",
			"type": "programming",
			"extensions": [".sco"],
			"aliases": ["csound-sco"]
		},
		{
			"name": "Cuda",
			"type": "programming",
			"extensions": [".cu", ".cuh"]
		},
		{
			"name": "Cue Sheet",
			"type": "data",
			"extensions": [".cue"]
		},
		{
			"name": "Curry",
			"type": "programming",
			"extensions": [".curry"]
		},
		{
			"name": "Cycript",
			"type": "programming",
			"extensions": [".cy"]
		},
		{
			"name": "Cylc",
			"type": "data",
			"group": "INI",
			"extensions": [".cylc"],
			"filenames": ["suite.rc"]
		},
		{
			"name": "Cypher",
			"type": "programming",
			"extensions": [".cyp", ".cypher"]
		},
		{
			"name": "Cython",
			"type": "programming",
			"extensions": [
				".pyx",
				".pxd",
				".pxi"
			],
			"aliases": ["pyrex"]
		},
		{
			"name": "D",
			"type": "programming",
			"extensions": [".d", ".di"],
			"aliases": ["Dlang"]
		},
		{
			"name": "D-ObjDump",
			"type": "data",
			"extensions": [".d-objdump"]
		},
		{
			"name": "D2",
			"type": "markup",
			"extensions": [".d2"],
			"aliases": ["d2lang"]
		},
		{
			"name": "DIGITAL Command Language",
			"type": "programming",
			"extensions": [".com"],
			"aliases": ["dcl"]
		},
		{
			"name": "DM",
			"type": "programming",
			"extensions": [".dm"],
			"aliases": ["byond"]
		},
		{
			"name": "DNS Zone",
			"type": "data",
			"extensions": [".zone", ".arpa"]
		},
		{
			"name": "DTrace",
			"type": "programming",
			"extensions": [".d"],
			"interpreters": ["dtrace"],
			"aliases": ["dtrace-script"]
		},
		{
			"name": "Dafny",
			"type": "programming",
			"extensions": [".dfy"],
			"interpreters": ["dafny"]
		},
		{
			"name": "Darcs Patch",
			"type": "data",
			"extensions": [".darcspatch", ".dpatch"],
			"aliases": ["dpatch"]
		},
		{
			"name": "Dart",
			"type": "programming",
			"extensions": [".dart"],
			"interpreters": ["dart"]
		},
		{
			"name": "Daslang",
			"type": "programming",
			"extensions": [".das"]
		},
		{
			"name": "DataWeave",
			"type": "programming",
			"extensions": [".dwl"]
		},
		{
			"name": "Debian Package Control File",
			"type": "data",
			"extensions": [".dsc"]
		},
		{
			"name": "DenizenScript",
			"type": "programming",
			"extensions": [".dsc"]
		},
		{
			"name": "Dhall",
			"type": "programming",
			"extensions": [".dhall"]
		},
		{
			"name": "Diff",
			"type": "data",
			"extensions": [".diff", ".patch"],
			"aliases": ["udiff"]
		},
		{
			"name": "DirectX 3D File",
			"type": "data",
			"extensions": [".x"]
		},
		{
			"name": "Dockerfile",
			"type": "programming",
			"extensions": [".dockerfile", ".containerfile"],
			"filenames": ["Containerfile", "Dockerfile"],
			"aliases": ["Containerfile"]
		},
		{
			"name": "Dogescript",
			"type": "programming",
			"extensions": [".djs"]
		},
		{
			"name": "Dotenv",
			"type": "data",
			"extensions": [".env"],
			"filenames": [
				".env",
				".env.ci",
				".env.dev",
				".env.development",
				".env.development.local",
				".env.example",
				".env.local",
				".env.prod",
				".env.production",
				".env.sample",
				".env.staging",
				".env.template",
				".env.test",
				".env.testing"
			]
		},
		{
			"name": "Dune",
			"type": "programming",
			"filenames": ["dune-project"]
		},
		{
			"name": "Dylan",
			"type": "programming",
			"extensions": [
				".dylan",
				".dyl",
				".intr",
				".lid"
			]
		},
		{
			"name": "E",
			"type": "programming",
			"extensions": [".e"],
			"interpreters": ["rune"]
		},
		{
			"name": "E-mail",
			"type": "data",
			"extensions": [".eml", ".mbox"],
			"aliases": [
				"email",
				"eml",
				"mail",
				"mbox"
			]
		},
		{
			"name": "EBNF",
			"type": "data",
			"extensions": [".ebnf"]
		},
		{
			"name": "ECL",
			"type": "programming",
			"extensions": [".ecl", ".eclxml"]
		},
		{
			"name": "ECLiPSe",
			"type": "programming",
			"group": "Prolog",
			"extensions": [".ecl"]
		},
		{
			"name": "EJS",
			"type": "markup",
			"extensions": [
				".ejs",
				".ect",
				".ejs.t",
				".jst"
			]
		},
		{
			"name": "EQ",
			"type": "programming",
			"extensions": [".eq"]
		},
		{
			"name": "Eagle",
			"type": "data",
			"extensions": [".sch", ".brd"]
		},
		{
			"name": "Earthly",
			"type": "programming",
			"filenames": ["Earthfile"],
			"aliases": ["Earthfile"]
		},
		{
			"name": "Easybuild",
			"type": "data",
			"group": "Python",
			"extensions": [".eb"]
		},
		{
			"name": "Ecere Projects",
			"type": "data",
			"group": "JavaScript",
			"extensions": [".epj"]
		},
		{
			"name": "Ecmarkup",
			"type": "markup",
			"group": "HTML",
			"extensions": [".html"],
			"aliases": ["ecmarkdown"]
		},
		{
			"name": "Edge",
			"type": "markup",
			"extensions": [".edge"]
		},
		{
			"name": "EdgeQL",
			"type": "programming",
			"extensions": [".edgeql", ".esdl"],
			"aliases": ["esdl"]
		},
		{
			"name": "EditorConfig",
			"type": "data",
			"group": "INI",
			"extensions": [".editorconfig"],
			"filenames": [".editorconfig"],
			"aliases": ["editor-config"]
		},
		{
			"name": "Edje Data Collection",
			"type": "data",
			"extensions": [".edc"]
		},
		{
			"name": "Eiffel",
			"type": "programming",
			"extensions": [".e"]
		},
		{
			"name": "Elixir",
			"type": "programming",
			"extensions": [".ex", ".exs"],
			"filenames": ["mix.lock"],
			"interpreters": ["elixir"]
		},
		{
			"name": "Elm",
			"type": "programming",
			"extensions": [".elm"]
		},
		{
			"name": "Elvish",
			"type": "programming",
			"extensions": [".elv"],
			"interpreters": ["elvish"]
		},
		{
			"name": "Elvish Transcript",
			"type": "programming",
			"group": "Elvish"
		},
		{
			"name": "Emacs Lisp",
			"type": "programming",
			"extensions": [
				".el",
				".emacs",
				".emacs.desktop"
			],
			"filenames": [
				".abbrev_defs",
				".emacs",
				".emacs.desktop",
				".gnus",
				".spacemacs",
				".viper",
				"Cask",
				"Eask",
				"Project.ede",
				"_emacs",
				"abbrev_defs"
			],
			"aliases": [
				"cask",
				"eask",
				"elisp",
				"emacs"
			]
		},
		{
			"name": "EmberScript",
			"type": "programming",
			"extensions": [".em", ".emberscript"]
		},
		{
			"name": "Erlang",
			"type": "programming",
			"extensions": [
				".erl",
				".app",
				".app.src",
				".es",
				".escript",
				".hrl",
				".xrl",
				".yrl"
			],
			"filenames": [
				"Emakefile",
				"rebar.config",
				"rebar.config.lock",
				"rebar.lock"
			],
			"interpreters": ["escript"]
		},
		{
			"name": "Euphoria",
			"type": "programming",
			"extensions": [".e", ".ex"],
			"interpreters": ["eui", "euiw"]
		},
		{
			"name": "F#",
			"type": "programming",
			"extensions": [
				".fs",
				".fsi",
				".fsx"
			],
			"aliases": ["fsharp"]
		},
		{
			"name": "F*",
			"type": "programming",
			"extensions": [".fst", ".fsti"],
			"aliases": ["fstar"]
		},
		{
			"name": "FIGlet Font",
			"type": "data",
			"extensions": [".flf"],
			"aliases": ["FIGfont"]
		},
		{
			"name": "FIRRTL",
			"type": "programming",
			"extensions": [".fir"]
		},
		{
			"name": "FLUX",
			"type": "programming",
			"extensions": [".fx", ".flux"]
		},
		{
			"name": "FPP",
			"type": "programming",
			"extensions": [".fpp", ".fppi"]
		},
		{
			"name": "Factor",
			"type": "programming",
			"extensions": [".factor"],
			"filenames": [".factor-boot-rc", ".factor-rc"]
		},
		{
			"name": "Fancy",
			"type": "programming",
			"extensions": [".fy", ".fancypack"],
			"filenames": ["Fakefile"]
		},
		{
			"name": "Fantom",
			"type": "programming",
			"extensions": [".fan"]
		},
		{
			"name": "Faust",
			"type": "programming",
			"extensions": [".dsp"]
		},
		{
			"name": "Fennel",
			"type": "programming",
			"extensions": [".fnl"],
			"interpreters": ["fennel"]
		},
		{
			"name": "Filebench WML",
			"type": "programming",
			"extensions": [".f"]
		},
		{
			"name": "Filterscript",
			"type": "programming",
			"group": "RenderScript",
			"extensions": [".fs"]
		},
		{
			"name": "FlatBuffers",
			"type": "data",
			"extensions": [".fbs"]
		},
		{
			"name": "Flix",
			"type": "programming",
			"extensions": [".flix"]
		},
		{
			"name": "Fluent",
			"type": "programming",
			"extensions": [".ftl"]
		},
		{
			"name": "Formatted",
			"type": "data",
			"extensions": [".for", ".eam.fs"]
		},
		{
			"name": "Forth",
			"type": "programming",
			"extensions": [
				".fth",
				".4th",
				".f",
				".for",
				".forth",
				".fr",
				".frt",
				".fs"
			]
		},
		{
			"name": "Fortran",
			"type": "programming",
			"group": "Fortran",
			"extensions": [
				".f",
				".f77",
				".for",
				".fpp"
			]
		},
		{
			"name": "Fortran Free Form",
			"type": "programming",
			"group": "Fortran",
			"extensions": [
				".f90",
				".f03",
				".f08",
				".f95"
			]
		},
		{
			"name": "FreeBASIC",
			"type": "programming",
			"extensions": [".bi", ".bas"],
			"aliases": ["fb"]
		},
		{
			"name": "FreeMarker",
			"type": "programming",
			"extensions": [".ftl", ".ftlh"],
			"aliases": ["ftl"]
		},
		{
			"name": "Frege",
			"type": "programming",
			"extensions": [".fr"]
		},
		{
			"name": "Futhark",
			"type": "programming",
			"extensions": [".fut"]
		},
		{
			"name": "G-code",
			"type": "programming",
			"extensions": [
				".g",
				".cnc",
				".gco",
				".gcode"
			]
		},
		{
			"name": "GAML",
			"type": "programming",
			"extensions": [".gaml"]
		},
		{
			"name": "GAMS",
			"type": "programming",
			"extensions": [".gms"]
		},
		{
			"name": "GAP",
			"type": "programming",
			"extensions": [
				".g",
				".gap",
				".gd",
				".gi",
				".tst"
			]
		},
		{
			"name": "GCC Machine Description",
			"type": "programming",
			"extensions": [".md"]
		},
		{
			"name": "GDB",
			"type": "programming",
			"extensions": [".gdb", ".gdbinit"]
		},
		{
			"name": "GDScript",
			"type": "programming",
			"extensions": [".gd"]
		},
		{
			"name": "GDShader",
			"type": "programming",
			"extensions": [".gdshader", ".gdshaderinc"]
		},
		{
			"name": "GEDCOM",
			"type": "data",
			"extensions": [".ged"]
		},
		{
			"name": "GLSL",
			"type": "programming",
			"extensions": [
				".glsl",
				".fp",
				".frag",
				".frg",
				".fs",
				".fsh",
				".fshader",
				".geo",
				".geom",
				".glslf",
				".glslv",
				".gs",
				".gshader",
				".rchit",
				".rmiss",
				".shader",
				".tesc",
				".tese",
				".vert",
				".vrx",
				".vs",
				".vsh",
				".vshader"
			]
		},
		{
			"name": "GN",
			"type": "data",
			"extensions": [".gn", ".gni"],
			"filenames": [".gn"],
			"interpreters": ["gn"]
		},
		{
			"name": "GSC",
			"type": "programming",
			"extensions": [
				".gsc",
				".csc",
				".gsh"
			]
		},
		{
			"name": "Game Maker Language",
			"type": "programming",
			"extensions": [".gml"]
		},
		{
			"name": "Gemfile.lock",
			"type": "data",
			"filenames": ["Gemfile.lock"]
		},
		{
			"name": "Gemini",
			"type": "prose",
			"extensions": [".gmi"],
			"aliases": ["gemtext"]
		},
		{
			"name": "Genero 4gl",
			"type": "programming",
			"extensions": [".4gl"]
		},
		{
			"name": "Genero per",
			"type": "markup",
			"extensions": [".per"]
		},
		{
			"name": "Genie",
			"type": "programming",
			"extensions": [".gs"]
		},
		{
			"name": "Genshi",
			"type": "programming",
			"extensions": [".kid"],
			"aliases": ["xml+genshi", "xml+kid"]
		},
		{
			"name": "Gentoo Ebuild",
			"type": "programming",
			"group": "Shell",
			"extensions": [".ebuild"]
		},
		{
			"name": "Gentoo Eclass",
			"type": "programming",
			"group": "Shell",
			"extensions": [".eclass"]
		},
		{
			"name": "Gerber Image",
			"type": "data",
			"extensions": [
				".gbr",
				".cmp",
				".gbl",
				".gbo",
				".gbp",
				".gbs",
				".gko",
				".gml",
				".gpb",
				".gpt",
				".gtl",
				".gto",
				".gtp",
				".gts",
				".ncl",
				".sol"
			],
			"interpreters": ["gerbv", "gerbview"],
			"aliases": ["rs-274x"]
		},
		{
			"name": "Gettext Catalog",
			"type": "prose",
			"extensions": [".po", ".pot"],
			"aliases": ["pot"]
		},
		{
			"name": "Gherkin",
			"type": "programming",
			"extensions": [".feature", ".story"],
			"aliases": ["cucumber"]
		},
		{
			"name": "Git Attributes",
			"type": "data",
			"filenames": [".gitattributes"],
			"aliases": ["gitattributes"]
		},
		{
			"name": "Git Commit",
			"type": "data",
			"filenames": [".gitmessage", "COMMIT_EDITMSG"],
			"aliases": ["commit"]
		},
		{
			"name": "Git Config",
			"type": "data",
			"group": "INI",
			"extensions": [".gitconfig"],
			"filenames": [
				".gitconfig",
				".gitmodules",
				".tgitconfig",
				"config.worktree"
			],
			"aliases": ["gitconfig", "gitmodules"]
		},
		{
			"name": "Git Revision List",
			"type": "data",
			"filenames": [".git-blame-ignore-revs"],
			"aliases": ["Git Blame Ignore Revs"]
		},
		{
			"name": "Gleam",
			"type": "programming",
			"extensions": [".gleam"]
		},
		{
			"name": "Glimmer JS",
			"type": "programming",
			"group": "JavaScript",
			"extensions": [".gjs"],
			"aliases": ["gjs"]
		},
		{
			"name": "Glimmer TS",
			"type": "programming",
			"group": "TypeScript",
			"extensions": [".gts"],
			"aliases": ["gts"]
		},
		{
			"name": "Glyph",
			"type": "programming",
			"extensions": [".glf"]
		},
		{
			"name": "Glyph Bitmap Distribution Format",
			"type": "data",
			"extensions": [".bdf"]
		},
		{
			"name": "Gno",
			"type": "programming",
			"extensions": [".gno"],
			"aliases": ["gnolang"]
		},
		{
			"name": "Gnuplot",
			"type": "programming",
			"extensions": [
				".gp",
				".gnu",
				".gnuplot",
				".p",
				".plot",
				".plt"
			],
			"interpreters": ["gnuplot"]
		},
		{
			"name": "Go",
			"type": "programming",
			"extensions": [".go"],
			"aliases": ["golang"]
		},
		{
			"name": "Go Checksums",
			"type": "data",
			"filenames": ["go.sum", "go.work.sum"],
			"aliases": [
				"go.sum",
				"go sum",
				"go.work.sum",
				"go work sum"
			]
		},
		{
			"name": "Go Module",
			"type": "data",
			"filenames": ["go.mod"],
			"aliases": ["go.mod", "go mod"]
		},
		{
			"name": "Go Template",
			"type": "markup",
			"extensions": [
				".gohtml",
				".gotmpl",
				".html.tmpl",
				".tmpl",
				".tpl"
			],
			"filenames": ["_helpers.tpl"],
			"aliases": ["gotmpl"]
		},
		{
			"name": "Go Workspace",
			"type": "data",
			"filenames": ["go.work"],
			"aliases": ["go.work", "go work"]
		},
		{
			"name": "Godot Resource",
			"type": "data",
			"extensions": [
				".gdnlib",
				".gdns",
				".tres",
				".tscn"
			],
			"filenames": ["project.godot"]
		},
		{
			"name": "Golo",
			"type": "programming",
			"extensions": [".golo"]
		},
		{
			"name": "Gosu",
			"type": "programming",
			"extensions": [
				".gs",
				".gst",
				".gsx",
				".vark"
			]
		},
		{
			"name": "Grace",
			"type": "programming",
			"extensions": [".grace"]
		},
		{
			"name": "Gradle",
			"type": "data",
			"extensions": [".gradle"]
		},
		{
			"name": "Gradle Kotlin DSL",
			"type": "data",
			"group": "Gradle",
			"extensions": [".gradle.kts"]
		},
		{
			"name": "Grammatical Framework",
			"type": "programming",
			"extensions": [".gf"],
			"aliases": ["gf"]
		},
		{
			"name": "Graph Modeling Language",
			"type": "data",
			"extensions": [".gml"]
		},
		{
			"name": "GraphQL",
			"type": "data",
			"extensions": [
				".graphql",
				".gql",
				".graphqls"
			]
		},
		{
			"name": "Graphviz (DOT)",
			"type": "data",
			"extensions": [".dot", ".gv"]
		},
		{
			"name": "Groovy",
			"type": "programming",
			"extensions": [
				".groovy",
				".grt",
				".gtpl",
				".gvy"
			],
			"filenames": ["Jenkinsfile"],
			"interpreters": ["groovy"]
		},
		{
			"name": "Groovy Server Pages",
			"type": "programming",
			"group": "Groovy",
			"extensions": [".gsp"],
			"aliases": ["gsp", "java server page"]
		},
		{
			"name": "GtkRC",
			"type": "data",
			"extensions": [".gtkrc"],
			"filenames": ["gtkrc", "gtkrc-2.0"],
			"aliases": [
				"gtk",
				"gtk 1",
				"gtk 2"
			]
		},
		{
			"name": "HAProxy",
			"type": "data",
			"extensions": [".cfg"],
			"filenames": ["haproxy.cfg"]
		},
		{
			"name": "HCL",
			"type": "programming",
			"extensions": [
				".hcl",
				".nomad",
				".tf",
				".tfvars",
				".tofu",
				".workflow"
			],
			"aliases": [
				"HashiCorp Configuration Language",
				"opentofu",
				"terraform"
			]
		},
		{
			"name": "HIP",
			"type": "programming",
			"extensions": [".hip"]
		},
		{
			"name": "HLSL",
			"type": "programming",
			"extensions": [
				".hlsl",
				".cginc",
				".fx",
				".fxh",
				".hlsli"
			]
		},
		{
			"name": "HOCON",
			"type": "data",
			"extensions": [".hocon"],
			"filenames": [".scalafix.conf", ".scalafmt.conf"]
		},
		{
			"name": "HTML",
			"type": "markup",
			"extensions": [
				".html",
				".hta",
				".htm",
				".html.hl",
				".inc",
				".xht",
				".xhtml"
			],
			"aliases": ["xhtml"]
		},
		{
			"name": "HTML+ECR",
			"type": "markup",
			"group": "HTML",
			"extensions": [".ecr"],
			"aliases": ["ecr"]
		},
		{
			"name": "HTML+EEX",
			"type": "markup",
			"group": "HTML",
			"extensions": [
				".html.eex",
				".heex",
				".leex"
			],
			"aliases": [
				"eex",
				"heex",
				"leex"
			]
		},
		{
			"name": "HTML+ERB",
			"type": "markup",
			"group": "HTML",
			"extensions": [
				".erb",
				".erb.deface",
				".rhtml"
			],
			"aliases": [
				"erb",
				"rhtml",
				"html+ruby"
			]
		},
		{
			"name": "HTML+PHP",
			"type": "markup",
			"group": "HTML",
			"extensions": [".phtml"]
		},
		{
			"name": "HTML+Razor",
			"type": "markup",
			"group": "HTML",
			"extensions": [".cshtml", ".razor"],
			"aliases": ["razor"]
		},
		{
			"name": "HTTP",
			"type": "data",
			"extensions": [".http"]
		},
		{
			"name": "HXML",
			"type": "data",
			"extensions": [".hxml"]
		},
		{
			"name": "Hack",
			"type": "programming",
			"extensions": [
				".hack",
				".hh",
				".hhi",
				".php"
			]
		},
		{
			"name": "Haml",
			"type": "markup",
			"extensions": [".haml", ".haml.deface"]
		},
		{
			"name": "Handlebars",
			"type": "markup",
			"extensions": [".handlebars", ".hbs"],
			"aliases": ["hbs", "htmlbars"]
		},
		{
			"name": "Harbour",
			"type": "programming",
			"extensions": [".hb"]
		},
		{
			"name": "Hare",
			"type": "programming",
			"extensions": [".ha"]
		},
		{
			"name": "Haskell",
			"type": "programming",
			"extensions": [
				".hs",
				".hs-boot",
				".hsc"
			],
			"interpreters": [
				"runghc",
				"runhaskell",
				"runhugs"
			]
		},
		{
			"name": "Haxe",
			"type": "programming",
			"extensions": [".hx", ".hxsl"]
		},
		{
			"name": "HiveQL",
			"type": "programming",
			"extensions": [".q", ".hql"]
		},
		{
			"name": "HolyC",
			"type": "programming",
			"extensions": [".hc"]
		},
		{
			"name": "Hosts File",
			"type": "data",
			"filenames": [
				"HOSTS",
				"hosts",
				"hosts.txt"
			],
			"aliases": ["hosts"]
		},
		{
			"name": "Hurl",
			"type": "programming",
			"extensions": [".hurl"]
		},
		{
			"name": "Hy",
			"type": "programming",
			"extensions": [".hy"],
			"interpreters": ["hy"],
			"aliases": ["hylang"]
		},
		{
			"name": "HyPhy",
			"type": "programming",
			"extensions": [".bf"]
		},
		{
			"name": "IDL",
			"type": "programming",
			"extensions": [".pro", ".dlm"]
		},
		{
			"name": "IGOR Pro",
			"type": "programming",
			"extensions": [".ipf"],
			"aliases": ["igor", "igorpro"]
		},
		{
			"name": "IL Assembly",
			"type": "programming",
			"extensions": [".il"],
			"aliases": ["ilasm", "msil"]
		},
		{
			"name": "INI",
			"type": "data",
			"extensions": [
				".ini",
				".cfg",
				".cnf",
				".container",
				".dof",
				".frm",
				".lektorproject",
				".mount",
				".network",
				".prefs",
				".pro",
				".properties",
				".service",
				".socket",
				".target",
				".timer",
				".url"
			],
			"filenames": [
				".buckconfig",
				".coveragerc",
				".flake8",
				".gitreview",
				".pylintrc",
				"HOSTS",
				"buildozer.spec",
				"hosts",
				"pylintrc",
				"vlcrc"
			],
			"aliases": ["conf", "dosini"]
		},
		{
			"name": "IRC log",
			"type": "data",
			"extensions": [".irclog", ".weechatlog"],
			"aliases": ["irc", "irc logs"]
		},
		{
			"name": "ISPC",
			"type": "programming",
			"extensions": [".ispc"]
		},
		{
			"name": "Idris",
			"type": "programming",
			"extensions": [".idr", ".lidr"]
		},
		{
			"name": "Ignore List",
			"type": "data",
			"extensions": [".gitignore"],
			"filenames": [
				".agignore",
				".atomignore",
				".babelignore",
				".bzrignore",
				".ckignore",
				".coffeelintignore",
				".cvsignore",
				".dockerignore",
				".easignore",
				".eleventyignore",
				".eslint-ignore",
				".eslintignore",
				".gitignore",
				".ignore",
				".markdownlintignore",
				".nodemonignore",
				".npmignore",
				".prettierignore",
				".rgignore",
				".stylelintignore",
				".vercelignore",
				".vscodeignore",
				"gitignore-global",
				"gitignore_global"
			],
			"aliases": [
				"ignore",
				"gitignore",
				"git-ignore"
			]
		},
		{
			"name": "ImHex Pattern Language",
			"type": "programming",
			"extensions": [".hexpat"],
			"aliases": [
				"ImHex",
				"ImHexPatternLanguage",
				"imhexpl"
			]
		},
		{
			"name": "ImageJ Macro",
			"type": "programming",
			"extensions": [".ijm"],
			"aliases": ["ijm"]
		},
		{
			"name": "Imba",
			"type": "programming",
			"extensions": [".imba"]
		},
		{
			"name": "Inform 7",
			"type": "programming",
			"extensions": [".ni", ".i7x"],
			"aliases": ["i7", "inform7"]
		},
		{
			"name": "Ink",
			"type": "programming",
			"extensions": [".ink"]
		},
		{
			"name": "Inno Setup",
			"type": "programming",
			"extensions": [".iss", ".isl"]
		},
		{
			"name": "Io",
			"type": "programming",
			"extensions": [".io"],
			"interpreters": ["io"]
		},
		{
			"name": "Ioke",
			"type": "programming",
			"extensions": [".ik"],
			"interpreters": ["ioke"]
		},
		{
			"name": "Isabelle",
			"type": "programming",
			"extensions": [".thy"]
		},
		{
			"name": "Isabelle ROOT",
			"type": "programming",
			"group": "Isabelle",
			"filenames": ["ROOT"]
		},
		{
			"name": "J",
			"type": "programming",
			"extensions": [".ijs"],
			"interpreters": ["jconsole"]
		},
		{
			"name": "JAR Manifest",
			"type": "data",
			"filenames": ["MANIFEST.MF"]
		},
		{
			"name": "JASS",
			"type": "programming",
			"extensions": [".j"],
			"aliases": ["jass2"]
		},
		{
			"name": "JCL",
			"type": "programming",
			"extensions": [".jcl"]
		},
		{
			"name": "JFlex",
			"type": "programming",
			"group": "Lex",
			"extensions": [".flex", ".jflex"]
		},
		{
			"name": "JSON",
			"type": "data",
			"extensions": [
				".json",
				".4DForm",
				".4DProject",
				".avsc",
				".geojson",
				".gltf",
				".har",
				".ice",
				".JSON-tmLanguage",
				".json.example",
				".jsonl",
				".mcmeta",
				".sarif",
				".slnlaunch",
				".tact",
				".tfstate",
				".tfstate.backup",
				".topojson",
				".webapp",
				".webmanifest",
				".yy",
				".yyp"
			],
			"filenames": [
				".all-contributorsrc",
				".arcconfig",
				".auto-changelog",
				".c8rc",
				".htmlhintrc",
				".imgbotconfig",
				".nycrc",
				".releaserc",
				".secrets.baseline",
				".tern-config",
				".tern-project",
				".watchmanconfig",
				"MODULE.bazel.lock",
				"Package.resolved",
				"Pipfile.lock",
				"bun.lock",
				"composer.lock",
				"deno.lock",
				"flake.lock",
				"mcmod.info"
			],
			"aliases": [
				"geojson",
				"jsonl",
				"sarif",
				"topojson"
			]
		},
		{
			"name": "JSON with Comments",
			"type": "data",
			"group": "JSON",
			"extensions": [
				".jsonc",
				".code-snippets",
				".code-workspace",
				".hujson",
				".sublime-build",
				".sublime-color-scheme",
				".sublime-commands",
				".sublime-completions",
				".sublime-keymap",
				".sublime-macro",
				".sublime-menu",
				".sublime-mousemap",
				".sublime-project",
				".sublime-settings",
				".sublime-theme",
				".sublime-workspace",
				".sublime_metrics",
				".sublime_session",
				".tsconfig.json"
			],
			"filenames": [
				".babelrc",
				".devcontainer.json",
				".eslintrc",
				".eslintrc.json",
				".jscsrc",
				".jshintrc",
				".jslintrc",
				".oxlintrc.json",
				".swcrc",
				"api-extractor.json",
				"devcontainer.json",
				"jsconfig.json",
				"language-configuration.json",
				"tsconfig.json",
				"tslint.json"
			],
			"aliases": ["jsonc"]
		},
		{
			"name": "JSON5",
			"type": "data",
			"extensions": [".json5"]
		},
		{
			"name": "JSONLD",
			"type": "data",
			"extensions": [".jsonld"]
		},
		{
			"name": "JSONiq",
			"type": "programming",
			"extensions": [".jq"]
		},
		{
			"name": "Jac",
			"type": "programming",
			"extensions": [".jac"]
		},
		{
			"name": "Jai",
			"type": "programming",
			"extensions": [".jai"]
		},
		{
			"name": "Janet",
			"type": "programming",
			"extensions": [".janet"],
			"interpreters": ["janet"]
		},
		{
			"name": "Jasmin",
			"type": "programming",
			"extensions": [".j"]
		},
		{
			"name": "Java",
			"type": "programming",
			"extensions": [
				".java",
				".jav",
				".jsh"
			]
		},
		{
			"name": "Java Properties",
			"type": "data",
			"extensions": [".properties"]
		},
		{
			"name": "Java Server Pages",
			"type": "programming",
			"group": "Java",
			"extensions": [".jsp", ".tag"],
			"aliases": ["jsp"]
		},
		{
			"name": "Java Template Engine",
			"type": "programming",
			"group": "Java",
			"extensions": [".jte"],
			"aliases": ["jte"]
		},
		{
			"name": "JavaScript",
			"type": "programming",
			"extensions": [
				".js",
				"._js",
				".bones",
				".cjs",
				".es",
				".es6",
				".frag",
				".gs",
				".jake",
				".javascript",
				".jsb",
				".jscad",
				".jsfl",
				".jslib",
				".jsm",
				".jspre",
				".jss",
				".jsx",
				".mjs",
				".njs",
				".pac",
				".sjs",
				".ssjs",
				".xsjs",
				".xsjslib"
			],
			"filenames": ["Jakefile"],
			"interpreters": [
				"bun",
				"chakra",
				"d8",
				"deno",
				"gjs",
				"js",
				"node",
				"nodejs",
				"qjs",
				"rhino",
				"v8",
				"v8-shell"
			],
			"aliases": ["js", "node"]
		},
		{
			"name": "JavaScript+ERB",
			"type": "programming",
			"group": "JavaScript",
			"extensions": [".js.erb"]
		},
		{
			"name": "Jest Snapshot",
			"type": "data",
			"extensions": [".snap"]
		},
		{
			"name": "JetBrains MPS",
			"type": "programming",
			"extensions": [
				".mps",
				".mpl",
				".msd"
			],
			"aliases": ["mps"]
		},
		{
			"name": "Jinja",
			"type": "markup",
			"extensions": [
				".jinja",
				".j2",
				".jinja2"
			],
			"aliases": [
				"django",
				"html+django",
				"html+jinja",
				"htmldjango"
			]
		},
		{
			"name": "Jison",
			"type": "programming",
			"group": "Yacc",
			"extensions": [".jison"]
		},
		{
			"name": "Jison Lex",
			"type": "programming",
			"group": "Lex",
			"extensions": [".jisonlex"]
		},
		{
			"name": "Jolie",
			"type": "programming",
			"extensions": [".ol", ".iol"],
			"interpreters": ["jolie"]
		},
		{
			"name": "Jsonnet",
			"type": "programming",
			"extensions": [".jsonnet", ".libsonnet"]
		},
		{
			"name": "Julia",
			"type": "programming",
			"extensions": [".jl"],
			"interpreters": ["julia"]
		},
		{
			"name": "Julia REPL",
			"type": "programming",
			"group": "Julia"
		},
		{
			"name": "Jupyter Notebook",
			"type": "markup",
			"extensions": [".ipynb"],
			"filenames": ["Notebook"],
			"aliases": ["IPython Notebook"]
		},
		{
			"name": "Just",
			"type": "programming",
			"extensions": [".just"],
			"filenames": [
				".JUSTFILE",
				".Justfile",
				".justfile",
				"JUSTFILE",
				"Justfile",
				"justfile"
			],
			"aliases": ["Justfile"]
		},
		{
			"name": "KCL",
			"type": "programming",
			"extensions": [".k"],
			"filenames": ["kcl.mod", "kcl.mod.lock"]
		},
		{
			"name": "KDL",
			"type": "data",
			"extensions": [".kdl"]
		},
		{
			"name": "KFramework",
			"type": "programming",
			"extensions": [".k"]
		},
		{
			"name": "KRL",
			"type": "programming",
			"extensions": [".krl"]
		},
		{
			"name": "Kaitai Struct",
			"type": "programming",
			"extensions": [".ksy"],
			"aliases": ["ksy"]
		},
		{
			"name": "KakouneScript",
			"type": "programming",
			"extensions": [".kak"],
			"filenames": ["kakrc"],
			"aliases": ["kak", "kakscript"]
		},
		{
			"name": "KerboScript",
			"type": "programming",
			"extensions": [".ks"]
		},
		{
			"name": "KiCad Layout",
			"type": "data",
			"extensions": [
				".kicad_pcb",
				".kicad_mod",
				".kicad_wks"
			],
			"filenames": ["fp-lib-table"],
			"aliases": ["pcbnew"]
		},
		{
			"name": "KiCad Legacy Layout",
			"type": "data",
			"extensions": [".brd"]
		},
		{
			"name": "KiCad Schematic",
			"type": "data",
			"extensions": [
				".kicad_sch",
				".kicad_sym",
				".sch"
			],
			"aliases": ["eeschema schematic"]
		},
		{
			"name": "Kickstart",
			"type": "data",
			"extensions": [".ks"]
		},
		{
			"name": "Kit",
			"type": "markup",
			"extensions": [".kit"]
		},
		{
			"name": "KoLmafia ASH",
			"type": "programming",
			"extensions": [".ash"]
		},
		{
			"name": "Koka",
			"type": "programming",
			"extensions": [".kk"],
			"interpreters": ["koka"]
		},
		{
			"name": "Kotlin",
			"type": "programming",
			"extensions": [
				".kt",
				".ktm",
				".kts"
			]
		},
		{
			"name": "Kusto",
			"type": "data",
			"extensions": [".csl", ".kql"]
		},
		{
			"name": "LFE",
			"type": "programming",
			"extensions": [".lfe"]
		},
		{
			"name": "LLVM",
			"type": "programming",
			"extensions": [".ll"]
		},
		{
			"name": "LOLCODE",
			"type": "programming",
			"extensions": [".lol"]
		},
		{
			"name": "LSL",
			"type": "programming",
			"extensions": [".lsl", ".lslp"],
			"interpreters": ["lsl"]
		},
		{
			"name": "LTspice Symbol",
			"type": "data",
			"extensions": [".asy"]
		},
		{
			"name": "LabVIEW",
			"type": "programming",
			"extensions": [
				".lvproj",
				".lvclass",
				".lvlib"
			]
		},
		{
			"name": "Lambdapi",
			"type": "programming",
			"extensions": [".lp"]
		},
		{
			"name": "Langium",
			"type": "programming",
			"extensions": [".langium"]
		},
		{
			"name": "Lark",
			"type": "data",
			"extensions": [".lark"]
		},
		{
			"name": "Lasso",
			"type": "programming",
			"extensions": [
				".lasso",
				".las",
				".lasso8",
				".lasso9"
			],
			"aliases": ["lassoscript"]
		},
		{
			"name": "Latte",
			"type": "markup",
			"extensions": [".latte"]
		},
		{
			"name": "Lean",
			"type": "programming",
			"extensions": [".lean", ".hlean"]
		},
		{
			"name": "Lean 4",
			"type": "programming",
			"group": "Lean",
			"extensions": [".lean"],
			"aliases": ["lean4"]
		},
		{
			"name": "Leo",
			"type": "programming",
			"extensions": [".leo"]
		},
		{
			"name": "Less",
			"type": "markup",
			"extensions": [".less"],
			"aliases": ["less-css"]
		},
		{
			"name": "Lex",
			"type": "programming",
			"extensions": [".l", ".lex"],
			"filenames": ["Lexer.x", "lexer.x"],
			"aliases": ["flex"]
		},
		{
			"name": "LigoLANG",
			"type": "programming",
			"group": "LigoLANG",
			"extensions": [".ligo"]
		},
		{
			"name": "LilyPond",
			"type": "programming",
			"extensions": [".ly", ".ily"]
		},
		{
			"name": "Limbo",
			"type": "programming",
			"extensions": [".b", ".m"]
		},
		{
			"name": "Linear Programming",
			"type": "programming",
			"extensions": [".lp"]
		},
		{
			"name": "Linker Script",
			"type": "programming",
			"extensions": [
				".ld",
				".lds",
				".x"
			],
			"filenames": ["ld.script"]
		},
		{
			"name": "Linux Kernel Module",
			"type": "data",
			"extensions": [".mod"]
		},
		{
			"name": "Liquid",
			"type": "markup",
			"extensions": [".liquid"]
		},
		{
			"name": "Liquidsoap",
			"type": "programming",
			"extensions": [".liq"]
		},
		{
			"name": "Literate Agda",
			"type": "programming",
			"group": "Agda",
			"extensions": [".lagda"]
		},
		{
			"name": "Literate CoffeeScript",
			"type": "programming",
			"group": "CoffeeScript",
			"extensions": [".litcoffee", ".coffee.md"],
			"aliases": ["litcoffee"]
		},
		{
			"name": "Literate Haskell",
			"type": "programming",
			"group": "Haskell",
			"extensions": [".lhs"],
			"aliases": ["lhaskell", "lhs"]
		},
		{
			"name": "LiveCode Script",
			"type": "programming",
			"extensions": [".livecodescript"]
		},
		{
			"name": "LiveScript",
			"type": "programming",
			"extensions": [".ls", "._ls"],
			"filenames": ["Slakefile"],
			"aliases": ["live-script", "ls"]
		},
		{
			"name": "Lobster",
			"type": "programming",
			"extensions": [".lobster"]
		},
		{
			"name": "Logos",
			"type": "programming",
			"extensions": [
				".xm",
				".x",
				".xi"
			]
		},
		{
			"name": "Logtalk",
			"type": "programming",
			"extensions": [".lgt", ".logtalk"]
		},
		{
			"name": "LookML",
			"type": "programming",
			"extensions": [".lkml", ".lookml"]
		},
		{
			"name": "LoomScript",
			"type": "programming",
			"extensions": [".ls"]
		},
		{
			"name": "Lua",
			"type": "programming",
			"extensions": [
				".lua",
				".fcgi",
				".nse",
				".p8",
				".pd_lua",
				".rbxs",
				".rockspec",
				".wlua"
			],
			"filenames": [".luacheckrc"],
			"interpreters": ["lua", "luajit"]
		},
		{
			"name": "Luau",
			"type": "programming",
			"extensions": [".luau"],
			"interpreters": ["luau"]
		},
		{
			"name": "M",
			"type": "programming",
			"extensions": [".mumps", ".m"],
			"aliases": ["mumps"]
		},
		{
			"name": "M3U",
			"type": "data",
			"extensions": [".m3u", ".m3u8"],
			"aliases": ["hls playlist", "m3u playlist"]
		},
		{
			"name": "M4",
			"type": "programming",
			"extensions": [".m4", ".mc"]
		},
		{
			"name": "M4Sugar",
			"type": "programming",
			"group": "M4",
			"extensions": [".m4"],
			"filenames": ["configure.ac"],
			"aliases": ["autoconf"]
		},
		{
			"name": "MATLAB",
			"type": "programming",
			"extensions": [".matlab", ".m"],
			"aliases": ["octave"]
		},
		{
			"name": "MAXScript",
			"type": "programming",
			"extensions": [".ms", ".mcr"]
		},
		{
			"name": "MDX",
			"type": "markup",
			"extensions": [".mdx"]
		},
		{
			"name": "MLIR",
			"type": "programming",
			"extensions": [".mlir"]
		},
		{
			"name": "MQL4",
			"type": "programming",
			"extensions": [".mq4", ".mqh"]
		},
		{
			"name": "MQL5",
			"type": "programming",
			"extensions": [".mq5", ".mqh"]
		},
		{
			"name": "MTML",
			"type": "markup",
			"extensions": [".mtml"]
		},
		{
			"name": "MUF",
			"type": "programming",
			"group": "Forth",
			"extensions": [".muf", ".m"]
		},
		{
			"name": "Macaulay2",
			"type": "programming",
			"extensions": [".m2"],
			"interpreters": ["M2"],
			"aliases": ["m2"]
		},
		{
			"name": "Makefile",
			"type": "programming",
			"extensions": [
				".mak",
				".d",
				".make",
				".makefile",
				".mk",
				".mkfile"
			],
			"filenames": [
				"BSDmakefile",
				"GNUmakefile",
				"Kbuild",
				"Makefile",
				"Makefile.am",
				"Makefile.boot",
				"Makefile.frag",
				"Makefile.in",
				"Makefile.inc",
				"Makefile.pc",
				"Makefile.wat",
				"makefile",
				"makefile.sco",
				"mkfile"
			],
			"interpreters": ["make"],
			"aliases": [
				"bsdmake",
				"make",
				"mf"
			]
		},
		{
			"name": "Mako",
			"type": "programming",
			"extensions": [".mako", ".mao"]
		},
		{
			"name": "Markdown",
			"type": "prose",
			"extensions": [
				".md",
				".livemd",
				".markdown",
				".mdown",
				".mdwn",
				".mkd",
				".mkdn",
				".mkdown",
				".ronn",
				".scd",
				".workbook"
			],
			"filenames": ["contents.lr"],
			"aliases": ["md", "pandoc"]
		},
		{
			"name": "Marko",
			"type": "markup",
			"extensions": [".marko"],
			"aliases": ["markojs"]
		},
		{
			"name": "Mask",
			"type": "markup",
			"extensions": [".mask"]
		},
		{
			"name": "Mathematical Programming System",
			"type": "programming",
			"extensions": [".mps"]
		},
		{
			"name": "Maven POM",
			"type": "data",
			"group": "XML",
			"filenames": ["pom.xml"]
		},
		{
			"name": "Max",
			"type": "programming",
			"extensions": [
				".maxpat",
				".maxhelp",
				".maxproj",
				".mxt",
				".pat"
			],
			"aliases": ["max/msp", "maxmsp"]
		},
		{
			"name": "MeTTa",
			"type": "programming",
			"extensions": [".metta"]
		},
		{
			"name": "Mercury",
			"type": "programming",
			"extensions": [".m", ".moo"],
			"interpreters": ["mmi"]
		},
		{
			"name": "Mermaid",
			"type": "markup",
			"extensions": [".mmd", ".mermaid"],
			"aliases": ["mermaid example"]
		},
		{
			"name": "Meson",
			"type": "programming",
			"filenames": ["meson.build", "meson_options.txt"]
		},
		{
			"name": "Metal",
			"type": "programming",
			"extensions": [".metal"]
		},
		{
			"name": "Microsoft Developer Studio Project",
			"type": "data",
			"extensions": [".dsp"]
		},
		{
			"name": "Microsoft Visual Studio Solution",
			"type": "data",
			"extensions": [".sln"]
		},
		{
			"name": "MiniD",
			"type": "programming",
			"extensions": [".minid"]
		},
		{
			"name": "MiniScript",
			"type": "programming",
			"extensions": [".ms"]
		},
		{
			"name": "MiniYAML",
			"type": "data",
			"extensions": [".yaml", ".yml"]
		},
		{
			"name": "MiniZinc",
			"type": "programming",
			"extensions": [".mzn"]
		},
		{
			"name": "MiniZinc Data",
			"type": "data",
			"extensions": [".dzn"]
		},
		{
			"name": "Mint",
			"type": "programming",
			"extensions": [".mint"]
		},
		{
			"name": "Mirah",
			"type": "programming",
			"extensions": [
				".druby",
				".duby",
				".mirah"
			]
		},
		{
			"name": "Modelica",
			"type": "programming",
			"extensions": [".mo"]
		},
		{
			"name": "Modula-2",
			"type": "programming",
			"extensions": [".mod"]
		},
		{
			"name": "Modula-3",
			"type": "programming",
			"extensions": [
				".i3",
				".ig",
				".m3",
				".mg"
			]
		},
		{
			"name": "Module Management System",
			"type": "programming",
			"extensions": [".mms", ".mmk"],
			"filenames": ["descrip.mmk", "descrip.mms"]
		},
		{
			"name": "Mojo",
			"type": "programming",
			"extensions": [".mojo"]
		},
		{
			"name": "Monkey",
			"type": "programming",
			"extensions": [".monkey", ".monkey2"]
		},
		{
			"name": "Monkey C",
			"type": "programming",
			"extensions": [".mc"]
		},
		{
			"name": "Moocode",
			"type": "programming",
			"extensions": [".moo"]
		},
		{
			"name": "MoonBit",
			"type": "programming",
			"extensions": [".mbt"]
		},
		{
			"name": "MoonScript",
			"type": "programming",
			"extensions": [".moon"],
			"interpreters": ["moon"]
		},
		{
			"name": "Motoko",
			"type": "programming",
			"extensions": [".mo"]
		},
		{
			"name": "Motorola 68K Assembly",
			"type": "programming",
			"group": "Assembly",
			"extensions": [
				".asm",
				".i",
				".inc",
				".s",
				".x68"
			],
			"aliases": ["m68k"]
		},
		{
			"name": "Move",
			"type": "programming",
			"extensions": [".move"]
		},
		{
			"name": "Muse",
			"type": "prose",
			"extensions": [".muse"],
			"aliases": ["amusewiki", "emacs muse"]
		},
		{
			"name": "Mustache",
			"type": "markup",
			"extensions": [".mustache"]
		},
		{
			"name": "Myghty",
			"type": "programming",
			"extensions": [".myt"]
		},
		{
			"name": "NASL",
			"type": "programming",
			"extensions": [".nasl", ".inc"]
		},
		{
			"name": "NCL",
			"type": "programming",
			"extensions": [".ncl"]
		},
		{
			"name": "NEON",
			"type": "data",
			"extensions": [".neon"],
			"aliases": ["nette object notation", "ne-on"]
		},
		{
			"name": "NL",
			"type": "data",
			"extensions": [".nl"]
		},
		{
			"name": "NMODL",
			"type": "programming",
			"extensions": [".mod"]
		},
		{
			"name": "NPM Config",
			"type": "data",
			"group": "INI",
			"filenames": [".npmrc"],
			"aliases": ["npmrc"]
		},
		{
			"name": "NSIS",
			"type": "programming",
			"extensions": [".nsi", ".nsh"]
		},
		{
			"name": "NWScript",
			"type": "programming",
			"extensions": [".nss"]
		},
		{
			"name": "Nasal",
			"type": "programming",
			"extensions": [".nas"]
		},
		{
			"name": "Nearley",
			"type": "programming",
			"extensions": [".ne", ".nearley"]
		},
		{
			"name": "Nemerle",
			"type": "programming",
			"extensions": [".n"]
		},
		{
			"name": "NetLinx",
			"type": "programming",
			"extensions": [".axs", ".axi"]
		},
		{
			"name": "NetLinx+ERB",
			"type": "programming",
			"extensions": [".axs.erb", ".axi.erb"]
		},
		{
			"name": "NetLogo",
			"type": "programming",
			"extensions": [".nlogo"]
		},
		{
			"name": "NewLisp",
			"type": "programming",
			"extensions": [
				".nl",
				".lisp",
				".lsp"
			],
			"interpreters": ["newlisp"]
		},
		{
			"name": "Nextflow",
			"type": "programming",
			"extensions": [".nf"],
			"filenames": ["nextflow.config"],
			"interpreters": ["nextflow"]
		},
		{
			"name": "Nginx",
			"type": "data",
			"extensions": [
				".nginx",
				".nginxconf",
				".vhost"
			],
			"filenames": ["nginx.conf"],
			"aliases": ["nginx configuration file"]
		},
		{
			"name": "Nickel",
			"type": "programming",
			"extensions": [".ncl"]
		},
		{
			"name": "Nim",
			"type": "programming",
			"extensions": [
				".nim",
				".nim.cfg",
				".nimble",
				".nimrod",
				".nims"
			],
			"filenames": ["nim.cfg"]
		},
		{
			"name": "Ninja",
			"type": "data",
			"extensions": [".ninja"]
		},
		{
			"name": "Nit",
			"type": "programming",
			"extensions": [".nit"]
		},
		{
			"name": "Nix",
			"type": "programming",
			"extensions": [".nix"],
			"aliases": ["nixos"]
		},
		{
			"name": "Noir",
			"type": "programming",
			"extensions": [".nr"],
			"aliases": ["nargo"]
		},
		{
			"name": "Nu",
			"type": "programming",
			"extensions": [".nu"],
			"filenames": ["Nukefile"],
			"interpreters": ["nush"],
			"aliases": ["nush"]
		},
		{
			"name": "NumPy",
			"type": "programming",
			"group": "Python",
			"extensions": [
				".numpy",
				".numpyw",
				".numsc"
			]
		},
		{
			"name": "Nunjucks",
			"type": "markup",
			"extensions": [".njk"],
			"aliases": ["njk"]
		},
		{
			"name": "Nushell",
			"type": "programming",
			"extensions": [".nu"],
			"interpreters": ["nu"],
			"aliases": ["nu-script", "nushell-script"]
		},
		{
			"name": "OASv2-json",
			"type": "data",
			"group": "OpenAPI Specification v2",
			"extensions": [".json"]
		},
		{
			"name": "OASv2-yaml",
			"type": "data",
			"group": "OpenAPI Specification v2",
			"extensions": [".yaml", ".yml"]
		},
		{
			"name": "OASv3-json",
			"type": "data",
			"group": "OpenAPI Specification v3",
			"extensions": [".json"]
		},
		{
			"name": "OASv3-yaml",
			"type": "data",
			"group": "OpenAPI Specification v3",
			"extensions": [".yaml", ".yml"]
		},
		{
			"name": "OCaml",
			"type": "programming",
			"extensions": [
				".ml",
				".eliom",
				".eliomi",
				".ml4",
				".mli",
				".mll",
				".mly"
			],
			"interpreters": [
				"ocaml",
				"ocamlrun",
				"ocamlscript"
			]
		},
		{
			"name": "OMNeT++ MSG",
			"type": "programming",
			"extensions": [".msg"],
			"aliases": ["omnetpp-msg"]
		},
		{
			"name": "OMNeT++ NED",
			"type": "programming",
			"extensions": [".ned"],
			"aliases": ["omnetpp-ned"]
		},
		{
			"name": "Oberon",
			"type": "programming",
			"extensions": [".ob2"]
		},
		{
			"name": "ObjDump",
			"type": "data",
			"extensions": [".objdump"]
		},
		{
			"name": "Object Data Instance Notation",
			"type": "data",
			"extensions": [".odin"]
		},
		{
			"name": "ObjectScript",
			"type": "programming",
			"extensions": [".cls"]
		},
		{
			"name": "Objective-C",
			"type": "programming",
			"extensions": [".m", ".h"],
			"aliases": [
				"obj-c",
				"objc",
				"objectivec"
			]
		},
		{
			"name": "Objective-C++",
			"type": "programming",
			"extensions": [".mm"],
			"aliases": [
				"obj-c++",
				"objc++",
				"objectivec++"
			]
		},
		{
			"name": "Objective-J",
			"type": "programming",
			"extensions": [".j", ".sj"],
			"aliases": [
				"obj-j",
				"objectivej",
				"objj"
			]
		},
		{
			"name": "Odin",
			"type": "programming",
			"extensions": [".odin"],
			"aliases": ["odinlang", "odin-lang"]
		},
		{
			"name": "Omgrofl",
			"type": "programming",
			"extensions": [".omgrofl"]
		},
		{
			"name": "Opa",
			"type": "programming",
			"extensions": [".opa"]
		},
		{
			"name": "Opal",
			"type": "programming",
			"extensions": [".opal"]
		},
		{
			"name": "Open Policy Agent",
			"type": "programming",
			"extensions": [".rego"]
		},
		{
			"name": "OpenAPI Specification v2",
			"type": "data",
			"aliases": ["oasv2"]
		},
		{
			"name": "OpenAPI Specification v3",
			"type": "data",
			"aliases": ["oasv3"]
		},
		{
			"name": "OpenCL",
			"type": "programming",
			"group": "C",
			"extensions": [".cl", ".opencl"]
		},
		{
			"name": "OpenEdge ABL",
			"type": "programming",
			"extensions": [
				".p",
				".cls",
				".w"
			],
			"aliases": [
				"progress",
				"openedge",
				"abl"
			]
		},
		{
			"name": "OpenQASM",
			"type": "programming",
			"extensions": [".qasm"]
		},
		{
			"name": "OpenRC runscript",
			"type": "programming",
			"group": "Shell",
			"interpreters": ["openrc-run"],
			"aliases": ["openrc"]
		},
		{
			"name": "OpenSCAD",
			"type": "programming",
			"extensions": [".scad"]
		},
		{
			"name": "OpenStep Property List",
			"type": "data",
			"extensions": [".plist", ".glyphs"]
		},
		{
			"name": "OpenType Feature File",
			"type": "data",
			"extensions": [".fea"],
			"aliases": ["AFDKO"]
		},
		{
			"name": "Option List",
			"type": "data",
			"filenames": [
				".ackrc",
				".rspec",
				".yardopts",
				"ackrc",
				"mocha.opts"
			],
			"aliases": ["opts", "ackrc"]
		},
		{
			"name": "Org",
			"type": "prose",
			"extensions": [".org"]
		},
		{
			"name": "OverPy",
			"type": "programming",
			"extensions": [".opy"],
			"aliases": ["opy"]
		},
		{
			"name": "OverpassQL",
			"type": "programming",
			"extensions": [".overpassql"]
		},
		{
			"name": "Ox",
			"type": "programming",
			"extensions": [
				".ox",
				".oxh",
				".oxo"
			]
		},
		{
			"name": "Oxygene",
			"type": "programming",
			"extensions": [".oxygene"]
		},
		{
			"name": "Oz",
			"type": "programming",
			"extensions": [".oz"]
		},
		{
			"name": "P4",
			"type": "programming",
			"extensions": [".p4"]
		},
		{
			"name": "PDDL",
			"type": "programming",
			"extensions": [".pddl"]
		},
		{
			"name": "PEG.js",
			"type": "programming",
			"extensions": [".pegjs", ".peggy"]
		},
		{
			"name": "PHP",
			"type": "programming",
			"extensions": [
				".php",
				".aw",
				".ctp",
				".fcgi",
				".inc",
				".php3",
				".php4",
				".php5",
				".phps",
				".phpt"
			],
			"filenames": [
				".php",
				".php_cs",
				".php_cs.dist",
				"Phakefile"
			],
			"interpreters": ["php"],
			"aliases": ["inc"]
		},
		{
			"name": "PLSQL",
			"type": "programming",
			"extensions": [
				".pls",
				".bdy",
				".ddl",
				".fnc",
				".pck",
				".pkb",
				".pks",
				".plb",
				".plsql",
				".prc",
				".spc",
				".sql",
				".tpb",
				".tps",
				".trg",
				".vw"
			]
		},
		{
			"name": "PLpgSQL",
			"type": "programming",
			"extensions": [".pgsql", ".sql"]
		},
		{
			"name": "POV-Ray SDL",
			"type": "programming",
			"extensions": [".pov", ".inc"],
			"aliases": ["pov-ray", "povray"]
		},
		{
			"name": "Pact",
			"type": "programming",
			"extensions": [".pact"]
		},
		{
			"name": "Pan",
			"type": "programming",
			"extensions": [".pan"]
		},
		{
			"name": "Papyrus",
			"type": "programming",
			"extensions": [".psc"]
		},
		{
			"name": "Parrot",
			"type": "programming",
			"extensions": [".parrot"]
		},
		{
			"name": "Parrot Assembly",
			"type": "programming",
			"group": "Parrot",
			"extensions": [".pasm"],
			"interpreters": ["parrot"],
			"aliases": ["pasm"]
		},
		{
			"name": "Parrot Internal Representation",
			"type": "programming",
			"group": "Parrot",
			"extensions": [".pir"],
			"interpreters": ["parrot"],
			"aliases": ["pir"]
		},
		{
			"name": "Pascal",
			"type": "programming",
			"extensions": [
				".pas",
				".dfm",
				".dpr",
				".inc",
				".lpr",
				".pascal",
				".pp"
			],
			"interpreters": ["instantfpc"],
			"aliases": ["delphi", "objectpascal"]
		},
		{
			"name": "Pawn",
			"type": "programming",
			"extensions": [
				".pwn",
				".inc",
				".sma"
			]
		},
		{
			"name": "Pep8",
			"type": "programming",
			"extensions": [".pep"]
		},
		{
			"name": "Perl",
			"type": "programming",
			"extensions": [
				".pl",
				".al",
				".cgi",
				".fcgi",
				".perl",
				".ph",
				".plx",
				".pm",
				".psgi",
				".t"
			],
			"filenames": [
				".latexmkrc",
				"Makefile.PL",
				"Rexfile",
				"ack",
				"cpanfile",
				"latexmkrc"
			],
			"interpreters": ["cperl", "perl"],
			"aliases": ["cperl"]
		},
		{
			"name": "Pic",
			"type": "markup",
			"group": "Roff",
			"extensions": [".pic", ".chem"],
			"aliases": ["pikchr"]
		},
		{
			"name": "Pickle",
			"type": "data",
			"extensions": [".pkl"]
		},
		{
			"name": "PicoLisp",
			"type": "programming",
			"extensions": [".l"],
			"interpreters": ["picolisp", "pil"]
		},
		{
			"name": "PigLatin",
			"type": "programming",
			"extensions": [".pig"]
		},
		{
			"name": "Pike",
			"type": "programming",
			"extensions": [".pike", ".pmod"],
			"interpreters": ["pike"]
		},
		{
			"name": "Pip Requirements",
			"type": "data",
			"filenames": [
				"dev-requirements.txt",
				"requirements-dev.txt",
				"requirements.lock.txt",
				"requirements.txt"
			]
		},
		{
			"name": "Pkl",
			"type": "programming",
			"extensions": [".pkl"],
			"interpreters": ["pkl"]
		},
		{
			"name": "PlantUML",
			"type": "data",
			"extensions": [
				".puml",
				".iuml",
				".plantuml"
			]
		},
		{
			"name": "Pod",
			"type": "prose",
			"extensions": [".pod"],
			"interpreters": ["perl"]
		},
		{
			"name": "Pod 6",
			"type": "prose",
			"extensions": [".pod", ".pod6"],
			"interpreters": ["perl6"]
		},
		{
			"name": "PogoScript",
			"type": "programming",
			"extensions": [".pogo"]
		},
		{
			"name": "Polar",
			"type": "programming",
			"extensions": [".polar"]
		},
		{
			"name": "Pony",
			"type": "programming",
			"extensions": [".pony"]
		},
		{
			"name": "Portugol",
			"type": "programming",
			"extensions": [".por"]
		},
		{
			"name": "PostCSS",
			"type": "markup",
			"group": "CSS",
			"extensions": [".pcss", ".postcss"]
		},
		{
			"name": "PostScript",
			"type": "markup",
			"extensions": [
				".ps",
				".eps",
				".epsi",
				".pfa"
			],
			"aliases": ["postscr"]
		},
		{
			"name": "Power Query",
			"type": "programming",
			"extensions": [".pq"],
			"aliases": ["powerquery"]
		},
		{
			"name": "PowerBuilder",
			"type": "programming",
			"extensions": [
				".pbt",
				".sra",
				".sru",
				".srw"
			]
		},
		{
			"name": "PowerShell",
			"type": "programming",
			"extensions": [
				".ps1",
				".psd1",
				".psm1"
			],
			"interpreters": ["pwsh"],
			"aliases": ["posh", "pwsh"]
		},
		{
			"name": "Praat",
			"type": "programming",
			"extensions": [".praat"]
		},
		{
			"name": "Prisma",
			"type": "data",
			"extensions": [".prisma"]
		},
		{
			"name": "Pro*C",
			"type": "programming",
			"extensions": [".pc"]
		},
		{
			"name": "Processing",
			"type": "programming",
			"extensions": [".pde"]
		},
		{
			"name": "Procfile",
			"type": "programming",
			"filenames": ["Procfile"]
		},
		{
			"name": "Proguard",
			"type": "data",
			"extensions": [".pro"]
		},
		{
			"name": "Prolog",
			"type": "programming",
			"extensions": [
				".pl",
				".plt",
				".pro",
				".prolog",
				".yap"
			],
			"interpreters": ["swipl", "yap"]
		},
		{
			"name": "Promela",
			"type": "programming",
			"extensions": [".pml"]
		},
		{
			"name": "Propeller Spin",
			"type": "programming",
			"extensions": [".spin"]
		},
		{
			"name": "Protocol Buffer",
			"type": "data",
			"extensions": [".proto"],
			"aliases": [
				"proto",
				"protobuf",
				"Protocol Buffers"
			]
		},
		{
			"name": "Protocol Buffer Text Format",
			"type": "data",
			"extensions": [
				".textproto",
				".pbt",
				".pbtxt",
				".txtpb"
			],
			"aliases": ["text proto", "protobuf text format"]
		},
		{
			"name": "Public Key",
			"type": "data",
			"extensions": [".asc", ".pub"]
		},
		{
			"name": "Pug",
			"type": "markup",
			"extensions": [".jade", ".pug"]
		},
		{
			"name": "Puppet",
			"type": "programming",
			"extensions": [".pp"],
			"filenames": ["Modulefile"]
		},
		{
			"name": "Pure Data",
			"type": "data",
			"extensions": [".pd"]
		},
		{
			"name": "PureBasic",
			"type": "programming",
			"extensions": [".pb", ".pbi"]
		},
		{
			"name": "PureScript",
			"type": "programming",
			"extensions": [".purs"]
		},
		{
			"name": "Pyret",
			"type": "programming",
			"extensions": [".arr"]
		},
		{
			"name": "Python",
			"type": "programming",
			"extensions": [
				".py",
				".cgi",
				".fcgi",
				".gyp",
				".gypi",
				".lmi",
				".py3",
				".pyde",
				".pyi",
				".pyp",
				".pyt",
				".pyw",
				".rpy",
				".spec",
				".tac",
				".wsgi",
				".xpy"
			],
			"filenames": [
				".gclient",
				"DEPS",
				"SConscript",
				"SConstruct",
				"wscript"
			],
			"interpreters": [
				"python",
				"python2",
				"python3",
				"py",
				"pypy",
				"pypy3",
				"uv"
			],
			"aliases": [
				"py",
				"py3",
				"python3",
				"rusthon"
			]
		},
		{
			"name": "Python console",
			"type": "programming",
			"group": "Python",
			"aliases": ["pycon"]
		},
		{
			"name": "Python traceback",
			"type": "data",
			"group": "Python",
			"extensions": [".pytb"]
		},
		{
			"name": "Q#",
			"type": "programming",
			"extensions": [".qs"],
			"aliases": ["qsharp"]
		},
		{
			"name": "QML",
			"type": "programming",
			"extensions": [".qml", ".qbs"]
		},
		{
			"name": "QMake",
			"type": "programming",
			"extensions": [".pro", ".pri"],
			"interpreters": ["qmake"]
		},
		{
			"name": "Qt Script",
			"type": "programming",
			"extensions": [".qs"],
			"filenames": ["installscript.qs", "toolchain_installscript.qs"]
		},
		{
			"name": "Quake",
			"type": "programming",
			"filenames": ["m3makefile", "m3overrides"]
		},
		{
			"name": "QuakeC",
			"type": "programming",
			"extensions": [".qc"]
		},
		{
			"name": "Quartus Simulation IP",
			"type": "data",
			"extensions": [".sip"]
		},
		{
			"name": "QuickBASIC",
			"type": "programming",
			"extensions": [".bas", ".bi"],
			"aliases": [
				"qb",
				"qbasic",
				"qb64",
				"classic qbasic",
				"classic quickbasic"
			]
		},
		{
			"name": "Quint",
			"type": "programming",
			"extensions": [".qnt"]
		},
		{
			"name": "R",
			"type": "programming",
			"extensions": [
				".r",
				".rd",
				".rhistory",
				".rsx"
			],
			"filenames": [
				".Rapp.history",
				".Rhistory",
				".Rprofile",
				"expr-dist"
			],
			"interpreters": ["Rscript"],
			"aliases": ["Rscript", "splus"]
		},
		{
			"name": "RAML",
			"type": "markup",
			"extensions": [".raml"]
		},
		{
			"name": "RAScript",
			"type": "programming",
			"extensions": [".rascript"]
		},
		{
			"name": "RBS",
			"type": "data",
			"group": "Ruby",
			"extensions": [".rbs"]
		},
		{
			"name": "RDoc",
			"type": "prose",
			"extensions": [".rdoc"]
		},
		{
			"name": "REALbasic",
			"type": "programming",
			"extensions": [
				".rbbas",
				".rbfrm",
				".rbmnu",
				".rbres",
				".rbtbar",
				".rbuistate"
			]
		},
		{
			"name": "REXX",
			"type": "programming",
			"extensions": [
				".rexx",
				".pprx",
				".rex"
			],
			"interpreters": ["regina", "rexx"],
			"aliases": ["arexx"]
		},
		{
			"name": "RMarkdown",
			"type": "prose",
			"extensions": [".qmd", ".rmd"]
		},
		{
			"name": "RON",
			"type": "data",
			"extensions": [".ron"]
		},
		{
			"name": "ROS Interface",
			"type": "data",
			"extensions": [
				".msg",
				".action",
				".srv"
			],
			"aliases": ["rosmsg"]
		},
		{
			"name": "RPC",
			"type": "programming",
			"extensions": [".x"],
			"aliases": [
				"rpcgen",
				"oncrpc",
				"xdr"
			]
		},
		{
			"name": "RPGLE",
			"type": "programming",
			"extensions": [".rpgle", ".sqlrpgle"],
			"aliases": ["ile rpg", "sqlrpgle"]
		},
		{
			"name": "RPM Spec",
			"type": "data",
			"extensions": [".spec"],
			"aliases": ["specfile"]
		},
		{
			"name": "RUNOFF",
			"type": "markup",
			"extensions": [".rnh", ".rno"]
		},
		{
			"name": "Racket",
			"type": "programming",
			"extensions": [
				".rkt",
				".rktd",
				".rktl",
				".scrbl"
			],
			"interpreters": ["racket"]
		},
		{
			"name": "Ragel",
			"type": "programming",
			"extensions": [".rl"],
			"aliases": ["ragel-rb", "ragel-ruby"]
		},
		{
			"name": "Raku",
			"type": "programming",
			"extensions": [
				".6pl",
				".6pm",
				".nqp",
				".p6",
				".p6l",
				".p6m",
				".pl",
				".pl6",
				".pm",
				".pm6",
				".raku",
				".rakumod",
				".t"
			],
			"interpreters": [
				"perl6",
				"raku",
				"rakudo"
			],
			"aliases": ["perl6", "perl-6"]
		},
		{
			"name": "Rascal",
			"type": "programming",
			"extensions": [".rsc"]
		},
		{
			"name": "Raw token data",
			"type": "data",
			"extensions": [".raw"],
			"aliases": ["raw"]
		},
		{
			"name": "ReScript",
			"type": "programming",
			"extensions": [".res", ".resi"],
			"interpreters": ["ocaml"]
		},
		{
			"name": "Readline Config",
			"type": "data",
			"group": "INI",
			"filenames": [".inputrc", "inputrc"],
			"aliases": ["inputrc", "readline"]
		},
		{
			"name": "Reason",
			"type": "programming",
			"extensions": [".re", ".rei"]
		},
		{
			"name": "ReasonLIGO",
			"type": "programming",
			"group": "LigoLANG",
			"extensions": [".religo"]
		},
		{
			"name": "Rebol",
			"type": "programming",
			"extensions": [
				".reb",
				".r",
				".r2",
				".r3",
				".rebol"
			]
		},
		{
			"name": "Record Jar",
			"type": "data",
			"filenames": ["language-subtag-registry.txt"]
		},
		{
			"name": "Red",
			"type": "programming",
			"extensions": [".red", ".reds"],
			"aliases": ["red/system"]
		},
		{
			"name": "Redcode",
			"type": "programming",
			"extensions": [".cw"]
		},
		{
			"name": "Redirect Rules",
			"type": "data",
			"filenames": ["_redirects"],
			"aliases": ["redirects"]
		},
		{
			"name": "Redscript",
			"type": "programming",
			"extensions": [".reds"]
		},
		{
			"name": "Regular Expression",
			"type": "data",
			"extensions": [".regexp", ".regex"],
			"aliases": ["regexp", "regex"]
		},
		{
			"name": "Ren'Py",
			"type": "programming",
			"extensions": [".rpy"],
			"aliases": ["renpy"]
		},
		{
			"name": "RenderScript",
			"type": "programming",
			"extensions": [".rs", ".rsh"]
		},
		{
			"name": "Rez",
			"type": "programming",
			"extensions": [".r"]
		},
		{
			"name": "Rhai",
			"type": "programming",
			"extensions": [".rhai"]
		},
		{
			"name": "Rich Text Format",
			"type": "markup",
			"extensions": [".rtf"]
		},
		{
			"name": "Ring",
			"type": "programming",
			"extensions": [".ring"]
		},
		{
			"name": "Riot",
			"type": "markup",
			"extensions": [".riot"]
		},
		{
			"name": "RobotFramework",
			"type": "programming",
			"extensions": [".robot", ".resource"]
		},
		{
			"name": "Robots Exclusion Rules",
			"type": "data",
			"filenames": ["robots.txt"],
			"aliases": [
				"robots",
				"robots txt",
				"robotx.txt"
			]
		},
		{
			"name": "Roc",
			"type": "programming",
			"extensions": [".roc"]
		},
		{
			"name": "Rocq Prover",
			"type": "programming",
			"extensions": [".v", ".coq"],
			"aliases": ["coq", "rocq"]
		},
		{
			"name": "Roff",
			"type": "markup",
			"extensions": [
				".roff",
				".1",
				".1in",
				".1m",
				".1x",
				".2",
				".3",
				".3in",
				".3m",
				".3p",
				".3pm",
				".3qt",
				".3x",
				".4",
				".5",
				".6",
				".7",
				".8",
				".9",
				".l",
				".man",
				".mdoc",
				".me",
				".ms",
				".n",
				".nr",
				".rno",
				".tmac"
			],
			"filenames": [
				"eqnrc",
				"mmn",
				"mmt",
				"troffrc",
				"troffrc-end"
			],
			"aliases": [
				"groff",
				"man",
				"manpage",
				"man page",
				"man-page",
				"mdoc",
				"nroff",
				"troff"
			]
		},
		{
			"name": "Roff Manpage",
			"type": "markup",
			"group": "Roff",
			"extensions": [
				".1",
				".1in",
				".1m",
				".1x",
				".2",
				".3",
				".3in",
				".3m",
				".3p",
				".3pm",
				".3qt",
				".3x",
				".4",
				".5",
				".6",
				".7",
				".8",
				".9",
				".man",
				".mdoc"
			]
		},
		{
			"name": "Rouge",
			"type": "programming",
			"extensions": [".rg"]
		},
		{
			"name": "RouterOS Script",
			"type": "programming",
			"extensions": [".rsc"],
			"interpreters": ["RouterOS"]
		},
		{
			"name": "Ruby",
			"type": "programming",
			"extensions": [
				".rb",
				".builder",
				".eye",
				".fcgi",
				".gemspec",
				".god",
				".jbuilder",
				".mspec",
				".pluginspec",
				".podspec",
				".prawn",
				".rabl",
				".rake",
				".rbi",
				".rbuild",
				".rbw",
				".rbx",
				".ru",
				".ruby",
				".spec",
				".thor",
				".watchr"
			],
			"filenames": [
				".irbrc",
				".pryrc",
				".simplecov",
				"Appraisals",
				"Berksfile",
				"Brewfile",
				"Buildfile",
				"Capfile",
				"Dangerfile",
				"Deliverfile",
				"Fastfile",
				"Gemfile",
				"Guardfile",
				"Jarfile",
				"Mavenfile",
				"Podfile",
				"Puppetfile",
				"Rakefile",
				"Snapfile",
				"Steepfile",
				"Thorfile",
				"Vagrantfile",
				"buildfile"
			],
			"interpreters": [
				"ruby",
				"macruby",
				"rake",
				"jruby",
				"rbx"
			],
			"aliases": [
				"jruby",
				"macruby",
				"rake",
				"rb",
				"rbx"
			]
		},
		{
			"name": "Rust",
			"type": "programming",
			"extensions": [".rs", ".rs.in"],
			"interpreters": ["rust-script"],
			"aliases": ["rs"]
		},
		{
			"name": "SAS",
			"type": "programming",
			"extensions": [".sas"]
		},
		{
			"name": "SCSS",
			"type": "markup",
			"extensions": [".scss"]
		},
		{
			"name": "SELinux Policy",
			"type": "data",
			"extensions": [".te"],
			"filenames": [
				"file_contexts",
				"genfs_contexts",
				"initial_sids",
				"port_contexts",
				"security_classes"
			],
			"aliases": ["SELinux Kernel Policy Language", "sepolicy"]
		},
		{
			"name": "SIP",
			"type": "programming",
			"extensions": [".sip"]
		},
		{
			"name": "SMT",
			"type": "programming",
			"extensions": [
				".smt2",
				".smt",
				".z3"
			],
			"interpreters": [
				"boolector",
				"cvc4",
				"mathsat5",
				"opensmt",
				"smtinterpol",
				"smt-rat",
				"stp",
				"verit",
				"yices2",
				"z3"
			]
		},
		{
			"name": "SPARQL",
			"type": "data",
			"extensions": [".sparql", ".rq"]
		},
		{
			"name": "SQF",
			"type": "programming",
			"extensions": [".sqf", ".hqf"]
		},
		{
			"name": "SQL",
			"type": "data",
			"extensions": [
				".sql",
				".ddl",
				".inc",
				".mysql",
				".prc",
				".tab",
				".udf",
				".viw"
			]
		},
		{
			"name": "SQLPL",
			"type": "programming",
			"extensions": [".sql", ".db2"]
		},
		{
			"name": "SRecode Template",
			"type": "markup",
			"extensions": [".srt"]
		},
		{
			"name": "SSH Config",
			"type": "data",
			"group": "INI",
			"filenames": [
				"ssh-config",
				"ssh_config",
				"sshconfig",
				"sshconfig.snip",
				"sshd-config",
				"sshd_config"
			],
			"aliases": [
				"sshconfig",
				"sshdconfig",
				"ssh_config",
				"sshd_config"
			]
		},
		{
			"name": "STAR",
			"type": "data",
			"extensions": [".star"]
		},
		{
			"name": "STL",
			"type": "data",
			"extensions": [".stl"],
			"aliases": ["ascii stl", "stla"]
		},
		{
			"name": "STON",
			"type": "data",
			"group": "Smalltalk",
			"extensions": [".ston"]
		},
		{
			"name": "SVG",
			"type": "data",
			"extensions": [".svg"]
		},
		{
			"name": "SWIG",
			"type": "programming",
			"extensions": [
				".i",
				".swg",
				".swig"
			]
		},
		{
			"name": "Sage",
			"type": "programming",
			"extensions": [".sage", ".sagews"]
		},
		{
			"name": "Sail",
			"type": "programming",
			"extensions": [".sail"]
		},
		{
			"name": "Salt",
			"type": "programming",
			"extensions": [".sls"],
			"aliases": ["saltstack", "saltstate"]
		},
		{
			"name": "Sass",
			"type": "markup",
			"extensions": [".sass"]
		},
		{
			"name": "Scala",
			"type": "programming",
			"extensions": [
				".scala",
				".kojo",
				".sbt",
				".sc"
			],
			"interpreters": ["scala"]
		},
		{
			"name": "Scaml",
			"type": "markup",
			"extensions": [".scaml"]
		},
		{
			"name": "Scenic",
			"type": "programming",
			"extensions": [".scenic"],
			"interpreters": ["scenic"]
		},
		{
			"name": "Scheme",
			"type": "programming",
			"extensions": [
				".scm",
				".sch",
				".sld",
				".sls",
				".sps",
				".ss"
			],
			"interpreters": [
				"scheme",
				"guile",
				"bigloo",
				"chicken",
				"csi",
				"gosh",
				"r6rs"
			]
		},
		{
			"name": "Scilab",
			"type": "programming",
			"extensions": [
				".sci",
				".sce",
				".tst"
			]
		},
		{
			"name": "Self",
			"type": "programming",
			"extensions": [".self"]
		},
		{
			"name": "ShaderLab",
			"type": "programming",
			"extensions": [".shader"]
		},
		{
			"name": "Shell",
			"type": "programming",
			"extensions": [
				".sh",
				".bash",
				".bats",
				".cgi",
				".command",
				".fcgi",
				".ksh",
				".pacscript",
				".sbatch",
				".sh.in",
				".slurm",
				".tmux",
				".tool",
				".trigger",
				".zsh",
				".zsh-theme"
			],
			"filenames": [
				".bash_aliases",
				".bash_functions",
				".bash_history",
				".bash_logout",
				".bash_profile",
				".bashrc",
				".cshrc",
				".envrc",
				".flaskenv",
				".kshrc",
				".login",
				".profile",
				".tmux.conf",
				".xinitrc",
				".xsession",
				".zlogin",
				".zlogout",
				".zprofile",
				".zshenv",
				".zshrc",
				"9fs",
				"PKGBUILD",
				"bash_aliases",
				"bash_logout",
				"bash_profile",
				"bashrc",
				"cshrc",
				"gradlew",
				"kshrc",
				"login",
				"man",
				"mvnw",
				"profile",
				"tmux.conf",
				"xinitrc",
				"xsession",
				"zlogin",
				"zlogout",
				"zprofile",
				"zshenv",
				"zshrc"
			],
			"interpreters": [
				"ash",
				"bash",
				"dash",
				"ksh",
				"mksh",
				"pdksh",
				"rc",
				"sh",
				"zsh"
			],
			"aliases": [
				"sh",
				"shell-script",
				"bash",
				"zsh",
				"envrc"
			]
		},
		{
			"name": "ShellCheck Config",
			"type": "data",
			"filenames": [".shellcheckrc"],
			"aliases": ["shellcheckrc"]
		},
		{
			"name": "ShellSession",
			"type": "programming",
			"extensions": [".sh-session"],
			"aliases": ["bash session", "console"]
		},
		{
			"name": "Shen",
			"type": "programming",
			"extensions": [".shen"]
		},
		{
			"name": "Sieve",
			"type": "programming",
			"extensions": [".sieve"]
		},
		{
			"name": "Simple File Verification",
			"type": "data",
			"group": "Checksums",
			"extensions": [".sfv"],
			"aliases": ["sfv"]
		},
		{
			"name": "Singularity",
			"type": "programming",
			"filenames": ["Singularity"]
		},
		{
			"name": "Slang",
			"type": "programming",
			"extensions": [".slang"]
		},
		{
			"name": "Slash",
			"type": "programming",
			"extensions": [".sl"]
		},
		{
			"name": "Slice",
			"type": "programming",
			"extensions": [".ice"]
		},
		{
			"name": "Slim",
			"type": "markup",
			"extensions": [".slim"]
		},
		{
			"name": "Slint",
			"type": "markup",
			"extensions": [".slint"]
		},
		{
			"name": "SmPL",
			"type": "programming",
			"extensions": [".cocci"],
			"aliases": ["coccinelle"]
		},
		{
			"name": "Smali",
			"type": "programming",
			"extensions": [".smali"]
		},
		{
			"name": "Smalltalk",
			"type": "programming",
			"extensions": [".st", ".cs"],
			"aliases": ["squeak"]
		},
		{
			"name": "Smarty",
			"type": "programming",
			"extensions": [".tpl"]
		},
		{
			"name": "Smithy",
			"type": "programming",
			"extensions": [".smithy"]
		},
		{
			"name": "Snakemake",
			"type": "programming",
			"group": "Python",
			"extensions": [".smk", ".snakefile"],
			"filenames": ["Snakefile"],
			"aliases": ["snakefile"]
		},
		{
			"name": "Solidity",
			"type": "programming",
			"extensions": [".sol"]
		},
		{
			"name": "Soong",
			"type": "data",
			"filenames": ["Android.bp"]
		},
		{
			"name": "SourcePawn",
			"type": "programming",
			"extensions": [".sp", ".inc"],
			"aliases": ["sourcemod"]
		},
		{
			"name": "SpiceDB Schema",
			"type": "data",
			"extensions": [".zed"]
		},
		{
			"name": "Spline Font Database",
			"type": "data",
			"extensions": [".sfd"]
		},
		{
			"name": "Squirrel",
			"type": "programming",
			"extensions": [".nut"]
		},
		{
			"name": "Stan",
			"type": "programming",
			"extensions": [".stan"]
		},
		{
			"name": "Standard ML",
			"type": "programming",
			"extensions": [
				".ml",
				".fun",
				".sig",
				".sml"
			],
			"aliases": ["sml"]
		},
		{
			"name": "Starlark",
			"type": "programming",
			"extensions": [".bzl", ".star"],
			"filenames": [
				"BUCK",
				"BUILD",
				"BUILD.bazel",
				"MODULE.bazel",
				"Tiltfile",
				"WORKSPACE",
				"WORKSPACE.bazel",
				"WORKSPACE.bzlmod"
			],
			"aliases": ["bazel", "bzl"]
		},
		{
			"name": "Stata",
			"type": "programming",
			"extensions": [
				".do",
				".ado",
				".doh",
				".ihlp",
				".mata",
				".matah",
				".sthlp"
			]
		},
		{
			"name": "StringTemplate",
			"type": "markup",
			"extensions": [".st"]
		},
		{
			"name": "Stylus",
			"type": "markup",
			"extensions": [".styl"]
		},
		{
			"name": "SubRip Text",
			"type": "data",
			"extensions": [".srt"]
		},
		{
			"name": "SugarSS",
			"type": "markup",
			"extensions": [".sss"]
		},
		{
			"name": "SuperCollider",
			"type": "programming",
			"extensions": [".sc", ".scd"],
			"interpreters": ["sclang", "scsynth"]
		},
		{
			"name": "SurrealQL",
			"type": "programming",
			"extensions": [".surql"],
			"aliases": ["surql"]
		},
		{
			"name": "Survex data",
			"type": "data",
			"extensions": [".svx"]
		},
		{
			"name": "Svelte",
			"type": "markup",
			"extensions": [".svelte"]
		},
		{
			"name": "Sway",
			"type": "programming",
			"extensions": [".sw"]
		},
		{
			"name": "Sweave",
			"type": "prose",
			"extensions": [".rnw"]
		},
		{
			"name": "Swift",
			"type": "programming",
			"extensions": [".swift"]
		},
		{
			"name": "SystemVerilog",
			"type": "programming",
			"extensions": [
				".sv",
				".svh",
				".vh"
			]
		},
		{
			"name": "TI Program",
			"type": "programming",
			"extensions": [".8xp", ".8xp.txt"]
		},
		{
			"name": "TL-Verilog",
			"type": "programming",
			"extensions": [".tlv"]
		},
		{
			"name": "TLA",
			"type": "programming",
			"extensions": [".tla"]
		},
		{
			"name": "TMDL",
			"type": "data",
			"extensions": [".tmdl"],
			"aliases": ["Tabular Model Definition Language"]
		},
		{
			"name": "TOML",
			"type": "data",
			"extensions": [".toml", ".toml.example"],
			"filenames": [
				"Cargo.lock",
				"Cargo.toml.orig",
				"Gopkg.lock",
				"Pipfile",
				"mise.local.lock",
				"mise.lock",
				"pdm.lock",
				"poetry.lock",
				"uv.lock"
			]
		},
		{
			"name": "TSPLIB data",
			"type": "data",
			"extensions": [".tsp"],
			"aliases": ["travelling salesman problem", "traveling salesman problem"]
		},
		{
			"name": "TSQL",
			"type": "programming",
			"extensions": [".sql"]
		},
		{
			"name": "TSV",
			"type": "data",
			"extensions": [".tsv", ".vcf"],
			"aliases": ["tab-seperated values"]
		},
		{
			"name": "TSX",
			"type": "programming",
			"group": "TypeScript",
			"extensions": [".tsx"],
			"aliases": ["typescriptreact"]
		},
		{
			"name": "TXL",
			"type": "programming",
			"extensions": [".txl"]
		},
		{
			"name": "Tact",
			"type": "programming",
			"extensions": [".tact"]
		},
		{
			"name": "Talon",
			"type": "programming",
			"extensions": [".talon"]
		},
		{
			"name": "Tape",
			"type": "programming",
			"extensions": [".tape"],
			"aliases": ["vhs"]
		},
		{
			"name": "Tcl",
			"type": "programming",
			"extensions": [
				".tcl",
				".adp",
				".sdc",
				".tcl.in",
				".tm",
				".xdc"
			],
			"filenames": ["owh", "starfield"],
			"interpreters": ["tclsh", "wish"],
			"aliases": ["sdc", "xdc"]
		},
		{
			"name": "Tcsh",
			"type": "programming",
			"group": "Shell",
			"extensions": [".tcsh", ".csh"],
			"interpreters": ["tcsh", "csh"]
		},
		{
			"name": "TeX",
			"type": "markup",
			"extensions": [
				".tex",
				".aux",
				".bbx",
				".cbx",
				".cls",
				".dtx",
				".ins",
				".lbx",
				".ltx",
				".mkii",
				".mkiv",
				".mkvi",
				".sty",
				".toc"
			],
			"aliases": ["latex"]
		},
		{
			"name": "Tea",
			"type": "markup",
			"extensions": [".tea"]
		},
		{
			"name": "Teal",
			"type": "programming",
			"extensions": [".tl"],
			"interpreters": ["tl"]
		},
		{
			"name": "Terra",
			"type": "programming",
			"extensions": [".t"],
			"interpreters": ["lua"]
		},
		{
			"name": "Terraform Template",
			"type": "markup",
			"group": "HCL",
			"extensions": [".tftpl"]
		},
		{
			"name": "Texinfo",
			"type": "prose",
			"extensions": [
				".texinfo",
				".texi",
				".txi"
			],
			"interpreters": ["makeinfo"]
		},
		{
			"name": "Text",
			"type": "prose",
			"extensions": [
				".txt",
				".fr",
				".nb",
				".ncl",
				".no"
			],
			"filenames": [
				"CITATION",
				"CITATIONS",
				"COPYING",
				"COPYING.regex",
				"COPYRIGHT.regex",
				"FONTLOG",
				"INSTALL",
				"INSTALL.mysql",
				"LICENSE",
				"LICENSE.mysql",
				"NEWS",
				"README.me",
				"README.mysql",
				"README.nss",
				"README.pc",
				"click.me",
				"delete.me",
				"keep.me",
				"package.mask",
				"package.use.mask",
				"package.use.stable.mask",
				"read.me",
				"readme.1st",
				"test.me",
				"use.mask",
				"use.stable.mask"
			],
			"aliases": ["fundamental", "plain text"]
		},
		{
			"name": "TextGrid",
			"type": "data",
			"extensions": [".TextGrid"]
		},
		{
			"name": "TextMate Properties",
			"type": "data",
			"filenames": [".tm_properties"],
			"aliases": ["tm-properties"]
		},
		{
			"name": "Textile",
			"type": "prose",
			"extensions": [".textile"]
		},
		{
			"name": "Thrift",
			"type": "programming",
			"extensions": [".thrift"]
		},
		{
			"name": "Toit",
			"type": "programming",
			"extensions": [".toit"]
		},
		{
			"name": "Tolk",
			"type": "programming",
			"extensions": [".tolk"]
		},
		{
			"name": "Tor Config",
			"type": "data",
			"filenames": ["torrc"],
			"aliases": ["torrc"]
		},
		{
			"name": "Tree-sitter Query",
			"type": "programming",
			"extensions": [".scm"],
			"aliases": ["tsq"]
		},
		{
			"name": "Turing",
			"type": "programming",
			"extensions": [".t", ".tu"]
		},
		{
			"name": "Turtle",
			"type": "data",
			"extensions": [".ttl"]
		},
		{
			"name": "Twig",
			"type": "markup",
			"extensions": [".twig"]
		},
		{
			"name": "Type Language",
			"type": "data",
			"extensions": [".tl"],
			"aliases": ["tl"]
		},
		{
			"name": "TypeScript",
			"type": "programming",
			"extensions": [
				".ts",
				".cts",
				".mts"
			],
			"interpreters": [
				"bun",
				"deno",
				"ts-node",
				"tsx",
				"node"
			],
			"aliases": ["ts"]
		},
		{
			"name": "TypeSpec",
			"type": "programming",
			"extensions": [".tsp"],
			"aliases": ["tsp"]
		},
		{
			"name": "Typst",
			"type": "programming",
			"extensions": [".typ"],
			"aliases": ["typ"]
		},
		{
			"name": "Unified Parallel C",
			"type": "programming",
			"group": "C",
			"extensions": [".upc"]
		},
		{
			"name": "Unity3D Asset",
			"type": "data",
			"extensions": [
				".anim",
				".asset",
				".mask",
				".mat",
				".meta",
				".prefab",
				".unity"
			]
		},
		{
			"name": "Unix Assembly",
			"type": "programming",
			"group": "Assembly",
			"extensions": [".s", ".ms"],
			"aliases": [
				"gas",
				"gnu asm",
				"unix asm"
			]
		},
		{
			"name": "Uno",
			"type": "programming",
			"extensions": [".uno"]
		},
		{
			"name": "UnrealScript",
			"type": "programming",
			"extensions": [".uc"]
		},
		{
			"name": "Untyped Plutus Core",
			"type": "programming",
			"extensions": [".uplc"]
		},
		{
			"name": "UrWeb",
			"type": "programming",
			"extensions": [".ur", ".urs"],
			"aliases": ["Ur/Web", "Ur"]
		},
		{
			"name": "V",
			"type": "programming",
			"extensions": [".v"],
			"aliases": ["vlang"]
		},
		{
			"name": "VBA",
			"type": "programming",
			"extensions": [
				".bas",
				".cls",
				".frm",
				".vba"
			],
			"aliases": ["visual basic for applications"]
		},
		{
			"name": "VBScript",
			"type": "programming",
			"extensions": [".vbs"]
		},
		{
			"name": "VCL",
			"type": "programming",
			"extensions": [".vcl"]
		},
		{
			"name": "VHDL",
			"type": "programming",
			"extensions": [
				".vhdl",
				".vhd",
				".vhf",
				".vhi",
				".vho",
				".vhs",
				".vht",
				".vhw"
			]
		},
		{
			"name": "Vala",
			"type": "programming",
			"extensions": [".vala", ".vapi"]
		},
		{
			"name": "Valve Data Format",
			"type": "data",
			"extensions": [".vdf", ".vmf"],
			"aliases": ["keyvalues", "vdf"]
		},
		{
			"name": "Velocity Template Language",
			"type": "markup",
			"extensions": [".vtl"],
			"aliases": ["vtl", "velocity"]
		},
		{
			"name": "Vento",
			"type": "markup",
			"extensions": [".vto"]
		},
		{
			"name": "Verilog",
			"type": "programming",
			"extensions": [".v", ".veo"]
		},
		{
			"name": "Verse",
			"type": "programming",
			"extensions": [".verse"]
		},
		{
			"name": "Vespa Schema Definition",
			"type": "data",
			"extensions": [".sd"],
			"aliases": ["vespa"]
		},
		{
			"name": "Vim Help File",
			"type": "prose",
			"extensions": [".txt"],
			"aliases": ["help", "vimhelp"]
		},
		{
			"name": "Vim Snippet",
			"type": "markup",
			"extensions": [
				".snip",
				".snippet",
				".snippets"
			],
			"aliases": [
				"SnipMate",
				"UltiSnip",
				"UltiSnips",
				"NeoSnippet"
			]
		},
		{
			"name": "Vim script",
			"type": "programming",
			"extensions": [
				".vim",
				".vba",
				".vimrc",
				".vmb"
			],
			"filenames": [
				".exrc",
				".gvimrc",
				".nvimrc",
				".vimrc",
				"_vimrc",
				"gvimrc",
				"nvimrc",
				"vimrc"
			],
			"aliases": [
				"vim",
				"viml",
				"nvim",
				"vimscript"
			]
		},
		{
			"name": "Visual Basic .NET",
			"type": "programming",
			"extensions": [".vb", ".vbhtml"],
			"aliases": [
				"visual basic",
				"vbnet",
				"vb .net",
				"vb.net"
			]
		},
		{
			"name": "Visual Basic 6.0",
			"type": "programming",
			"extensions": [
				".bas",
				".cls",
				".ctl",
				".Dsr",
				".frm"
			],
			"aliases": [
				"vb6",
				"vb 6",
				"visual basic 6",
				"visual basic classic",
				"classic visual basic"
			]
		},
		{
			"name": "Volt",
			"type": "programming",
			"extensions": [".volt"]
		},
		{
			"name": "Vue",
			"type": "markup",
			"extensions": [".vue"]
		},
		{
			"name": "Vyper",
			"type": "programming",
			"extensions": [".vy"]
		},
		{
			"name": "WDL",
			"type": "programming",
			"extensions": [".wdl"],
			"aliases": ["Workflow Description Language"]
		},
		{
			"name": "WGSL",
			"type": "programming",
			"extensions": [".wgsl"]
		},
		{
			"name": "Wavefront Material",
			"type": "data",
			"extensions": [".mtl"]
		},
		{
			"name": "Wavefront Object",
			"type": "data",
			"extensions": [".obj"]
		},
		{
			"name": "Web Ontology Language",
			"type": "data",
			"extensions": [".owl"]
		},
		{
			"name": "WebAssembly",
			"type": "programming",
			"extensions": [".wast", ".wat"],
			"aliases": ["wast", "wasm"]
		},
		{
			"name": "WebAssembly Interface Type",
			"type": "data",
			"extensions": [".wit"],
			"aliases": ["wit"]
		},
		{
			"name": "WebIDL",
			"type": "programming",
			"extensions": [".webidl"]
		},
		{
			"name": "WebVTT",
			"type": "data",
			"extensions": [".vtt"],
			"aliases": ["vtt"]
		},
		{
			"name": "Wget Config",
			"type": "data",
			"group": "INI",
			"filenames": [".wgetrc"],
			"aliases": ["wgetrc"]
		},
		{
			"name": "Whiley",
			"type": "programming",
			"extensions": [".whiley"]
		},
		{
			"name": "Wikitext",
			"type": "prose",
			"extensions": [
				".mediawiki",
				".wiki",
				".wikitext"
			],
			"aliases": ["mediawiki", "wiki"]
		},
		{
			"name": "Win32 Message File",
			"type": "data",
			"extensions": [".mc"]
		},
		{
			"name": "Windows Registry Entries",
			"type": "data",
			"extensions": [".reg"]
		},
		{
			"name": "Witcher Script",
			"type": "programming",
			"extensions": [".ws"]
		},
		{
			"name": "Wolfram Language",
			"type": "programming",
			"extensions": [
				".mathematica",
				".cdf",
				".m",
				".ma",
				".mt",
				".nb",
				".nbp",
				".wl",
				".wls",
				".wlt"
			],
			"interpreters": [
				"wolfram",
				"WolframKernel",
				"wolframscript",
				"math",
				"MathKernel",
				"MathematicaScript",
				"WolframNB",
				"Mathematica"
			],
			"aliases": [
				"mathematica",
				"mma",
				"wolfram",
				"wolfram lang",
				"wl"
			]
		},
		{
			"name": "Wollok",
			"type": "programming",
			"extensions": [".wlk"]
		},
		{
			"name": "World of Warcraft Addon Data",
			"type": "data",
			"extensions": [".toc"]
		},
		{
			"name": "Wren",
			"type": "programming",
			"extensions": [".wren"],
			"aliases": ["wrenlang"]
		},
		{
			"name": "X BitMap",
			"type": "data",
			"group": "C",
			"extensions": [".xbm"],
			"aliases": ["xbm"]
		},
		{
			"name": "X Font Directory Index",
			"type": "data",
			"filenames": [
				"encodings.dir",
				"fonts.alias",
				"fonts.dir",
				"fonts.scale"
			]
		},
		{
			"name": "X PixMap",
			"type": "data",
			"group": "C",
			"extensions": [".xpm", ".pm"],
			"aliases": ["xpm"]
		},
		{
			"name": "X10",
			"type": "programming",
			"extensions": [".x10"],
			"aliases": ["xten"]
		},
		{
			"name": "XC",
			"type": "programming",
			"extensions": [".xc"]
		},
		{
			"name": "XCompose",
			"type": "data",
			"filenames": [
				".XCompose",
				"XCompose",
				"xcompose"
			]
		},
		{
			"name": "XML",
			"type": "data",
			"extensions": [
				".xml",
				".adml",
				".admx",
				".ant",
				".axaml",
				".axml",
				".builds",
				".ccproj",
				".ccxml",
				".clixml",
				".cproject",
				".cscfg",
				".csdef",
				".csl",
				".csproj",
				".ct",
				".depproj",
				".dita",
				".ditamap",
				".ditaval",
				".dll.config",
				".dotsettings",
				".filters",
				".fsproj",
				".fxml",
				".glade",
				".gml",
				".gmx",
				".gpx",
				".grxml",
				".gst",
				".hzp",
				".icls",
				".iml",
				".ivy",
				".jelly",
				".jsproj",
				".kml",
				".launch",
				".mdpolicy",
				".meta4",
				".mjml",
				".mm",
				".mod",
				".mojo",
				".mxml",
				".natvis",
				".ncl",
				".ndproj",
				".nproj",
				".nuspec",
				".odd",
				".osm",
				".pkgproj",
				".pluginspec",
				".proj",
				".props",
				".ps1xml",
				".psc1",
				".pt",
				".pubxml",
				".qhelp",
				".rbxmx",
				".rdf",
				".res",
				".resx",
				".rs",
				".rss",
				".sch",
				".scxml",
				".sfproj",
				".shproj",
				".slnx",
				".srdf",
				".storyboard",
				".sublime-snippet",
				".sw",
				".targets",
				".tml",
				".ts",
				".tsx",
				".typ",
				".ui",
				".urdf",
				".ux",
				".vbproj",
				".vcxproj",
				".vsixmanifest",
				".vssettings",
				".vstemplate",
				".vxml",
				".wixproj",
				".workflow",
				".wsdl",
				".wsf",
				".wxi",
				".wxl",
				".wxs",
				".x3d",
				".xacro",
				".xaml",
				".xib",
				".xlf",
				".xliff",
				".xmi",
				".xml.dist",
				".xmp",
				".xproj",
				".xsd",
				".xspec",
				".xul",
				".zcml"
			],
			"filenames": [
				".classpath",
				".cproject",
				".project",
				"App.config",
				"NuGet.config",
				"Settings.StyleCop",
				"Web.Debug.config",
				"Web.Release.config",
				"Web.config",
				"packages.config"
			],
			"aliases": [
				"rss",
				"xsd",
				"wsdl"
			]
		},
		{
			"name": "XML Property List",
			"type": "data",
			"group": "XML",
			"extensions": [
				".plist",
				".stTheme",
				".tmCommand",
				".tmLanguage",
				".tmPreferences",
				".tmSnippet",
				".tmTheme"
			]
		},
		{
			"name": "XPages",
			"type": "data",
			"extensions": [".xsp-config", ".xsp.metadata"]
		},
		{
			"name": "XProc",
			"type": "programming",
			"extensions": [".xpl", ".xproc"]
		},
		{
			"name": "XQuery",
			"type": "programming",
			"extensions": [
				".xquery",
				".xq",
				".xql",
				".xqm",
				".xqy"
			]
		},
		{
			"name": "XS",
			"type": "programming",
			"extensions": [".xs"]
		},
		{
			"name": "XSLT",
			"type": "programming",
			"extensions": [".xslt", ".xsl"],
			"aliases": ["xsl"]
		},
		{
			"name": "Xmake",
			"type": "programming",
			"filenames": ["xmake.lua"]
		},
		{
			"name": "Xojo",
			"type": "programming",
			"extensions": [
				".xojo_code",
				".xojo_menu",
				".xojo_report",
				".xojo_script",
				".xojo_toolbar",
				".xojo_window"
			]
		},
		{
			"name": "Xonsh",
			"type": "programming",
			"extensions": [".xsh"]
		},
		{
			"name": "Xtend",
			"type": "programming",
			"extensions": [".xtend"]
		},
		{
			"name": "YAML",
			"type": "data",
			"extensions": [
				".yml",
				".mir",
				".reek",
				".rviz",
				".sublime-syntax",
				".syntax",
				".yaml",
				".yaml-tmlanguage",
				".yaml.sed",
				".yml.mysql"
			],
			"filenames": [
				".clang-format",
				".clang-tidy",
				".clangd",
				".eslintrc",
				".gemrc",
				".releaserc",
				"CITATION.cff",
				"glide.lock",
				"pixi.lock",
				"yarn.lock"
			],
			"aliases": ["yml"]
		},
		{
			"name": "YANG",
			"type": "data",
			"extensions": [".yang"]
		},
		{
			"name": "YARA",
			"type": "programming",
			"extensions": [".yar", ".yara"]
		},
		{
			"name": "YASnippet",
			"type": "markup",
			"extensions": [".yasnippet"],
			"aliases": ["snippet", "yas"]
		},
		{
			"name": "Yacc",
			"type": "programming",
			"extensions": [
				".y",
				".yacc",
				".yy"
			]
		},
		{
			"name": "Yul",
			"type": "programming",
			"extensions": [".yul"]
		},
		{
			"name": "ZAP",
			"type": "programming",
			"extensions": [".zap", ".xzap"]
		},
		{
			"name": "ZIL",
			"type": "programming",
			"extensions": [".zil", ".mud"]
		},
		{
			"name": "Zeek",
			"type": "programming",
			"extensions": [".zeek", ".bro"],
			"aliases": ["bro"]
		},
		{
			"name": "ZenScript",
			"type": "programming",
			"extensions": [".zs"]
		},
		{
			"name": "Zephir",
			"type": "programming",
			"extensions": [".zep"]
		},
		{
			"name": "Zig",
			"type": "programming",
			"extensions": [".zig", ".zig.zon"]
		},
		{
			"name": "Zimpl",
			"type": "programming",
			"extensions": [
				".zimpl",
				".zmpl",
				".zpl"
			]
		},
		{
			"name": "Zmodel",
			"type": "data",
			"extensions": [".zmodel"]
		},
		{
			"name": "cURL Config",
			"type": "data",
			"group": "INI",
			"filenames": [".curlrc", "_curlrc"],
			"aliases": ["curlrc"]
		},
		{
			"name": "crontab",
			"type": "data",
			"filenames": ["crontab"],
			"aliases": ["cron", "cron table"]
		},
		{
			"name": "desktop",
			"type": "data",
			"group": "INI",
			"extensions": [".desktop", ".desktop.in"]
		},
		{
			"name": "dircolors",
			"type": "data",
			"extensions": [".dircolors"],
			"filenames": [
				".dir_colors",
				".dircolors",
				"DIR_COLORS",
				"_dir_colors",
				"_dircolors",
				"dir_colors"
			]
		},
		{
			"name": "eC",
			"type": "programming",
			"extensions": [".ec", ".eh"]
		},
		{
			"name": "edn",
			"type": "data",
			"extensions": [".edn"]
		},
		{
			"name": "fish",
			"type": "programming",
			"group": "Shell",
			"extensions": [".fish"],
			"interpreters": ["fish"]
		},
		{
			"name": "hoon",
			"type": "programming",
			"extensions": [".hoon"]
		},
		{
			"name": "iCalendar",
			"type": "data",
			"extensions": [".ics", ".ical"],
			"aliases": ["iCal"]
		},
		{
			"name": "jq",
			"type": "programming",
			"extensions": [".jq"],
			"interpreters": [
				"gojq",
				"jaq",
				"jq",
				"jqjq",
				"jqq",
				"query-json"
			]
		},
		{
			"name": "kvlang",
			"type": "markup",
			"extensions": [".kv"]
		},
		{
			"name": "mIRC Script",
			"type": "programming",
			"extensions": [".mrc"]
		},
		{
			"name": "mcfunction",
			"type": "programming",
			"extensions": [".mcfunction"]
		},
		{
			"name": "mdsvex",
			"type": "markup",
			"extensions": [".svx"]
		},
		{
			"name": "mupad",
			"type": "programming",
			"extensions": [".mu"]
		},
		{
			"name": "nanorc",
			"type": "data",
			"group": "INI",
			"extensions": [".nanorc"],
			"filenames": [".nanorc", "nanorc"]
		},
		{
			"name": "nesC",
			"type": "programming",
			"extensions": [".nc"]
		},
		{
			"name": "ooc",
			"type": "programming",
			"extensions": [".ooc"]
		},
		{
			"name": "pkg-config",
			"type": "data",
			"extensions": [".pc", ".pc.in"],
			"aliases": ["pkgconf"]
		},
		{
			"name": "q",
			"type": "programming",
			"extensions": [".q"]
		},
		{
			"name": "reStructuredText",
			"type": "prose",
			"extensions": [
				".rst",
				".rest",
				".rest.txt",
				".rst.txt"
			],
			"aliases": ["rst"]
		},
		{
			"name": "sed",
			"type": "programming",
			"extensions": [".sed"],
			"interpreters": [
				"gsed",
				"minised",
				"sed",
				"ssed"
			]
		},
		{
			"name": "templ",
			"type": "markup",
			"extensions": [".templ"]
		},
		{
			"name": "ucode",
			"type": "programming",
			"extensions": [".uc"],
			"interpreters": ["ucode"]
		},
		{
			"name": "vCard",
			"type": "data",
			"extensions": [".vcf"],
			"aliases": ["virtual contact file", "electronic business card"]
		},
		{
			"name": "wisp",
			"type": "programming",
			"extensions": [".wisp"]
		},
		{
			"name": "xBase",
			"type": "programming",
			"extensions": [
				".prg",
				".ch",
				".prw"
			],
			"aliases": [
				"advpl",
				"clipper",
				"foxpro"
			]
		}
	]
};
// src/registry.ts
/**
* The language and file-format support registry: the one place that says what a file is
* and what CodeAtlas does with it. ArchLens ships a bundled copy (skills/archlens/scripts/
* inventory.mjs), checked to be identical to this build.
*
* Identification data (names, extensions, filenames, interpreters) comes from GitHub
* Linguist v9.7.0 (MIT, data/LINGUIST-LICENSE), so recognition is not limited to popular
* languages. Categories and analysers are this project's own overlay.
*/
var LINGUIST_VERSION = linguist_default.version;
/** Category for languages whose Linguist type does not say enough. Names are Linguist's. */
var CATEGORY_OVERRIDES = {};
var put = (c, names) => {
	for (const n of names) CATEGORY_OVERRIDES[n] = c;
};
put("scripting", [
	"Shell",
	"PowerShell",
	"Batchfile",
	"fish",
	"Tcsh",
	"AppleScript",
	"AutoHotkey",
	"AutoIt",
	"Awk",
	"sed",
	"Tcl",
	"Vim script",
	"Nushell",
	"Xonsh",
	"Elvish",
	"ShellSession"
]);
put("database", [
	"SQL",
	"PLSQL",
	"PLpgSQL",
	"TSQL",
	"SQLPL",
	"Cypher",
	"SPARQL",
	"PigLatin",
	"HiveQL",
	"EdgeQL",
	"Prisma",
	"OverpassQL",
	"JSONiq",
	"Kusto"
]);
put("stylesheet", [
	"CSS",
	"SCSS",
	"Sass",
	"Less",
	"Stylus",
	"PostCSS"
]);
put("template", [
	"Jinja",
	"HTML+ERB",
	"JavaScript+ERB",
	"Handlebars",
	"Mustache",
	"Liquid",
	"Blade",
	"HTML+EEX",
	"Twig",
	"Smarty",
	"Pug",
	"Haml",
	"Slim",
	"Go Template",
	"Velocity Template Language",
	"FreeMarker",
	"Nunjucks",
	"HTML+Razor",
	"Java Template Engine",
	"StringTemplate",
	"Closure Templates",
	"Terraform Template",
	"HTML+PHP"
]);
put("config", [
	"YAML",
	"TOML",
	"INI",
	"Java Properties",
	"EditorConfig",
	"Git Config",
	"Git Attributes",
	"Ignore List",
	"Nginx",
	"ApacheConf",
	"SSH Config",
	"Dotenv",
	"HOCON",
	"XML Property List",
	"Option List",
	"JSON with Comments",
	"JSON5",
	"Browserslist",
	"Caddyfile",
	"Readline Config",
	"Windows Registry Entries",
	"SELinux Policy",
	"Robots Exclusion Rules",
	"Procfile"
]);
put("build", [
	"Makefile",
	"CMake",
	"Gradle",
	"Gradle Kotlin DSL",
	"Maven POM",
	"Meson",
	"Starlark",
	"Ninja",
	"Ant Build System",
	"QMake",
	"Just",
	"M4Sugar",
	"Earthly",
	"Nix",
	"Go Module",
	"Go Workspace",
	"Go Checksums",
	"Gemfile.lock",
	"Pip Requirements",
	"Module Management System",
	"Inno Setup",
	"NSIS",
	"Linux Kernel Module"
]);
put("infrastructure", [
	"HCL",
	"Bicep",
	"Puppet",
	"Jsonnet",
	"CUE",
	"Dhall",
	"Pkl",
	"Nickel",
	"Dockerfile",
	"Open Policy Agent",
	"Cloud Firestore Security Rules"
]);
put("api", [
	"Protocol Buffer",
	"Thrift",
	"GraphQL",
	"Cap'n Proto",
	"RAML",
	"API Blueprint",
	"WebIDL",
	"Smithy",
	"OASv2-json",
	"OASv3-json",
	"OASv2-yaml",
	"OASv3-yaml",
	"Avro IDL",
	"ASN.1",
	"WebAssembly Interface Type",
	"Protocol Buffer Text Format"
]);
put("markup", [
	"XML",
	"XSLT",
	"SVG",
	"HTML"
]);
put("notebook", ["Jupyter Notebook"]);
put("docs", [
	"TeX",
	"Roff",
	"Roff Manpage",
	"Texinfo"
]);
var TYPE_CATEGORY = {
	programming: "programming",
	markup: "markup",
	data: "data",
	prose: "docs"
};
/** Languages the declaration extractor has rules for (see products/codeatlas/core/src/indexer/extract/declarations.ts). */
var DECLARATION_LANGUAGES = [
	"Python",
	"Cython",
	"Starlark",
	"Mojo",
	"Go",
	"Java",
	"Kotlin",
	"Scala",
	"Groovy",
	"Gradle",
	"Gradle Kotlin DSL",
	"Apex",
	"C#",
	"Visual Basic .NET",
	"VBA",
	"VBScript",
	"Visual Basic 6.0",
	"F#",
	"OCaml",
	"Rust",
	"C",
	"C++",
	"Objective-C",
	"Objective-C++",
	"Cuda",
	"Swift",
	"Dart",
	"Ruby",
	"Crystal",
	"PHP",
	"Hack",
	"Perl",
	"Raku",
	"Lua",
	"Luau",
	"Elixir",
	"Erlang",
	"Haskell",
	"Elm",
	"PureScript",
	"Clojure",
	"Common Lisp",
	"Emacs Lisp",
	"Scheme",
	"Racket",
	"R",
	"Julia",
	"Fortran",
	"Fortran Free Form",
	"COBOL",
	"Assembly",
	"Unix Assembly",
	"Motorola 68K Assembly",
	"PowerShell",
	"Shell",
	"fish",
	"Tcl",
	"Vim script",
	"Pascal",
	"Ada",
	"Zig",
	"Nim",
	"D",
	"Solidity",
	"Haxe",
	"ActionScript",
	"Prolog",
	"ABAP",
	"Gleam",
	"V",
	"Odin",
	"Vala",
	"GDScript",
	"Awk",
	"Batchfile",
	"JCL",
	"RPGLE",
	"Smalltalk",
	"Verilog",
	"SystemVerilog",
	"VHDL",
	"MATLAB",
	"Nix",
	"Puppet",
	"Bicep",
	"Jsonnet"
];
/**
* Languages the tree-sitter syntax layer parses (packages/syntax/src/languages.ts; a CodeAtlas
* test checks the two lists are the same).
*/
var SYNTAX_LANGUAGES = [
	"Python",
	"Starlark",
	"Go",
	"Java",
	"C#",
	"C",
	"C++",
	"Objective-C",
	"Cuda",
	"Rust",
	"PHP",
	"Ruby",
	"Scala",
	"Kotlin",
	"Gradle Kotlin DSL",
	"Groovy",
	"Gradle",
	"Lua",
	"Elixir",
	"Haskell",
	"Julia",
	"OCaml",
	"F#",
	"Zig",
	"Solidity",
	"Shell",
	"PowerShell",
	"Puppet",
	"Bicep",
	"HCL"
];
var ANALYSER_BY_LANGUAGE = {
	TypeScript: "ts-compiler",
	TSX: "ts-compiler",
	JavaScript: "ts-compiler",
	JSON: "json",
	"JSON with Comments": "json",
	"Jupyter Notebook": "json",
	"OASv2-json": "json",
	"OASv3-json": "json",
	YAML: "yaml",
	"OASv2-yaml": "yaml",
	"OASv3-yaml": "yaml",
	TOML: "toml",
	XML: "xml",
	"Maven POM": "xml",
	"Ant Build System": "xml",
	"XML Property List": "xml",
	XSLT: "xml",
	SVG: "xml",
	INI: "ini",
	"Java Properties": "ini",
	EditorConfig: "ini",
	"Git Config": "ini",
	Dotenv: "ini",
	Dockerfile: "dockerfile",
	Makefile: "make",
	CMake: "cmake",
	HCL: "hcl",
	SQL: "sql",
	PLSQL: "sql",
	PLpgSQL: "sql",
	TSQL: "sql",
	SQLPL: "sql",
	Prisma: "prisma",
	Markdown: "markdown",
	MDX: "markdown",
	reStructuredText: "doc-headings",
	AsciiDoc: "doc-headings",
	Org: "doc-headings",
	Pod: "doc-headings",
	"Pod 6": "doc-headings",
	TeX: "doc-headings",
	"Protocol Buffer": "idl",
	Thrift: "idl",
	GraphQL: "idl",
	"Cap'n Proto": "idl",
	"Avro IDL": "idl",
	Smithy: "idl",
	WebIDL: "idl",
	CSV: "delimited",
	TSV: "delimited",
	"Graphviz (DOT)": "dot",
	"Gettext Catalog": "gettext"
};
for (const l of SYNTAX_LANGUAGES) ANALYSER_BY_LANGUAGE[l] = "syntax";
for (const l of DECLARATION_LANGUAGES) ANALYSER_BY_LANGUAGE[l] ??= "declarations";
/** Formats Linguist does not list that repositories commonly contain. */
var EXTRA = [
	{
		name: "Liquibase changelog",
		type: "data"
	},
	{
		name: "Git LFS pointer",
		type: "data"
	},
	{
		name: "PEM certificate or key",
		type: "data",
		extensions: [
			".pem",
			".crt",
			".cer",
			".csr",
			".key"
		]
	},
	{
		name: "Keystore",
		type: "data",
		extensions: [
			".jks",
			".p12",
			".pfx",
			".keystore",
			".truststore"
		]
	},
	{
		name: "EEx",
		type: "markup",
		extensions: [".eex"]
	},
	{
		name: "Apple strings",
		type: "data",
		extensions: [".strings", ".stringsdict"]
	},
	{
		name: "Xcode configuration",
		type: "data",
		extensions: [".xcconfig"]
	},
	{
		name: "Xcode project",
		type: "data",
		extensions: [".pbxproj"]
	},
	{
		name: "Java service provider list",
		type: "data"
	},
	{
		name: "Play routes",
		type: "data"
	}
].filter((e) => !linguist_default.languages.some((l) => l.name === e.name));
var ALL = [...linguist_default.languages, ...EXTRA].map((l) => ({
	name: l.name,
	linguistType: EXTRA.includes(l) ? "nexora" : l.type,
	category: CATEGORY_OVERRIDES[l.name] ?? TYPE_CATEGORY[l.type],
	group: l.group,
	extensions: l.extensions ?? [],
	filenames: l.filenames ?? [],
	interpreters: l.interpreters ?? [],
	aliases: l.aliases ?? [],
	analyser: ANALYSER_BY_LANGUAGE[l.name] ?? "text"
}));
var LANGUAGES = ALL;
var BY_NAME = new Map(ALL.map((l) => [l.name, l]));
function categoryOf(language) {
	return BY_NAME.get(language)?.category ?? "unknown";
}
// src/roles.ts
var B = "(^|/)";
/** First match wins, so specific rules come before generic ones. */
var RULES = [
	{
		id: "docker-compose",
		label: "Docker Compose",
		group: "container",
		path: new RegExp(`${B}(docker-compose|compose)[^/]*\\.ya?ml$`, "i")
	},
	{
		id: "dockerfile",
		label: "Dockerfile / Containerfile",
		group: "container",
		path: new RegExp(`${B}((Docker|Container)file[^/]*|[^/]+\\.(dockerfile|containerfile))$`, "i")
	},
	{
		id: "dockerignore",
		label: ".dockerignore",
		group: "container",
		path: new RegExp(`${B}\\.dockerignore$`)
	},
	{
		id: "devcontainer",
		label: "Dev container",
		group: "container",
		path: new RegExp(`${B}\\.devcontainer(/|\\.json$)`)
	},
	{
		id: "github-actions",
		label: "GitHub Actions workflow",
		group: "ci",
		path: new RegExp(`${B}\\.github/workflows/[^/]+\\.ya?ml$`)
	},
	{
		id: "github-action",
		label: "GitHub Action definition",
		group: "ci",
		path: new RegExp(`${B}action\\.ya?ml$`),
		content: /^\s*runs:\s*$/m
	},
	{
		id: "gitlab-ci",
		label: "GitLab CI",
		group: "ci",
		path: new RegExp(`${B}\\.gitlab-ci\\.ya?ml$|${B}\\.gitlab/ci/.+\\.ya?ml$`)
	},
	{
		id: "jenkins",
		label: "Jenkinsfile",
		group: "ci",
		path: new RegExp(`${B}Jenkinsfile[^/]*$`)
	},
	{
		id: "circleci",
		label: "CircleCI",
		group: "ci",
		path: new RegExp(`${B}\\.circleci/[^/]+\\.ya?ml$`)
	},
	{
		id: "azure-pipelines",
		label: "Azure Pipelines",
		group: "ci",
		path: new RegExp(`${B}(azure-pipelines[^/]*\\.ya?ml|\\.azure-pipelines/.+\\.ya?ml)$`)
	},
	{
		id: "bitbucket",
		label: "Bitbucket Pipelines",
		group: "ci",
		path: new RegExp(`${B}bitbucket-pipelines\\.ya?ml$`)
	},
	{
		id: "travis",
		label: "Travis CI",
		group: "ci",
		path: new RegExp(`${B}\\.travis\\.ya?ml$`)
	},
	{
		id: "other-ci",
		label: "Other CI (Drone, Buildkite, Woodpecker, AppVeyor, Cirrus, Tekton, Argo)",
		group: "ci",
		path: new RegExp(`${B}(\\.drone\\.ya?ml|\\.buildkite/.+|\\.woodpecker(\\.ya?ml|/.+)|appveyor\\.ya?ml|\\.cirrus\\.ya?ml|\\.tekton/.+\\.ya?ml|cloudbuild\\.ya?ml|buildspec\\.ya?ml|codemagic\\.ya?ml|\\.pre-commit-config\\.yaml)$`)
	},
	{
		id: "helm",
		label: "Helm chart",
		group: "orchestration",
		path: new RegExp(`${B}Chart\\.ya?ml$`)
	},
	{
		id: "helm-template",
		label: "Helm template",
		group: "orchestration",
		path: /(^|\/)templates\/[^/]+\.(ya?ml|tpl)$/,
		content: /\{\{[-\s]*(\.Values|\.Release|include|template|define)\b/
	},
	{
		id: "kustomize",
		label: "Kustomize",
		group: "orchestration",
		path: new RegExp(`${B}kustomization\\.ya?ml$`)
	},
	{
		id: "skaffold",
		label: "Skaffold",
		group: "orchestration",
		path: new RegExp(`${B}skaffold[^/]*\\.ya?ml$`)
	},
	{
		id: "kubernetes",
		label: "Kubernetes manifest",
		group: "orchestration",
		path: /\.(ya?ml|json)$/i,
		content: /^\s*"?apiVersion"?\s*:\s*"?[\w./-]+"?\s*,?\s*$[\s\S]*^\s*"?kind"?\s*:|^\s*"?kind"?\s*:\s*"?\w+"?\s*,?\s*$[\s\S]*^\s*"?apiVersion"?\s*:/m
	},
	{
		id: "terraform",
		label: "Terraform / OpenTofu",
		group: "iac",
		path: /\.(tf|tofu|tf\.json)$/i
	},
	{
		id: "terraform-vars",
		label: "Terraform variables",
		group: "iac",
		path: /\.tfvars(\.json)?$/i
	},
	{
		id: "terragrunt",
		label: "Terragrunt",
		group: "iac",
		path: new RegExp(`${B}terragrunt\\.hcl$`)
	},
	{
		id: "bicep",
		label: "Bicep",
		group: "iac",
		path: /\.bicep(param)?$/i
	},
	{
		id: "cloudformation",
		label: "AWS CloudFormation / SAM",
		group: "iac",
		path: /\.(ya?ml|json|template)$/i,
		content: /AWSTemplateFormatVersion|Transform:\s*AWS::Serverless|"AWSTemplateFormatVersion"/
	},
	{
		id: "serverless",
		label: "Serverless Framework",
		group: "iac",
		path: new RegExp(`${B}serverless\\.ya?ml$`)
	},
	{
		id: "pulumi",
		label: "Pulumi",
		group: "iac",
		path: new RegExp(`${B}Pulumi(\\.[\\w-]+)?\\.ya?ml$`)
	},
	{
		id: "ansible",
		label: "Ansible",
		group: "iac",
		path: /(^|\/)(playbooks?\/.+|roles\/[^/]+\/(tasks|handlers|defaults|vars|meta)\/[^/]+|site|playbook)\.ya?ml$|(^|\/)ansible\.cfg$|(^|\/)(inventory|hosts)(\.ini|\.ya?ml)?$/
	},
	{
		id: "ansible-play",
		label: "Ansible",
		group: "iac",
		path: /\.ya?ml$/,
		content: /^-\s+(hosts|import_playbook):/m
	},
	{
		id: "puppet",
		label: "Puppet",
		group: "iac",
		path: /\.pp$/
	},
	{
		id: "vagrant",
		label: "Vagrantfile",
		group: "iac",
		path: new RegExp(`${B}Vagrantfile$`)
	},
	{
		id: "nix",
		label: "Nix",
		group: "iac",
		path: /\.nix$|(^|\/)flake\.lock$/
	},
	{
		id: "packer",
		label: "Packer",
		group: "iac",
		path: /\.pkr\.(hcl|json)$/
	},
	{
		id: "nomad",
		label: "Nomad job",
		group: "iac",
		path: /\.nomad(\.hcl)?$/
	},
	{
		id: "lockfile",
		label: "Lockfile",
		group: "lockfile",
		path: new RegExp(`${B}(package-lock\\.json|npm-shrinkwrap\\.json|yarn\\.lock|pnpm-lock\\.yaml|bun\\.lockb?|deno\\.lock|Cargo\\.lock|go\\.sum|go\\.work\\.sum|Gemfile\\.lock|poetry\\.lock|Pipfile\\.lock|uv\\.lock|pdm\\.lock|composer\\.lock|mix\\.lock|packages\\.lock\\.json|gradle\\.lockfile|Podfile\\.lock|Package\\.resolved|pubspec\\.lock|flake\\.lock|conan\\.lock|vcpkg-lock\\.json|Manifest\\.toml|rebar\\.lock|stack\\.yaml\\.lock|cabal\\.project\\.freeze|pixi\\.lock|renv\\.lock|shard\\.lock|.terraform\\.lock\\.hcl)$`)
	},
	{
		id: "npm-package",
		label: "npm package.json",
		group: "dependencies",
		path: new RegExp(`${B}package\\.json$`)
	},
	{
		id: "maven",
		label: "Maven POM",
		group: "dependencies",
		path: new RegExp(`${B}pom\\.xml$`)
	},
	{
		id: "gradle",
		label: "Gradle build",
		group: "build",
		path: /\.gradle(\.kts)?$|(^|\/)gradle\.properties$|(^|\/)gradle\/libs\.versions\.toml$/
	},
	{
		id: "sbt",
		label: "sbt build",
		group: "build",
		path: /\.sbt$|(^|\/)project\/[^/]+\.scala$/
	},
	{
		id: "go-module",
		label: "Go module",
		group: "dependencies",
		path: new RegExp(`${B}go\\.(mod|work)$`)
	},
	{
		id: "cargo",
		label: "Cargo manifest",
		group: "dependencies",
		path: new RegExp(`${B}Cargo\\.toml$`)
	},
	{
		id: "python-deps",
		label: "Python packaging",
		group: "dependencies",
		path: new RegExp(`${B}(pyproject\\.toml|setup\\.py|setup\\.cfg|Pipfile|requirements[^/]*\\.(txt|in)|environment\\.ya?ml|conda\\.ya?ml|tox\\.ini|MANIFEST\\.in)$`)
	},
	{
		id: "ruby-deps",
		label: "Ruby gems",
		group: "dependencies",
		path: new RegExp(`${B}(Gemfile|[^/]+\\.gemspec|\\.ruby-version)$`)
	},
	{
		id: "php-deps",
		label: "Composer",
		group: "dependencies",
		path: new RegExp(`${B}composer\\.json$`)
	},
	{
		id: "dotnet-project",
		label: ".NET project or solution",
		group: "dependencies",
		path: /\.(csproj|fsproj|vbproj|vcxproj|sln|slnx|props|targets)$|(^|\/)(packages\.config|nuget\.config|global\.json|Directory\.Packages\.props)$/i
	},
	{
		id: "elixir-deps",
		label: "Elixir/Erlang project",
		group: "dependencies",
		path: new RegExp(`${B}(mix\\.exs|rebar\\.config|[^/]+\\.app\\.src|erlang\\.mk)$`)
	},
	{
		id: "haskell-deps",
		label: "Haskell project",
		group: "dependencies",
		path: /\.cabal$|(^|\/)(stack\.yaml|cabal\.project|package\.yaml)$/
	},
	{
		id: "jvm-other",
		label: "Clojure/Leiningen project",
		group: "dependencies",
		path: new RegExp(`${B}(project\\.clj|deps\\.edn|build\\.boot|shadow-cljs\\.edn)$`)
	},
	{
		id: "swift-deps",
		label: "Swift/CocoaPods/Carthage",
		group: "dependencies",
		path: new RegExp(`${B}(Package\\.swift|Podfile|Cartfile|[^/]+\\.podspec)$`)
	},
	{
		id: "dart-deps",
		label: "Dart/Flutter pubspec",
		group: "dependencies",
		path: new RegExp(`${B}pubspec\\.ya?ml$`)
	},
	{
		id: "other-deps",
		label: "Other dependency manifest",
		group: "dependencies",
		path: new RegExp(`${B}(DESCRIPTION|NAMESPACE|Project\\.toml|cpanfile|Makefile\\.PL|Build\\.PL|dist\\.ini|[^/]+\\.rockspec|[^/]+\\.nimble|build\\.zig(\\.zon)?|dune-project|dune|[^/]+\\.opam|shard\\.yml|vcpkg\\.json|conanfile\\.(txt|py)|deno\\.jsonc?|bower\\.json|v\\.mod|gleam\\.toml|elm\\.json|spago\\.(dhall|ya?ml)|bsconfig\\.json|rescript\\.json|esy\\.json|[^/]+\\.csproj\\.user|jsr\\.json|requirements\\.R)$`)
	},
	{
		id: "make",
		label: "Makefile",
		group: "build",
		path: new RegExp(`${B}(GNUmakefile|[Mm]akefile(\\.[\\w.]+)?|BSDmakefile|[^/]+\\.(mk|mak|make))$`)
	},
	{
		id: "cmake",
		label: "CMake",
		group: "build",
		path: new RegExp(`${B}CMakeLists\\.txt$|\\.cmake(\\.in)?$|${B}CMakePresets\\.json$`)
	},
	{
		id: "bazel",
		label: "Bazel / Buck / Pants",
		group: "build",
		path: new RegExp(`${B}(BUILD|BUILD\\.bazel|WORKSPACE|WORKSPACE\\.bazel|MODULE\\.bazel|[^/]+\\.bzl|\\.bazelrc|\\.bazelversion|BUCK|TARGETS|pants\\.toml|BUILD\\.pants)$`)
	},
	{
		id: "other-build",
		label: "Other build file",
		group: "build",
		path: new RegExp(`${B}(meson\\.build|meson_options\\.txt|build\\.ninja|SConstruct|SConscript|Rakefile|[^/]+\\.rake|justfile|Justfile|Taskfile\\.ya?ml|build\\.xml|configure\\.ac|configure\\.in|Makefile\\.am|Makefile\\.in|Earthfile|Gruntfile\\.[jt]s|gulpfile\\.[jt]s|Brewfile|Snakefile|[^/]+\\.pro|[^/]+\\.pri|Kbuild|Kconfig|build\\.sh|build\\.ps1|build\\.cmd|build\\.bat|mvnw|gradlew|[^/]+\\.spec)$`)
	},
	{
		id: "js-build",
		label: "JavaScript build/test tool config",
		group: "build",
		path: /(^|\/)(vite|vitest|webpack|rollup|next|nuxt|svelte|astro|tsup|esbuild|playwright|jest|wxt|drizzle|babel|postcss|tailwind|metro|karma|cypress|remix|turbo|nx|lerna|rspack|rsbuild|quasar|angular|ember-cli-build|vue)\.?(config)?\.[cm]?[jt]s(on)?$|(^|\/)(turbo|nx|lerna|angular|pnpm-workspace)\.(json|ya?ml)$/
	},
	{
		id: "compiler-config",
		label: "Compiler and linter configuration",
		group: "compiler",
		path: /(^|\/)((ts|js)config[^/]*\.json|\.babelrc(\.\w+)?|\.swcrc|\.eslintrc(\.\w+)?|eslint\.config\.[cm]?[jt]s|\.prettierrc(\.\w+)?|prettier\.config\.[cm]?[jt]s|\.stylelintrc(\.\w+)?|\.editorconfig|\.clang-format|\.clang-tidy|\.rustfmt\.toml|rustfmt\.toml|clippy\.toml|\.golangci\.ya?ml|\.rubocop\.ya?ml|\.flake8|\.pylintrc|mypy\.ini|ruff\.toml|\.scalafmt\.conf|detekt\.ya?ml|\.swiftlint\.ya?ml|analysis_options\.yaml|checkstyle\.xml|\.credo\.exs|\.formatter\.exs|biome\.jsonc?|deno\.jsonc?|\.browserslistrc|rust-toolchain(\.toml)?|\.nvmrc|\.node-version|\.tool-versions|\.python-version|\.java-version|\.sdkmanrc|\.hlint\.yaml|\.stylish-haskell\.yaml|\.jshintrc|\.markdownlint[^/]*|\.yamllint[^/]*|\.shellcheckrc|\.luacheckrc|\.luarc\.json|stylua\.toml|\.clangd)$/
	},
	{
		id: "liquibase",
		label: "Liquibase changelog",
		group: "database",
		path: /\.(xml|ya?ml|json|sql)$/i,
		content: /databaseChangeLog|<changeSet\b|--\s*liquibase formatted sql/
	},
	{
		id: "flyway",
		label: "Flyway migration",
		group: "database",
		path: /(^|\/)[VUR]\d+(_\d+)*__[^/]+\.sql$/
	},
	{
		id: "sql-migration",
		label: "Database migration",
		group: "database",
		path: /(^|\/)(migrations?|migrate|db\/migrate|alembic\/versions|schema_migrations|changelogs?|evolutions|sql\/updates?|upgrades?)\/.+\.(sql|py|rb|exs|js|ts|go|php|java|kt|cs|xml|ya?ml)$/i
	},
	{
		id: "orm-schema",
		label: "ORM schema",
		group: "database",
		path: /\.prisma$|(^|\/)db\/(schema|structure)\.(rb|sql)$|(^|\/)schema\.(rb|graphql|sql)$/
	},
	{
		id: "sql-procedure",
		label: "Stored procedures, functions and packages",
		group: "database",
		path: /\.(sql|pls|plb|pks|pkb|pck|prc|fnc|trg|tps|tpb|spc|bdy|plsql|psql|pgsql|tsql)$/i,
		content: /\bcreate\s+(or\s+replace\s+|or\s+alter\s+)?(procedure|proc|function|trigger|package)\b/i
	},
	{
		id: "sql-schema",
		label: "SQL schema and scripts",
		group: "database",
		path: /\.(sql|ddl|dml|mysql|pgsql|psql|tsql|db2|hql|cql|cypher)$/i
	},
	{
		id: "dbt",
		label: "dbt project",
		group: "database",
		path: new RegExp(`${B}(dbt_project|profiles|packages|dependencies)\\.ya?ml$`),
		content: /^\s*(models|profile|packages|config-version|seeds)\s*:/m
	},
	{
		id: "openapi",
		label: "OpenAPI / Swagger",
		group: "api",
		path: /\.(ya?ml|json)$/i,
		content: /^\s*"?(openapi|swagger)"?\s*:\s*["']?\d/m
	},
	{
		id: "asyncapi",
		label: "AsyncAPI",
		group: "api",
		path: /\.(ya?ml|json)$/i,
		content: /^\s*"?asyncapi"?\s*:\s*["']?\d/m
	},
	{
		id: "protobuf",
		label: "Protocol Buffers",
		group: "api",
		path: /\.proto$/i
	},
	{
		id: "thrift",
		label: "Thrift",
		group: "api",
		path: /\.thrift$/i
	},
	{
		id: "graphql",
		label: "GraphQL schema/operations",
		group: "api",
		path: /\.(graphqls?|gql)$/i
	},
	{
		id: "other-idl",
		label: "Other interface definition",
		group: "api",
		path: /\.(capnp|avdl|smithy|webidl|idl|wsdl|raml|apib|fbs|asn1?|wit|aidl)$/i
	},
	{
		id: "json-schema",
		label: "JSON Schema",
		group: "schema",
		path: /\.json$/i,
		content: /"\$schema"\s*:\s*"https?:\/\/json-schema\.org/
	},
	{
		id: "xml-schema",
		label: "XML Schema / DTD",
		group: "schema",
		path: /\.(xsd|dtd|rng|rnc)$/i
	},
	{
		id: "avro",
		label: "Avro schema",
		group: "schema",
		path: /\.avsc$/i
	},
	{
		id: "env-template",
		label: "Environment template",
		group: "env",
		path: /(^|\/)(\.env\.(example|sample|template|dist|defaults)|[^/]*\.env\.(example|sample|template)|env\.(example|sample|template))$/i
	},
	{
		id: "app-config",
		label: "Application configuration",
		group: "config",
		path: /(^|\/)(application|bootstrap)(-[\w-]+)?\.(ya?ml|properties)$|(^|\/)appsettings[^/]*\.json$|(^|\/)(config|conf|settings|etc)\/[^/]+\.(ya?ml|json|toml|ini|conf|cfg|properties|xml|hocon|php|exs)$|\.(conf|cfg|ini|properties|hocon|toml)$|(^|\/)(web|app)\.config$|(^|\/)nginx[^/]*\.conf$|(^|\/)Procfile$|(^|\/)(app|fly|render|vercel|netlify|now|firebase|wrangler)\.(ya?ml|json|toml)$/i
	},
	{
		id: "repo-meta",
		label: "Repository metadata",
		group: "repo",
		path: /(^|\/)(\.gitignore|\.gitattributes|\.gitmodules|\.mailmap|CODEOWNERS|OWNERS(_ALIASES)?|\.github\/[^/]+\.(md|ya?ml)|\.github\/ISSUE_TEMPLATE\/.+|\.github\/PULL_REQUEST_TEMPLATE.*|\.github\/dependabot\.ya?ml|renovate\.json5?|\.renovaterc(\.json)?|\.git-blame-ignore-revs|FUNDING\.ya?ml|\.vscode\/.+|\.idea\/.+|\.fleet\/.+)$/
	},
	{
		id: "adr",
		label: "Architecture decision record",
		group: "docs",
		path: /(^|\/)(adr|adrs|decisions|architecture\/decisions)\/[^/]+\.(md|rst|adoc|txt)$/i
	},
	{
		id: "docs",
		label: "Documentation",
		group: "docs",
		path: /\.(md|markdown|mdx|rst|adoc|asciidoc|org|txt|textile|pod|rdoc|tex|wiki|creole)$|(^|\/)(README|CHANGELOG|CHANGES|HISTORY|NEWS|CONTRIBUTING|AUTHORS|LICEN[CS]E|COPYING|NOTICE|SECURITY|CODE_OF_CONDUCT|INSTALL|UPGRADING|MAINTAINERS)([._-][^/]*)?$/i
	}
];
var INFO = /* @__PURE__ */ new Map();
for (const r of RULES) {
	const cur = INFO.get(r.id);
	const join = (a, b) => a && b ? `${a} | ${b}` : a ?? b;
	INFO.set(r.id, {
		id: r.id,
		label: cur?.label ?? r.label,
		group: cur?.group ?? r.group,
		pathPattern: join(cur?.pathPattern, r.path.source),
		...r.content || cur?.contentPattern ? { contentPattern: join(cur?.contentPattern, r.content?.source) } : {}
	});
}
function roleInfo(id) {
	return INFO.get(id);
}
/**
* The file type of a path, or undefined for ordinary source files. `head` is the first part
* of the text (8 KiB is enough); rules that need content do not match without it.
*/
function roleOf(path, head) {
	for (const r of RULES) {
		if (!r.path.test(path)) continue;
		if (r.content && !(head !== void 0 && r.content.test(head))) continue;
		return INFO.get(r.id);
	}
}
// src/detect.ts
/**
* Identifies a file's language or format from its name, extension, shebang, editor modeline
* and a bounded look at its first bytes. One function, used by CodeAtlas discovery and by the
* ArchLens inventory script, so both products name the same file the same way.
*
* Order: binary signature, Git LFS pointer, exact filename, extension (longest suffix first,
* with content heuristics for extensions several languages share), shebang, modeline, content
* signature, then "unrecognised text". Nothing is dropped: every path gets a classification.
*/
var byFilename = /* @__PURE__ */ new Map();
var byFilenameLower = /* @__PURE__ */ new Map();
var byExt = /* @__PURE__ */ new Map();
var byExtExact = /* @__PURE__ */ new Map();
var byInterpreter = /* @__PURE__ */ new Map();
var byAlias = /* @__PURE__ */ new Map();
var push = (m, k, l) => {
	const list = m.get(k);
	if (!list) m.set(k, [l]);
	else if (!list.includes(l)) list.push(l);
};
for (const l of LANGUAGES) {
	for (const f of l.filenames) {
		push(byFilename, f, l);
		push(byFilenameLower, f.toLowerCase(), l);
	}
	for (const e of l.extensions) {
		push(byExt, e.toLowerCase(), l);
		push(byExtExact, e, l);
	}
	for (const i of l.interpreters) push(byInterpreter, i, l);
	for (const a of [l.name, ...l.aliases]) byAlias.set(a.toLowerCase(), l);
}
/** Extensions Linguist leaves out that are common in real repositories. */
var EXTRA_EXT = {
	".jcl": "JCL",
	".cbl": "COBOL",
	".cpy": "COBOL",
	".ksh": "Shell",
	".env.example": "Dotenv",
	".env.sample": "Dotenv",
	".env.template": "Dotenv",
	".containerfile": "Dockerfile",
	".properties": "Java Properties",
	".conf": "INI",
	".cfg": "INI",
	".tfvars": "HCL",
	".hcl": "HCL",
	".fypp": "Fortran Free Form",
	".xcstrings": "JSON"
};
var EXTRA_FILENAME = {
	Jenkinsfile: "Groovy",
	"go.mod": "Go Module",
	"go.work": "Go Workspace",
	"go.sum": "Go Checksums",
	Podfile: "Ruby",
	Fastfile: "Ruby",
	Brewfile: "Ruby",
	Dangerfile: "Ruby",
	Procfile: "Procfile",
	"requirements.txt": "Pip Requirements",
	".gitkeep": "Text",
	".keep": "Text",
	CODEOWNERS: "Text",
	OWNERS: "YAML",
	OWNERS_ALIASES: "YAML",
	"requirements.in": "Pip Requirements",
	NOTICE: "Text",
	PATENTS: "Text",
	AUTHORS: "Text",
	CONTRIBUTORS: "Text",
	MAINTAINERS: "Text",
	SECURITY_CONTACTS: "Text",
	VERSION: "Text",
	README: "Text",
	".go-version": "Text",
	".node-version": "Text",
	".nvmrc": "Text",
	".python-version": "Text",
	".ruby-version": "Text",
	".mailmap": "Text",
	gitconfig: "Git Config",
	".env.example": "Dotenv"
};
/**
* Which language an extension most often means, when Linguist lists several. Used only after the
* content heuristics below found nothing; the result is labelled inferred with the alternatives.
*/
var PREFERRED = {
	".h": "C",
	".m": "Objective-C",
	".pl": "Perl",
	".pm": "Perl",
	".t": "Perl",
	".sql": "SQL",
	".yml": "YAML",
	".yaml": "YAML",
	".md": "Markdown",
	".ts": "TypeScript",
	".cs": "C#",
	".fs": "F#",
	".r": "R",
	".rs": "Rust",
	".v": "Verilog",
	".json": "JSON",
	".txt": "Text",
	".d": "D",
	".s": "Unix Assembly",
	".asm": "Assembly",
	".inc": "PHP",
	".cls": "TeX",
	".html": "HTML",
	".xml": "XML",
	".php": "PHP",
	".sc": "Scala",
	".ex": "Elixir",
	".pro": "QMake",
	".mod": "Modula-2",
	".bas": "BASIC",
	".cgi": "Shell",
	".fcgi": "Shell",
	".l": "Lex",
	".ms": "Roff",
	".gs": "JavaScript",
	".st": "Smalltalk",
	".lisp": "Common Lisp",
	".sh": "Shell",
	".toml": "TOML",
	".cmd": "Batchfile",
	".mk": "Makefile",
	".properties": "Java Properties",
	".ini": "INI",
	".cfg": "INI",
	".conf": "INI",
	".f": "Fortran",
	".for": "Fortran",
	".lock": "JSON",
	".mm": "Objective-C++",
	".cl": "OpenCL",
	".pp": "Puppet",
	".sch": "Scheme",
	".x": "RPC",
	".i": "SWIG",
	".asc": "AsciiDoc",
	".lp": "Linear Programming",
	".e": "Eiffel",
	".n": "Roff",
	".ice": "Slice",
	".tpl": "Smarty",
	".builds": "XML",
	".plist": "XML Property List",
	".q": "q",
	".prg": "xBase",
	".re": "Reason",
	".rpy": "Python",
	".service": "INI",
	".cake": "C#",
	".sls": "Salt",
	".bf": "Brainfuck",
	".ncl": "NCL",
	".gml": "Game Maker Language",
	".frm": "VBA",
	".vba": "VBA",
	".tag": "Java Server Pages",
	".nb": "Wolfram Language",
	".srt": "SubRip Text",
	".p": "OpenEdge ABL",
	".ml": "OCaml",
	".js": "JavaScript",
	".mjs": "JavaScript",
	".lua": "Lua",
	".hh": "C++",
	".hpp": "C++",
	".cp": "C++",
	".php3": "PHP",
	".xsl": "XSLT",
	".pod": "Pod",
	".cmake.in": "CMake",
	".cmake": "CMake",
	".rb": "Ruby",
	".py": "Python",
	".kt": "Kotlin",
	".sv": "SystemVerilog",
	".vhd": "VHDL",
	".vh": "SystemVerilog"
};
/** Content rules for shared extensions: the first matching pattern decides (inferred). */
var HEURISTICS = {
	".h": [["Objective-C", /^\s*(@interface|@protocol|@property|@end|#import\s)/m], ["C++", /^\s*(class\s+\w+\s*[:{]|namespace\s+\w*\s*\{|template\s*<|using\s+namespace\b|#include\s*<(iostream|string|vector|memory|map)>)/m]],
	".m": [
		["Objective-C", /^\s*(@interface|@implementation|@protocol|#import\s|#include\s)/m],
		["MATLAB", /^\s*(function\b|%|end\s*$|classdef\b)/m],
		["Mercury", /^:-\s*module\b/m]
	],
	".pl": [["Prolog", /^[^#]*:-|^\s*:-/m], ["Raku", /^\s*(use\s+v6|unit\s+(module|class))/m]],
	".pm": [["Raku", /^\s*(use\s+v6|unit\s+(module|class))/m]],
	".ts": [["XML", /^\s*<\?xml|^\s*<TS\b/]],
	".sql": [
		["PLpgSQL", /\$\$\s*LANGUAGE\s+'?plpgsql/i],
		["TSQL", /^\s*GO\s*$|\bCREATE\s+PROC(EDURE)?\s+\[?dbo\]?\.|\bNVARCHAR\s*\(\s*MAX\s*\)|^\s*SET\s+NOCOUNT\b/im],
		["PLSQL", /\bCREATE\s+(OR\s+REPLACE\s+)?(EDITIONABLE\s+)?(PACKAGE|TYPE\s+BODY)\b|^\s*END\s+\w+\s*;\s*\n\s*\/\s*$|\bDBMS_\w+\.|\bVARCHAR2\b/im],
		["SQLPL", /\bLANGUAGE\s+SQL\b.*\bBEGIN\s+ATOMIC\b/is]
	],
	".cls": [
		["Apex", /\b(public|private|global)\s+(with\s+sharing\s+|without\s+sharing\s+)?class\b/i],
		["VBA", /^\s*(VERSION\s+1\.0\s+CLASS|Attribute\s+VB_)/m],
		["TeX", /\\(NeedsTeXFormat|ProvidesClass|LoadClass)/]
	],
	".inc": [
		["PHP", /<\?(php)?/],
		["Assembly", /^\s*(%macro|%define|\.\w+\s|section\s)/im],
		["C++", /^\s*#(include|define|ifndef)\b/m],
		["Pascal", /^\s*(procedure|function|unit)\s/im],
		["SQL", /^\s*(CREATE|INSERT|SELECT)\s/im]
	],
	".fs": [["GLSL", /^\s*#version\b|\bgl_FragColor\b|\bvoid\s+main\s*\(/m], ["Forth", /^\s*:\s+\S+|^\s*\\\s/m]],
	".v": [["Rocq Prover", /^\s*(Require|Theorem|Lemma|Proof|Definition|Inductive)\b/m], ["V", /^\s*(module\s+main|fn\s+main\s*\(\)|import\s+\w+\s*$)/m]],
	".r": [["Rebol", /^\s*REBOL\s*\[/im]],
	".cs": [["Smalltalk", /![\w\s]+methodsFor:/]],
	".rs": [["RenderScript", /^\s*#pragma\s+(version|rs\s+java_package_name)/m]],
	".d": [["Makefile", /^[\w./-]+\s*:\s/m]],
	".pro": [
		["Prolog", /:-/],
		["IDL", /^\s*(pro|function)\s+\w+\s*,/im],
		["INI", /^\s*\[/m]
	],
	".mod": [
		["AMPL", /^\s*(param|var|set|subject\s+to)\b/m],
		["Linux Kernel Module", /\.ko$/m],
		["XML", /^\s*<\?xml/]
	],
	".yml": [],
	".yaml": [],
	".md": [["GCC Machine Description", /^\s*\(define_(insn|expand|attr)/m]],
	".l": [["Common Lisp", /^\s*\(/m], ["Roff", /^\.[A-Z]{2}\b/m]],
	".s": [["Motorola 68K Assembly", /\b(move\.[lwb]|lea\s|d[0-7],)/i]],
	".gs": [["GLSL", /^\s*#version\b/m]],
	".ex": [["Euphoria", /^\s*(include\s+std\/|global\s+procedure)/m]],
	".f": [["Forth", /^\s*:\s+\S+\s/m]],
	".for": [["Forth", /^\s*:\s+\S+\s/m]],
	".bas": [["VBA", /^\s*Attribute\s+VB_/m]],
	".cgi": [["Perl", /^#!.*\bperl\b/], ["Python", /^#!.*\bpython/]],
	".sch": [["XML", /^\s*<\?xml/]],
	".x": [["Logos", /%hook\b/]],
	".ml": [["Standard ML", /^\s*(structure|signature|functor)\s/m]]
};
/** Binary signatures (magic numbers) at offset 0 unless stated. */
var MAGIC = [
	["PNG image", [
		137,
		80,
		78,
		71
	]],
	["JPEG image", [
		255,
		216,
		255
	]],
	["GIF image", [
		71,
		73,
		70,
		56
	]],
	["PDF document", [
		37,
		80,
		68,
		70
	]],
	["ZIP archive (also JAR, APK, DOCX, XLSX)", [
		80,
		75,
		3,
		4
	]],
	["gzip archive", [31, 139]],
	["bzip2 archive", [
		66,
		90,
		104
	]],
	["xz archive", [
		253,
		55,
		122,
		88,
		90
	]],
	["7-Zip archive", [
		55,
		122,
		188,
		175
	]],
	["Zstandard archive", [
		40,
		181,
		47,
		253
	]],
	["ELF executable or library", [
		127,
		69,
		76,
		70
	]],
	["Windows executable (PE)", [77, 90]],
	["Mach-O executable", [
		207,
		250,
		237,
		254
	]],
	["Mach-O executable", [
		254,
		237,
		250,
		207
	]],
	["Java class or Mach-O universal binary", [
		202,
		254,
		186,
		190
	]],
	["WebAssembly module", [
		0,
		97,
		115,
		109
	]],
	["SQLite database", [
		83,
		81,
		76,
		105,
		116,
		101,
		32,
		102
	]],
	["WOFF font", [
		119,
		79,
		70,
		70
	]],
	["WOFF2 font", [
		119,
		79,
		70,
		50
	]],
	["TrueType font", [
		0,
		1,
		0,
		0,
		0
	]],
	["OpenType font", [
		79,
		84,
		84,
		79
	]],
	["ICO image", [
		0,
		0,
		1,
		0
	]],
	["WebP/WAV/AVI (RIFF)", [
		82,
		73,
		70,
		70
	]],
	["MP3 audio", [
		73,
		68,
		51
	]],
	["Ogg media", [
		79,
		103,
		103,
		83
	]],
	[
		"MP4/QuickTime media",
		[
			102,
			116,
			121,
			112
		],
		4
	],
	[
		"Python bytecode",
		[
			13,
			13,
			10
		],
		1
	],
	["Microsoft Office document (OLE)", [
		208,
		207,
		17,
		224
	]],
	["Photoshop image", [
		56,
		66,
		80,
		83
	]],
	["TIFF image", [
		73,
		73,
		42,
		0
	]],
	["TIFF image", [
		77,
		77,
		0,
		42
	]],
	["BMP image", [66, 77]],
	["Git bundle or pack", [
		80,
		65,
		67,
		75
	]],
	["RAR archive", [
		82,
		97,
		114,
		33
	]],
	["Lua bytecode", [
		27,
		76,
		117,
		97
	]],
	["Android DEX", [
		100,
		101,
		120,
		10
	]]
];
/** Extensions that name binary formats, for files whose content was not read (size limit). */
var BINARY_EXT = {};
for (const [kind, exts] of Object.entries({
	Image: "png jpg jpeg gif bmp ico icns webp tif tiff psd xcf heic avif",
	Font: "ttf otf woff woff2 eot",
	Archive: "zip tar gz tgz bz2 xz 7z rar zst jar war ear apk aab ipa nupkg whl egg gem deb rpm dmg iso msi cab",
	"Compiled code": "class o obj a lib so dylib dll exe pyc pyo pyd wasm dex elc beam ko node",
	Media: "mp3 mp4 m4a wav ogg flac avi mov mkv webm",
	Document: "pdf doc docx xls xlsx ppt pptx odt ods odp",
	Database: "sqlite sqlite3 db mdb accdb dbf",
	Data: "bin dat pkl pickle npy npz h5 hdf5 parquet avro orc onnx pt pth ckpt safetensors tflite pb"
})) for (const e of exts.split(" ")) BINARY_EXT[`.${e}`] = kind;
function startsWith(buf, sig, at = 0) {
	if (buf.length < at + sig.length) return false;
	for (let i = 0; i < sig.length; i++) if (buf[at + i] !== sig[i]) return false;
	return true;
}
/** Binary kind from magic bytes or NUL bytes, or undefined for text. UTF-16 with a BOM is text. */
function sniffBinary(buf) {
	if (startsWith(buf, [255, 254]) || startsWith(buf, [254, 255])) return void 0;
	for (const [kind, sig, at] of MAGIC) if (startsWith(buf, sig, at ?? 0)) return kind;
	const n = Math.min(buf.length, 8e3);
	for (let i = 0; i < n; i++) if (buf[i] === 0) return "Binary data";
}
function encodingOf(buf) {
	if (startsWith(buf, [255, 254])) return "utf-16le";
	if (startsWith(buf, [254, 255])) return "utf-16be";
	return "utf-8";
}
/** Decodes text bytes (UTF-8 or UTF-16 with BOM). */
function decodeText(buf) {
	const enc = encodingOf(buf);
	if (enc === "utf-8") return new TextDecoder("utf-8").decode(buf);
	return new TextDecoder(enc).decode(buf.subarray(2));
}
var basenameOf = (p) => p.slice(p.lastIndexOf("/") + 1);
function extCandidates(base) {
	let i = base.indexOf(".", base.startsWith(".") ? 1 : 0);
	while (i >= 0) {
		const ext = base.slice(i);
		const extra = EXTRA_EXT[ext.toLowerCase()];
		const langs = byExtExact.get(ext) ?? byExt.get(ext.toLowerCase());
		if (langs?.length) return {
			ext: ext.toLowerCase(),
			langs
		};
		if (extra) {
			const l = LANGUAGES.find((x) => x.name === extra);
			if (l) return {
				ext: ext.toLowerCase(),
				langs: [l]
			};
		}
		i = base.indexOf(".", i + 1);
	}
}
function interpreterOf(line) {
	const m = /^#!\s*(\S+)(.*)$/.exec(line);
	if (!m) return void 0;
	let prog = basenameOf(m[1]);
	if (prog === "env") {
		prog = (m[2] ?? "").trim().split(/\s+/).find((a) => a && !a.startsWith("-") && !a.includes("=")) ?? "";
		prog = basenameOf(prog);
	}
	return prog || void 0;
}
function byInterp(prog) {
	const tries = [
		prog,
		prog.replace(/[\d.]+$/, ""),
		prog.replace(/-[\w.]+$/, "")
	];
	for (const t of tries) {
		const l = byInterpreter.get(t);
		if (l?.length) return l[0];
	}
}
function modelineOf(text) {
	const lines = text.split("\n");
	const window = [...lines.slice(0, 5), ...lines.slice(-5)].join("\n");
	const vim = /\b(?:vim?|ex):\s*(?:set?\s+)?[^\n]*?\b(?:ft|filetype|syntax)=([\w+-]+)/.exec(window);
	const emacs = /-\*-\s*(?:[^\n]*?\bmode:\s*)?([\w+-]+)\s*(?:;[^\n]*)?-\*-/i.exec(window);
	const name = (vim?.[1] ?? emacs?.[1])?.toLowerCase();
	if (!name) return void 0;
	return byAlias.get(name) ?? byAlias.get(name.replace(/-mode$/, ""));
}
function contentSignature(head) {
	const t = head.trimStart();
	if (/^<\?xml\b/.test(t)) return "XML";
	if (/^<!DOCTYPE\s+html|^<html\b/i.test(t)) return "HTML";
	if (/^<\?php\b/.test(t)) return "PHP";
	if (/^%YAML\b|^---\s*\n\s*\w[\w-]*\s*:/.test(t)) return "YAML";
	if (/^[{[]/.test(t)) {
		try {
			JSON.parse(head);
			return "JSON";
		} catch {}
		if (/^\{\s*"[^"\n]{1,100}"\s*:/.test(t)) return "JSON";
	}
	if (/^\s*apiVersion:\s*\S+\s*$/m.test(t) && /^\s*kind:\s*\S+/m.test(t)) return "YAML";
	const meaningful = t.split("\n").slice(0, 200).filter((l) => l.trim() && !/^\s*[#;]/.test(l));
	if (meaningful.length >= 2) {
		const share = (re) => meaningful.filter((l) => re.test(l)).length / meaningful.length;
		if (/^\[[^\]]+\]\s*$/.test(meaningful[0]) && share(/^\[[^\]]+\]\s*$|^\s*[\w.-]+\s*=/) >= .8) return "INI";
		if (/^[\w.-]+:(\s|$)/.test(meaningful[0]) && share(/^\s*-\s|^\s*-$|^\s*[\w."'/-]+:(\s|$)|^\s+\S/) >= .9) return "YAML";
	}
}
/** Paths whose location says what they are (checked before the file name). */
var PATH_RULES = [
	[/(^|\/)META-INF\/services\/[^/]+$/, "Java service provider list"],
	[/(^|\/)conf\/routes$/, "Play routes"],
	[/(^|\/)conf\/messages(\.[\w-]+)?$/, "Java Properties"]
];
/** Suffixes that wrap another file type: config.h.in, app.yaml.tmpl, settings.json.example. */
var TEMPLATE_SUFFIX = /\.(in|tmpl|tpl|template|example|sample|dist|orig|bak)$/i;
function pick(name) {
	return LANGUAGES.find((l) => l.name === name);
}
function result(lang, detectedBy, confidence, alternatives) {
	const name = typeof lang === "string" ? lang : lang.name;
	const out = {
		language: name,
		category: typeof lang === "string" ? categoryOf(name) : lang.category,
		detectedBy,
		confidence
	};
	if (alternatives?.length) out.alternatives = alternatives;
	return out;
}
/** Classifies one file. Never returns nothing: unknown text and binary are classifications too. */
function classify({ path, head }) {
	const base = basenameOf(path);
	let text;
	if (head) {
		const bin = sniffBinary(head);
		if (bin) return {
			language: `Binary: ${bin}`,
			category: "binary",
			detectedBy: "magic",
			confidence: "observed",
			binaryKind: bin
		};
		text = decodeText(head);
		if (text.startsWith("version https://git-lfs.github.com/spec/")) return {
			language: "Git LFS pointer",
			category: "data",
			detectedBy: "content",
			confidence: "observed",
			lfsPointer: true
		};
	} else {
		const dot = base.lastIndexOf(".");
		const kind = dot > 0 ? BINARY_EXT[base.slice(dot).toLowerCase()] : void 0;
		if (kind) return {
			language: `Binary: ${kind}`,
			category: "binary",
			detectedBy: "extension",
			confidence: "inferred",
			binaryKind: kind
		};
	}
	const withRole = (c) => {
		const role = roleOf(path, text?.slice(0, 8192));
		const enc = head ? encodingOf(head) : void 0;
		return {
			...c,
			...role ? { role: role.id } : {},
			...enc && enc !== "utf-8" ? { encoding: enc } : {}
		};
	};
	for (const [re, name] of PATH_RULES) if (re.test(path)) {
		const l = pick(name);
		if (l) return withRole(result(l, "filename", "observed"));
	}
	const fname = byFilename.get(base) ?? byFilenameLower.get(base.toLowerCase());
	const extraName = EXTRA_FILENAME[base];
	if (fname?.length === 1) return withRole(result(fname[0], "filename", "observed"));
	if (!fname?.length && extraName) {
		const l = pick(extraName);
		if (l) return withRole(result(l, "filename", "observed"));
	}
	const stem = /^(Dockerfile|Containerfile|Jenkinsfile|Makefile|Vagrantfile|Gemfile|Rakefile)[._-]/.exec(base)?.[1];
	if (stem) {
		const l = byFilename.get(stem)?.[0] ?? (EXTRA_FILENAME[stem] ? pick(EXTRA_FILENAME[stem]) : void 0);
		if (l) return withRole(result(l, "filename", "observed"));
	}
	const cand = extCandidates(base);
	const candidates = fname?.length ? fname : cand?.langs;
	if (candidates?.length === 1) return withRole(result(candidates[0], fname?.length ? "filename" : "extension", "observed"));
	if (candidates && candidates.length > 1) {
		const ext = cand?.ext ?? "";
		const names = candidates.map((c) => c.name);
		const prog = text ? interpreterOf(text.split("\n", 1)[0] ?? "") : void 0;
		const viaShebang = prog ? byInterp(prog) : void 0;
		if (viaShebang && names.includes(viaShebang.name)) return withRole(result(viaShebang, "shebang", "observed", names.filter((n) => n !== viaShebang.name)));
		if (text) {
			for (const [name, re] of HEURISTICS[ext] ?? []) if (names.includes(name) && re.test(text)) return withRole(result(name, "heuristic", "inferred", names.filter((n) => n !== name)));
		}
		const preferred = PREFERRED[ext];
		const chosen = preferred && candidates.find((c) => c.name === preferred) || candidates.find((c) => c.extensions[0]?.toLowerCase() === ext) || candidates.find((c) => c.linguistType === "programming") || candidates[0];
		return withRole(result(chosen, "heuristic", "inferred", names.filter((n) => n !== chosen.name)));
	}
	if (text !== void 0) {
		const prog = interpreterOf(text.split("\n", 1)[0] ?? "");
		if (prog) {
			const l = byInterp(prog);
			if (l) return withRole(result(l, "shebang", "observed"));
		}
		const ml = modelineOf(text);
		if (ml) return withRole(result(ml, "modeline", "observed"));
		const sig = contentSignature(text);
		if (sig) return withRole(result(sig, "content", "inferred"));
		if (prog) return withRole(result(`Script (${prog})`, "shebang", "observed"));
	}
	const inner = base.replace(TEMPLATE_SUFFIX, "");
	if (inner !== base && inner.includes(".")) {
		const c = classify({
			path: path.slice(0, path.length - base.length) + inner,
			head
		});
		if (c.category !== "unknown" && c.category !== "binary") return {
			...c,
			...withRole({
				language: c.language,
				category: c.category,
				detectedBy: "extension",
				confidence: "inferred"
			}),
			alternatives: [`Template (${base.slice(inner.length)})`]
		};
	}
	const dot = base.lastIndexOf(".");
	const ext = dot > 0 ? base.slice(dot) : "";
	return withRole({
		language: ext ? `Unrecognised (${ext.toLowerCase()})` : "Unrecognised (no extension)",
		category: "unknown",
		detectedBy: "fallback",
		confidence: "inferred"
	});
}
// src/types.ts
var CATEGORY_LABEL = {
	programming: "Programming language",
	scripting: "Scripting and automation",
	database: "Database language",
	markup: "Markup",
	stylesheet: "Stylesheet",
	template: "Template",
	config: "Configuration",
	data: "Data and serialization",
	build: "Build system",
	infrastructure: "Infrastructure as code",
	api: "API and interface definition",
	docs: "Documentation",
	notebook: "Notebook",
	binary: "Binary",
	unknown: "Unrecognised"
};
/**
* What was done to one file, from the processing result (never from the format's name).
*
* - `full`: a complete parser read the whole file and the meaning of its file type was extracted.
* - `partial`: either a complete parse with no model of the file's meaning, or pattern-based
*   extraction of declarations, imports or blocks that is not a full parse.
* - `text`: read as text and indexed for search only; no structure extracted.
* - `unsupported`: recognised, but its content could not be used (for example a Git LFS pointer,
*   or an encoding that cannot be decoded).
* - `failed`: an analyser tried and failed; the reason is recorded.
* - `excluded`: deliberately not read (credentials, limits, build output, generated, ignored).
* - `binary`: binary content; recorded, not read.
*/
var STATUSES = [
	"full",
	"partial",
	"text",
	"unsupported",
	"failed",
	"excluded",
	"binary"
];
var ROLE_GROUP_LABEL = {
	container: "Containers",
	orchestration: "Orchestration (Kubernetes, Helm, Kustomize)",
	ci: "CI/CD pipelines",
	build: "Build systems",
	dependencies: "Dependency manifests",
	lockfile: "Lockfiles",
	compiler: "Compiler and tool configuration",
	iac: "Infrastructure as code",
	database: "Database schemas, migrations and procedures",
	api: "API specifications and interface definitions",
	schema: "Schema and data definitions",
	config: "Application configuration",
	env: "Environment templates",
	docs: "Documentation and specifications",
	repo: "Repository metadata",
	test: "Test files"
};
// src/inventory.ts
/**
* Repository file inventory: one record per listed path, and the summary both products show.
* The summary is computed only from records, so every number on a dashboard is a count of
* real processing results. Invariant: the status counts add up to `total`.
*/
var emptyCounts = () => Object.fromEntries(STATUSES.map((s) => [s, 0]));
var analysedOf = (c) => c.full + c.partial;
var readableOf = (c) => c.full + c.partial + c.text + c.unsupported + c.failed;
var ratio = (a, b) => b ? Math.round(a / b * 1e3) / 1e3 : null;
function statusWord(c) {
	const present = STATUSES.filter((s) => c[s] > 0);
	if (present.length === 1) return present[0];
	const total = STATUSES.reduce((t, s) => t + c[s], 0);
	const readable = present.filter((s) => s !== "excluded" && s !== "binary");
	if (readable.length === 1 && c[readable[0]] * 2 >= total) return readable[0];
	return "mixed";
}
/** Worst first, for lists of files that were not fully analysed. */
var SEVERITY = {
	failed: 0,
	unsupported: 1,
	text: 2,
	excluded: 3,
	partial: 4,
	binary: 5,
	full: 6
};
function summarize(records, opts) {
	const depth = opts.depth ?? 2;
	const maxEx = opts.maxExamples ?? 5;
	const counts = emptyCounts();
	const langs = /* @__PURE__ */ new Map();
	const roles = /* @__PURE__ */ new Map();
	const dirs = /* @__PURE__ */ new Map();
	const reasons = /* @__PURE__ */ new Map();
	const ambiguous = /* @__PURE__ */ new Map();
	const cats = /* @__PURE__ */ new Map();
	for (const r of records) {
		counts[r.status]++;
		const isAnalysed = r.status === "full" || r.status === "partial";
		let L = langs.get(r.language);
		if (!L) {
			L = {
				language: r.language,
				category: r.category ?? categoryOf(r.language),
				files: 0,
				bytes: 0,
				counts: emptyCounts(),
				analysed: 0,
				coverage: null,
				status: "text",
				method: "",
				methods: /* @__PURE__ */ new Map()
			};
			langs.set(r.language, L);
		}
		L.files++;
		L.bytes += r.bytes ?? 0;
		L.counts[r.status]++;
		L.methods.set(r.method, (L.methods.get(r.method) ?? 0) + 1);
		const cat = cats.get(L.category) ?? {
			files: 0,
			analysed: 0
		};
		cat.files++;
		if (isAnalysed) cat.analysed++;
		cats.set(L.category, cat);
		if (r.role) {
			const info = roleInfo(r.role);
			let R = roles.get(r.role);
			if (!R) {
				R = {
					role: r.role,
					label: info?.label ?? r.role,
					group: info?.group ?? "config",
					groupLabel: ROLE_GROUP_LABEL[info?.group ?? "config"],
					files: 0,
					counts: emptyCounts(),
					analysed: 0,
					coverage: null,
					examples: []
				};
				roles.set(r.role, R);
			}
			R.files++;
			R.counts[r.status]++;
			if (R.examples.length < maxEx) R.examples.push(r.path);
		}
		const segs = r.path.split("/");
		const dir = segs.length > 1 ? segs.slice(0, Math.min(depth, segs.length - 1)).join("/") : ".";
		let D = dirs.get(dir);
		if (!D) {
			D = {
				path: dir,
				files: 0,
				counts: emptyCounts(),
				analysed: 0,
				coverage: null
			};
			dirs.set(dir, D);
		}
		D.files++;
		D.counts[r.status]++;
		if (r.status !== "full" && r.status !== "partial" && r.status !== "text") {
			const reason = r.reason ?? r.method;
			const key = `${r.status}\0${reason}`;
			let X = reasons.get(key);
			if (!X) {
				X = {
					status: r.status,
					reason,
					files: 0,
					examples: []
				};
				reasons.set(key, X);
			}
			X.files++;
			if (X.examples.length < maxEx) X.examples.push(r.path);
		}
		if (r.confidence === "inferred" && r.alternatives?.length) {
			const A = ambiguous.get(r.language) ?? {
				language: r.language,
				alternatives: r.alternatives.slice(0, 8),
				files: 0
			};
			A.files++;
			ambiguous.set(r.language, A);
		}
	}
	const finish = (x) => {
		x.analysed = analysedOf(x.counts);
		x.coverage = ratio(x.analysed, readableOf(x.counts));
		return x;
	};
	const languages = [...langs.values()].map((L) => {
		finish(L);
		L.status = statusWord(L.counts);
		L.method = [...L.methods.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
		const { methods: _m, ...row } = L;
		return row;
	}).sort((a, b) => b.files - a.files || a.language.localeCompare(b.language));
	const notAnalysedAll = records.filter((r) => r.status !== "full" && r.status !== "binary").sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || a.path.localeCompare(b.path));
	const analysed = analysedOf(counts);
	const readable = readableOf(counts);
	return {
		producer: opts.producer,
		total: records.length,
		counts,
		analysed,
		readable,
		coverage: ratio(analysed, readable),
		fullCoverage: ratio(counts.full, readable),
		languages,
		categories: [...cats.entries()].map(([category, v]) => ({
			category,
			label: CATEGORY_LABEL[category],
			...v
		})).sort((a, b) => b.files - a.files),
		fileTypes: [...roles.values()].map(finish).sort((a, b) => a.groupLabel.localeCompare(b.groupLabel) || b.files - a.files),
		directories: [...dirs.values()].map(finish).sort((a, b) => b.files - a.files || a.path.localeCompare(b.path)).slice(0, opts.maxDirectories ?? 200),
		reasons: [...reasons.values()].sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || b.files - a.files),
		notAnalysed: notAnalysedAll.slice(0, opts.maxNotAnalysed ?? 500).map((r) => ({
			path: r.path,
			language: r.language,
			status: r.status,
			method: r.method,
			...r.reason ? { reason: r.reason } : {}
		})),
		notAnalysedTotal: notAnalysedAll.length,
		ambiguous: [...ambiguous.values()].sort((a, b) => b.files - a.files)
	};
}
/** Checks the inventory invariant: status counts add up to the number of listed paths. */
function checkInventory(s) {
	const errors = [];
	const sum = STATUSES.reduce((t, k) => t + s.counts[k], 0);
	if (sum !== s.total) errors.push(`status counts add up to ${sum}, not ${s.total}`);
	const langSum = s.languages.reduce((t, l) => t + l.files, 0);
	if (langSum !== s.total) errors.push(`language rows add up to ${langSum}, not ${s.total}`);
	return errors;
}
/** One sentence for the overview, from the counts. Never says "complete" unless every readable file was fully analysed. */
function coverageSentence(s) {
	const fmt = (n) => n.toLocaleString("en-US");
	const pct = (x) => x === null ? "n/a" : `${Math.round(x * 1e3) / 10}%`;
	if (!s.total) return "No files were found.";
	const parts = [
		`${fmt(s.total)} files found`,
		`${fmt(s.counts.full)} fully analysed`,
		`${fmt(s.counts.partial)} partially analysed`,
		`${fmt(s.counts.text)} text only`
	];
	if (s.counts.failed) parts.push(`${fmt(s.counts.failed)} failed`);
	if (s.counts.unsupported) parts.push(`${fmt(s.counts.unsupported)} not readable`);
	parts.push(`${fmt(s.counts.excluded)} excluded`, `${fmt(s.counts.binary)} binary`);
	return `${parts.join(", ")}. ${pct(s.coverage)} of readable files were analysed (${pct(s.fullCoverage)} fully).`;
}
// src/policy.ts
/**
* Folder names whose tracked content is treated as build output or dependencies. A tracked
* file inside one is recorded as excluded, never dropped, because real source can live in a
* folder with one of these names.
*/
var IGNORED_DIRS = /* @__PURE__ */ new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"out",
	".next",
	".output",
	".wxt",
	"coverage",
	".turbo",
	".cache",
	".data",
	"vendor",
	"target",
	"__pycache__",
	".venv",
	"venv",
	"test-results",
	"playwright-report"
]);
/** Files that may hold credentials are never read. Templates such as .env.example are allowed. */
var SECRET_PATTERNS = [
	/(^|\/)\.env(\..*)?$/,
	/\.(pem|key|p12|pfx|jks|keystore|crt|cer)$/i,
	/(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
	/(^|\/)\.npmrc$/,
	/(^|\/)\.netrc$/,
	/(^|\/)credentials(\.json)?$/i,
	/secrets?\.(json|ya?ml)$/i,
	/\.tfstate(\.backup)?$/
];
var SECRET_ALLOW = [/\.env\.(example|sample|template|dist|defaults)$/];
function isSecretPath(p) {
	return SECRET_PATTERNS.some((r) => r.test(p)) && !SECRET_ALLOW.some((r) => r.test(p));
}
/** Generated files, by path, with the reason shown in the inventory. */
var GENERATED = [
	[/\.min\.(js|css)$/, "minified build output"],
	[/\.map$/, "source map"],
	[/(^|\/)migrations\/meta\//, "migration tool snapshot"],
	[/\.d\.ts$/, "TypeScript declaration file (usually generated)"]
];
function generatedReason(p) {
	return GENERATED.find(([r]) => r.test(p))?.[1];
}
/** True when a folder on the path is one of IGNORED_DIRS. */
function inIgnoredDir(p) {
	return p.split("/").slice(0, -1).some((seg) => IGNORED_DIRS.has(seg));
}
// src/listing.ts
/**
* Lists every path of a repository (Node.js only): `git ls-files` when it is a git checkout,
* otherwise a directory walk. Shared by CodeAtlas discovery and the ArchLens inventory script,
* so both count the same files. Paths that exist but are not listed one by one (ignored
* folders, unreadable directories) are returned in `unlisted`, never dropped silently.
*/
function git(root, args) {
	try {
		return execFileSync("git", [
			"-C",
			root,
			...args
		], {
			encoding: "buffer",
			maxBuffer: 268435456,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		}).toString("utf8").split("\0").filter(Boolean);
	} catch {
		return null;
	}
}
function walk(root, unlisted) {
	const out = [];
	const stack = [root];
	while (stack.length) {
		const dir = stack.pop();
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch (e) {
			unlisted.push({
				path: relative(root, dir).split(sep).join("/") || ".",
				reason: `directory could not be read (${e.code ?? "error"})`
			});
			continue;
		}
		for (const e of entries) {
			const abs = join(dir, e.name);
			const rel = relative(root, abs).split(sep).join("/");
			if (e.isDirectory()) {
				if (!IGNORED_DIRS.has(e.name)) stack.push(abs);
				else if (e.name !== ".git") unlisted.push({
					path: `${rel}/`,
					reason: "build-output or dependency folder; not walked"
				});
			} else out.push(rel);
		}
	}
	return out;
}
function listRepository(root) {
	const unlisted = [];
	const listed = git(root, [
		"ls-files",
		"-z",
		"--cached",
		"--others",
		"--exclude-standard"
	]);
	const usedGit = listed !== null;
	const submodules = /* @__PURE__ */ new Set();
	if (usedGit) {
		for (const line of git(root, [
			"ls-files",
			"-z",
			"--stage"
		]) ?? []) {
			const m = /^160000 [0-9a-f]+ \d+\t(.+)$/.exec(line);
			if (m) submodules.add(m[1]);
		}
		const ignored = git(root, [
			"ls-files",
			"-z",
			"--others",
			"--ignored",
			"--exclude-standard",
			"--directory"
		]);
		if (ignored?.length) {
			const shown = ignored.filter((p) => !p.split("/").some((s) => s === "node_modules")).slice(0, 20);
			for (const p of shown) unlisted.push({
				path: p,
				reason: "ignored by .gitignore rules"
			});
			if (ignored.length > shown.length) unlisted.push({
				path: `(${ignored.length - shown.length} more)`,
				reason: "ignored by .gitignore rules (including node_modules)"
			});
		}
	}
	return {
		paths: [...new Set(listed ?? walk(root, unlisted))].sort(),
		usedGit,
		submodules,
		unlisted
	};
}
/** Reads up to `max` bytes from the start of a file. */
function readHead(abs, max) {
	const fd = openSync(abs, "r");
	try {
		const buf = Buffer.alloc(max);
		const n = readSync(fd, buf, 0, max, 0);
		return buf.subarray(0, n);
	} finally {
		closeSync(fd);
	}
}
// src/cli/inventory.ts
/**
* ArchLens inventory: lists every file of a repository, identifies its language and file type
* with the shared registry, and records what was done to it. Bundled into
* skills/archlens/scripts/inventory.mjs (standalone, Node.js built-ins only).
*
*   node inventory.mjs <repo> [--model brain-model.json] [--read paths.txt] [--out inventory.json]
*
* Without a model every readable file is "text" (listed and identified, not analysed). Files the
* model cites (neuron or synapse `file`) and files named in --read were read in the session:
* they become "partial" (structure recorded by hand, not checked by a compiler). Nothing is ever
* "full" here. With --model the summary is written into the model's coverage.inventory.
*/
var HEAD_BYTES = 8192;
var MAX_FILES = 2e5;
/** Classifies every listed path. `read` holds paths the session actually read. */
function inventoryRepository(root, read = /* @__PURE__ */ new Set()) {
	const { paths, usedGit, submodules, unlisted } = listRepository(root);
	const records = [];
	const add = (path, c, status, method, reason, bytes) => {
		const r = {
			path,
			language: c.language,
			category: c.category,
			status,
			method,
			detectedBy: c.detectedBy,
			confidence: c.confidence
		};
		if (c.role) r.role = c.role;
		if (reason) r.reason = reason;
		if (bytes !== void 0) r.bytes = bytes;
		if (c.alternatives) r.alternatives = c.alternatives;
		records.push(r);
	};
	const byName = (path) => classify({
		path,
		head: null
	});
	for (const path of paths) {
		if (records.length >= MAX_FILES) {
			add(path, byName(path), "excluded", "not read", `beyond the ${MAX_FILES.toLocaleString("en-US")}-file limit`);
			continue;
		}
		if (submodules.has(path)) {
			add(path, {
				...byName(path),
				language: "Git submodule",
				category: "data"
			}, "excluded", "not read", "git submodule; a separate repository");
			continue;
		}
		if (inIgnoredDir(path)) {
			if (usedGit) add(path, byName(path), "excluded", "not read", "in a build-output or dependency folder");
			continue;
		}
		if (isSecretPath(path)) {
			add(path, byName(path), "excluded", "not read", "may contain credentials; never read");
			continue;
		}
		const gen = generatedReason(path);
		if (gen) {
			add(path, byName(path), "excluded", "not read", `generated: ${gen}`);
			continue;
		}
		const abs = join(root, path);
		let size;
		try {
			const st = lstatSync(abs);
			if (st.isSymbolicLink()) {
				add(path, byName(path), "excluded", "not read", "symbolic link; the target is not followed");
				continue;
			}
			if (!st.isFile()) {
				add(path, byName(path), "failed", "not read", "not a regular file");
				continue;
			}
			size = st.size;
		} catch (e) {
			add(path, byName(path), "failed", "not read", `could not be read (${e.code ?? "error"})`);
			continue;
		}
		let head;
		try {
			head = readHead(abs, HEAD_BYTES);
		} catch (e) {
			add(path, byName(path), "failed", "not read", `could not be read (${e.code ?? "error"})`, size);
			continue;
		}
		const c = classify({
			path,
			head
		});
		if (c.category === "binary") add(path, c, "binary", "not read", c.binaryKind ? `binary content (${c.binaryKind})` : "binary content", size);
		else if (c.lfsPointer) add(path, c, "unsupported", "not read", "Git LFS pointer; the real content is not in the clone", size);
		else if (read.has(path)) add(path, c, "partial", "read by ArchLens (structure recorded by hand)", void 0, size);
		else add(path, c, "text", "listed and identified; not read", void 0, size);
	}
	return {
		records,
		unlisted,
		usedGit
	};
}
/** Paths a brain model cites: the files whose content was read to build it. */
function citedFiles(model) {
	const out = /* @__PURE__ */ new Set();
	const m = model;
	for (const x of [...Array.isArray(m?.neurons) ? m.neurons : [], ...Array.isArray(m?.synapses) ? m.synapses : []]) {
		const f = x?.file;
		if (typeof f === "string" && f) out.add(f.replace(/^\.\//, ""));
	}
	return out;
}
function main(argv) {
	const args = [...argv];
	const opt = (name) => {
		const i = args.indexOf(name);
		return i >= 0 ? args.splice(i, 2)[1] : void 0;
	};
	const modelPath = opt("--model");
	const readPath = opt("--read");
	const outPath = opt("--out");
	const [root] = args;
	if (!root) {
		console.error("Usage: node inventory.mjs <repo> [--model brain-model.json] [--read paths.txt] [--out inventory.json]");
		return 2;
	}
	let model;
	if (modelPath) {
		try {
			model = JSON.parse(readFileSync(resolve(modelPath), "utf8"));
		} catch (e) {
			console.error(`${modelPath} is not valid JSON: ${e.message}`);
			return 1;
		}
		if (model && typeof model === "object" && "brain" in model) model = model.brain;
	}
	const read = model ? citedFiles(model) : /* @__PURE__ */ new Set();
	if (readPath) {
		for (const line of readFileSync(resolve(readPath), "utf8").split("\n")) if (line.trim()) read.add(line.trim().replace(/^\.\//, ""));
	}
	const run = inventoryRepository(resolve(root), read);
	const summary = summarize(run.records, { producer: "archlens" });
	const errors = checkInventory(summary);
	if (errors.length) {
		console.error(`Inventory invariant broken: ${errors.join("; ")}`);
		return 1;
	}
	const sentence = coverageSentence(summary);
	const listedPaths = new Set(run.records.map((r) => r.path));
	const missing = [...read].filter((p) => !listedPaths.has(p));
	console.log(`${run.usedGit ? "git ls-files" : "directory walk"}; registry: GitHub Linguist ${LINGUIST_VERSION} data plus Nexora overlays.`);
	console.log(sentence);
	console.log("Languages and formats (files, analysed, status):");
	for (const l of summary.languages.slice(0, 25)) console.log(`  ${l.language.padEnd(30)} ${String(l.files).padStart(7)} ${String(l.analysed).padStart(7)}  ${l.status}`);
	if (summary.languages.length > 25) console.log(`  … and ${summary.languages.length - 25} more`);
	if (summary.fileTypes.length) console.log(`File types: ${summary.fileTypes.map((r) => `${r.files} ${r.label}`).join(", ")}.`);
	for (const r of summary.reasons) console.log(`  ${r.status}: ${r.reason} (${r.files})`);
	for (const u of run.unlisted.slice(0, 10)) console.log(`  not listed: ${u.path} (${u.reason})`);
	if (missing.length) console.log(`Warning: ${missing.length} cited paths are not files of this repository, e.g. ${missing.slice(0, 3).join(", ")}.`);
	const inventory = {
		...summary,
		summary: sentence,
		unlisted: run.unlisted
	};
	if (outPath) writeFileSync(resolve(outPath), `${JSON.stringify({
		inventory,
		records: run.records
	}, null, 1)}\n`);
	if (model && modelPath) {
		const cov = model.coverage && typeof model.coverage === "object" ? model.coverage : {};
		const gaps = Array.isArray(cov.gaps) ? cov.gaps.filter((g) => typeof g === "string" && !g.startsWith("File inventory:")) : [];
		model.coverage = {
			...cov,
			partial: true,
			summary: typeof cov.summary === "string" && cov.summary ? cov.summary : sentence,
			gaps: [`File inventory: ${sentence}`, ...gaps],
			inventory
		};
		writeFileSync(resolve(modelPath), `${JSON.stringify(model, null, 1)}\n`);
		console.log(`Wrote coverage.inventory into ${modelPath}.`);
	}
	return 0;
}
if (typeof process !== "undefined" && process.argv[1] && /inventory\.(mjs|ts)$/.test(process.argv[1])) process.exitCode = main(process.argv.slice(2));
export { citedFiles, inventoryRepository };
