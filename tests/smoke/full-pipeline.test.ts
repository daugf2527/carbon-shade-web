/**
 * Stage 1 full-pipeline smoke test — runs EXTRACT → PARSE → VALIDATE → LOAD
 * → EXPORT against a real Script.pvf and asserts the end-to-end contract.
 *
 * Env-gated: requires `DNF_PVF_PATH` to be set; exits 0 with a SKIP message
 * when absent (so the suite runs cleanly on CI hosts without PVF data).
 *
 * Verifies, for a curated 5-file set (swordman.chr + attack3.atk +
 * upperslash.skl + goblin.mob + 4.map):
 *   1. stage advances all the way to "export"
 *   2. validation has 0 errors / 0 warnings on the curated set
 *   3. dist/data/players/swordman.json ≥ 200 KB (roadmap §4 Day 14 target)
 *   4. manifest.json present with expected per-shard entries; each entry
 *      has a 64-char hex sha256 and sizeBytes matching the file on disk
 *   5. SQLite mirror DB contains the 5 upserts + extraction_runs row
 *   6. Wall-clock < 10 minutes (roadmap §4 Day 14 "时间合理" target)
 *
 * Cleans up the smoke output dir on success; preserves on failure for
 * inspection.
 */

import { mkdir, rm, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert } from "../static/test-utils.js";

import { runExtractParsePipeline } from "../../src/dnf-native-combat/data/pipeline/pipelineRunner.js";
import { DNF_PHYSICS_CONSTANTS } from "../../src/data/official/dnfPhysicsConstants.js";
import {
  ATTACKTYPE, ELEMENT, DAMAGEACT, KNOCK_BACK_TYPE, DOWN_PARAM_TYPE,
  CUSTOM_ATTACKINFO, FIELD_TO_ENUM,
} from "../../src/data/official/dnfEnumTables.js";

const pvfPath = process.env.DNF_PVF_PATH;
if (!pvfPath || pvfPath.trim() === "") {
  console.log("SKIP: full-pipeline smoke test — DNF_PVF_PATH not set.");
  console.log("      To run, set DNF_PVF_PATH to a Script.pvf path:");
  console.log("        DNF_PVF_PATH=/path/to/Script.pvf npm run smoke:pipeline");
  process.exit(0);
}

const smokeRoot = join(tmpdir(), `smoke-pipeline-${Date.now()}`);
await mkdir(smokeRoot, { recursive: true });

const debugOut = join(smokeRoot, "debug");
const verificationOut = join(smokeRoot, "verification");
const sqliteDbPath = join(smokeRoot, "smoke.db");
const exportOut = join(smokeRoot, "dist", "data");

// Curated minimal cross-section that exercises every parser kind we have
// a real-PVF sample for at this point. Day 14 baseline; expand later.
const files = [
  "character/swordman/swordman.chr",
  "character/swordman/attackinfo/attack3.atk",
  "skill/swordman/upperslash.skl",
  "monster/goblin/goblin.mob",
  "map/test_lorien/4.map",
];

// Stringify enum maps so JSON output is consistent (int keys → string keys).
function stringifyKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[String(k)] = v;
  return out;
}

const startMs = Date.now();

const result = await runExtractParsePipeline({
  pvfPath,
  files,
  debugOut,
  verificationOutDir: verificationOut,
  sqliteDbPath,
  exportOutDir: exportOut,
  sharedPhysics: DNF_PHYSICS_CONSTANTS,
  sharedEnums: {
    tables: {
      ATTACKTYPE: stringifyKeys(ATTACKTYPE),
      ELEMENT: stringifyKeys(ELEMENT),
      DAMAGEACT: stringifyKeys(DAMAGEACT),
      KNOCK_BACK_TYPE: stringifyKeys(KNOCK_BACK_TYPE),
      DOWN_PARAM_TYPE: stringifyKeys(DOWN_PARAM_TYPE),
      CUSTOM_ATTACKINFO: stringifyKeys(CUSTOM_ATTACKINFO),
    },
    field_to_enum: FIELD_TO_ENUM,
  },
});

const durationMs = Date.now() - startMs;

// ── 1. stage advanced to export ─────────────────────────────────────────
assert.equal(result.stage, "export", `smoke: stage must reach 'export' (got '${result.stage}')`);

// ── 2. validation clean on curated set ──────────────────────────────────
assert.equal(result.validation.stats.filesParsed, files.length,
  `smoke: filesParsed must equal ${files.length} (got ${result.validation.stats.filesParsed})`);
assert.equal(result.validation.stats.errors, 0,
  `smoke: 0 errors (got ${result.validation.stats.errors}; first: ${JSON.stringify(result.validation.errors[0])})`);
assert.equal(result.validation.stats.warnings, 0,
  `smoke: 0 warnings (got ${result.validation.stats.warnings}; first: ${JSON.stringify(result.validation.warnings[0])})`);
// Tier-3 marks on ChrParser yield 4 entries per swordman.chr.
assert.ok(result.validation.tier3Fields.length >= 4,
  `smoke: tier3Fields ≥ 4 from swordman.chr (got ${result.validation.tier3Fields.length})`);

// ── 3. players/swordman.json size ≥ 200 KB ──────────────────────────────
const playerShardPath = join(exportOut, "players", "swordman.json");
const playerStat = await stat(playerShardPath);
assert.ok(playerStat.size >= 200_000,
  `smoke: dist/data/players/swordman.json ≥ 200KB (got ${playerStat.size} bytes)`);

// ── 4. manifest correctness ─────────────────────────────────────────────
const manifestPath = result.exportResult?.manifestPath;
assert.ok(manifestPath && existsSync(manifestPath),
  `smoke: manifest.json present (path=${manifestPath})`);
const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
assert.equal(manifest.manifest_version, "1.0.0", "smoke: manifest_version");
assert.ok(manifest.files.length >= 4,
  `smoke: ≥4 entries (player + monster + 2 shared); got ${manifest.files.length}`);

// Each entry: 64-char hex sha256 + sizeBytes matches disk.
for (const entry of manifest.files) {
  assert.ok(/^[0-9a-f]{64}$/.test(entry.sha256),
    `smoke: manifest entry sha256 64-hex (got ${entry.sha256} for ${entry.path})`);
  const absPath = join(exportOut, entry.path);
  const st = await stat(absPath);
  assert.equal(entry.sizeBytes, st.size,
    `smoke: manifest sizeBytes matches disk for ${entry.path}`);
}

// ── 5. SQLite mirror DB has expected rows ───────────────────────────────
const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync(sqliteDbPath);
const fileRow = db.prepare("SELECT COUNT(*) AS n FROM pvf_files").get() as { n: number };
assert.equal(fileRow.n, files.length,
  `smoke: SQLite pvf_files row count = ${files.length} (got ${fileRow.n})`);
const runs = db.prepare("SELECT COUNT(*) AS n FROM extraction_runs").get() as { n: number };
assert.ok(runs.n >= 1, `smoke: extraction_runs has ≥1 row (got ${runs.n})`);
const swordmanInChars = db.prepare("SELECT job, jump_power FROM characters WHERE pvf_path = ?").get("character/swordman/swordman.chr") as { job: string; jump_power: number } | undefined;
assert.equal(swordmanInChars?.job, "swordman", "smoke: characters view returns job");
assert.equal(swordmanInChars?.jump_power, 430, "smoke: characters view returns jump_power=430");
db.close();

// ── 6. Wall-clock < 10 minutes ──────────────────────────────────────────
assert.ok(durationMs < 10 * 60 * 1000,
  `smoke: full pipeline < 10 minutes (got ${durationMs}ms)`);

console.log("");
console.log(`smoke/full-pipeline: PASS in ${durationMs}ms`);
console.log(`  stage=${result.stage}`);
console.log(`  filesExtracted=${result.filesExtracted} filesParsed=${result.filesParsed}`);
console.log(`  validation: errors=${result.validation.stats.errors}, warnings=${result.validation.stats.warnings}, tier3=${result.validation.tier3Fields.length}`);
console.log(`  sqlite: ${result.sqliteImport?.filesUpserted} upserted, ${result.sqliteImport?.refsInserted} refs`);
console.log(`  export: ${result.exportResult?.filesWritten} files written to ${exportOut}`);
console.log(`  players/swordman.json: ${playerStat.size} bytes (target: ≥200000)`);

// Cleanup on success.
await rm(smokeRoot, { recursive: true, force: true });
