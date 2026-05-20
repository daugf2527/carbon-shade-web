#!/usr/bin/env node
// scripts/extract-equipment-layer.mjs — Extract equipment layer frames aligned to body action
//
// Reads an equipment .ani file (e.g. coat_a/stay.ani), pulls the sprite template + imgParam
// per frame, substitutes the costume style code, and resolves+decodes each frame.
//
// Usage:
//   node scripts/extract-equipment-layer.mjs <body-action> <equipment-ani-path> [options]
//
//   --style <CCVV>    Costume style 4 chars: <category 2 digits><variant 2 digits>. Default 0000.
//   --layer-name <s>  Output dir name under public/.../<action>/. Default = .ani parent dir name.
//
// Example:
//   node scripts/extract-equipment-layer.mjs stay \
//     "equipment/character/swordman/avatar/coat/coat_a/stay.ani" --style 0000

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";
import { PNG } from "pngjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const EXTRACT_BASENAME = platform() === "win32" ? "dnf-extract.exe" : "dnf-extract";
const EXTRACT = join(ROOT, "tools", EXTRACT_BASENAME);
const PVF = process.env.DNF_PVF;
const NPK_DIR = process.env.DNF_NPK_DIR;

// ── CLI ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 2 || args[0] === "--help") {
  console.error([
    "Usage: extract-equipment-layer.mjs <body-action> <equipment-ani-path> [options]",
    "",
    "  --style <CCVV>     Costume style code (default 0000)",
    "  --layer-name <s>   Output folder name (default = parent dir of .ani)",
    "",
    "Example:",
    "  node scripts/extract-equipment-layer.mjs stay \\",
    "    equipment/character/swordman/avatar/coat/coat_a/stay.ani",
  ].join("\n"));
  process.exit(args[0] === "--help" ? 0 : 1);
}

const actionName = args[0];
const equipmentAniPath = args[1];
let style = "0000";
let layerName = basename(dirname(equipmentAniPath));  // e.g. "coat_a"
for (let i = 2; i < args.length; i++) {
  if (args[i] === "--style") style = args[++i];
  else if (args[i] === "--layer-name") layerName = args[++i];
}

if (!/^\d{4}$/.test(style)) {
  console.error(`--style must be 4 digits (got "${style}")`);
  process.exit(1);
}

if (!PVF) {
  console.error("DNF_PVF environment variable is required. Set it to the path of Script.pvf.");
  process.exit(1);
}
if (!NPK_DIR) {
  console.error("DNF_NPK_DIR environment variable is required. Set it to the path of ImagePacks2.");
  process.exit(1);
}
if (!existsSync(PVF)) {
  console.error(`PVF not found: ${PVF}`);
  process.exit(1);
}
if (!existsSync(NPK_DIR)) {
  console.error(`NPK_DIR not found: ${NPK_DIR}`);
  process.exit(1);
}

const styleHi = style.slice(0, 2);
const styleLo = style.slice(2, 4);

// ── Load body meta.json (for sanity check; we trust .ani as the source of truth) ────

const bodyMetaPath = join(ROOT, "public", "assets", "dnf", "character", "swordman", actionName, "meta.json");
if (!existsSync(bodyMetaPath)) {
  console.error(`Body meta.json not found: ${bodyMetaPath}\nExtract the body action first.`);
  process.exit(1);
}
const bodyMeta = JSON.parse(readFileSync(bodyMetaPath, "utf8"));

const outDir = join(ROOT, "public", "assets", "dnf", "character", "swordman", actionName, layerName);
mkdirSync(outDir, { recursive: true });

// ── Pixel decoders ───────────────────────────────────────────────────

function decodeToPng(raw, png, width, height, formatName, frameIndex) {
  const pixels = width * height;
  if (raw.length === pixels * 4) {
    const forceOpaque = formatName === "ARGB_1555";
    for (let p = 0; p < pixels; p++) {
      const o = p * 4;
      png.data[o + 0] = raw[o + 2];
      png.data[o + 1] = raw[o + 1];
      png.data[o + 2] = raw[o + 0];
      png.data[o + 3] = forceOpaque ? 255 : raw[o + 3];
    }
  } else if (raw.length === pixels * 2 && formatName === "ARGB_1555") {
    for (let p = 0; p < pixels; p++) {
      const v = raw[p * 2] | (raw[p * 2 + 1] << 8);
      const a = (v >> 15) & 1;
      const r = (v >> 10) & 0x1f;
      const g = (v >> 5) & 0x1f;
      const b = v & 0x1f;
      const o = p * 4;
      png.data[o + 0] = (r << 3) | (r >> 2);
      png.data[o + 1] = (g << 3) | (g >> 2);
      png.data[o + 2] = (b << 3) | (b >> 2);
      png.data[o + 3] = a ? 0 : 255;  // DNF inverted: 1=transparent
    }
  } else if (raw.length === pixels * 2 && formatName === "ARGB_4444") {
    for (let p = 0; p < pixels; p++) {
      const v = raw[p * 2] | (raw[p * 2 + 1] << 8);
      const a = (v >> 12) & 0xf;
      const r = (v >> 8) & 0xf;
      const g = (v >> 4) & 0xf;
      const b = v & 0xf;
      const o = p * 4;
      png.data[o + 0] = (r << 4) | r;
      png.data[o + 1] = (g << 4) | g;
      png.data[o + 2] = (b << 4) | b;
      png.data[o + 3] = (a << 4) | a;
    }
  } else {
    throw new Error(`frame ${frameIndex}: buffer ${raw.length}B unexpected for ${width}x${height} ${formatName}`);
  }
}

// ── dnf-extract wrapper ──────────────────────────────────────────────

function dnfJson(...extractArgs) {
  const r = spawnSync(EXTRACT, extractArgs, { encoding: null, maxBuffer: 200 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`dnf-extract exit ${r.status}\nstderr: ${r.stderr?.toString().slice(0, 500)}`);
  }
  return JSON.parse(r.stdout.toString("utf8"));
}

// ── Read equipment .ani to get per-frame sprite + imgParam ────────────

console.error(`[${layerName}] Reading ${equipmentAniPath} (style=${style})`);
const equipmentAni = dnfJson("--pvf", PVF, "--file", equipmentAniPath);
if (equipmentAni.type !== "animation") {
  throw new Error(`expected animation, got ${equipmentAni.type}: ${JSON.stringify(equipmentAni).slice(0, 200)}`);
}

if (equipmentAni.framesCount !== bodyMeta.frames.length) {
  console.error(`  ⚠ frame count mismatch: equipment=${equipmentAni.framesCount}, body=${bodyMeta.frames.length}`);
}

// Substitute style code in sprite template (sprintf-style %02d%02d)
function expandSpritePath(template) {
  // First %02d → styleHi, second %02d → styleLo
  let out = template;
  out = out.replace("%02d", styleHi);
  out = out.replace("%02d", styleLo);
  return out;
}

// ── Extract each frame ───────────────────────────────────────────────

const layerMeta = {
  layer: layerName,
  source: { aniPath: equipmentAniPath, style },
  frames: [],
};

for (const aniFrame of equipmentAni.frames) {
  const spritePath = expandSpritePath(aniFrame.sprite);
  let frameIdx = aniFrame.imgParam;

  let resolved;
  for (let hop = 0; hop < 8; hop++) {
    resolved = dnfJson(
      "--pvf", PVF,
      "--npk-dir", NPK_DIR,
      "--resolve", spritePath,
      "--frame", String(frameIdx),
      "--with-data",
    );
    if (resolved.type === "error") {
      console.error(`  ⚠ frame ${aniFrame.i}: ${resolved.error} (skipped)`);
      resolved = null;
      break;
    }
    if (resolved.isLink) { frameIdx = resolved.linkId; continue; }
    break;
  }

  if (!resolved || resolved.isLink) {
    layerMeta.frames.push({ index: aniFrame.i, file: null, skipped: true });
    continue;
  }

  const raw = Buffer.from(resolved.dataBase64, "base64");
  const { width, height } = resolved;
  const png = new PNG({ width, height });
  decodeToPng(raw, png, width, height, resolved.formatName, aniFrame.i);
  const pngBuf = PNG.sync.write(png);

  const filename = `frame_${String(aniFrame.i).padStart(2, "0")}.png`;
  writeFileSync(join(outDir, filename), pngBuf);

  layerMeta.frames.push({
    index: aniFrame.i,
    file: filename,
    width, height,
    aniOffset: { x: aniFrame.x, y: aniFrame.y },
    imgAnchor: { x: resolved.x, y: resolved.y },
    maxWidth: resolved.maxWidth,
    maxHeight: resolved.maxHeight,
    provenance: {
      spritePath,
      atlasFrameIndex: aniFrame.imgParam,
    },
  });
  console.error(`  ✓ frame ${aniFrame.i}: ${width}x${height} ${resolved.formatName} → ${filename}`);
}

writeFileSync(join(outDir, "layer-meta.json"), JSON.stringify(layerMeta, null, 2));
console.error(`Done. ${layerMeta.frames.filter(f => f.file).length}/${equipmentAni.framesCount} frames → ${outDir}`);
