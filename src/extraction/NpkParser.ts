// NpkParser — NPK container parser for DNF (Dungeon & Fighter) asset files.
// Parses the NPK container format, verifies magic, extracts IMG index entries,
// decrypts filenames, and verifies SHA256 checksums.
//
// Pure TypeScript, depends only on ByteReader, types, and node:crypto.

import { createHash } from "node:crypto";
import { ByteReader } from "./ByteReader.js";
import { NpkParseError, type NpkContainer, type NpkImgEntry } from "./types.js";

/** 16-byte magic string that identifies NPK files. */
const NPK_MAGIC = "NeoplePack_Bill";

/** Size of each IMG index entry in bytes: offset(4) + size(4) + encryptedName(256). */
const IMG_INDEX_ENTRY_SIZE = 264;

/** Size of the NPK checksum at the end of the index block. */
const NPK_CHECKSUM_SIZE = 32;

/** XOR key for name decryption (same 0x81A79011 used in PVF decryption). */
const NAME_XOR_KEY = 0x81a79011;

export class NpkParser {
  /**
   * Parse an NPK buffer. Returns the container with all IMG entries identified.
   * Does NOT decompress IMG data — that's ImgParser's job.
   */
  static parse(buf: Buffer): NpkContainer {
    const reader = new ByteReader(buf);

    // 1. Verify magic
    const magic = reader.readString(NPK_MAGIC.length, "ascii");
    if (magic !== NPK_MAGIC) {
      throw new NpkParseError(
        `Invalid NPK magic: expected "${NPK_MAGIC}", got "${magic}"`,
        reader.position - NPK_MAGIC.length
      );
    }

    // 2. Read imgCount (4 bytes)
    const imgCount = reader.readUint32();
    if (imgCount === 0) {
      return {
        imgCount: 0,
        storedChecksum: "",
        computedChecksum: "",
        checksumMatches: true,
        entries: [],
      };
    }

    // 3. Parse index entries
    const entries: NpkImgEntry[] = [];
    for (let i = 0; i < imgCount; i++) {
      if (reader.remaining < IMG_INDEX_ENTRY_SIZE) {
        throw new NpkParseError(
          `Truncated NPK: expected IMG index entry ${i}/${imgCount}, but only ${reader.remaining} bytes remaining`,
          reader.position,
          true
        );
      }

      const offset = reader.readUint32();
      const size = reader.readUint32();
      const rawName = reader.readBytes(256);

      // Decrypt the filename using XOR 0x81A79011 + rotate-right-6
      const name = NpkParser._decryptName(rawName);

      entries.push({ offset, size, name, rawName: new Uint8Array(rawName) });
    }

    // 4. Read stored checksum (32 bytes)
    let storedChecksum = "";
    try {
      storedChecksum = reader.readBytes(NPK_CHECKSUM_SIZE).toString("hex");
    } catch {
      storedChecksum = "";
    }

    // 5. Compute SHA256 checksum
    // Checksum covers: all bytes from start through end of index block
    // (i.e., everything except the checksum itself)
    const dataForChecksum = buf.subarray(0, buf.length - (reader.remaining > 0 ? reader.remaining : 0));
    const computedChecksum = createHash("sha256").update(dataForChecksum).digest("hex");
    const checksumMatches = storedChecksum === computedChecksum;

    return {
      imgCount,
      storedChecksum,
      computedChecksum,
      checksumMatches,
      entries,
    };
  }

  /**
   * Verify SHA256 checksum against stored checksum in the file.
   * Returns false if the file has been truncated or corrupted.
   */
  static verifyChecksum(buf: Buffer): boolean {
    try {
      const result = NpkParser.parse(buf);
      return result.checksumMatches;
    } catch {
      return false;
    }
  }

  /**
   * Decrypt an NPK IMG filename.
   * Algorithm: XOR each 4-byte chunk with 0x81A79011, then rotate-right 6 bits.
   * Stop at first null byte (null-terminated within the 256-byte field).
   */
  private static _decryptName(raw: Buffer): string {
    // Copy to avoid mutating the original buffer
    const decrypted = Buffer.alloc(raw.length);

    for (let i = 0; i < raw.length; i += 4) {
      // Read 4 bytes as LE uint32
      const b0 = raw[i]!;
      const b1 = raw[i + 1]!;
      const b2 = raw[i + 2]!;
      const b3 = raw[i + 3]!;
      let value = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;

      // XOR with key
      value ^= NAME_XOR_KEY;

      // Rotate right 6 bits on 32-bit unsigned
      value = ((value >>> 6) | (value << 26)) >>> 0;

      // Write back as LE
      decrypted[i] = value & 0xff;
      decrypted[i + 1] = (value >>> 8) & 0xff;
      decrypted[i + 2] = (value >>> 16) & 0xff;
      decrypted[i + 3] = (value >>> 24) & 0xff;
    }

    // Find null terminator
    const nullIdx = decrypted.indexOf(0);
    const nameBytes = nullIdx >= 0 ? decrypted.subarray(0, nullIdx) : decrypted;

    // Try CP949 (EUC-KR) decoding — NPK names use Korean encoding
    try {
      return nameBytes.toString("euc-kr" as BufferEncoding);
    } catch {
      // Fallback to latin1
      let result = "";
      for (let i = 0; i < nameBytes.length; i++) {
        const b = nameBytes[i]!;
        result += b < 0x80 ? String.fromCharCode(b) : "?";
      }
      return result;
    }
  }
}
