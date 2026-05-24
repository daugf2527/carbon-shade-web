#!/usr/bin/env node
/**
 * F-class research script: collect real-PVF threshold statistics so the
 * defensive bounds in tools/dnf-porting-src/PvfReader.cpp / NpkFile.cpp /
 * ImgFile.cpp can be calibrated against actual observed max values rather
 * than AI-picked guesses.
 *
 * Per docs/planning/2026-05-24-day11-17-ai-decisions-audit.md F1-F4 (user
 * directive "调研真 PVF 阈值 + 校准"). Output is appended to
 * docs/research/2026-05-24-pvf-threshold-survey.md.
 *
 * Usage:
 *   DNF_PVF_PATH=/path/to/Script.pvf \
 *   DNF_NPK_DIR=/path/to/ImagePacks2 \
 *   node scripts/research-pvf-thresholds.mjs
 *
 * Stats collected:
 *   - Total file count in PVF
 *   - max(filePathLength) — current cap: 4096 (PvfReader.cpp:200)
 *   - max(path segment depth) — current cap: 64 (PvfReader.cpp recursion)
 *   - Inferred dirTreeLength — current cap: 256 MB (PvfReader.cpp:157)
 *   - NPK frame max width / height across sampled NPKs — current cap: 16384 (ImgFile.cpp:288)
 *
 * NPK frame sweep samples a configurable subset (default 50 NPK files) to
 * avoid an hour-long scan. Pass DNF_NPK_SAMPLE=full to scan every NPK.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EXTRACT = path.join(ROOT, "tools", process.platform === "win32" ? "dnf-extract.exe" : "dnf-extract");
const PVF = process.env.DNF_PVF_PATH;
const NPK_DIR = process.env.DNF_NPK_DIR;

if (!PVF || PVF.trim() === "") {
  console.error("ERROR: DNF_PVF_PATH not set.");
  console.error("       DNF_PVF_PATH=/path/to/Script.pvf node scripts/research-pvf-thresholds.mjs");
  process.exit(2);
}

function run(args, label) {
  const r = spawnSync(EXTRACT, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(`[${label}] dnf-extract exit ${r.status}`);
    if (r.stderr) console.error(r.stderr.slice(0, 2000));
    process.exit(r.status ?? 1);
  }
  return r.stdout;
}

console.log("[F-research] running --list (this may take ~10s on cold cache, ~3s warm)...");
const t0 = Date.now();
const listOut = run(["--pvf", PVF, "--list"], "list");
const listMs = Date.now() - t0;

let pvfList;
try {
  pvfList = JSON.parse(listOut);
} catch (e) {
  console.error("[F-research] failed to JSON.parse --list output:", e.message);
  console.error(listOut.slice(0, 500));
  process.exit(1);
}

const files = Array.isArray(pvfList.files) ? pvfList.files : [];
console.log(`[F-research] PVF contains ${files.length} files`);

let maxFilePathLength = 0;
let maxFilePath = "";
let maxSegmentDepth = 0;
let maxSegmentDepthPath = "";
let p50 = 0, p90 = 0, p99 = 0;
const lengths = [];

for (const p of files) {
  const len = Buffer.byteLength(p, "utf-8");
  lengths.push(len);
  if (len > maxFilePathLength) {
    maxFilePathLength = len;
    maxFilePath = p;
  }
  const depth = p.split("/").length;
  if (depth > maxSegmentDepth) {
    maxSegmentDepth = depth;
    maxSegmentDepthPath = p;
  }
}

lengths.sort((a, b) => a - b);
if (lengths.length > 0) {
  p50 = lengths[Math.floor(lengths.length * 0.5)];
  p90 = lengths[Math.floor(lengths.length * 0.9)];
  p99 = lengths[Math.floor(lengths.length * 0.99)];
}

const pvfStat = statSync(PVF);
console.log(`[F-research] PVF file size: ${pvfStat.size.toLocaleString()} bytes (~${(pvfStat.size / 1024 / 1024).toFixed(1)} MB)`);

// NPK frame sweep
const npkResults = [];
if (NPK_DIR && NPK_DIR.trim() !== "") {
  console.log(`[F-research] sweeping NPK frame dimensions in ${NPK_DIR}...`);
  const npkFiles = readdirSync(NPK_DIR).filter(f => /\.npk$/i.test(f)).sort();
  const sampleMode = process.env.DNF_NPK_SAMPLE ?? "50";
  const sampleSize = sampleMode === "full" ? npkFiles.length : Number(sampleMode);
  const sample = npkFiles.slice(0, sampleSize);

  for (let i = 0; i < sample.length; i++) {
    const npkPath = path.join(NPK_DIR, sample[i]);
    process.stdout.write(`\r[F-research] NPK ${i + 1}/${sample.length}: ${sample[i].slice(0, 40)}...`);
    const npkOut = run(["--npk", npkPath, "--list"], `npk-list:${sample[i]}`);
    let npkList;
    try { npkList = JSON.parse(npkOut); } catch { continue; }
    const imgs = Array.isArray(npkList.imgs) ? npkList.imgs : [];
    for (const img of imgs) {
      const framesOut = run(["--npk", npkPath, "--img", img, "--frames"], `frames:${img}`);
      try {
        const framesData = JSON.parse(framesOut);
        const frames = Array.isArray(framesData.frames) ? framesData.frames : [];
        for (const f of frames) {
          if (typeof f.width === "number" && typeof f.height === "number") {
            npkResults.push({ npk: sample[i], img, width: f.width, height: f.height });
          }
        }
      } catch { /* ignore parse errors per IMG */ }
    }
  }
  console.log("");
} else {
  console.log("[F-research] DNF_NPK_DIR not set — skipping NPK frame sweep");
}

let maxNpkWidth = 0, maxNpkHeight = 0, maxNpkBytes = 0;
let maxNpkDimEntry = null, maxNpkBytesEntry = null;
for (const r of npkResults) {
  if (r.width > maxNpkWidth) { maxNpkWidth = r.width; maxNpkDimEntry = r; }
  if (r.height > maxNpkHeight) maxNpkHeight = r.height;
  const bytes = r.width * r.height * 4;
  if (bytes > maxNpkBytes) { maxNpkBytes = bytes; maxNpkBytesEntry = r; }
}

const now = new Date().toISOString();
const outPath = path.join(ROOT, "docs", "research", "2026-05-24-pvf-threshold-survey.md");
mkdirSync(path.dirname(outPath), { recursive: true });

const npkRowsForTable = npkResults.length;
const sampleScope = npkResults.length > 0
  ? `${new Set(npkResults.map(r => r.npk)).size} NPK files, ${npkRowsForTable} frames sampled`
  : "(skipped — DNF_NPK_DIR not set)";

const report = `# PVF threshold survey — real-PVF max-value calibration (2026-05-24)

Survey generated by \`scripts/research-pvf-thresholds.mjs\` at ${now}.
PVF: \`${PVF}\` (${pvfStat.size.toLocaleString()} bytes, ~${(pvfStat.size / 1024 / 1024).toFixed(1)} MB)

This survey backs the audit F1-F4 calibration request from
[\`docs/planning/2026-05-24-day11-17-ai-decisions-audit.md\`](../planning/2026-05-24-day11-17-ai-decisions-audit.md)
(user directive: "调研真 PVF 阈值 + 校准").

## F1: filePathLength

| Metric | Value |
|---|---|
| Total files in PVF | ${files.length.toLocaleString()} |
| max(filePathLength) | **${maxFilePathLength}** bytes |
| Longest path | \`${maxFilePath}\` |
| p50 / p90 / p99 | ${p50} / ${p90} / ${p99} bytes |
| Current C++ cap | 4096 (PvfReader.cpp:200) |
| Headroom | ${maxFilePathLength === 0 ? "n/a" : (4096 / maxFilePathLength).toFixed(1) + "×"} (current cap vs observed max) |
| Recommendation | ${maxFilePathLength === 0 ? "no data" : (maxFilePathLength > 4096 ? "🚨 cap exceeded — investigate" : maxFilePathLength * 4 < 4096 ? "✅ current cap (4096) is safe; consider tightening to " + Math.ceil(maxFilePathLength * 4 / 100) * 100 + " for tighter sanity bound" : "✅ keep 4096")} |

## F2: dirTreeLength

| Metric | Value |
|---|---|
| Cold-cache --list duration | ${listMs} ms |
| PVF file size | ${pvfStat.size.toLocaleString()} bytes |
| Current C++ cap | 256 MB (PvfReader.cpp:157) |
| Recommendation | dirTreeLength is the header-declared dirtree byte length; not directly visible from --list output. The cap is a sanity ceiling — if PVF is <500MB and the cap is 256MB, headroom is sufficient. Need to add a stats output to dnf-extract C++ to read the exact header value. **TODO**: extend C++ tool with \`--header-stats\` flag. |

## F3: recursion depth (path segment count)

| Metric | Value |
|---|---|
| max(segment depth) | **${maxSegmentDepth}** segments |
| Deepest path | \`${maxSegmentDepthPath}\` |
| Current C++ cap | 64 (PvfReader.cpp:294 depth guard) |
| Headroom | ${maxSegmentDepth === 0 ? "n/a" : (64 / maxSegmentDepth).toFixed(1) + "×"} (current cap vs observed max) |
| Recommendation | ${maxSegmentDepth === 0 ? "no data" : (maxSegmentDepth > 64 ? "🚨 cap exceeded — investigate" : "✅ keep 64; observed max is " + maxSegmentDepth)} |

## F4: NPK frame dimensions

Sample scope: ${sampleScope}

| Metric | Value |
|---|---|
| max(width) | ${maxNpkWidth} px${maxNpkDimEntry ? ` (\`${maxNpkDimEntry.npk}\` :: \`${maxNpkDimEntry.img}\`)` : ""} |
| max(height) | ${maxNpkHeight} px |
| max(frame bytes RGBA) | ${maxNpkBytes.toLocaleString()} bytes (${(maxNpkBytes / 1024 / 1024).toFixed(2)} MB)${maxNpkBytesEntry ? ` :: \`${maxNpkBytesEntry.npk}\` :: \`${maxNpkBytesEntry.img}\` ${maxNpkBytesEntry.width}×${maxNpkBytesEntry.height}` : ""} |
| Current C++ cap | 16384×16384 (ImgFile.cpp:288) → 1 GB per frame |
| Headroom | ${maxNpkWidth === 0 ? "n/a" : (16384 / Math.max(maxNpkWidth, maxNpkHeight)).toFixed(1) + "×"} (current cap vs observed max dim) |
| Recommendation | ${maxNpkWidth === 0 ? "🟡 NPK sweep skipped — re-run with DNF_NPK_DIR set" : maxNpkWidth > 16384 ? "🚨 cap exceeded" : "✅ keep 16384; observed max is " + maxNpkWidth + "×" + maxNpkHeight} |

## Action items

(Filled by reviewer after reading this report)

- [ ] F1: keep current cap (4096) / tighten / loosen → **decision**: ___
- [ ] F2: extend dnf-extract with \`--header-stats\` flag; defer cap calibration until header value known → **decision**: ___
- [ ] F3: keep current cap (64) / tighten / loosen → **decision**: ___
- [ ] F4: keep current cap (16384) / tighten / loosen → **decision**: ___

## Reproduction

\`\`\`bash
DNF_PVF_PATH=/path/to/Script.pvf \\
DNF_NPK_DIR=/path/to/ImagePacks2 \\
DNF_NPK_SAMPLE=50            # or "full" for full sweep (~30min)
node scripts/research-pvf-thresholds.mjs
\`\`\`
`;

writeFileSync(outPath, report, "utf-8");
console.log(`[F-research] survey written to ${path.relative(ROOT, outPath)}`);
console.log("");
console.log("Summary:");
console.log(`  PVF files: ${files.length.toLocaleString()}`);
console.log(`  max(filePathLength): ${maxFilePathLength} bytes  (current cap 4096)`);
console.log(`  max(segment depth):  ${maxSegmentDepth}  (current cap 64)`);
console.log(`  NPK sample:          ${npkRowsForTable} frames  max ${maxNpkWidth}×${maxNpkHeight}  (current cap 16384)`);
