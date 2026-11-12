/**
 * SCIP index decoding (https://github.com/sourcegraph/scip, scip.proto at be1d9f769a02).
 *
 * Only the fields CodeAtlas uses are kept: metadata, each document's path, language,
 * occurrences (range, symbol, roles, enclosing range) and symbol information (kind, display
 * name, relationships, enclosing symbol). Documentation, signatures, diagnostics and document
 * text are skipped.
 */
import { WireError, fields, ints, str } from './wire';

export const SymbolRole = {
  Definition: 0x1,
  Import: 0x2,
  WriteAccess: 0x4,
  ReadAccess: 0x8,
  Generated: 0x10,
  Test: 0x20,
  ForwardDefinition: 0x40,
} as const;

/** [startLine, startCharacter, endLine, endCharacter], zero-based. */
export type Range = [number, number, number, number];

export interface Occurrence {
  range: Range;
  symbol: string;
  roles: number;
  enclosing?: Range;
}

export interface Relationship {
  symbol: string;
  isReference: boolean;
  isImplementation: boolean;
  isTypeDefinition: boolean;
  isDefinition: boolean;
}

export interface SymbolInfo {
  symbol: string;
  /** SymbolInformation.Kind number; see KIND_NAMES. 0 when the indexer did not say. */
  kind: number;
  displayName?: string;
  enclosingSymbol?: string;
  relationships: Relationship[];
}

export interface ScipDocument {
  path: string;
  language?: string;
  occurrences: Occurrence[];
  symbols: SymbolInfo[];
  /** 1 UTF-8, 2 UTF-16, 3 UTF-32 code units per character offset; 0 unspecified. */
  positionEncoding: number;
}

export interface ScipIndex {
  tool?: { name: string; version: string; arguments: string[] };
  projectRoot?: string;
  documents: ScipDocument[];
  externalSymbols: SymbolInfo[];
}

export interface DecodeLimits {
  /** Largest index accepted, in bytes. Default 512 MB. */
  maxBytes?: number;
}

/** A range from the deprecated repeated int32 form: three elements mean one line. */
function rangeOf(v: number[]): Range | undefined {
  if (v.length === 3) return [v[0]!, v[1]!, v[0]!, v[2]!];
  if (v.length === 4) return [v[0]!, v[1]!, v[2]!, v[3]!];
  return undefined;
}

function singleLine(b: Uint8Array, base: number): Range {
  let line = 0;
  let s = 0;
  let e = 0;
  for (const f of fields(b, base))
    if (f.wire === 0) {
      if (f.no === 1) line = f.i32;
      else if (f.no === 2) s = f.i32;
      else if (f.no === 3) e = f.i32;
    }
  return [line, s, line, e];
}

function multiLine(b: Uint8Array, base: number): Range {
  const r: Range = [0, 0, 0, 0];
  for (const f of fields(b, base)) if (f.wire === 0 && f.no >= 1 && f.no <= 4) r[f.no - 1] = f.i32;
  return r;
}

function occurrence(b: Uint8Array, base: number): Occurrence | undefined {
  const legacy: number[] = [];
  const legacyEnclosing: number[] = [];
  let range: Range | undefined;
  let enclosing: Range | undefined;
  let symbol = '';
  let roles = 0;
  for (const f of fields(b, base)) {
    if (f.no === 1) ints(f, legacy);
    else if (f.no === 2 && f.wire === 2) symbol = str(f);
    else if (f.no === 3 && f.wire === 0) roles = f.i32;
    else if (f.no === 7) ints(f, legacyEnclosing);
    else if (f.no === 8 && f.wire === 2) range = singleLine(f.bytes, base);
    else if (f.no === 9 && f.wire === 2) range = multiLine(f.bytes, base);
    else if (f.no === 10 && f.wire === 2) enclosing = singleLine(f.bytes, base);
    else if (f.no === 11 && f.wire === 2) enclosing = multiLine(f.bytes, base);
  }
  // The typed ranges win over the deprecated repeated int32 ones (scip.proto).
  range ??= rangeOf(legacy);
  enclosing ??= rangeOf(legacyEnclosing);
  if (!range || !symbol) return undefined;
  return { range, symbol, roles, ...(enclosing ? { enclosing } : {}) };
}

function relationship(b: Uint8Array, base: number): Relationship {
  const r: Relationship = {
    symbol: '',
    isReference: false,
    isImplementation: false,
    isTypeDefinition: false,
    isDefinition: false,
  };
  for (const f of fields(b, base)) {
    if (f.no === 1 && f.wire === 2) r.symbol = str(f);
    else if (f.wire === 0) {
      const v = f.varint !== 0;
      if (f.no === 2) r.isReference = v;
      else if (f.no === 3) r.isImplementation = v;
      else if (f.no === 4) r.isTypeDefinition = v;
      else if (f.no === 5) r.isDefinition = v;
    }
  }
  return r;
}

function symbolInfo(b: Uint8Array, base: number): SymbolInfo {
  const s: SymbolInfo = { symbol: '', kind: 0, relationships: [] };
  for (const f of fields(b, base)) {
    if (f.no === 1 && f.wire === 2) s.symbol = str(f);
    else if (f.no === 4 && f.wire === 2) s.relationships.push(relationship(f.bytes, base));
    else if (f.no === 5 && f.wire === 0) s.kind = f.i32;
    else if (f.no === 6 && f.wire === 2) s.displayName = str(f);
    else if (f.no === 8 && f.wire === 2) s.enclosingSymbol = str(f);
  }
  return s;
}

function document(b: Uint8Array, base: number): ScipDocument {
  const d: ScipDocument = { path: '', occurrences: [], symbols: [], positionEncoding: 0 };
  for (const f of fields(b, base)) {
    if (f.no === 1 && f.wire === 2) d.path = str(f);
    else if (f.no === 2 && f.wire === 2) {
      const o = occurrence(f.bytes, base);
      if (o) d.occurrences.push(o);
    } else if (f.no === 3 && f.wire === 2) d.symbols.push(symbolInfo(f.bytes, base));
    else if (f.no === 4 && f.wire === 2) d.language = str(f);
    else if (f.no === 6 && f.wire === 0) d.positionEncoding = f.varint;
  }
  return d;
}

function metadata(b: Uint8Array, base: number, into: ScipIndex): void {
  for (const f of fields(b, base)) {
    if (f.no === 2 && f.wire === 2) {
      const t = { name: '', version: '', arguments: [] as string[] };
      for (const g of fields(f.bytes, base)) {
        if (g.wire !== 2) continue;
        if (g.no === 1) t.name = str(g);
        else if (g.no === 2) t.version = str(g);
        else if (g.no === 3) t.arguments.push(str(g));
      }
      into.tool = t;
    } else if (f.no === 3 && f.wire === 2) into.projectRoot = str(f);
  }
}

/** Decodes a whole `index.scip`. Throws WireError on malformed input. */
export function decodeIndex(bytes: Uint8Array, limits: DecodeLimits = {}): ScipIndex {
  const max = limits.maxBytes ?? 512 * 1024 * 1024;
  if (bytes.length > max) throw new WireError(`index larger than ${max} bytes`, 0);
  const out: ScipIndex = { documents: [], externalSymbols: [] };
  for (const f of fields(bytes)) {
    if (f.wire !== 2) continue;
    const base = f.bytes.byteOffset - bytes.byteOffset;
    if (f.no === 1) metadata(f.bytes, base, out);
    else if (f.no === 2) out.documents.push(document(f.bytes, base));
    else if (f.no === 3) out.externalSymbols.push(symbolInfo(f.bytes, base));
  }
  return out;
}

/** SymbolInformation.Kind names used by CodeAtlas (scip.proto). */
export const KIND_NAMES: Record<number, string> = {
  7: 'class',
  8: 'constant',
  9: 'constructor',
  11: 'enum',
  12: 'enum-member',
  15: 'field',
  17: 'function',
  18: 'getter',
  21: 'interface',
  25: 'macro',
  26: 'method',
  29: 'module',
  30: 'namespace',
  33: 'object',
  35: 'package',
  37: 'parameter',
  41: 'property',
  42: 'protocol',
  45: 'setter',
  49: 'struct',
  53: 'trait',
  54: 'type',
  55: 'type-alias',
  56: 'type-class',
  58: 'type-parameter',
  59: 'union',
  61: 'variable',
  66: 'abstract-method',
  67: 'method-specification',
  68: 'protocol-method',
  69: 'pure-virtual-method',
  70: 'trait-method',
  71: 'type-class-method',
  76: 'singleton-method',
  79: 'static-field',
  80: 'static-method',
  81: 'static-property',
  82: 'static-variable',
};
