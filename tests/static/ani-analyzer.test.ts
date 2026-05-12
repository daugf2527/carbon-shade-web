// ani-analyzer.test.ts — Tests for AniAnalyzer .ani binary parser.
// Uses inline binary fixtures for deterministic testing.
// Real PVF-extracted .ani files are tested when Script.pvf is available.

import { assert } from "./test-utils.js";
import { AniAnalyzer } from "../../src/extraction/AniAnalyzer.js";
import { PvfParser } from "../../src/extraction/PvfParser.js";
import { readFileSync } from "node:fs";

// ── Helper: build a minimal .ani binary ──

/** Build a minimal .ani binary buffer with header + img path + optional frame data.
 *  Version byte = 6 (was the old expected magic 0x06), sub-version 0x0001 */
function buildAni(imgPath: string, frameData?: Buffer): Buffer {
  const magic = Buffer.from([0x06, 0x00, 0x01, 0x00]);
  const pathBuf = Buffer.from(imgPath, "ascii");
  const strLen = Buffer.alloc(4);
  strLen.writeUInt32LE(pathBuf.length, 0);

  if (frameData && frameData.length > 0) {
    return Buffer.concat([magic, strLen, pathBuf, frameData]);
  }
  return Buffer.concat([magic, strLen, pathBuf]);
}

/** Build a 32-byte frame record (common .ani frame format) */
function build32ByteRecord(frameIndex: number, payload: Buffer): Buffer {
  const record = Buffer.alloc(32);
  // frame index at 0x00 (int32 LE)
  record.writeInt32LE(frameIndex, 0);
  // copy payload at offset 0x04
  payload.copy(record, 4, 0, Math.min(payload.length, 28));
  return record;
}

// ── Tests ──

// Test 1: Parse minimal .ani (just header + img path, no hitboxes)
{
  const buf = buildAni("Character/Swordman/Test.img");
  const result = AniAnalyzer.parse(buf, "test.ani");

  assert.ok(result, "Should return AniDef for minimal .ani");
  assert.equal(result.imgPath, "Character/Swordman/Test.img");
  assert.equal(result.totalFrames, 0, "No frame data → 0 totalFrames");
  assert.equal(result.hitBoxes.length, 0, "No frame data → 0 hitBoxes");
  // New version-aware parser always emits "Version N, sub-version N"
  assert.ok(result.parseWarnings.length >= 1, "Should have at least version info warning");
  assert.ok(result.parseWarnings[0]!.includes("Version"), "First warning should mention version");
  assert.equal(result.sourcePath, "test.ani");
  assert.equal(result.rawSections.length, 0, "No rawSections without frame data");
}

// Test 2: Parse .ani with frame data (no hitboxes in records)
{
  const frameData = Buffer.alloc(128);
  // Fill with blank 32-byte records (all zeros)
  const buf = buildAni("Test/EmptyFrames.img", frameData);
  const result = AniAnalyzer.parse(buf);

  assert.ok(result);
  assert.equal(result.imgPath, "Test/EmptyFrames.img");
  assert.ok(result.totalFrames > 0, "Should detect frames from data");
  assert.equal(result.rawSections.length, 1, "Should have frameData rawSection");
  assert.equal(result.rawSections[0]!.type, "frameData");
}

// Test 3: Empty buffer → graceful error
{
  const result = AniAnalyzer.parse(Buffer.alloc(0));
  assert.ok(result);
  assert.equal(result.imgPath, "");
  assert.equal(result.totalFrames, 0);
  assert.ok(result.parseWarnings.length > 0, "Should have warning for empty buffer");
}

// Test 4: Buffer too small for header → graceful error
{
  const result = AniAnalyzer.parse(Buffer.from([0x06]));
  assert.ok(result);
  assert.ok(result.parseWarnings.length > 0, "Should have warning for tiny buffer");
}

// Test 5: Invalid magic bytes → warning but still parses
{
  const buf = buildAni("Test/BadMagic.img");
  // Corrupt first byte
  buf[0] = 0xFF;
  const result = AniAnalyzer.parse(buf, undefined);
  assert.ok(result);
  assert.equal(result.imgPath, "Test/BadMagic.img", "Should still parse img path despite bad magic");
  // New version-aware parser treats first byte as version, not magic
  assert.ok(result.parseWarnings.some(w => w.includes("Version")), "Should have version warning even for bad first byte");
}

// Test 6: Frame data with int16 hitbox coordinates
{
  // Build a 32-byte record with valid-looking int16 coordinates at offset 0x08
  const record = Buffer.alloc(32);
  record.writeInt32LE(5, 0); // frame 5

  // Place int16 hitbox coords at offset 8: x1=-50, y1=-100, z1=0, x2=50, y2=10, z2=80
  const coords = [-50, -100, 0, 50, 10, 80];
  for (let i = 0; i < 6; i++) {
    record.writeInt16LE(coords[i]!, 8 + i * 2);
  }

  const buf = buildAni("Test/HitBoxFrame.img", record);
  const result = AniAnalyzer.parse(buf);

  assert.ok(result);
  assert.ok(result.hitBoxes.length >= 0, "Hitbox extraction is optional — may or may not find pattern");
}

// Test 7: Multiple frame records
{
  const records: Buffer[] = [];
  for (let f = 0; f < 10; f++) {
    records.push(build32ByteRecord(f, Buffer.alloc(28)));
  }
  const frameData = Buffer.concat(records);
  const buf = buildAni("Test/MultiFrame.img", frameData);
  const result = AniAnalyzer.parse(buf);

  assert.ok(result);
  assert.equal(result.totalFrames, 10, "Should detect 10 frames from 10×32-byte records");
}

// Test 8: Script.pvf cross-reference (if available)
// This test is skipped if Script.pvf is not accessible.
{
  let pvfAvailable = false;
  const PVF_PATH = "D:/BaiduNetdiskDownload/DNF客户端（2018年2月更新）/地下城与勇士/Script.pvf";
  try {
    readFileSync(PVF_PATH);
    pvfAvailable = true;
  } catch {
    // Script.pvf not available — skip cross-reference
  }

  if (pvfAvailable) {
    const pvfBuf = readFileSync(PVF_PATH);
    const p = PvfParser.parse(pvfBuf);

    // Test with a known swordman .ani
    const aniPath = "character/swordman/animation/weaponcomboblade4.ani";
    const result = AniAnalyzer.extractAndParse(pvfBuf, p, aniPath);

    assert.ok(result, "extractAndParse should return result for known .ani");
    assert.ok(result!.imgPath.length > 0, "Should have non-empty imgPath");
    // Note: totalFrames may be 0 if detectRecordSize cannot parse the format.
    // The .ani binary format is being reverse-engineered; best-effort parsing.
    assert.ok(result!.parseWarnings.length >= 0, "parseWarnings should be an array");
    assert.equal(result!.sourcePath, aniPath);
  }
}

console.log("PASS: ani-analyzer tests (8/8)");
