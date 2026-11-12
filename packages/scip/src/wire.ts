/**
 * Protocol Buffers wire format (https://protobuf.dev/programming-guides/encoding/), only as much
 * as SCIP needs: varints, length-delimited fields and packed repeated int32. Fixed 32 and 64-bit
 * fields are skipped. Groups (wire types 3 and 4) are rejected: SCIP has none.
 *
 * Every read is bounds-checked; malformed input throws a WireError with the byte offset instead of
 * reading past the buffer.
 */

export class WireError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(`${message} at byte ${offset}`);
  }
}

export interface Field {
  no: number;
  /** 0 varint, 1 fixed64, 2 length-delimited, 5 fixed32. */
  wire: 0 | 1 | 2 | 5;
  /** Varint value (wire 0). Values above 2^53 lose precision; SCIP uses int32 and enums only. */
  varint: number;
  /** The varint read as int32: its low 32 bits, signed (exact even for 10-byte negatives). */
  i32: number;
  /** Bytes of a length-delimited field (wire 2), a view into the input. */
  bytes: Uint8Array;
}

const EMPTY = new Uint8Array(0);

export class Reader {
  pos = 0;
  /** Low 32 bits of the last varint read, as a signed int32. */
  low32 = 0;
  constructor(
    readonly buf: Uint8Array,
    /** Offset of `buf` in the whole input, for error messages. */
    readonly base = 0,
  ) {}

  get done(): boolean {
    return this.pos >= this.buf.length;
  }

  varint(): number {
    let result = 0;
    let mul = 1;
    let low = 0;
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.buf.length)
        throw new WireError('truncated varint', this.base + this.pos);
      const b = this.buf[this.pos++]!;
      result += (b & 0x7f) * mul;
      // Bits 0..31 come from the first five bytes; `| 0` keeps them as a signed int32.
      if (i < 5) low = low | ((b & 0x7f) << (7 * i)) | 0;
      if (b < 0x80) {
        this.low32 = low;
        return result;
      }
      mul *= 128;
    }
    throw new WireError('varint longer than 10 bytes', this.base + this.pos);
  }

  /** The next field, or undefined at the end of the buffer. */
  field(): Field | undefined {
    if (this.done) return undefined;
    const at = this.pos;
    const tag = this.varint();
    const no = Math.floor(tag / 8);
    const wire = tag % 8;
    if (no === 0) throw new WireError('field number 0', this.base + at);
    switch (wire) {
      case 0:
        return { no, wire, varint: this.varint(), i32: this.low32, bytes: EMPTY };
      case 1:
        this.skip(8);
        return { no, wire, varint: 0, i32: 0, bytes: EMPTY };
      case 2: {
        const len = this.varint();
        const start = this.pos;
        this.skip(len);
        return { no, wire, varint: 0, i32: 0, bytes: this.buf.subarray(start, start + len) };
      }
      case 5:
        this.skip(4);
        return { no, wire, varint: 0, i32: 0, bytes: EMPTY };
      default:
        throw new WireError(`unsupported wire type ${wire}`, this.base + at);
    }
  }

  private skip(n: number): void {
    if (n < 0 || this.pos + n > this.buf.length)
      throw new WireError('length past the end of the message', this.base + this.pos);
    this.pos += n;
  }
}

/** Iterates the fields of one message. */
export function* fields(buf: Uint8Array, base = 0): Generator<Field> {
  const r = new Reader(buf, base);
  for (let f = r.field(); f; f = r.field()) yield f;
}

const decoder = new TextDecoder('utf-8', { fatal: false });
export const str = (f: Field): string => decoder.decode(f.bytes);

/** A repeated int32 field: packed (wire 2) or one value per field (wire 0). */
export function ints(f: Field, into: number[]): void {
  if (f.wire === 0) {
    into.push(f.i32);
    return;
  }
  if (f.wire !== 2) return;
  const r = new Reader(f.bytes);
  while (!r.done) {
    r.varint();
    into.push(r.low32);
  }
}
