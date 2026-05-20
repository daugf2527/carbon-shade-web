#!/usr/bin/env node
// scripts/extract-berserker-action.mjs — PoC: dnf-extract --file + --resolve → PNG frames + meta.json
//
// Usage: node scripts/extract-berserker-action.mjs <ani-path-in-pvf> [--out-name <name>] [--costume <NNNN>]
//
// Example:
//   node scripts/extract-berserker-action.mjs character/swordman/animation/stay.ani
//   → writes public/assets/dnf/character/swordman/stay/frame_00.png ... meta.json
//
// The .ani gives:
//   - sprites[] (path templates with %04d for costume variant, e.g. sm_body%04d.img)
//   - per frame: imgId (which sprites[] entry), imgParam (atlas internal frame index),
//     x/y (anchor), delay, damage/attack boxes.
//
// We resolve each frame by substituting %04d with the costume index (default "0000" = bare)
// and extracting the imgParam-th frame from the resulting .img.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

// ── Pixel format decoders ────────────────────────────────────────────

function decodeToPng(raw, png, width, height, formatName, frameIndex) {
  const pixels = width * height;
  // dnf-extract always outputs decoded BGRA 32-bit regardless of original format
  if (raw.length !== pixels * 4) throw new Error(`frame ${frameIndex}: pixel buffer ${raw.length}B ≠ expected ${pixels * 4}B (${formatName})`);
  for (let p = 0; p < pixels; p++) {
    const o = p * 4;
    png.data[o + 0] = raw[o + 2]; // R ← B
    png.data[o + 1] = raw[o + 1]; // G
    png.data[o + 2] = raw[o + 0]; // B ← R
    png.data[o + 3] = raw[o + 3]; // A
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const EXTRACT = join(ROOT, "tools", "dnf-extract.exe");
const PVF = process.env.DNF_PVF
  ?? "D:/BaiduNetdiskDownload/DNF客户端（2018年2月更新）/地下城与勇士/Script.pvf";
const NPK_DIR = process.env.DNF_NPK_DIR
  ?? "D:/BaiduNetdiskDownload/DNF客户端（2018年2月更新）/地下城与勇士/ImagePacks2";

// ── CLI ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 1 || args[0] === "--help") {
  console.error("Usage: extract-berserker-action.mjs <ani-path> [--out-name <name>] [--costume <NNNN>]");
  process.exit(args[0] === "--help" ? 0 : 1);
}
const aniPath = args[0];
let outName = basename(aniPath, ".ani");
let costume = "0000";
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--out-name") outName = args[++i];
  else if (args[i] === "--costume") costume = args[++i];
}

if (!existsSync(EXTRACT)) {
  console.error(`dnf-extract.exe missing at ${EXTRACT}`);
  process.exit(1);
}

const outDir = join(ROOT, "public", "assets", "dnf", "character", "swordman", outName);
mkdirSync(outDir, { recursive: true });

// ── dnf-extract wrapper ──────────────────────────────────────────────

function dnfJson(...extractArgs) {
  const r = spawnSync(EXTRACT, extractArgs, { encoding: null, maxBuffer: 200 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`dnf-extract exit ${r.status}\nstderr: ${r.stderr?.toString().slice(0, 500)}`);
  }
  return JSON.parse(r.stdout.toString("utf8"));
}

// ── 1) parse .ani ────────────────────────────────────────────────────

console.error(`[1/3] parse ${aniPath}`);
const ani = dnfJson("--pvf", PVF, "--file", aniPath);
if (ani.type !== "animation") {
  throw new Error(`Expected type=animation, got type=${ani.type}`);
}
console.error(`  ${ani.framesCount} frames, loop=${ani.loop}`);

// ── 2) resolve each frame ────────────────────────────────────────────

console.error(`[2/3] resolve ${ani.frames.length} frames (costume=${costume})`);
const out = {
  action: outName,
  source: { aniPath, framesCount: ani.framesCount, loop: ani.loop, costume },
  frames: [],
};

for (const f of ani.frames) {
  const spritePath = f.sprite.replace("%04d", costume);
  let frameIdx = f.imgParam; // atlas internal index, NOT a file suffix

  // Resolve, following link frames (up to 8 hops to avoid infinite loops)
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
      throw new Error(`frame ${f.i}: ${resolved.error}`);
    }
    if (resolved.isLink) {
      frameIdx = resolved.linkId;
      continue;
    }
    break;
  }
  if (resolved.isLink) {
    throw new Error(`frame ${f.i}: link chain too deep (last linkId=${resolved.linkId})`);
  }

  const raw = Buffer.from(resolved.dataBase64, "base64");
  const { width, height } = resolved;
  const png = new PNG({ width, height });
  decodeToPng(raw, png, width, height, resolved.formatName, f.i);
  const pngBuf = PNG.sync.write(png);

  const filename = `frame_${String(f.i).padStart(2, "0")}.png`;
  writeFileSync(join(outDir, filename), pngBuf);

  out.frames.push({
    index: f.i,
    file: filename,
    width,
    height,
    // .ani anchor offset (relative to character feet) — sprite is drawn at (-aniX, -aniY) from anchor
    aniOffset: { x: f.x, y: f.y },
    // anchor inside the IMG cell — where the visible pixels start within maxWidth x maxHeight
    imgAnchor: { x: resolved.x, y: resolved.y },
    delay: f.delay ?? 100,
    damageBox: f.dmg ?? [],
    attackBox: f.atk ?? [],
    provenance: {
      imgId: f.imgId,
      imgParam: f.imgParam,
      spritePath,
      atlasFrameIndex: frameIdx,
    },
  });

  console.error(`  ✓ frame ${f.i}: ${width}x${height} → ${filename}`);
}

// ── 3) write meta.json ───────────────────────────────────────────────

console.error(`[3/3] write meta.json`);
writeFileSync(join(outDir, "meta.json"), JSON.stringify(out, null, 2));
console.error(`Done. ${out.frames.length} frames + meta.json → ${outDir}`);
