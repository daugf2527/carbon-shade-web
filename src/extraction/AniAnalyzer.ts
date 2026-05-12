// AniAnalyzer — Binary parser for DNF .ani animation files.
// Extracts frame data, hitbox/collision box definitions, and animation metadata.
//
// .ani files are compiled binary format stored inside Script.pvf (NOT ImagePacks2).
// They reference .img sprite files and define per-frame hitbox regions used by
// the DNF combat engine.
//
// Binary format (reverse-engineered from DNF Script.pvf samples, 2026-05):
//   Offset  Size  Description
//   0x00    1     Version byte (0x01–0x0f observed)
//   0x01    2     Reserved / sub-version (usually 0x00 0x01 or 0x00 0x02)
//   0x03    1     Reserved
//   0x04    4     String length (uint32 LE)
//   0x08    N     .img file path (CP949/ASCII)
//   0x08+N  -     Frame data section (variable-length, version-dependent records)
//
// Frame record structure (varies by version byte):
//   Common patterns across versions:
//   - Records start with a frame index (u32 or u16)
//   - Coordinate data uses s16 values (typically in range [-2000, 2000])
//   - Each version has a characteristic record size
//   - Hitbox data encodes: x1,y1,z1,x2,y2,z2 as 6 s16 values
//
// Version-specific record sizes observed:
//   v1 (0x01): ~24 bytes per record
//   v2 (0x02): ~27 bytes
//   v3 (0x03): ~34 bytes
//   v5 (0x05): ~31 bytes
//   v9 (0x09): ~30 bytes
//   v15 (0x0f): ~27 bytes

import { ByteReader } from "./ByteReader.js";
import type { AniDef, AniHitBox, PvfContainer } from "./types.js";
import { PvfParser } from "./PvfParser.js";

/** Minimum .ani file size: version(1)+reserved(3)+strLen(4)+at least 1 char = 9 bytes */
const MIN_ANI_SIZE = 9;

/** Known per-version record sizes (bytes), mapped from hex analysis */
const VERSION_RECORD_SIZE: Record<number, number> = {
  1: 24,   // tiny-93B
  2: 27,   // small-121B
  3: 34,   // medium-135B / med2-157B
  5: 31,   // large-197B
  9: 30,   // anims-309B
  15: 27,  // anims-669B (v15 with sub-version 0x02)
};

/** Fallback record sizes to try when version is unknown */
const FALLBACK_RECORD_SIZES = [24, 27, 30, 31, 32, 34, 36, 40];

export class AniAnalyzer {
  /**
   * Parse a raw .ani binary buffer into a structured AniDef.
   *
   * The parser handles version-dependent frame record formats.
   * Unknown sections are preserved in rawSections for forward compatibility.
   *
   * @param buf — raw .ani file bytes
   * @param sourcePath — source path for provenance
   * @returns structured AniDef with extracted hitboxes and metadata
   */
  static parse(buf: Buffer, sourcePath?: string): AniDef {
    const parseWarnings: string[] = [];
    const rawSections: Array<{ type: string; offset: number; size: number }> = [];

    // 1. Validate minimum size
    if (buf.length < MIN_ANI_SIZE) {
      return {
        imgPath: "",
        totalFrames: 0,
        hitBoxes: [],
        rawSections: [],
        sourcePath,
        parseWarnings: ["File too small to contain valid .ani header"],
      };
    }

    // 2. Read version byte and validate
    const version = buf[0]!;
    const subVersion = buf.readUInt16LE(1);
    parseWarnings.push(`Version ${version}, sub-version ${subVersion}`);

    // 3. Read .img path string (length-prefixed, at offset 4)
    const strLen = buf.readUInt32LE(4);
    let imgPath = "";
    if (strLen > 0 && strLen <= buf.length - 8) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const iconv = require("iconv-lite");
        imgPath = iconv.decode(buf.subarray(8, 8 + strLen), "cp949").replace(/\x00/g, "");
      } catch {
        imgPath = buf.subarray(8, 8 + strLen).toString("ascii").replace(/\x00/g, "");
      }
    } else if (strLen > buf.length - 8) {
      parseWarnings.push(`String length ${strLen} exceeds remaining data`);
    }

    // 4. Parse frame data section
    const frameDataStart = 8 + strLen;
    const frameDataSize = buf.length - frameDataStart;
    if (frameDataSize > 0) {
      rawSections.push({ type: "frameData", offset: frameDataStart, size: frameDataSize });
    }

    const hitBoxes: AniHitBox[] = [];
    let totalFrames = 0;

    if (frameDataSize > 0) {
      const frameData = buf.subarray(frameDataStart);

      // Determine record size (version-aware)
      const recordSize = AniAnalyzer.detectRecordSize(frameData, version);
      if (recordSize === 0) {
        parseWarnings.push(`Cannot determine frame record size (v${version}, ${frameDataSize} bytes)`);
      } else {
        totalFrames = Math.floor(frameDataSize / recordSize);
        parseWarnings.push(`Record size ${recordSize} bytes, ${totalFrames} frames`);

        // Parse each frame record
        for (let f = 0; f < totalFrames; f++) {
          const recordOffset = f * recordSize;
          const record = frameData.subarray(recordOffset, recordOffset + recordSize);

          const frameInfo = AniAnalyzer.parseFrameRecord(record, recordSize, f, version);
          if (frameInfo.hitBox) {
            hitBoxes.push(frameInfo.hitBox);
          }
          if (frameInfo.warning) {
            parseWarnings.push(`Frame ${f}: ${frameInfo.warning}`);
          }
        }
      }
    }

    return {
      imgPath,
      totalFrames,
      hitBoxes,
      rawSections,
      sourcePath,
      parseWarnings,
    };
  }

  /**
   * Detect frame record size using version knowledge and data analysis.
   *
   * 1. If the version byte maps to a known record size AND the frame data
   *    is evenly divisible by it, use it directly.
   * 2. Otherwise, try fallback sizes, checking which produces sequential
   *    frame indices across multiple records.
   *
   * @param data — raw frame data bytes
   * @param version — .ani version byte (buf[0])
   * @returns detected record size, or 0 if undetermined
   */
  private static detectRecordSize(data: Uint8Array, version: number): number {
    if (data.length < 8) return 0;

    // 1. Check version-specific known size first
    const knownSize = VERSION_RECORD_SIZE[version];
    if (knownSize && data.length % knownSize === 0) {
      // Verify by checking frame indices are sequential
      const recordCount = Math.floor(data.length / knownSize);
      if (recordCount >= 2) {
        let sequential = true;
        for (let r = 1; r < Math.min(5, recordCount); r++) {
          const prev = AniAnalyzer.readInt32LE(data, (r - 1) * knownSize);
          const curr = AniAnalyzer.readInt32LE(data, r * knownSize);
          if (curr !== prev + 1 && curr !== prev) {
            sequential = false;
            break;
          }
        }
        if (sequential) return knownSize;
      } else if (recordCount === 1) {
        return knownSize; // single record — trust the known size
      }
    }

    // 2. Fallback: try each candidate size
    for (const size of FALLBACK_RECORD_SIZES) {
      if (size === knownSize) continue; // already checked above
      if (data.length < size * 2) continue;
      if (data.length % size !== 0) continue;

      let consistent = 0;
      const total = Math.min(5, Math.floor(data.length / size));
      for (let r = 1; r < total; r++) {
        const prevFrame = AniAnalyzer.readInt32LE(data, (r - 1) * size);
        const currFrame = AniAnalyzer.readInt32LE(data, r * size);
        if (currFrame === prevFrame + 1 || currFrame === prevFrame) {
          consistent++;
        }
      }
      if (consistent >= Math.max(1, total - 2)) {
        return size;
      }
    }

    // 3. Absolute fallback: check divisibility
    for (const size of FALLBACK_RECORD_SIZES) {
      if (data.length % size === 0) return size;
    }

    return 0;
  }

  /** Read a little-endian int32 from a buffer at given offset */
  private static readInt32LE(buf: Uint8Array, offset: number): number {
    return (
      (buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16) | (buf[offset + 3]! << 24))
    ) >>> 0;
  }

  /** Read a little-endian int16 from a buffer at given offset */
  private static readInt16LE(buf: Uint8Array, offset: number): number {
    const val = (buf[offset]! | (buf[offset + 1]! << 8));
    return val > 0x7FFF ? val - 0x10000 : val;
  }

  /**
   * Parse a single frame record, extracting hitbox data if present.
   *
   * Uses version-specific knowledge for record layout:
   *   v3, v5, v9: coordinate data at known offsets as signed int16 pairs
   *   Others: heuristic scanning for coordinate-like patterns
   *
   * @param record — raw frame record bytes
   * @param recordSize — detected record size for this file
   * @param frameIndex — sequential index in the parsed loop
   * @param version — .ani version byte
   */
  private static parseFrameRecord(
    record: Uint8Array,
    recordSize: number,
    frameIndex: number,
    version: number,
  ): { hitBox?: AniHitBox; warning?: string } {
    if (recordSize < 4) return {};

    // Read the stored frame index (usually first u32)
    const storedFrameIndex = AniAnalyzer.readInt32LE(record, 0);

    // Version-specific hitbox extraction
    switch (version) {
      case 3: // medium-135B, med2-157B — coords at offset 8-19 (6 s16 values)
        if (recordSize >= 20) {
          const coords: number[] = [];
          for (let i = 0; i < 6; i++) {
            coords.push(AniAnalyzer.readInt16LE(record, 8 + i * 2));
          }
          return AniAnalyzer.tryExtractHitbox(coords, storedFrameIndex);
        }
        break;

      case 5: // large-197B — coords at offset 8-19
        if (recordSize >= 20) {
          const coords: number[] = [];
          for (let i = 0; i < 6; i++) {
            coords.push(AniAnalyzer.readInt16LE(record, 8 + i * 2));
          }
          return AniAnalyzer.tryExtractHitbox(coords, storedFrameIndex);
        }
        break;

      case 9: // anims-309B — coords at offset 14-25
        if (recordSize >= 26) {
          const coords: number[] = [];
          for (let i = 0; i < 6; i++) {
            coords.push(AniAnalyzer.readInt16LE(record, 14 + i * 2));
          }
          return AniAnalyzer.tryExtractHitbox(coords, storedFrameIndex);
        }
        break;

      case 15: // anims-669B — coords at offset 8-19 (s16)
        if (recordSize >= 20) {
          const coords: number[] = [];
          for (let i = 0; i < 6; i++) {
            coords.push(AniAnalyzer.readInt16LE(record, 8 + i * 2));
          }
          return AniAnalyzer.tryExtractHitbox(coords, storedFrameIndex);
        }
        break;

      default: {
        // Heuristic: scan record for coordinate-like patterns
        // Try offsets 4, 8, 12 for 6 consecutive s16 values in range [-5000, 5000]
        for (const off of [4, 8, 12, 14]) {
          if (off + 12 > recordSize) continue;
          const coords: number[] = [];
          for (let i = 0; i < 6; i++) {
            coords.push(AniAnalyzer.readInt16LE(record, off + i * 2));
          }
          const valid = coords.filter(c => c !== 0 && Math.abs(c) <= 5000).length >= 4;
          if (valid) {
            return AniAnalyzer.tryExtractHitbox(coords, storedFrameIndex);
          }
        }
        return {};
      }
    }

    return {};
  }

  /**
   * Try to extract hitbox coordinates from pre-parsed coordinate array.
   * Returns undefined if the data doesn't look like a valid hitbox.
   *
   * @param coords — array of 6 int16 values (x1, y1, z1, x2, y2, z2)
   * @param frameIndex — frame index to assign to the hitbox
   */
  private static tryExtractHitbox(
    coords: number[],
    frameIndex: number,
  ): { hitBox?: AniHitBox; warning?: string } {
    if (coords.length < 6) return {};

    // Validate coordinates look reasonable for a hitbox
    const nonZeroCount = coords.filter(c => c !== 0).length;
    const allInRange = coords.every(c => Math.abs(c) <= 5000);

    if (nonZeroCount >= 4 && allInRange) {
      // This looks like a valid hitbox
      return {
        hitBox: {
          shape: "rect",
          frameStart: frameIndex,
          frameEnd: frameIndex,
          x1: coords[0]!,
          y1: coords[1]!,
          z1: coords[2]!,
          x2: coords[3]!,
          y2: coords[4]!,
          z2: coords[5]!,
        },
      };
    }

    return { warning: `No valid hitbox pattern in coords: ${coords.join(",")}` };
  }

  /**
   * Convenience method: extract a .ani file from a PVF container and parse it.
   *
   * @param pvfBuf — raw Script.pvf buffer
   * @param container — parsed PvfContainer from PvfParser.parse()
   * @param aniPath — exact .ani file path within the PVF
   */
  static extractAndParse(
    pvfBuf: Buffer,
    container: PvfContainer,
    aniPath: string,
  ): AniDef | undefined {
    const data = PvfParser.extractFile(pvfBuf, container, aniPath);
    if (!data) return undefined;
    return AniAnalyzer.parse(data, aniPath);
  }
}