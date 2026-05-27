#!/usr/bin/env node
/**
 * scan-dgn-stale-mapids.mjs — Cross-dungeon stale mapId scanner
 *
 * Trigger: jungle.dgn 8 mapId 里 6 个 stale (75%)。问题是不是普遍？
 * 这个脚本扫 PVF 全部 .dgn (338 个) 算出 stale rate 分布。
 *
 * 算法:
 *   1. 读 verification/pvf-list-stdout.json (全 PVF 文件清单)
 *   2. 抠所有 map/*.map 路径，提取 mapId set (in PVF)
 *   3. dnf-extract --batch 全部 .dgn（分 chunk 避免 ARG_MAX）
 *   4. 对每个 .dgn 抠 "map specification" 段 mat[*].2.v (mapIds 引用)
 *   5. cross-ref：每个引用 mapId 是不是在 mapIdsInPvf 里
 *   6. 输出 verification/dgn-stale-summary-2026-05-27.json
 *
 * 2026-05-27 创建（用户指令"跨副本 stale mapId 扫描"）。
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.dirname(__dirname);
const PVF = path.join(ROOT, "data", "Script.pvf");
const EXTRACT = path.join(ROOT, "tools", "dnf-extract.exe");
const PVF_LIST_PATH = path.join(ROOT, "verification", "pvf-list-stdout.json");
const OUT_PATH = path.join(ROOT, "verification", "dgn-stale-summary-2026-05-27.json");

// === Step 1: PVF list ===
console.log("[scan] reading PVF list snapshot...");
const PVF_LIST = JSON.parse(readFileSync(PVF_LIST_PATH, "utf8")).files;
console.log(`  total PVF files: ${PVF_LIST.length}`);

// === Step 2: mapId set in PVF ===
console.log("[scan] building mapId set from .map files...");
const mapFiles = PVF_LIST.filter(p => p.startsWith("map/") && p.endsWith(".map"));
const mapIdsInPvf = new Set();
for (const m of mapFiles) {
  // mapId is the first 3+ digit run in the basename. `e3204(1,2).map` → 3204.
  const match = m.match(/(\d{3,})/);
  if (match) mapIdsInPvf.add(Number(match[1]));
}
console.log(`  .map files: ${mapFiles.length}, unique mapIds: ${mapIdsInPvf.size}`);

// === Step 3: extract all .dgn (chunked) ===
const dgnFiles = PVF_LIST.filter(p => p.endsWith(".dgn"));
console.log(`[scan] extracting ${dgnFiles.length} .dgn files in chunks of 100...`);
const BATCH = 100;
const allDgnDocs = [];
for (let i = 0; i < dgnFiles.length; i += BATCH) {
  const chunk = dgnFiles.slice(i, i + BATCH);
  const result = spawnSync(EXTRACT, ["--pvf", PVF, "--batch", ...chunk], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.warn(`  chunk ${i / BATCH + 1} exit=${result.status}: ${(result.stderr ?? "").slice(-200)}`);
    continue;
  }
  const parts = (result.stdout ?? "").split(/\n?---\n?/).filter(s => s.trim());
  for (const part of parts) {
    try {
      const doc = JSON.parse(part.trim());
      if (doc.type === "document") allDgnDocs.push(doc);
    } catch (e) {
      // skip malformed
    }
  }
}
console.log(`  extracted: ${allDgnDocs.length}/${dgnFiles.length}`);

// === Step 4+5: per-dgn stale rate ===
console.log("[scan] computing per-dgn stale rate...");
const perDgn = [];
let totalReferenced = 0;
let totalStale = 0;
for (const doc of allDgnDocs) {
  const mapSpec = (doc.sections ?? []).find(s => s.name === "map specification");
  if (!mapSpec) continue;
  const matAttr = (mapSpec.attributes ?? []).find(a => a.t === "mat");
  if (!matAttr || !Array.isArray(matAttr.items)) continue;

  const refIds = matAttr.items.map(row => {
    if (!Array.isArray(row) || row.length < 3) return null;
    const v = row[2];
    if (typeof v === "object" && v !== null && typeof v.v === "number") return v.v;
    if (typeof v === "number") return v;
    return null;
  }).filter(x => x !== null);

  const stale = refIds.filter(id => !mapIdsInPvf.has(id));
  totalReferenced += refIds.length;
  totalStale += stale.length;
  perDgn.push({
    dgn: doc.path,
    referenced: refIds.length,
    stale: stale.length,
    staleRate: refIds.length > 0 ? Number((stale.length / refIds.length).toFixed(3)) : 0,
    staleIds: stale.sort((a, b) => a - b),
  });
}

// Aggregate by stale-rate bucket
const buckets = { "0%": 0, "1-20%": 0, "21-50%": 0, "51-80%": 0, "81-100%": 0 };
for (const e of perDgn) {
  const r = e.staleRate * 100;
  if (r === 0) buckets["0%"]++;
  else if (r <= 20) buckets["1-20%"]++;
  else if (r <= 50) buckets["21-50%"]++;
  else if (r <= 80) buckets["51-80%"]++;
  else buckets["81-100%"]++;
}

perDgn.sort((a, b) => b.staleRate - a.staleRate || b.stale - a.stale);

const summary = {
  generatedAt: new Date().toISOString(),
  pvfHash: "data/Script.pvf",
  totals: {
    dgnFilesInPvf: dgnFiles.length,
    dgnExtracted: allDgnDocs.length,
    dgnWithMapSpec: perDgn.length,
    mapFilesInPvf: mapFiles.length,
    uniqueMapIdsInPvf: mapIdsInPvf.size,
    totalMapIdRefs: totalReferenced,
    totalStaleRefs: totalStale,
    globalStaleRate: totalReferenced > 0 ? Number((totalStale / totalReferenced).toFixed(3)) : 0,
  },
  staleBuckets: buckets,
  perDgn,
};

writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2));
console.log("");
console.log("=== summary ===");
console.log(`  .dgn files in PVF:       ${dgnFiles.length}`);
console.log(`  .dgn extracted ok:       ${allDgnDocs.length}`);
console.log(`  .dgn with mapSpec:       ${perDgn.length}`);
console.log(`  total mapId references:  ${totalReferenced}`);
console.log(`  total stale references:  ${totalStale}`);
console.log(`  global stale rate:       ${(summary.totals.globalStaleRate * 100).toFixed(1)}%`);
console.log("");
console.log("  stale rate distribution:");
for (const [bucket, count] of Object.entries(buckets)) {
  console.log(`    ${bucket.padEnd(10)} ${count} dgn`);
}
console.log("");
console.log(`output written to: ${path.relative(ROOT, OUT_PATH)}`);
