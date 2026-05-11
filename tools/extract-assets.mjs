#!/usr/bin/env node
// tools/extract-assets.mjs — CLI tool for extracting assets from DNF PVF and NPK archives.
// Self-contained: implements PVF/NPK parsing inline using only Node.js built-ins.
//
// Usage:
//   node tools/extract-assets.mjs --pvf <file> --list
//   node tools/extract-assets.mjs --pvf <file> --extract <path> [--out <dir|file>]
//   node tools/extract-assets.mjs --pvf <file> --extract-all --out <dir>
//   node tools/extract-assets.mjs --npk <file> --list
//   node tools/extract-assets.mjs --npk <file> --extract <name> --out <dir>
//   node tools/extract-assets.mjs --npk <file> --extract-all --out <dir>
//   node tools/extract-assets.mjs --help

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

const PVF_XOR_KEY = 0x81a79011;
const NPK_MAGIC = "NeoplePack_Bill";
const IMG_INDEX_ENTRY_SIZE = 264; // offset(4) + size(4) + name(256)

// ══════════════════════════════════════════════════════════════════════════════
// XOR+ROTR6 decryption (shared by PVF and NPK)
// ══════════════════════════════════════════════════════════════════════════════

/** Decrypt a chunk of PVF-encrypted data: XOR with derived key, then ROTR6. */
function decryptChunk(buf, crc32) {
  const key = (PVF_XOR_KEY ^ crc32) >>> 0;
  const result = Buffer.alloc(buf.length);
  const chunkCount = Math.floor(buf.length / 4);

  for (let i = 0; i < chunkCount; i++) {
    const offset = i * 4;
    let value = (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0;
    value ^= key;
    value = ((value >>> 6) | (value << 26)) >>> 0; // ROTR6
    result[offset] = value & 0xff;
    result[offset + 1] = (value >>> 8) & 0xff;
    result[offset + 2] = (value >>> 16) & 0xff;
    result[offset + 3] = (value >>> 24) & 0xff;
  }

  // Copy remaining bytes (< 4) as-is
  for (let i = chunkCount * 4; i < buf.length; i++) {
    result[i] = buf[i];
  }

  return result;
}

/** Decrypt an NPK IMG filename (same XOR+ROTR6, null-terminated CP949). */
function decryptName(raw) {
  const decrypted = Buffer.alloc(raw.length);

  for (let i = 0; i < raw.length; i += 4) {
    const offset = i;
    let value = (raw[offset] | (raw[offset + 1] << 8) | (raw[offset + 2] << 16) | (raw[offset + 3] << 24)) >>> 0;
    value ^= PVF_XOR_KEY;
    value = ((value >>> 6) | (value << 26)) >>> 0;
    decrypted[offset] = value & 0xff;
    decrypted[offset + 1] = (value >>> 8) & 0xff;
    decrypted[offset + 2] = (value >>> 16) & 0xff;
    decrypted[offset + 3] = (value >>> 24) & 0xff;
  }

  // Find null terminator
  const nullIdx = decrypted.indexOf(0);
  const nameBytes = nullIdx >= 0 ? decrypted.subarray(0, nullIdx) : decrypted;

  // Decode as EUC-KR (CP949), fallback to latin1
  try {
    return nameBytes.toString("euc-kr");
  } catch {
    let result = "";
    for (let i = 0; i < nameBytes.length; i++) {
      const b = nameBytes[i];
      result += b < 0x80 ? String.fromCharCode(b) : "?";
    }
    return result;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PVF parsing
// ══════════════════════════════════════════════════════════════════════════════

function parsePVF(buf) {
  let pos = 0;

  // Read header fields manually (no ByteReader — keep it simple)
  const uuidLength = buf.readUInt32LE(pos); pos += 4;
  if (uuidLength === 0 || uuidLength > 256) {
    throw new Error(`Invalid PVF uuidLength: ${uuidLength}`);
  }
  const uuid = buf.subarray(pos, pos + uuidLength).toString("ascii"); pos += uuidLength;
  const fileVersion = buf.readUInt32LE(pos); pos += 4;
  const dirTreeLength = buf.readUInt32LE(pos); pos += 4;
  const dirTreeCrc32 = buf.readUInt32LE(pos); pos += 4;
  const headerFilesCount = buf.readUInt32LE(pos); pos += 4;

  if (dirTreeLength === 0) {
    return {
      uuid,
      fileVersion,
      headerFilesCount: 0,
      files: [],
      filePackStart: pos,
      filePackSize: 0,
    };
  }

  if (pos + dirTreeLength > buf.length) {
    throw new Error(`Truncated PVF: expected ${dirTreeLength} bytes for header tree, only ${buf.length - pos} remaining`);
  }

  const encryptedTree = buf.subarray(pos, pos + dirTreeLength); pos += dirTreeLength;
  const decryptedTree = decryptChunk(encryptedTree, dirTreeCrc32);

  // Parse decrypted file tree
  const files = [];
  let treePos = 0;
  for (let i = 0; i < headerFilesCount; i++) {
    if (treePos + 16 > decryptedTree.length) {
      throw new Error(`Truncated PVF file tree at entry ${i}/${headerFilesCount}`);
    }

    const fileNumber = decryptedTree.readUInt32LE(treePos); treePos += 4;
    const filePathLength = decryptedTree.readUInt32LE(treePos); treePos += 4;

    if (filePathLength === 0 || treePos + filePathLength + 12 > decryptedTree.length) {
      throw new Error(`Truncated PVF file path at entry ${i}`);
    }

    // Read path as EUC-KR
    const pathBytes = decryptedTree.subarray(treePos, treePos + filePathLength); treePos += filePathLength;
    let path;
    try {
      path = pathBytes.toString("euc-kr");
    } catch {
      path = pathBytes.toString("latin1");
    }
    // Normalize backslashes to forward slashes
    path = path.replace(/\\/g, "/");

    const fileLength = decryptedTree.readUInt32LE(treePos); treePos += 4;
    const fileCrc32 = decryptedTree.readUInt32LE(treePos); treePos += 4;
    const relativeOffset = decryptedTree.readUInt32LE(treePos); treePos += 4;

    files.push({
      fileNumber,
      path,
      size: fileLength,
      crc32: fileCrc32,
      offset: relativeOffset,
    });
  }

  const filePackStart = pos;
  const filePackSize = buf.length - pos;

  return { uuid, fileVersion, headerFilesCount, files, filePackStart, filePackSize };
}

function extractPVFFile(buf, container, filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const entry = container.files.find(f => f.path === normalizedPath);
  if (!entry) return undefined;

  const absoluteOffset = container.filePackStart + entry.offset;
  if (absoluteOffset + entry.size > buf.length) return undefined;

  const raw = buf.subarray(absoluteOffset, absoluteOffset + entry.size);

  if (entry.crc32 !== 0) {
    return decryptChunk(Buffer.from(raw), entry.crc32);
  }
  return Buffer.from(raw);
}

// ══════════════════════════════════════════════════════════════════════════════
// NPK parsing
// ══════════════════════════════════════════════════════════════════════════════

function parseNPK(buf) {
  let pos = 0;

  // Verify magic
  const magic = buf.subarray(pos, pos + NPK_MAGIC.length).toString("ascii"); pos += NPK_MAGIC.length;
  if (magic !== NPK_MAGIC) {
    throw new Error(`Invalid NPK magic: expected "${NPK_MAGIC}", got "${magic}"`);
  }

  const imgCount = buf.readUInt32LE(pos); pos += 4;

  const entries = [];
  for (let i = 0; i < imgCount; i++) {
    if (pos + IMG_INDEX_ENTRY_SIZE > buf.length) {
      throw new Error(`Truncated NPK: expected IMG entry ${i}/${imgCount}`);
    }

    const offset = buf.readUInt32LE(pos); pos += 4;
    const size = buf.readUInt32LE(pos); pos += 4;
    const rawName = buf.subarray(pos, pos + 256); pos += 256;
    const name = decryptName(rawName);

    entries.push({ offset, size, name });
  }

  return { imgCount, entries };
}

function extractNPKImg(buf, container, name) {
  const entry = container.entries.find(e => e.name === name);
  if (!entry) return undefined;
  if (entry.offset + entry.size > buf.length) return undefined;
  return Buffer.from(buf.subarray(entry.offset, entry.offset + entry.size));
}

// ══════════════════════════════════════════════════════════════════════════════
// Output helpers
// ══════════════════════════════════════════════════════════════════════════════

function formatSize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CLI
// ══════════════════════════════════════════════════════════════════════════════

function showHelp() {
  console.log(`extract-assets.mjs — DNF PVF/NPK asset extraction tool

USAGE:
  node tools/extract-assets.mjs --pvf <file> --list
  node tools/extract-assets.mjs --pvf <file> --extract <path> [--out <file>]
  node tools/extract-assets.mjs --pvf <file> --extract-all --out <dir>
  node tools/extract-assets.mjs --npk <file> --list
  node tools/extract-assets.mjs --npk <file> --extract <name> --out <dir>
  node tools/extract-assets.mjs --npk <file> --extract-all --out <dir>
  node tools/extract-assets.mjs --help

OPTIONS:
  --pvf <file>       Operate on a PVF archive
  --npk <file>       Operate on an NPK archive
  --list             List all files/entries in the archive
  --extract <path>   Extract a single file (PVF: full path; NPK: entry name)
  --extract-all      Extract all files/entries
  --out <dir|file>   Output directory or file path
  --help             Show this help

EXAMPLES:
  node tools/extract-assets.mjs --pvf data.pvf --list
  node tools/extract-assets.mjs --pvf data.pvf --extract "skill/gore_cross.skl"
  node tools/extract-assets.mjs --pvf data.pvf --extract-all --out ./extracted/
  node tools/extract-assets.mjs --npk sprite.npk --list
  node tools/extract-assets.mjs --npk sprite.npk --extract-all --out ./img_output/`);
}

function parseArgs(args) {
  const opts = { list: false, extract: null, extractAll: false, out: null, help: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--pvf":
        opts.pvf = args[++i];
        break;
      case "--npk":
        opts.npk = args[++i];
        break;
      case "--list":
        opts.list = true;
        break;
      case "--extract":
        opts.extract = args[++i];
        break;
      case "--extract-all":
        opts.extractAll = true;
        break;
      case "--out":
        opts.out = args[++i];
        break;
      case "--help":
        opts.help = true;
        break;
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || (!opts.pvf && !opts.npk)) {
    showHelp();
    process.exit(opts.help ? 0 : 1);
  }

  if (opts.pvf && opts.npk) {
    console.error("Error: --pvf and --npk are mutually exclusive");
    process.exit(1);
  }

  try {
    if (opts.pvf) {
      handlePVF(opts);
    } else if (opts.npk) {
      handleNPK(opts);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

function handlePVF(opts) {
  const buf = readFileSync(opts.pvf);
  const container = parsePVF(buf);

  console.error(`PVF: ${container.uuid} (v${container.fileVersion})`);
  console.error(`Files: ${container.files.length}`);
  console.error(`File pack: ${formatSize(container.filePackSize)}`);

  if (opts.list) {
    console.log(`${"#".padEnd(6)} ${"Size".padEnd(12)} ${"CRC32".padEnd(10)} ${"Path"}`);
    console.log(`${"-".repeat(6)} ${"-".repeat(12)} ${"-".repeat(10)} ${"-".repeat(50)}`);
    for (const f of container.files) {
      const crc = f.crc32 === 0 ? "(none)" : `0x${f.crc32.toString(16).padStart(8, "0")}`;
      console.log(`${String(f.fileNumber).padEnd(6)} ${formatSize(f.size).padEnd(12)} ${crc.padEnd(10)} ${f.path}`);
    }
  } else if (opts.extract) {
    const data = extractPVFFile(buf, container, opts.extract);
    if (!data) {
      console.error(`File not found: ${opts.extract}`);
      console.error("Available paths:");
      for (const f of container.files) {
        console.error(`  ${f.path}`);
      }
      process.exit(1);
    }
    if (opts.out) {
      const outPath = resolve(opts.out);
      ensureDir(outPath);
      writeFileSync(outPath, data);
      console.error(`Extracted ${formatSize(data.length)} to ${outPath}`);
    } else {
      process.stdout.write(data);
    }
  } else if (opts.extractAll) {
    if (!opts.out) {
      console.error("Error: --extract-all requires --out <dir>");
      process.exit(1);
    }
    const outDir = resolve(opts.out);
    let extracted = 0;
    for (const f of container.files) {
      const data = extractPVFFile(buf, container, f.path);
      if (!data) {
        console.error(`  SKIP: ${f.path} (offset out of bounds)`);
        continue;
      }
      const outPath = join(outDir, f.path);
      ensureDir(outPath);
      writeFileSync(outPath, data);
      extracted++;
    }
    console.error(`Extracted ${extracted}/${container.files.length} files to ${outDir}`);
  } else {
    console.error("Specify --list, --extract <path>, or --extract-all");
    process.exit(1);
  }
}

function handleNPK(opts) {
  const buf = readFileSync(opts.npk);
  const container = parseNPK(buf);

  console.error(`NPK: ${container.imgCount} IMG entries`);

  if (opts.list) {
    console.log(`${"#".padEnd(6)} ${"Size".padEnd(12)} ${"Offset".padEnd(10)} ${"Name"}`);
    console.log(`${"-".repeat(6)} ${"-".repeat(12)} ${"-".repeat(10)} ${"-".repeat(50)}`);
    for (let i = 0; i < container.entries.length; i++) {
      const e = container.entries[i];
      console.log(`${String(i).padEnd(6)} ${formatSize(e.size).padEnd(12)} ${String(e.offset).padEnd(10)} ${e.name}`);
    }
  } else if (opts.extract) {
    const data = extractNPKImg(buf, container, opts.extract);
    if (!data) {
      console.error(`Entry not found: ${opts.extract}`);
      console.error("Available entries:");
      for (const e of container.entries) {
        console.error(`  ${e.name}`);
      }
      process.exit(1);
    }
    const outDir = opts.out ? resolve(opts.out) : process.cwd();
    ensureDir(outDir);
    const outPath = join(outDir, basename(opts.extract) || "extracted.img");
    writeFileSync(outPath, data);
    console.error(`Extracted ${formatSize(data.length)} to ${outPath}`);
  } else if (opts.extractAll) {
    if (!opts.out) {
      console.error("Error: --extract-all requires --out <dir>");
      process.exit(1);
    }
    const outDir = resolve(opts.out);
    ensureDir(outDir);
    let extracted = 0;
    for (const e of container.entries) {
      const data = extractNPKImg(buf, container, e.name);
      if (!data) {
        console.error(`  SKIP: ${e.name} (offset out of bounds)`);
        continue;
      }
      const outPath = join(outDir, basename(e.name) || `entry_${extracted}.img`);
      writeFileSync(outPath, data);
      extracted++;
    }
    console.error(`Extracted ${extracted}/${container.entries.length} IMGs to ${outDir}`);
  } else {
    console.error("Specify --list, --extract <name>, or --extract-all");
    process.exit(1);
  }
}

main();
