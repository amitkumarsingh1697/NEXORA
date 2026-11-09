/**
 * Identifies a file's language or format from its name, extension, shebang, editor modeline
 * and a bounded look at its first bytes. One function, used by CodeAtlas discovery and by the
 * ArchLens inventory script, so both products name the same file the same way.
 *
 * Order: binary signature, Git LFS pointer, exact filename, extension (longest suffix first,
 * with content heuristics for extensions several languages share), shebang, modeline, content
 * signature, then "unrecognised text". Nothing is dropped: every path gets a classification.
 */
import { LANGUAGES, type LanguageInfo, categoryOf } from './registry';
import { roleOf } from './roles';
import type { Category, Classification } from './types';

const byFilename = new Map<string, LanguageInfo[]>();
const byFilenameLower = new Map<string, LanguageInfo[]>();
const byExt = new Map<string, LanguageInfo[]>();
const byExtExact = new Map<string, LanguageInfo[]>();
const byInterpreter = new Map<string, LanguageInfo[]>();
const byAlias = new Map<string, LanguageInfo>();
const push = <K>(m: Map<K, LanguageInfo[]>, k: K, l: LanguageInfo) => {
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
export const EXTRA_EXT: Record<string, string> = {
  '.jcl': 'JCL',
  '.cbl': 'COBOL',
  '.cpy': 'COBOL',
  '.ksh': 'Shell',
  '.env.example': 'Dotenv',
  '.env.sample': 'Dotenv',
  '.env.template': 'Dotenv',
  '.containerfile': 'Dockerfile',
  '.properties': 'Java Properties',
  '.conf': 'INI',
  '.cfg': 'INI',
  '.tfvars': 'HCL',
  '.hcl': 'HCL',
  // Fortran run through the fypp preprocessor (fortran-lang/stdlib).
  '.fypp': 'Fortran Free Form',
  '.xcstrings': 'JSON',
};
export const EXTRA_FILENAME: Record<string, string> = {
  Jenkinsfile: 'Groovy',
  'go.mod': 'Go Module',
  'go.work': 'Go Workspace',
  'go.sum': 'Go Checksums',
  Podfile: 'Ruby',
  Fastfile: 'Ruby',
  Brewfile: 'Ruby',
  Dangerfile: 'Ruby',
  Procfile: 'Procfile',
  'requirements.txt': 'Pip Requirements',
  '.gitkeep': 'Text',
  '.keep': 'Text',
  CODEOWNERS: 'Text',
  OWNERS: 'YAML',
  OWNERS_ALIASES: 'YAML',
  'requirements.in': 'Pip Requirements',
  NOTICE: 'Text',
  PATENTS: 'Text',
  AUTHORS: 'Text',
  CONTRIBUTORS: 'Text',
  MAINTAINERS: 'Text',
  SECURITY_CONTACTS: 'Text',
  VERSION: 'Text',
  README: 'Text',
  '.go-version': 'Text',
  '.node-version': 'Text',
  '.nvmrc': 'Text',
  '.python-version': 'Text',
  '.ruby-version': 'Text',
  '.mailmap': 'Text',
  gitconfig: 'Git Config',
  '.env.example': 'Dotenv',
};

/**
 * Which language an extension most often means, when Linguist lists several. Used only after the
 * content heuristics below found nothing; the result is labelled inferred with the alternatives.
 */
export const PREFERRED: Record<string, string> = {
  '.h': 'C',
  '.m': 'Objective-C',
  '.pl': 'Perl',
  '.pm': 'Perl',
  '.t': 'Perl',
  '.sql': 'SQL',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.md': 'Markdown',
  '.ts': 'TypeScript',
  '.cs': 'C#',
  '.fs': 'F#',
  '.r': 'R',
  '.rs': 'Rust',
  '.v': 'Verilog',
  '.json': 'JSON',
  '.txt': 'Text',
  '.d': 'D',
  '.s': 'Unix Assembly',
  '.asm': 'Assembly',
  '.inc': 'PHP',
  '.cls': 'TeX',
  '.html': 'HTML',
  '.xml': 'XML',
  '.php': 'PHP',
  '.sc': 'Scala',
  '.ex': 'Elixir',
  '.pro': 'QMake',
  '.mod': 'Modula-2',
  '.bas': 'BASIC',
  '.cgi': 'Shell',
  '.fcgi': 'Shell',
  '.l': 'Lex',
  '.ms': 'Roff',
  '.gs': 'JavaScript',
  '.st': 'Smalltalk',
  '.lisp': 'Common Lisp',
  '.sh': 'Shell',
  '.toml': 'TOML',
  '.cmd': 'Batchfile',
  '.mk': 'Makefile',
  '.properties': 'Java Properties',
  '.ini': 'INI',
  '.cfg': 'INI',
  '.conf': 'INI',
  '.f': 'Fortran',
  '.for': 'Fortran',
  '.lock': 'JSON',
  '.mm': 'Objective-C++',
  '.cl': 'OpenCL',
  '.pp': 'Puppet',
  '.sch': 'Scheme',
  '.x': 'RPC',
  '.i': 'SWIG',
  '.asc': 'AsciiDoc',
  '.lp': 'Linear Programming',
  '.e': 'Eiffel',
  '.n': 'Roff',
  '.ice': 'Slice',
  '.tpl': 'Smarty',
  '.builds': 'XML',
  '.plist': 'XML Property List',
  '.q': 'q',
  '.prg': 'xBase',
  '.re': 'Reason',
  '.rpy': 'Python',
  '.service': 'INI',
  '.cake': 'C#',
  '.sls': 'Salt',
  '.bf': 'Brainfuck',
  '.ncl': 'NCL',
  '.gml': 'Game Maker Language',
  '.frm': 'VBA',
  '.vba': 'VBA',
  '.tag': 'Java Server Pages',
  '.nb': 'Wolfram Language',
  '.srt': 'SubRip Text',
  '.p': 'OpenEdge ABL',
  '.ml': 'OCaml',
  '.js': 'JavaScript',
  '.mjs': 'JavaScript',
  '.lua': 'Lua',
  '.hh': 'C++',
  '.hpp': 'C++',
  '.cp': 'C++',
  '.php3': 'PHP',
  '.xsl': 'XSLT',
  '.pod': 'Pod',
  '.cmake.in': 'CMake',
  '.cmake': 'CMake',
  '.rb': 'Ruby',
  '.py': 'Python',
  '.kt': 'Kotlin',
  '.sv': 'SystemVerilog',
  '.vhd': 'VHDL',
  '.vh': 'SystemVerilog',
};

/** Content rules for shared extensions: the first matching pattern decides (inferred). */
export const HEURISTICS: Record<string, [string, RegExp][]> = {
  '.h': [
    ['Objective-C', /^\s*(@interface|@protocol|@property|@end|#import\s)/m],
    [
      'C++',
      /^\s*(class\s+\w+\s*[:{]|namespace\s+\w*\s*\{|template\s*<|using\s+namespace\b|#include\s*<(iostream|string|vector|memory|map)>)/m,
    ],
  ],
  '.m': [
    ['Objective-C', /^\s*(@interface|@implementation|@protocol|#import\s|#include\s)/m],
    ['MATLAB', /^\s*(function\b|%|end\s*$|classdef\b)/m],
    ['Mercury', /^:-\s*module\b/m],
  ],
  '.pl': [
    ['Prolog', /^[^#]*:-|^\s*:-/m],
    ['Raku', /^\s*(use\s+v6|unit\s+(module|class))/m],
  ],
  '.pm': [['Raku', /^\s*(use\s+v6|unit\s+(module|class))/m]],
  '.ts': [['XML', /^\s*<\?xml|^\s*<TS\b/]],
  '.sql': [
    ['PLpgSQL', /\$\$\s*LANGUAGE\s+'?plpgsql/i],
    [
      'TSQL',
      /^\s*GO\s*$|\bCREATE\s+PROC(EDURE)?\s+\[?dbo\]?\.|\bNVARCHAR\s*\(\s*MAX\s*\)|^\s*SET\s+NOCOUNT\b/im,
    ],
    [
      'PLSQL',
      /\bCREATE\s+(OR\s+REPLACE\s+)?(PACKAGE|TYPE\s+BODY|TRIGGER)\b|^\s*END\s+\w+\s*;\s*\n\s*\/\s*$|\bDBMS_\w+\./im,
    ],
    ['SQLPL', /\bLANGUAGE\s+SQL\b.*\bBEGIN\s+ATOMIC\b/is],
  ],
  '.cls': [
    ['Apex', /\b(public|private|global)\s+(with\s+sharing\s+|without\s+sharing\s+)?class\b/i],
    ['VBA', /^\s*(VERSION\s+1\.0\s+CLASS|Attribute\s+VB_)/m],
    ['TeX', /\\(NeedsTeXFormat|ProvidesClass|LoadClass)/],
  ],
  '.inc': [
    ['PHP', /<\?(php)?/],
    ['Assembly', /^\s*(%macro|%define|\.\w+\s|section\s)/im],
    ['C++', /^\s*#(include|define|ifndef)\b/m],
    ['Pascal', /^\s*(procedure|function|unit)\s/im],
    ['SQL', /^\s*(CREATE|INSERT|SELECT)\s/im],
  ],
  '.fs': [
    ['GLSL', /^\s*#version\b|\bgl_FragColor\b|\bvoid\s+main\s*\(/m],
    ['Forth', /^\s*:\s+\S+|^\s*\\\s/m],
  ],
  '.v': [
    ['Rocq Prover', /^\s*(Require|Theorem|Lemma|Proof|Definition|Inductive)\b/m],
    ['V', /^\s*(module\s+main|fn\s+main\s*\(\)|import\s+\w+\s*$)/m],
  ],
  '.r': [['Rebol', /^\s*REBOL\s*\[/im]],
  '.cs': [['Smalltalk', /![\w\s]+methodsFor:/]],
  '.rs': [['RenderScript', /^\s*#pragma\s+(version|rs\s+java_package_name)/m]],
  '.d': [['Makefile', /^[\w./-]+\s*:\s/m]],
  '.pro': [
    ['Prolog', /:-/],
    ['IDL', /^\s*(pro|function)\s+\w+\s*,/im],
    ['INI', /^\s*\[/m],
  ],
  '.mod': [
    ['AMPL', /^\s*(param|var|set|subject\s+to)\b/m],
    ['Linux Kernel Module', /\.ko$/m],
    ['XML', /^\s*<\?xml/],
  ],
  '.yml': [],
  '.yaml': [],
  '.md': [['GCC Machine Description', /^\s*\(define_(insn|expand|attr)/m]],
  '.l': [
    ['Common Lisp', /^\s*\(/m],
    ['Roff', /^\.[A-Z]{2}\b/m],
  ],
  '.s': [['Motorola 68K Assembly', /\b(move\.[lwb]|lea\s|d[0-7],)/i]],
  '.gs': [['GLSL', /^\s*#version\b/m]],
  '.ex': [['Euphoria', /^\s*(include\s+std\/|global\s+procedure)/m]],
  '.f': [['Forth', /^\s*:\s+\S+\s/m]],
  '.for': [['Forth', /^\s*:\s+\S+\s/m]],
  '.bas': [['VBA', /^\s*Attribute\s+VB_/m]],
  '.cgi': [
    ['Perl', /^#!.*\bperl\b/],
    ['Python', /^#!.*\bpython/],
  ],
  '.sch': [['XML', /^\s*<\?xml/]],
  '.x': [['Logos', /%hook\b/]],
  '.ml': [['Standard ML', /^\s*(structure|signature|functor)\s/m]],
};

/** Binary signatures (magic numbers) at offset 0 unless stated. */
const MAGIC: [string, number[], number?][] = [
  ['PNG image', [0x89, 0x50, 0x4e, 0x47]],
  ['JPEG image', [0xff, 0xd8, 0xff]],
  ['GIF image', [0x47, 0x49, 0x46, 0x38]],
  ['PDF document', [0x25, 0x50, 0x44, 0x46]],
  ['ZIP archive (also JAR, APK, DOCX, XLSX)', [0x50, 0x4b, 0x03, 0x04]],
  ['gzip archive', [0x1f, 0x8b]],
  ['bzip2 archive', [0x42, 0x5a, 0x68]],
  ['xz archive', [0xfd, 0x37, 0x7a, 0x58, 0x5a]],
  ['7-Zip archive', [0x37, 0x7a, 0xbc, 0xaf]],
  ['Zstandard archive', [0x28, 0xb5, 0x2f, 0xfd]],
  ['ELF executable or library', [0x7f, 0x45, 0x4c, 0x46]],
  ['Windows executable (PE)', [0x4d, 0x5a]],
  ['Mach-O executable', [0xcf, 0xfa, 0xed, 0xfe]],
  ['Mach-O executable', [0xfe, 0xed, 0xfa, 0xcf]],
  ['Java class or Mach-O universal binary', [0xca, 0xfe, 0xba, 0xbe]],
  ['WebAssembly module', [0x00, 0x61, 0x73, 0x6d]],
  ['SQLite database', [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66]],
  ['WOFF font', [0x77, 0x4f, 0x46, 0x46]],
  ['WOFF2 font', [0x77, 0x4f, 0x46, 0x32]],
  ['TrueType font', [0x00, 0x01, 0x00, 0x00, 0x00]],
  ['OpenType font', [0x4f, 0x54, 0x54, 0x4f]],
  ['ICO image', [0x00, 0x00, 0x01, 0x00]],
  ['WebP/WAV/AVI (RIFF)', [0x52, 0x49, 0x46, 0x46]],
  ['MP3 audio', [0x49, 0x44, 0x33]],
  ['Ogg media', [0x4f, 0x67, 0x67, 0x53]],
  ['MP4/QuickTime media', [0x66, 0x74, 0x79, 0x70], 4],
  ['Python bytecode', [0x0d, 0x0d, 0x0a], 1],
  ['Microsoft Office document (OLE)', [0xd0, 0xcf, 0x11, 0xe0]],
  ['Photoshop image', [0x38, 0x42, 0x50, 0x53]],
  ['TIFF image', [0x49, 0x49, 0x2a, 0x00]],
  ['TIFF image', [0x4d, 0x4d, 0x00, 0x2a]],
  ['BMP image', [0x42, 0x4d]],
  ['Git bundle or pack', [0x50, 0x41, 0x43, 0x4b]],
  ['RAR archive', [0x52, 0x61, 0x72, 0x21]],
  ['Lua bytecode', [0x1b, 0x4c, 0x75, 0x61]],
  ['Android DEX', [0x64, 0x65, 0x78, 0x0a]],
];

/** Extensions that name binary formats, for files whose content was not read (size limit). */
const BINARY_EXT: Record<string, string> = {};
for (const [kind, exts] of Object.entries({
  Image: 'png jpg jpeg gif bmp ico icns webp tif tiff psd xcf heic avif',
  Font: 'ttf otf woff woff2 eot',
  Archive:
    'zip tar gz tgz bz2 xz 7z rar zst jar war ear apk aab ipa nupkg whl egg gem deb rpm dmg iso msi cab',
  'Compiled code': 'class o obj a lib so dylib dll exe pyc pyo pyd wasm dex elc beam ko node',
  Media: 'mp3 mp4 m4a wav ogg flac avi mov mkv webm',
  Document: 'pdf doc docx xls xlsx ppt pptx odt ods odp',
  Database: 'sqlite sqlite3 db mdb accdb dbf',
  Data: 'bin dat pkl pickle npy npz h5 hdf5 parquet avro orc onnx pt pth ckpt safetensors tflite pb',
})) {
  for (const e of exts.split(' ')) BINARY_EXT[`.${e}`] = kind;
}

function startsWith(buf: Uint8Array, sig: number[], at = 0): boolean {
  if (buf.length < at + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (buf[at + i] !== sig[i]) return false;
  return true;
}

/** Binary kind from magic bytes or NUL bytes, or undefined for text. UTF-16 with a BOM is text. */
export function sniffBinary(buf: Uint8Array): string | undefined {
  if (startsWith(buf, [0xff, 0xfe]) || startsWith(buf, [0xfe, 0xff])) return undefined;
  for (const [kind, sig, at] of MAGIC) if (startsWith(buf, sig, at ?? 0)) return kind;
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return 'Binary data';
  return undefined;
}

export function encodingOf(buf: Uint8Array): Classification['encoding'] {
  if (startsWith(buf, [0xff, 0xfe])) return 'utf-16le';
  if (startsWith(buf, [0xfe, 0xff])) return 'utf-16be';
  return 'utf-8';
}

/** Decodes text bytes (UTF-8 or UTF-16 with BOM). */
export function decodeText(buf: Uint8Array): string {
  const enc = encodingOf(buf);
  if (enc === 'utf-8') return new TextDecoder('utf-8').decode(buf);
  return new TextDecoder(enc).decode(buf.subarray(2));
}

const basenameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);

function extCandidates(base: string): { ext: string; langs: LanguageInfo[] } | undefined {
  // Longest suffix first: "x.blade.php" tries ".blade.php" then ".php".
  let i = base.indexOf('.', base.startsWith('.') ? 1 : 0);
  while (i >= 0) {
    const ext = base.slice(i);
    const extra = EXTRA_EXT[ext.toLowerCase()];
    const exact = byExtExact.get(ext);
    // Case matters for a few extensions (.C is C++, .R and .r are both R).
    const langs = exact ?? byExt.get(ext.toLowerCase());
    if (langs?.length) return { ext: ext.toLowerCase(), langs };
    if (extra) {
      const l = LANGUAGES.find((x) => x.name === extra);
      if (l) return { ext: ext.toLowerCase(), langs: [l] };
    }
    i = base.indexOf('.', i + 1);
  }
  // A dotfile with no further dot: ".bashrc" is a filename, handled earlier.
  return undefined;
}

function interpreterOf(line: string): string | undefined {
  const m = /^#!\s*(\S+)(.*)$/.exec(line);
  if (!m) return undefined;
  let prog = basenameOf(m[1] as string);
  if (prog === 'env') {
    const args = (m[2] ?? '').trim().split(/\s+/);
    prog = args.find((a) => a && !a.startsWith('-') && !a.includes('=')) ?? '';
    prog = basenameOf(prog);
  }
  return prog || undefined;
}

function byInterp(prog: string): LanguageInfo | undefined {
  const tries = [prog, prog.replace(/[\d.]+$/, ''), prog.replace(/-[\w.]+$/, '')];
  for (const t of tries) {
    const l = byInterpreter.get(t);
    if (l?.length) return l[0];
  }
  return undefined;
}

function modelineOf(text: string): LanguageInfo | undefined {
  const lines = text.split('\n');
  const window = [...lines.slice(0, 5), ...lines.slice(-5)].join('\n');
  const vim = /\b(?:vim?|ex):\s*(?:set?\s+)?[^\n]*?\b(?:ft|filetype|syntax)=([\w+-]+)/.exec(window);
  const emacs = /-\*-\s*(?:[^\n]*?\bmode:\s*)?([\w+-]+)\s*(?:;[^\n]*)?-\*-/i.exec(window);
  const name = (vim?.[1] ?? emacs?.[1])?.toLowerCase();
  if (!name) return undefined;
  return byAlias.get(name) ?? byAlias.get(name.replace(/-mode$/, ''));
}

function contentSignature(head: string): string | undefined {
  const t = head.trimStart();
  if (/^<\?xml\b/.test(t)) return 'XML';
  if (/^<!DOCTYPE\s+html|^<html\b/i.test(t)) return 'HTML';
  if (/^<\?php\b/.test(t)) return 'PHP';
  if (/^%YAML\b|^---\s*\n\s*\w[\w-]*\s*:/.test(t)) return 'YAML';
  if (/^[{[]/.test(t)) {
    try {
      JSON.parse(head);
      return 'JSON';
    } catch {
      // not complete JSON (or truncated): decided only by the object shape below
    }
    // An object that opens with a quoted key: JSON with template placeholders, or truncated.
    if (/^\{\s*"[^"\n]{1,100}"\s*:/.test(t)) return 'JSON';
  }
  if (/^\s*apiVersion:\s*\S+\s*$/m.test(t) && /^\s*kind:\s*\S+/m.test(t)) return 'YAML';
  // Line-shape tests for extensionless config files; both are labelled inferred by the caller.
  const meaningful = t
    .split('\n')
    .slice(0, 200)
    .filter((l) => l.trim() && !/^\s*[#;]/.test(l));
  if (meaningful.length >= 2) {
    const share = (re: RegExp) => meaningful.filter((l) => re.test(l)).length / meaningful.length;
    if (
      /^\[[^\]]+\]\s*$/.test(meaningful[0] as string) &&
      share(/^\[[^\]]+\]\s*$|^\s*[\w.-]+\s*=/) >= 0.8
    )
      return 'INI';
    if (
      /^[\w.-]+:(\s|$)/.test(meaningful[0] as string) &&
      share(/^\s*-\s|^\s*-$|^\s*[\w."'/-]+:(\s|$)|^\s+\S/) >= 0.9
    )
      return 'YAML';
  }
  return undefined;
}

/** Paths whose location says what they are (checked before the file name). */
export const PATH_RULES: [RegExp, string][] = [
  [/(^|\/)META-INF\/services\/[^/]+$/, 'Java service provider list'],
  [/(^|\/)conf\/routes$/, 'Play routes'],
  [/(^|\/)conf\/messages(\.[\w-]+)?$/, 'Java Properties'],
];

/** Suffixes that wrap another file type: config.h.in, app.yaml.tmpl, settings.json.example. */
const TEMPLATE_SUFFIX = /\.(in|tmpl|tpl|template|example|sample|dist|orig|bak)$/i;

function pick(name: string): LanguageInfo | undefined {
  return LANGUAGES.find((l) => l.name === name);
}

function result(
  lang: LanguageInfo | string,
  detectedBy: Classification['detectedBy'],
  confidence: Classification['confidence'],
  alternatives?: string[],
): Omit<Classification, 'role'> {
  const name = typeof lang === 'string' ? lang : lang.name;
  const out: Omit<Classification, 'role'> = {
    language: name,
    category: typeof lang === 'string' ? categoryOf(name) : lang.category,
    detectedBy,
    confidence,
  };
  if (alternatives?.length) out.alternatives = alternatives;
  return out;
}

export interface ClassifyInput {
  /** Repository-relative POSIX path. */
  path: string;
  /** First bytes of the file (8 KiB is enough), or null when the content was not read. */
  head: Uint8Array | null;
}

/** Classifies one file. Never returns nothing: unknown text and binary are classifications too. */
export function classify({ path, head }: ClassifyInput): Classification {
  const base = basenameOf(path);
  let text: string | undefined;
  if (head) {
    const bin = sniffBinary(head);
    if (bin) {
      return {
        language: `Binary: ${bin}`,
        category: 'binary',
        detectedBy: 'magic',
        confidence: 'observed',
        binaryKind: bin,
      };
    }
    text = decodeText(head);
    if (text.startsWith('version https://git-lfs.github.com/spec/')) {
      return {
        language: 'Git LFS pointer',
        category: 'data',
        detectedBy: 'content',
        confidence: 'observed',
        lfsPointer: true,
      };
    }
  } else {
    const dot = base.lastIndexOf('.');
    const kind = dot > 0 ? BINARY_EXT[base.slice(dot).toLowerCase()] : undefined;
    if (kind)
      return {
        language: `Binary: ${kind}`,
        category: 'binary',
        detectedBy: 'extension',
        confidence: 'inferred',
        binaryKind: kind,
      };
  }
  const withRole = (c: Omit<Classification, 'role'>): Classification => {
    const role = roleOf(path, text?.slice(0, 8192));
    const enc = head ? encodingOf(head) : undefined;
    return {
      ...c,
      ...(role ? { role: role.id } : {}),
      ...(enc && enc !== 'utf-8' ? { encoding: enc } : {}),
    };
  };
  // 0. Formats known by where they live rather than by name.
  for (const [re, name] of PATH_RULES)
    if (re.test(path)) {
      const l = pick(name);
      if (l) return withRole(result(l, 'filename', 'observed'));
    }

  // 1. Exact filename (Dockerfile, Makefile, .bashrc, CMakeLists.txt, Jenkinsfile…).
  const fname = byFilename.get(base) ?? byFilenameLower.get(base.toLowerCase());
  const extraName = EXTRA_FILENAME[base];
  if (fname?.length === 1)
    return withRole(result(fname[0] as LanguageInfo, 'filename', 'observed'));
  if (!fname?.length && extraName) {
    const l = pick(extraName);
    if (l) return withRole(result(l, 'filename', 'observed'));
  }
  // Dockerfile.prod, Containerfile.dev, Jenkinsfile.release.
  const stem =
    /^(Dockerfile|Containerfile|Jenkinsfile|Makefile|Vagrantfile|Gemfile|Rakefile)[._-]/.exec(
      base,
    )?.[1];
  if (stem) {
    const l =
      byFilename.get(stem)?.[0] ?? (EXTRA_FILENAME[stem] ? pick(EXTRA_FILENAME[stem]) : undefined);
    if (l) return withRole(result(l, 'filename', 'observed'));
  }

  // 2. Extension.
  const cand = extCandidates(base);
  const candidates = fname?.length ? fname : cand?.langs;
  if (candidates?.length === 1)
    return withRole(
      result(candidates[0] as LanguageInfo, fname?.length ? 'filename' : 'extension', 'observed'),
    );
  if (candidates && candidates.length > 1) {
    const ext = cand?.ext ?? '';
    const names = candidates.map((c) => c.name);
    // Shebang beats a shared extension (a .cgi with #!/usr/bin/perl).
    const prog = text ? interpreterOf(text.split('\n', 1)[0] ?? '') : undefined;
    const viaShebang = prog ? byInterp(prog) : undefined;
    if (viaShebang && names.includes(viaShebang.name))
      return withRole(
        result(
          viaShebang,
          'shebang',
          'observed',
          names.filter((n) => n !== viaShebang.name),
        ),
      );
    if (text)
      for (const [name, re] of HEURISTICS[ext] ?? [])
        if (names.includes(name) && re.test(text))
          return withRole(
            result(
              name,
              'heuristic',
              'inferred',
              names.filter((n) => n !== name),
            ),
          );
    const preferred = PREFERRED[ext];
    const chosen =
      (preferred && candidates.find((c) => c.name === preferred)) ||
      candidates.find((c) => c.extensions[0]?.toLowerCase() === ext) ||
      candidates.find((c) => c.linguistType === 'programming') ||
      (candidates[0] as LanguageInfo);
    return withRole(
      result(
        chosen,
        'heuristic',
        'inferred',
        names.filter((n) => n !== chosen.name),
      ),
    );
  }

  if (text !== undefined) {
    // 3. Shebang (extensionless scripts).
    const prog = interpreterOf(text.split('\n', 1)[0] ?? '');
    if (prog) {
      const l = byInterp(prog);
      if (l) return withRole(result(l, 'shebang', 'observed'));
    }
    // 4. Editor modeline.
    const ml = modelineOf(text);
    if (ml) return withRole(result(ml, 'modeline', 'observed'));
    // 5. Content signature.
    const sig = contentSignature(text);
    if (sig) return withRole(result(sig, 'content', 'inferred'));
    if (prog) return withRole(result(`Script (${prog})`, 'shebang', 'observed'));
  }
  // 6. A template or copy of another file type: classify the inner name, as an inference.
  const inner = base.replace(TEMPLATE_SUFFIX, '');
  if (inner !== base && inner.includes('.')) {
    const c = classify({ path: path.slice(0, path.length - base.length) + inner, head });
    if (c.category !== 'unknown' && c.category !== 'binary')
      return {
        ...c,
        ...withRole({
          language: c.language,
          category: c.category,
          detectedBy: 'extension',
          confidence: 'inferred',
        }),
        alternatives: [`Template (${base.slice(inner.length)})`],
      };
  }
  // 7. Unrecognised: still recorded, by extension.
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot) : '';
  const name = ext ? `Unrecognised (${ext.toLowerCase()})` : 'Unrecognised (no extension)';
  const c = withRole({
    language: name,
    category: 'unknown' as Category,
    detectedBy: 'fallback',
    confidence: 'inferred',
  });
  return c;
}
