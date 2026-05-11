// pvf-parser.test.ts — Tests for PvfParser PVF container parsing and file extraction.
// Uses inline binary fixtures built from the PVF format documentation.

import { assert } from "./test-utils.js";
import { PvfParser } from "../../src/extraction/PvfParser.js";

// ── Constants ──

const PVF_XOR_KEY = 0x81a79011;

// ── Helper: encrypt a chunk (reverse of decryptChunk) ──
// decryptChunk: XOR with key, then ROTR6
// encryptChunk: ROTL6, then XOR with key

function encryptChunk(buf: Buffer, crc32: number): Buffer {
  const key = (PVF_XOR_KEY ^ crc32) >>> 0;
  const result = Buffer.alloc(buf.length);
  const chunkCount = Math.floor(buf.length / 4);
  for (let i = 0; i < chunkCount; i++) {
    const offset = i * 4;
    let value = (buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16) | (buf[offset + 3]! << 24)) >>> 0;
    value = ((value << 6) | (value >>> 26)) >>> 0; // ROTL6
    value ^= key;
    result[offset] = value & 0xff;
    result[offset + 1] = (value >>> 8) & 0xff;
    result[offset + 2] = (value >>> 16) & 0xff;
    result[offset + 3] = (value >>> 24) & 0xff;
  }
  const remaining = buf.length % 4;
  if (remaining > 0) {
    for (let i = chunkCount * 4; i < buf.length; i++) {
      result[i] = buf[i]!;
    }
  }
  return result;
}

// ── Helper: build file tree buffer (unencrypted) ──

interface FileEntryInput {
  path: string;
  size: number;
  crc32?: number;
  offset: number;
}

function buildFileTree(entries: FileEntryInput[]): Buffer {
  let treeSize = 0;
  for (const e of entries) {
    const pathBuf = Buffer.from(e.path, "ascii");
    treeSize += 20 + pathBuf.length; // fileNumber(4) + pathLength(4) + path(pathLen) + size(4) + crc32(4) + offset(4)
  }
  const buf = Buffer.alloc(treeSize);
  let pos = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const pathBuf = Buffer.from(e.path, "ascii");
    buf.writeUInt32LE(i, pos); pos += 4;               // fileNumber
    buf.writeUInt32LE(pathBuf.length, pos); pos += 4;   // filePathLength
    pathBuf.copy(buf, pos); pos += pathBuf.length;      // path (CP949, ASCII subset here)
    buf.writeUInt32LE(e.size, pos); pos += 4;           // fileLength
    buf.writeUInt32LE(e.crc32 ?? 0, pos); pos += 4;    // fileCrc32
    buf.writeUInt32LE(e.offset, pos); pos += 4;         // relativeOffset
  }
  return buf;
}

// ── Helper: build a minimal PVF buffer ──

function buildPVF(
  uuid: string,
  fileVersion: number,
  dirTreeCrc32: number,
  entries: FileEntryInput[],
  filePackData: Buffer[]
): Buffer {
  const tree = buildFileTree(entries);
  const dirTreeLength = tree.length;
  const encryptedTree = dirTreeLength > 0 ? encryptChunk(tree, dirTreeCrc32) : tree;

  const uuidBuf = Buffer.from(uuid, "ascii");
  const headerSize = 4 + uuidBuf.length + 4 + 4 + 4 + 4;
  // uuidLength(4) + uuid(variable) + fileVersion(4) + dirTreeLength(4) + dirTreeCrc32(4) + headerFilesCount(4)
  const filePackSize = filePackData.reduce((s, d) => s + d.length, 0);

  const buf = Buffer.alloc(headerSize + dirTreeLength + filePackSize);
  let pos = 0;

  buf.writeUInt32LE(uuidBuf.length, pos); pos += 4;
  uuidBuf.copy(buf, pos); pos += uuidBuf.length;
  buf.writeUInt32LE(fileVersion, pos); pos += 4;
  buf.writeUInt32LE(dirTreeLength, pos); pos += 4;
  buf.writeUInt32LE(dirTreeCrc32, pos); pos += 4;
  buf.writeUInt32LE(entries.length, pos); pos += 4;

  // Encrypted directory tree
  if (dirTreeLength > 0) {
    encryptedTree.copy(buf, pos); pos += encryptedTree.length;
  }

  // File pack data
  for (const d of filePackData) {
    d.copy(buf, pos);
    pos += d.length;
  }

  return buf;
}

// ── Test 1: Parse empty PVF (no files, dirTreeLength=0) ──

{
  const buf = buildPVF("test-uuid-001", 6, 0, [], []);

  const result = PvfParser.parse(buf);
  assert.equal(result.uuid, "test-uuid-001", "uuid should match");
  assert.equal(result.fileVersion, 6, "fileVersion should be 6");
  assert.equal(result.headerFilesCount, 0, "should have 0 files");
  assert.equal(result.files.length, 0, "files array should be empty");
  assert.equal(result.filePackSize, 0, "filePackSize should be 0 for empty PVF");
}

// ── Test 2: Parse PVF with 2 files, encrypted tree ──

{
  const buf = buildPVF("dnf-client-v5", 6, 0, [
    { path: "skill/berserker/gore_cross.skl", size: 256, offset: 0 },
    { path: "character/swordman/stat.tbl", size: 128, offset: 256 },
  ], [
    Buffer.alloc(256, 0xcc), // file 0 data
    Buffer.alloc(128, 0xdd), // file 1 data
  ]);

  const result = PvfParser.parse(buf);
  assert.equal(result.uuid, "dnf-client-v5");
  assert.equal(result.fileVersion, 6);
  assert.equal(result.headerFilesCount, 2);
  assert.equal(result.files.length, 2, "2 files parsed");
  assert.ok(result.filePackSize > 0, "filePackSize should be positive");

  // File 0
  const f0 = result.files[0]!;
  assert.equal(f0.fileNumber, 0);
  assert.equal(f0.path, "skill/berserker/gore_cross.skl", "forward-slash normalized path");
  assert.equal(f0.size, 256);
  assert.equal(f0.crc32, 0);
  assert.equal(f0.offset, 0);
  assert.equal(f0.segments.length, 3);
  assert.equal(f0.segments[0], "skill");
  assert.equal(f0.segments[2], "gore_cross.skl");

  // File 1
  const f1 = result.files[1]!;
  assert.equal(f1.fileNumber, 1);
  assert.equal(f1.path, "character/swordman/stat.tbl");
  assert.equal(f1.size, 128);
  assert.equal(f1.offset, 256);
}

// ── Test 3: Backslash path normalization ──

{
  // Build a tree where path uses backslashes (as in real PVF files)
  const treeBuf = (() => {
    const pathStr = "sprite\\character\\swordman\\idle.img";
    const pathBuf = Buffer.from(pathStr, "ascii");
    const buf = Buffer.alloc(20 + pathBuf.length);
    let pos = 0;
    buf.writeUInt32LE(0, pos); pos += 4;
    buf.writeUInt32LE(pathBuf.length, pos); pos += 4;
    pathBuf.copy(buf, pos); pos += pathBuf.length;
    buf.writeUInt32LE(512, pos); pos += 4;
    buf.writeUInt32LE(0, pos); pos += 4;
    buf.writeUInt32LE(0, pos); pos += 4;
    return buf;
  })();

  const encrypted = encryptChunk(treeBuf, 0);

  const uuidBuf = Buffer.from("bs-test", "ascii");
  const headerSize = 4 + uuidBuf.length + 4 + 4 + 4 + 4;
  const buf = Buffer.alloc(headerSize + encrypted.length);
  let pos = 0;
  buf.writeUInt32LE(uuidBuf.length, pos); pos += 4;
  uuidBuf.copy(buf, pos); pos += uuidBuf.length;
  buf.writeUInt32LE(6, pos); pos += 4;
  buf.writeUInt32LE(encrypted.length, pos); pos += 4;
  buf.writeUInt32LE(0, pos); pos += 4;
  buf.writeUInt32LE(1, pos); pos += 4;
  encrypted.copy(buf, pos);

  const result = PvfParser.parse(buf);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0]!.path, "sprite/character/swordman/idle.img", "backslashes normalized to forward slashes");
  assert.equal(result.files[0]!.segments.length, 4);
}

// ── Test 4: decryptChunk round-trip correctness ──

{
  // Encrypt known data with known CRC32, then decrypt and verify
  const original = Buffer.from("Hello PVF World! Test data 1234", "ascii");
  const testCrc32 = 0x12345678;

  const encrypted = encryptChunk(original, testCrc32);
  // Verify encrypted data differs from original
  let differs = false;
  for (let i = 0; i < original.length; i++) {
    if (encrypted[i] !== original[i]) {
      differs = true;
      break;
    }
  }
  assert.ok(differs, "encrypted data should differ from original");

  const decrypted = PvfParser.decryptChunk(encrypted, testCrc32);
  assert.equal(decrypted.length, original.length, "decrypted length matches");
  for (let i = 0; i < original.length; i++) {
    assert.equal(decrypted[i], original[i], `byte ${i} should match after round-trip`);
  }
}

// ── Test 5: decryptChunk with non-multiple-of-4 data ──

{
  // Test that trailing bytes are preserved as-is
  const original = Buffer.from("AB"); // 2 bytes, not divisible by 4
  const testCrc32 = 0x87654321;

  const encrypted = encryptChunk(original, testCrc32);
  // 2 bytes < 4, so encryptChunk copies as-is (no 4-byte chunk to encrypt)
  assert.equal(encrypted[0], original[0], "byte 0 should be unchanged for <4 byte input");
  assert.equal(encrypted[1], original[1], "byte 1 should be unchanged for <4 byte input");

  const decrypted = PvfParser.decryptChunk(encrypted, testCrc32);
  assert.equal(decrypted[0], original[0], "round-trip byte 0");
  assert.equal(decrypted[1], original[1], "round-trip byte 1");
}

// ── Test 6: decryptChunk with CRC32=0 (same as XOR key alone) ──

{
  const original = Buffer.from("TestData", "ascii"); // 8 bytes = 2 chunks
  const encrypted = encryptChunk(original, 0);
  const decrypted = PvfParser.decryptChunk(encrypted, 0);
  for (let i = 0; i < original.length; i++) {
    assert.equal(decrypted[i], original[i], `CRC32=0 round-trip byte ${i}`);
  }
}

// ── Test 7: extractFile — unencrypted file data ──

{
  const fileData = Buffer.from("unencrypted content here!", "ascii");
  const buf = buildPVF("extract-test", 6, 0, [
    { path: "data/plain.txt", size: fileData.length, crc32: 0, offset: 0 },
  ], [fileData]);

  const container = PvfParser.parse(buf);
  const extracted = PvfParser.extractFile(buf, container, "data/plain.txt");
  assert.ok(extracted !== undefined, "file should be found");
  assert.equal(extracted!.length, fileData.length, "extracted length matches");
  assert.equal(extracted!.toString("ascii"), "unencrypted content here!", "unencrypted data preserved as-is");
}

// ── Test 8: extractFile — encrypted file data ──

{
  const originalData = Buffer.from("Secret sKL payload", "ascii");
  const fileCrc32 = 0x0BADF00D;
  const encryptedData = encryptChunk(originalData, fileCrc32);

  const buf = buildPVF("crypto-test", 6, 0, [
    { path: "skill/gore_cross.skl", size: encryptedData.length, crc32: fileCrc32, offset: 0 },
  ], [encryptedData]);

  const container = PvfParser.parse(buf);
  const extracted = PvfParser.extractFile(buf, container, "skill/gore_cross.skl");
  assert.ok(extracted !== undefined, "encrypted file should be found");
  assert.equal(extracted!.length, originalData.length, "decrypted length matches original");
  assert.equal(extracted!.toString("ascii"), "Secret sKL payload", "file decrypted correctly");
}

// ── Test 9: extractFile — not found returns undefined ──

{
  const buf = buildPVF("missing-test", 6, 0, [
    { path: "skill/rage.skl", size: 64, offset: 0 },
  ], [Buffer.alloc(64, 0xee)]);

  const container = PvfParser.parse(buf);
  const extracted = PvfParser.extractFile(buf, container, "skill/nonexistent.skl");
  assert.equal(extracted, undefined, "non-existent file should return undefined");
}

// ── Test 10: extractFile — backslash path also works ──

{
  const fileData = Buffer.from("bs-path test", "ascii");
  const buf = buildPVF("bs-extract", 6, 0, [
    { path: "sprite/character/swordman/idle.img", size: fileData.length, offset: 0 },
  ], [fileData]);

  const container = PvfParser.parse(buf);
  const extracted = PvfParser.extractFile(buf, container, "sprite\\character\\swordman\\idle.img");
  assert.ok(extracted !== undefined, "backslash path should find file");
  assert.equal(extracted!.toString("ascii"), "bs-path test");
}

// ── Test 11: Invalid uuidLength (>256) ──

{
  const buf = Buffer.alloc(8);
  buf.writeUInt32LE(300, 0); // uuidLength = 300 (>256)

  let errorCaught = false;
  try {
    PvfParser.parse(buf);
  } catch (e: unknown) {
    errorCaught = true;
    const msg = (e as Error).message;
    assert.ok(msg.includes("uuidLength"), "should mention uuidLength in error");
  }
  assert.ok(errorCaught, "invalid uuidLength should throw");
}

// ── Test 12: Truncated PVF — tree length exceeds buffer ──

{
  // Build header claiming dirTreeLength=1000 but buffer is too small
  const uuidBuf = Buffer.from("trunc", "ascii");
  const buf = Buffer.alloc(4 + uuidBuf.length + 4 + 4 + 4 + 4 + 50); // only 50 bytes for tree
  let pos = 0;
  buf.writeUInt32LE(uuidBuf.length, pos); pos += 4;
  uuidBuf.copy(buf, pos); pos += uuidBuf.length;
  buf.writeUInt32LE(6, pos); pos += 4;        // fileVersion
  buf.writeUInt32LE(1000, pos); pos += 4;      // dirTreeLength (1000, but only ~50 available)
  buf.writeUInt32LE(0, pos); pos += 4;          // dirTreeCrc32
  buf.writeUInt32LE(5, pos); pos += 4;          // headerFilesCount

  let errorCaught = false;
  try {
    PvfParser.parse(buf);
  } catch (e: unknown) {
    errorCaught = true;
    const msg = (e as Error).message;
    assert.ok(msg.includes("Truncated") || msg.includes("truncated"), "should mention truncation");
  }
  assert.ok(errorCaught, "truncated tree should throw");
}

// ── Test 13: uuidLength=0 should throw ──

{
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(0, 0); // uuidLength = 0

  let errorCaught = false;
  try {
    PvfParser.parse(buf);
  } catch (e: unknown) {
    errorCaught = true;
  }
  assert.ok(errorCaught, "uuidLength=0 should throw");
}

// ── Done ──
console.log("pvf-parser.test.ts: all 13 tests passed");
