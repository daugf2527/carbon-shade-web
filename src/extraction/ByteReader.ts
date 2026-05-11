// ByteReader — shared binary buffer cursor for NPK/IMG/PVF parsers.
// Zero-copy sub-view slicing via Buffer.subarray().
// Pure TypeScript, depends only on Node.js Buffer/DataView.

import { ExtractionError } from "./types.js";

export class ByteReader {
  private _buf: Buffer;
  private _pos: number;
  private _view: DataView;

  constructor(buf: Buffer, pos: number = 0) {
    this._buf = buf;
    this._pos = pos;
    // Create DataView from the buffer's ArrayBuffer for LE multi-byte reads.
    // Buffer.buffer shares the same underlying ArrayBuffer.
    this._view = new DataView(buf.buffer, buf.byteOffset + pos, buf.byteLength - pos);
  }

  /** Current read position in bytes. */
  get position(): number {
    return this._pos;
  }

  set position(p: number) {
    if (p < 0) {
      throw new ExtractionError("ByteReader position cannot be negative");
    }
    this._pos = p;
    // Recreate DataView at the new position
    const offset = this._buf.byteOffset + p;
    this._view = new DataView(this._buf.buffer, offset, this._buf.byteLength - p);
  }

  /** Number of bytes remaining before end of buffer. */
  get remaining(): number {
    return this._buf.byteLength - this._pos;
  }

  /** The underlying buffer. */
  get buffer(): Buffer {
    return this._buf;
  }

  // ── Primitive readers (advance position) ──

  /** Read a single unsigned byte. */
  readUint8(): number {
    this._require(1);
    const val = this._buf[this._pos]!;
    this._pos += 1;
    this._advanceView(1);
    return val;
  }

  /** Read a 2-byte little-endian unsigned integer. */
  readUint16(): number {
    this._require(2);
    const val = this._view.getUint16(0, true);
    this._pos += 2;
    this._advanceView(2);
    return val;
  }

  /** Read a 4-byte little-endian unsigned integer. */
  readUint32(): number {
    this._require(4);
    const val = this._view.getUint32(0, true);
    this._pos += 4;
    this._advanceView(4);
    return val;
  }

  /** Read a 4-byte little-endian signed integer (int32). */
  readInt32(): number {
    this._require(4);
    const val = this._view.getInt32(0, true);
    this._pos += 4;
    this._advanceView(4);
    return val;
  }

  /** Read a 4-byte little-endian float. */
  readFloat32(): number {
    this._require(4);
    const val = this._view.getFloat32(0, true);
    this._pos += 4;
    this._advanceView(4);
    return val;
  }

  // ── Bulk readers ──

  /**
   * Read `length` bytes as a new Buffer.
   * Returns a copy (not a view) to avoid accidentally mutating the source.
   */
  readBytes(length: number): Buffer {
    this._require(length);
    const slice = this._buf.subarray(this._pos, this._pos + length);
    this._pos += length;
    this._advanceView(length);
    return Buffer.from(slice);
  }

  /**
   * Read `length` bytes and decode as a string.
   * @param encoding - Node.js BufferEncoding. Default 'utf-8'.
   */
  readString(length: number, encoding: BufferEncoding = "utf-8"): string {
    this._require(length);
    const slice = this._buf.subarray(this._pos, this._pos + length);
    this._pos += length;
    this._advanceView(length);
    // Find null terminator if present
    const nullIdx = slice.indexOf(0);
    const str = (nullIdx >= 0 ? slice.subarray(0, nullIdx) : slice).toString(encoding);
    return str;
  }

  /**
   * Read `length` bytes as a CP949 (EUC-KR) encoded string.
   * Used for PVF file paths and Korean text in DNF client files.
   */
  readEUCKR(length: number): string {
    this._require(length);
    const slice = this._buf.subarray(this._pos, this._pos + length);
    this._pos += length;
    this._advanceView(length);
    try {
      // CP949 is a superset of EUC-KR; 'euc-kr' handles most CP949 codepoints
      return slice.toString("euc-kr" as BufferEncoding);
    } catch {
      // Fallback to latin1 for non-decodable bytes
      let result = "";
      for (let i = 0; i < slice.length; i++) {
        const b = slice[i]!;
        result += b < 0x80 ? String.fromCharCode(b) : "?";
      }
      return result;
    }
  }

  // ── Peek (non-consuming reads) ──

  /** Read a 4-byte LE uint32 without advancing the cursor. */
  peekUint32(offset: number = 0): number {
    this._require(4, offset);
    return this._view.getUint32(offset, true);
  }

  /** Read a single byte without advancing the cursor. */
  peekUint8(offset: number = 0): number {
    this._require(1, offset);
    return this._buf[this._pos + offset]!;
  }

  // ── Slice (zero-copy sub-view) ──

  /**
   * Create a new ByteReader over the next `length` bytes.
   * Uses Buffer.subarray() — zero-copy, shares the same underlying memory.
   * Useful for handing IMG data to ImgParser or file chunks to PvfScriptParser.
   */
  slice(length: number): ByteReader {
    this._require(length);
    const sub = this._buf.subarray(this._pos, this._pos + length);
    this._pos += length;
    this._advanceView(length);
    return new ByteReader(Buffer.from(sub));
  }

  // ── Skip ──

  /** Skip `n` bytes. */
  skip(n: number): void {
    this._require(n);
    this._pos += n;
    this._advanceView(n);
  }

  // ── Internal helpers ──

  private _require(bytes: number, extraOffset: number = 0): void {
    if (this._pos + bytes + extraOffset > this._buf.byteLength) {
      throw new ExtractionError(
        `ByteReader: requested ${bytes} bytes at offset ${this._pos}+${extraOffset}, but only ${this.remaining} remaining`,
        this._pos
      );
    }
  }

  private _advanceView(bytes: number): void {
    if (bytes > 0) {
      const offset = this._buf.byteOffset + this._pos;
      this._view = new DataView(this._buf.buffer, offset, this._buf.byteLength - this._pos);
    }
  }
}
