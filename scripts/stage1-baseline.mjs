/**
 * Stage 1 baseline generator.
 *
 * Runs --full pipeline on a curated PVF cross-section (11 player .chr +
 * representative monster/skill/map/dungeon files) and saves three baseline
 * reports under verification/ for regression comparison:
 *
 *   verification/extraction-report-stage1-baseline.json
 *   verification/provenance-audit-stage1-baseline.json
 *   verification/dist-manifest-stage1-baseline.json
 *
 * The baseline locks a known-good output shape and stats. Subsequent runs
 * can diff their reports against the baseline to catch regressions in
 * validator counts, ref integrity, or per-shard sha256 contracts.
 *
 * Requires DNF_PVF_PATH env var (matches the smoke test contract). Refuses
 * to run if the env var is unset.
 *
 * The baseline runs across the entire Stage 1 parser surface but does NOT
 * scan the full 370K-file PVF — only a curated representative slice.
 */

import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const EXTRACT = path.join(ROOT, "tools", process.platform === "win32" ? "dnf-extract.exe" : "dnf-extract");

const pvfPath = process.env.DNF_PVF_PATH;
if (!pvfPath || pvfPath.trim() === "") {
  console.error("ERROR: DNF_PVF_PATH not set.");
  console.error("       DNF_PVF_PATH=/path/to/Script.pvf node scripts/stage1-baseline.mjs");
  process.exit(2);
}

// Curated cross-section. All 11 player .chr + cross-parser representatives.
const CURATED_FILES = [
  // All 11 player .chr — exercise ChrParser full surface
  "character/swordman/swordman.chr",
  "character/swordman/demonicswordman.chr",
  "character/gunner/gunner.chr",
  "character/gunner/atgunner.chr",
  "character/priest/priest.chr",
  "character/fighter/fighter.chr",
  "character/fighter/atfighter.chr",
  "character/mage/mage.chr",
  "character/mage/atmage.chr",
  "character/mage/creatormage.chr",
  "character/thief/thief.chr",
  // Atk samples
  "character/swordman/attackinfo/attack1.atk",
  "character/swordman/attackinfo/attack3.atk",
  "character/swordman/attackinfo/dashattack.atk",
  // Skill samples
  "skill/swordman/upperslash.skl",
  "skill/swordman/icewave.skl",
  // Monster sample
  "monster/goblin/goblin.mob",
  // Map sample
  "map/test_lorien/4.map",
];

// Compile TS once.
const compile = spawnSync(process.execPath, [
  path.join(ROOT, "scripts", "run-tsc.mjs"),
  "-p", path.join(ROOT, "tsconfig.test.json"),
], { cwd: ROOT, encoding: "utf8" });
if (compile.status !== 0) {
  if (compile.stdout) process.stdout.write(compile.stdout);
  if (compile.stderr) process.stderr.write(compile.stderr);
  process.exit(compile.status ?? 1);
}

const runnerUrl = pathToFileURL(path.join(
  ROOT, ".tmp", "test-js", "src", "dnf-native-combat", "data", "pipeline", "pipelineRunner.js",
)).href;
const physicsUrl = pathToFileURL(path.join(
  ROOT, ".tmp", "test-js", "src", "data", "official", "dnfPhysicsConstants.js",
)).href;
const enumsUrl = pathToFileURL(path.join(
  ROOT, ".tmp", "test-js", "src", "data", "official", "dnfEnumTables.js",
)).href;

const { runExtractParsePipeline } = await import(runnerUrl);
const physicsMod = await import(physicsUrl);
const enumsMod = await import(enumsUrl);

const stringifyKeys = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[String(k)] = v;
  return out;
};

const verificationDir = path.join(ROOT, "verification");
const debugOut = path.join(ROOT, ".tmp", "stage1-baseline-debug");
const sqliteDbPath = path.join(ROOT, ".tmp", "stage1-baseline.db");
const exportOut = path.join(ROOT, "dist", "data");

await mkdir(verificationDir, { recursive: true });
await mkdir(debugOut, { recursive: true });

const runId = "stage1-baseline";  // fixed runId so report filenames are stable

const startMs = Date.now();
console.log(`[baseline] starting on ${CURATED_FILES.length} curated files…`);

const result = await runExtractParsePipeline({
  pvfPath,
  files: CURATED_FILES,
  debugOut,
  executablePath: EXTRACT,
  runId,
  verificationOutDir: verificationDir,
  sqliteDbPath,
  sqliteMode: "full",
  exportOutDir: exportOut,
  sharedPhysics: physicsMod.DNF_PHYSICS_CONSTANTS,
  sharedEnums: {
    tables: {
      ATTACKTYPE: stringifyKeys(enumsMod.ATTACKTYPE),
      ELEMENT: stringifyKeys(enumsMod.ELEMENT),
      DAMAGEACT: stringifyKeys(enumsMod.DAMAGEACT),
      KNOCK_BACK_TYPE: stringifyKeys(enumsMod.KNOCK_BACK_TYPE),
      DOWN_PARAM_TYPE: stringifyKeys(enumsMod.DOWN_PARAM_TYPE),
      CUSTOM_ATTACKINFO: stringifyKeys(enumsMod.CUSTOM_ATTACKINFO),
    },
    field_to_enum: enumsMod.FIELD_TO_ENUM,
  },
});

const durationMs = Date.now() - startMs;

// Promote run-specific report files to *-stage1-baseline.json
const extractionSrc = path.join(verificationDir, `extraction-report-${runId}.json`);
const provenanceSrc = path.join(verificationDir, `provenance-audit-${runId}.json`);
const extractionDst = path.join(verificationDir, "extraction-report-stage1-baseline.json");
const provenanceDst = path.join(verificationDir, "provenance-audit-stage1-baseline.json");
const manifestSrc = path.join(exportOut, "manifest.json");
const manifestDst = path.join(verificationDir, "dist-manifest-stage1-baseline.json");

await copyFile(extractionSrc, extractionDst);
await copyFile(provenanceSrc, provenanceDst);
await copyFile(manifestSrc, manifestDst);

console.log("");
console.log(`[baseline] complete in ${durationMs}ms`);
console.log(`  pipeline stage:        ${result.stage}`);
console.log(`  files extracted:       ${result.filesExtracted}`);
console.log(`  files parsed:          ${result.filesParsed}`);
console.log(`  parse errors:          ${result.parseErrors.length}`);
console.log(`  validation errors:     ${result.validation.stats.errors}`);
console.log(`  validation warnings:   ${result.validation.stats.warnings}`);
console.log(`  tier3 fields surfaced: ${result.validation.tier3Fields.length}`);
console.log(`  pvp fields:            ${result.validation.pvpFields.length}`);
console.log(`  refs resolved:         ${result.validation.refIntegrity.filter(r => r.status === "resolved").length}`);
console.log(`  refs missing:          ${result.validation.refIntegrity.filter(r => r.status === "missing").length}`);
console.log(`  sqlite upserts:        ${result.sqliteImport?.filesUpserted ?? 0}`);
console.log(`  export shards written: ${result.exportResult?.filesWritten ?? 0}`);
console.log("");
console.log("Baseline reports:");
console.log(`  ${path.relative(ROOT, extractionDst)}`);
console.log(`  ${path.relative(ROOT, provenanceDst)}`);
console.log(`  ${path.relative(ROOT, manifestDst)}`);
