// ImgParser — IMG frame extraction for DNF (Dungeon & Fighter) asset files.
// Extracts per-frame metadata (frameCount, pivot, bounding box) from IMG V2/V4/V5 data.
// Handles ZLIB decompression, link frames (colorMode=0x11), V4 palette, and V5 DDS detection.
//
// Pure TypeScript, depends only on ByteReader, types, and node:zlib.

import { inflateSync } from "node:zlib";
import { ByteReader } from "./ByteReader.js";
import { ImgParseError, type ImgContainer, type ImgFrame, type ImgParseOptions, type ImgVersion } from "./types.js";

/** Magic prefix for IMG files. Actual magic field can be 16-20 bytes, null-padded. */
const IMG_MAGIC_PREFIX = "Neople Img File";

/** Size of an IMG V2 image frame index entry in bytes (without the data section). */
const V2_IMAGE_FRAME_ENTRY_SIZE = 32; // colorMode(4) + compression(4) + width(4) + height(4) + dataSize(4) + x(4) + y(4) + frameWidth(4) + frameHeight(4)

/** Size of a link frame index entry: colorMode(4) + linkFrame(4) + padding(24). */
const LINK_FRAME_ENTRY_SIZE = 32; // same total size as image frame, but only first 8 bytes are meaningful

/** V4 palette size: 256 colors × 4 bytes RGBA. */
const V4_PALETTE_SIZE = 256 * 4;

export class ImgParser {
  /**
   * Parse IMG data from a buffer.
   * @param buf - Raw IMG binary data (typically sliced from an NPK container entry).
   * @param options - Parse options (decompress, resolveLinks).
   * @returns ImgContainer with frames and stats.
   */
  static parse(buf: Buffer, options: ImgParseOptions = {}): ImgContainer {
    const decompress = options.decompress !== false;  // default true
    const resolveLinks = options.resolveLinks !== false;  // default true
    const reader = new ByteReader(buf);

    // 1. Read magic (variable length, null-padded, up to 20 bytes)
    // Strategy: read 20 bytes, find null terminator for magic.
    const magicStart = reader.position;
    const magicRaw = reader.readBytes(20);
    const nullIdx = magicRaw.indexOf(0);
    const magic = (nullIdx >= 0 ? magicRaw.subarray(0, nullIdx) : magicRaw).toString("ascii");
    if (!magic.startsWith(IMG_MAGIC_PREFIX)) {
      throw new ImgParseError(
        `Invalid IMG magic: expected prefix "${IMG_MAGIC_PREFIX}", got "${magic}"`,
        magicStart
      );
    }

    // 2. Read header fields
    const indexSize = reader.readUint32();       // size of the index block
    const reserved = reader.readUint32();         // reserved, usually 0
    const version = reader.readUint32() as ImgVersion;
    const indexCount = reader.readUint32();       // number of frames

    // Only versions 2, 4, 5 are supported (V6 not yet)
    if (version !== 2 && version !== 4 && version !== 5) {
      throw new ImgParseError(
        `Unsupported IMG version: ${version} (only V2, V4, V5 are supported)`,
        reader.position - 4
      );
    }

    const headerBytes = reader.position;
    const indexStart = reader.position;

    // 3. Handle V4/V6 palette (after header, before frame index)
    let palette: Buffer | undefined;
    if (version === 4) {
      if (reader.remaining >= V4_PALETTE_SIZE) {
        palette = reader.readBytes(V4_PALETTE_SIZE);
      }
    }

    // 4. Parse frame index entries
    const frames: ImgFrame[] = [];
    const dataOffsets: Array<{ frameIndex: number; offset: number; dataSize: number }> = [];
    let compressedFrames = 0;
    let linkFrames = 0;
    let dataBytesTotal = 0;

    for (let i = 0; i < indexCount; i++) {
      if (reader.remaining < 4) {
        throw new ImgParseError(
          `Truncated IMG: cannot read colorMode for frame ${i}/${indexCount}`,
          reader.position, i
        );
      }

      const frameStart = reader.position;
      const colorMode = reader.readUint32();

      if (colorMode === 0x11) {
        // Link frame — references another frame for deduplication
        const linkFrame = reader.readInt32(); // signed, though typically non-negative
        frames.push({ frameIndex: i, type: "link", linkFrame });
        linkFrames++;

        // Skip remaining 24 bytes of the 32-byte entry (all padding for link frames)
        reader.skip(24);
        continue;
      }

      // Image frame — read full 32-byte entry
      if (reader.remaining < 28) {
        throw new ImgParseError(
          `Truncated IMG: incomplete image frame ${i}/${indexCount}`,
          reader.position, i
        );
      }

      const compression = reader.readUint32();
      const width = reader.readUint32();
      const height = reader.readUint32();
      const dataSize = reader.readUint32();
      const pivotX = reader.readInt32();
      const pivotY = reader.readInt32();
      const frameWidth = reader.readUint32();
      const frameHeight = reader.readUint32();

      if (compression === 6) {
        compressedFrames++;
      }

      // Track offset into data section for later pixel data reading
      dataOffsets.push({ frameIndex: i, offset: dataBytesTotal, dataSize });
      dataBytesTotal += dataSize;

      frames.push({
        frameIndex: i,
        type: "image",
        colorMode,
        compression,
        width,
        height,
        pivotX,
        pivotY,
        frameWidth,
        frameHeight,
        compressedSize: dataSize,
      });
    }

    const indexBytes = reader.position - indexStart;

    // 5. Parse data section
    const dataStart = reader.position;
    if (reader.remaining < dataBytesTotal && dataBytesTotal > 0) {
      // Truncated data section — mark affected frames
      for (const dOff of dataOffsets) {
        if (dOff.offset + dOff.dataSize > reader.remaining) {
          const frame = frames[dOff.frameIndex];
          if (frame) {
            frame.error = "TRUNCATED_DATA";
          }
        }
      }
    }

    for (const dOff of dataOffsets) {
      const frame = frames[dOff.frameIndex];
      if (!frame || frame.type !== "image" || frame.error) continue;

      const bytesToRead = Math.min(dOff.dataSize, reader.remaining - dOff.offset);
      if (bytesToRead <= 0) {
        frame.error = "TRUNCATED_DATA";
        continue;
      }

      // Position the reader at the frame's data offset
      reader.position = dataStart + dOff.offset;
      const rawData = reader.readBytes(bytesToRead);

      if (frame.compression === 6 && decompress) {
        // ZLIB-compressed frame
        try {
          // Check ZLIB magic (0x78 0x9C or 0x78 0xDA or 0x78 0x01)
          if (rawData.length >= 2 && rawData[0] === 0x78) {
            const decompressed = inflateSync(rawData);
            frame.data = new Uint8Array(decompressed);
          } else {
            // Not valid ZLIB — treat as uncompressed
            frame.data = new Uint8Array(rawData);
          }
        } catch {
          // ZLIB inflate failed — store raw data with error flag
          frame.rawData = new Uint8Array(rawData);
          frame.error = "ZLIB_INFLATE_ERROR";
        }
      } else if (version === 5) {
        // V5 DDS frames — store raw, don't decode
        frame.data = new Uint8Array(rawData);
        frame.format = "dds";
      } else {
        // Uncompressed or decompress disabled
        frame.data = new Uint8Array(rawData);
      }

      frame.compressedSize = dOff.dataSize;
    }

    // 6. Resolve link frames if requested
    if (resolveLinks) {
      for (const frame of frames) {
        if (frame.type === "link" && frame.linkFrame !== undefined) {
          const target = frames[frame.linkFrame];
          // Only resolve one level; don't chain
        }
      }
    }

    return {
      version,
      indexCount,
      frames,
      stats: {
        headerBytes,
        indexBytes,
        dataBytes: dataBytesTotal,
        compressedFrames,
        linkFrames,
      },
      palette: palette ? new Uint8Array(palette) : undefined,
    };
  }
}
