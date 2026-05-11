// img-parser.test.ts — Tests for ImgParser IMG frame extraction.
// Uses inline binary fixtures built from the npk-api format documentation.

import { assert } from "./test-utils.js";
import { ImgParser } from "../../src/extraction/ImgParser.js";
import type { ImgFrame } from "../../src/extraction/types.js";
import { deflateSync } from "node:zlib";

// ── Helper: build a minimal V2 IMG buffer ──

/** Magic prefix for IMG files. */
const IMG_MAGIC = Buffer.from("Neople Img File\0\0\0\0\0", "ascii"); // 20 bytes

interface ImgFrameInput {
  colorMode?: number;   // default 0x0E
  compression?: number;  // default 0x06 (ZLIB)
  width?: number;        // pixel width
  height?: number;       // pixel height
  pivotX?: number;       // draw start X
  pivotY?: number;       // draw start Y
  frameWidth?: number;   // bounding box width
  frameHeight?: number;  // bounding box height
  pixelData?: Buffer;    // raw pixel data (will be ZLIB-compressed if compression=6)
  isLink?: boolean;
  linkFrame?: number;
}

function buildV2Img(frames: ImgFrameInput[], version: number = 2): Buffer {
  const imageFrames = frames.filter(f => !f.isLink);
  const linkFrames = frames.filter(f => f.isLink);
  const totalFrames = frames.length;

  // Calculate data sizes for each image frame
  const frameData: Buffer[] = [];
  for (const f of imageFrames) {
    const raw = f.pixelData ?? Buffer.alloc((f.width ?? 32) * (f.height ?? 32) * 4, 0x7f);
    if ((f.compression ?? 6) === 6) {
      frameData.push(deflateSync(raw));
    } else {
      frameData.push(raw);
    }
  }

  // Index entry size: 36 bytes per image frame (9 fields × 4B), 32 per link frame
  const indexSize = imageFrames.length * 36 + linkFrames.length * 32;
  const headerSize = 20 + 16; // magic(20) + indexSize(4) + reserved(4) + version(4) + indexCount(4)

  const buf = Buffer.alloc(headerSize + indexSize + frameData.reduce((s, d) => s + d.length, 0));
  let pos = 0;

  // Magic
  IMG_MAGIC.copy(buf, pos);
  pos += IMG_MAGIC.length;

  // indexSize, reserved, version, indexCount
  buf.writeUInt32LE(indexSize, pos); pos += 4;
  buf.writeUInt32LE(0, pos); pos += 4;          // reserved
  buf.writeUInt32LE(version, pos); pos += 4;     // version
  buf.writeUInt32LE(totalFrames, pos); pos += 4; // indexCount

  // Index entries
  let dataOffset = 0;
  for (const f of frames) {
    if (f.isLink) {
      buf.writeUInt32LE(0x11, pos); pos += 4;        // colorMode = link
      buf.writeInt32LE(f.linkFrame ?? 0, pos); pos += 4; // link target
      pos += 24; // padding
    } else {
      const dataSize = frameData[imageFrames.indexOf(f)]?.length ?? 0;
      buf.writeUInt32LE(f.colorMode ?? 0x0E, pos); pos += 4;
      buf.writeUInt32LE(f.compression ?? 6, pos); pos += 4;
      buf.writeUInt32LE(f.width ?? 32, pos); pos += 4;
      buf.writeUInt32LE(f.height ?? 32, pos); pos += 4;
      buf.writeUInt32LE(dataSize, pos); pos += 4;
      buf.writeInt32LE(f.pivotX ?? 0, pos); pos += 4;
      buf.writeInt32LE(f.pivotY ?? 0, pos); pos += 4;
      buf.writeUInt32LE(f.frameWidth ?? 32, pos); pos += 4;
      buf.writeUInt32LE(f.frameHeight ?? 32, pos); pos += 4;
    }
  }

  // Data section
  for (const d of frameData) {
    d.copy(buf, pos);
    pos += d.length;
  }

  return buf;
}

// ── Test 1: Parse valid V2 IMG with 3 image frames ──

{
  const buf = buildV2Img([
    { width: 16, height: 16, pivotX: 0, pivotY: 0, frameWidth: 16, frameHeight: 16 },
    { width: 32, height: 32, pivotX: 5, pivotY: -10, frameWidth: 32, frameHeight: 32 },
    { width: 64, height: 64, pivotX: -32, pivotY: -60, frameWidth: 64, frameHeight: 64 },
  ]);

  const result = ImgParser.parse(buf);
  assert.equal(result.version, 2, "version should be 2");
  assert.equal(result.indexCount, 3, "should have 3 frames");
  assert.equal(result.frames.length, 3, "frames array length");
  assert.equal(result.stats.linkFrames, 0, "no link frames");
  assert.equal(result.stats.compressedFrames, 3, "all compressed");

  const f0 = result.frames[0]!;
  assert.equal(f0.type, "image");
  assert.equal(f0.frameIndex, 0);
  assert.equal(f0.width, 16);
  assert.equal(f0.height, 16);
  assert.equal(f0.pivotX, 0);
  assert.equal(f0.pivotY, 0);
  assert.equal(f0.frameWidth, 16);
  assert.equal(f0.frameHeight, 16);
  assert.ok(f0.data !== undefined, "frame 0 should have data");
  assert.ok(!f0.error, "frame 0 should not have error");

  const f1 = result.frames[1]!;
  assert.equal(f1.pivotX, 5, "pivotX can be positive");
  assert.equal(f1.pivotY, -10, "pivotY can be negative");

  const f2 = result.frames[2]!;
  assert.equal(f2.pivotX, -32, "pivotX can be negative");
  assert.equal(f2.pivotY, -60, "pivotY can be negative");
}

// ── Test 2: ZLIB decompression ──

{
  // Build a V2 IMG where the pixel data is known pre-compression
  const rawPixels = Buffer.alloc(16 * 16 * 4, 0x7f);
  rawPixels[0] = 0xff; // mark first byte so we can verify decompression
  const compressed = deflateSync(rawPixels);

  const buf = buildV2Img([
    { width: 16, height: 16, pixelData: rawPixels },
  ]);

  const result = ImgParser.parse(buf);
  const frame = result.frames[0]!;
  assert.ok(frame.data !== undefined, "should have decompressed data");
  assert.equal(frame.data!.length, 16 * 16 * 4, "decompressed size correct");
  assert.equal(frame.data![0], 0xff, "first byte preserved after decompression");
  assert.equal(result.stats.compressedFrames, 1);
}

// ── Test 3: Link frames ──

{
  const buf = buildV2Img([
    { width: 32, height: 32 },
    { isLink: true, linkFrame: 0 },
    { width: 16, height: 16 },
    { isLink: true, linkFrame: 2 },
  ]);

  const result = ImgParser.parse(buf);
  assert.equal(result.frames.length, 4, "4 total frames");
  assert.equal(result.stats.linkFrames, 2, "2 link frames");

  const f1 = result.frames[1]!;
  assert.equal(f1.type, "link");
  assert.equal(f1.linkFrame, 0);

  const f3 = result.frames[3]!;
  assert.equal(f3.type, "link");
  assert.equal(f3.linkFrame, 2);
}

// ── Test 4: resolveLinks option ──

{
  const buf = buildV2Img([
    { width: 32, height: 32, pivotX: 10, pivotY: 20 },
    { isLink: true, linkFrame: 0 },
  ]);

  // With resolveLinks=true (default), link frames remain as type "link"
  const result = ImgParser.parse(buf);
  assert.equal(result.frames[1]!.type, "link", "link frame remains link type");
  assert.equal(result.frames[1]!.linkFrame, 0, "link points to frame 0");
}

// ── Test 5: V4 IMG with palette ──

{
  // Build a minimal V4 IMG: header + palette + 1 frame
  const rawPixels = Buffer.alloc(32 * 32, 0x00); // V4 uses 1-byte palette indices
  const palette = Buffer.alloc(256 * 4, 0x00);   // 256 colors RGBA
  // Set first palette entry to red
  palette[0] = 0xff; palette[1] = 0x00; palette[2] = 0x00; palette[3] = 0xff;

  const dataSize = rawPixels.length;
  const indexSize = 36; // 1 frame (9 fields × 4B)
  const headerSize = 20 + 16 + palette.length; // magic + fields + palette

  const buf = Buffer.alloc(headerSize + indexSize + dataSize);
  let pos = 0;
  IMG_MAGIC.copy(buf, pos); pos += IMG_MAGIC.length;
  buf.writeUInt32LE(indexSize, pos); pos += 4;
  buf.writeUInt32LE(0, pos); pos += 4;
  buf.writeUInt32LE(4, pos); pos += 4; // version 4
  buf.writeUInt32LE(1, pos); pos += 4; // 1 frame

  // Palette
  palette.copy(buf, pos); pos += palette.length;

  // Frame index entry (uncompressed)
  buf.writeUInt32LE(0x0E, pos); pos += 4; // colorMode
  buf.writeUInt32LE(5, pos); pos += 4;    // uncompressed
  buf.writeUInt32LE(32, pos); pos += 4;   // width
  buf.writeUInt32LE(32, pos); pos += 4;   // height
  buf.writeUInt32LE(dataSize, pos); pos += 4;
  buf.writeInt32LE(0, pos); pos += 4;     // pivotX
  buf.writeInt32LE(0, pos); pos += 4;     // pivotY
  buf.writeUInt32LE(32, pos); pos += 4;   // frameWidth
  buf.writeUInt32LE(32, pos); pos += 4;   // frameHeight

  // Data
  rawPixels.copy(buf, pos);

  const result = ImgParser.parse(buf);
  assert.equal(result.version, 4, "version 4");
  assert.ok(result.palette !== undefined, "V4 should have palette");
  assert.equal(result.palette!.length, 256 * 4, "palette size 1024");
  assert.equal(result.palette![0], 0xff, "first palette byte red");
}

// ── Test 6: V5 IMG with DDS frames ──

{
  // V5: frame data is DDS, stored raw. Build a minimal V5 IMG.
  const ddsData = Buffer.alloc(128, 0xaa); // 128 bytes of fake DDS
  const dataSize = ddsData.length;
  const indexSize = 36;

  const buf = Buffer.alloc(20 + 16 + indexSize + dataSize);
  let pos = 0;
  IMG_MAGIC.copy(buf, pos); pos += IMG_MAGIC.length;
  buf.writeUInt32LE(indexSize, pos); pos += 4;
  buf.writeUInt32LE(0, pos); pos += 4;
  buf.writeUInt32LE(5, pos); pos += 4; // version 5
  buf.writeUInt32LE(1, pos); pos += 4;

  // Frame index
  buf.writeUInt32LE(0x12, pos); pos += 4; // DDS color mode
  buf.writeUInt32LE(5, pos); pos += 4;    // uncompressed
  buf.writeUInt32LE(64, pos); pos += 4;   // width
  buf.writeUInt32LE(64, pos); pos += 4;   // height
  buf.writeUInt32LE(dataSize, pos); pos += 4;
  buf.writeInt32LE(0, pos); pos += 4;
  buf.writeInt32LE(0, pos); pos += 4;
  buf.writeUInt32LE(64, pos); pos += 4;
  buf.writeUInt32LE(64, pos); pos += 4;

  // DDS data
  ddsData.copy(buf, pos);

  const result = ImgParser.parse(buf, { decompress: true });
  assert.equal(result.version, 5, "version 5");
  assert.equal(result.frames[0]!.format, "dds", "V5 frame format should be 'dds'");
  assert.equal(result.frames[0]!.data!.length, dataSize, "DDS data stored raw");
  assert.equal(result.frames[0]!.data![0], 0xaa, "DDS data preserved");
}

// ── Test 7: Truncated data section ──

{
  const buf = buildV2Img([
    { width: 16, height: 16 },
  ]);

  // Truncate: remove last half of data
  const truncated = buf.subarray(0, buf.length - 64);

  let errorCaught = false;
  try {
    ImgParser.parse(truncated);
  } catch (e: unknown) {
    errorCaught = true;
    assert.ok(e instanceof Error, "should throw on truncation");
  }
  assert.ok(errorCaught, "truncated IMG should throw");
}

// ── Test 8: Unsupported version ──

{
  // Build an IMG with version 6 (not yet supported)
  const headerSize = 20 + 16;
  const buf = Buffer.alloc(headerSize + 32 + 64);
  let pos = 0;
  IMG_MAGIC.copy(buf, pos); pos += IMG_MAGIC.length;
  buf.writeUInt32LE(32, pos); pos += 4;    // indexSize
  buf.writeUInt32LE(0, pos); pos += 4;     // reserved
  buf.writeUInt32LE(6, pos); pos += 4;     // version 6 (unsupported)
  buf.writeUInt32LE(1, pos); pos += 4;     // indexCount

  let errorCaught = false;
  try {
    ImgParser.parse(buf);
  } catch (e: unknown) {
    errorCaught = true;
    const msg = (e as Error).message;
    assert.ok(msg.includes("Unsupported") || msg.includes("version"), "unsupported version message");
  }
  assert.ok(errorCaught, "unsupported version should throw");
}

// ── Done ──
console.log("img-parser.test.ts: all 8 tests passed");
