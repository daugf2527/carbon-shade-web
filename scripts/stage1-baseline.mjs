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
import { copyFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
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

const args = new Set(process.argv.slice(2));
const PVE_FULL = args.has("--pve-full");
const PVE_PATHS_SNAPSHOT = path.join(ROOT, "verification", "pvf-list-stdout.json");

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
  // Dungeon sample — P1-1 fix (2026-05-24, complete-stage1-review): without
  // a .dgn the baseline left dist/data/dungeons/ empty, leaving the Stage 2
  // DungeonRuntimeShape consumer surface with no fixture to compare against.
  "dungeon/act3/jungle.dgn",
  // Map sample
  "map/test_lorien/4.map",
  // Phase 4 P0-4 (2026-05-26, stage1.5-revised-plan §二.P0-4): swordman
  // core motion .ani inlined into player shard so Stage 2 system 5
  // (Animation playback) has per-frame hitbox data on Day 1. Without these,
  // RuntimeExporter.playerAnims stays {} and runtime can't read attack/dmg
  // boxes. .ani files are routed via a separate extract+parse path (main
  // pipeline filters type:"animation" out per parseStage NOTE).
  // DNF 命名约定（2026-05-27 audit 修正）：idle 叫 "stay" 不是 "stand"，
  // walk 叫 "move" 不是 "walk"。前一版 CURATED 用英文意译导致 dnf-extract
  // 返回 type:"error" / "not_found"，被 extractAndParseAnis 静默跳过，
  // 最终 swordman shard.animations 只有 10 个 key 而不是 12 个。
  "character/swordman/animation/stay.ani",
  "character/swordman/animation/move.ani",
  "character/swordman/animation/dash.ani",
  "character/swordman/animation/jump.ani",
  "character/swordman/animation/attack1.ani",
  "character/swordman/animation/attack2.ani",
  "character/swordman/animation/attack3.ani",
  "character/swordman/animation/hardattack.ani",
  "character/swordman/animation/jumpattack.ani",
  "character/swordman/animation/dashattack.ani",
  "character/swordman/animation/damage1.ani",
  "character/swordman/animation/down.ani",
];

// PVE Phase 2A filter (2026-05-24): expand to all character/* + skill/* files.
// Stage 1 EXPORT is entity-centric — one player shard per chr contains all
// sub-resources (skl/atk/ani/etc) that share the same parent job dir. So
// loading the player surface means loading every file under character/<job>/
// and skill/<job>/. PVE-only by exclusion: ignore battlemode/pvpmode artifacts
// and any non-runtime parser kinds (no .img / .ani metadata-only / .lst).
// PvP fields inside loaded files are still sanitised by the EXPORT step
// (sanitizeMapForRuntime / isPvpOnlyAtk).
//
// Phase 2B (later) would add monster/, dungeon/, map/, passiveobject/.
async function pveFullFiles() {
  // Auto-dump the PVF path list if absent. This makes baseline:pve runnable
  // from a fresh clone without manual setup — the snapshot is a function of
  // the .pvf file only (same crc32 ⇒ same path list), so it's a derivable
  // artifact, not source-controlled. Stored under verification/ so reviewers
  // can inspect the input without rerunning.
  try {
    await readFile(PVE_PATHS_SNAPSHOT, "utf8");
  } catch {
    console.log(`[baseline] pvf-list snapshot missing, generating via dnf-extract --list…`);
    const stderrPath = path.join(ROOT, "verification", "pvf-list-stderr.log");
    const { writeFile } = await import("node:fs/promises");
    const result = spawnSync(EXTRACT, ["--pvf", pvfPath, "--list"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status !== 0) {
      console.error("dnf-extract --list failed:", result.stderr);
      process.exit(result.status ?? 1);
    }
    await writeFile(PVE_PATHS_SNAPSHOT, result.stdout, "utf8");
    if (result.stderr) await writeFile(stderrPath, result.stderr, "utf8");
    console.log(`[baseline] pvf-list snapshot written to ${path.relative(ROOT, PVE_PATHS_SNAPSHOT)}`);
  }
  const snapshot = JSON.parse(await readFile(PVE_PATHS_SNAPSHOT, "utf8"));
  const all = snapshot.files;
  if (!Array.isArray(all)) {
    throw new Error(`pvf-list-stdout.json missing files array (got ${typeof snapshot.files})`);
  }
  const PVE_PREFIXES = ["character/", "skill/"];
  // Parser kinds the Stage 1 pipeline supports. Extensions not in this set
  // are filtered out before submission to the pipeline.
  // .act is in the PVF tree (character/common/action/*.act) but Stage 1
  // has no ActParser registered; submitting them yields "No parser
  // registered" errors that block EXPORT.
  const PVE_EXTS = new Set([".chr", ".atk", ".skl", ".ani", ".etc", ".mob", ".dgn", ".map"]);
  return all.filter(p => {
    if (!PVE_PREFIXES.some(prefix => p.startsWith(prefix))) return false;
    const dot = p.lastIndexOf(".");
    if (dot < 0) return false;
    return PVE_EXTS.has(p.slice(dot).toLowerCase());
  });
}

const targetFiles = PVE_FULL ? await pveFullFiles() : CURATED_FILES;
if (PVE_FULL) {
  console.log(`[baseline] --pve-full mode: loaded ${targetFiles.length} files from PVF snapshot`);
}

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
// Phase 4 P0-4: AniParser is intentionally outside the main pipeline dispatch
// (parseStage filters to type:"document"). We import it directly and feed
// AniDef[] via the `aniDefs` option on runExtractParsePipeline.
const aniParserUrl = pathToFileURL(path.join(
  ROOT, ".tmp", "test-js", "src", "dnf-native-combat", "data", "parsers", "AniParser.js",
)).href;

const { runExtractParsePipeline } = await import(runnerUrl);
const physicsMod = await import(physicsUrl);
const enumsMod = await import(enumsUrl);
const { parseAniDocument } = await import(aniParserUrl);

// Phase 4 P0-4 (2026-05-26): extract+parse a batch of .ani paths via
// dnf-extract, returning AniDef[]. .ani is JSON type:"animation", routed
// outside the main pipeline (which only handles type:"document"). Errors
// per-file are logged but do not abort the baseline run.
async function extractAndParseAnis(aniPaths) {
  if (aniPaths.length === 0) return [];
  const proc = spawnSync(EXTRACT, ["--pvf", pvfPath, "--batch", ...aniPaths], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    console.warn(`[baseline] ani --batch non-zero exit ${proc.status}; stderr tail: ${(proc.stderr ?? "").slice(-400)}`);
  }
  const parts = (proc.stdout ?? "").split(/\n?---\n?/).filter(s => s.trim());
  const aniDefs = [];
  let parseFailCount = 0;
  for (const part of parts) {
    let doc;
    try { doc = JSON.parse(part.trim()); }
    catch (e) { parseFailCount++; continue; }
    if (doc.type !== "animation") continue;
    try { aniDefs.push(parseAniDocument(doc)); }
    catch (e) {
      parseFailCount++;
      console.warn(`[baseline] AniParser failed for ${doc.path}: ${e.message}`);
    }
  }
  if (parseFailCount > 0) {
    console.warn(`[baseline] ${parseFailCount} ani docs failed JSON.parse or AniParser`);
  }
  return aniDefs;
}

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

// PVE-full fix (2026-05-25): wipe exportOut before the pipeline runs so
// stale shards from a prior --pve-sample run (e.g. dungeons/jungle.json
// when --pve-full's character/+skill/ filter excludes .dgn/.mob) don't
// survive into the next baseline's copyDir(exportOut, baseline-shards).
await rm(exportOut, { recursive: true, force: true });
await mkdir(exportOut, { recursive: true });

const runId = "stage1-baseline";  // fixed runId so report filenames are stable

const startMs = Date.now();
console.log(`[baseline] starting on ${targetFiles.length} ${PVE_FULL ? "PVE-full" : "curated"} files…`);

// Phase 4 P0-4: partition .ani out of main pipeline target list. Main
// pipeline (PvfDocumentLoader) drops type:"animation" with only a warn —
// AniParser instead runs in extractAndParseAnis() and feeds aniDefs.
const aniTargets = targetFiles.filter(p => p.toLowerCase().endsWith(".ani"));
const nonAniTargets = targetFiles.filter(p => !p.toLowerCase().endsWith(".ani"));
console.log(`[baseline] ani routing: ${aniTargets.length} .ani → AniParser; ${nonAniTargets.length} → main pipeline`);

const aniDefs = await extractAndParseAnis(aniTargets);
console.log(`[baseline] parsed ${aniDefs.length} AniDef from ${aniTargets.length} .ani requests`);

const result = await runExtractParsePipeline({
  pvfPath,
  files: nonAniTargets,
  debugOut,
  executablePath: EXTRACT,
  runId,
  verificationOutDir: verificationDir,
  sqliteDbPath,
  sqliteMode: "full",
  exportOutDir: exportOut,
  aniDefs,
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

// P0-3 fix (2026-05-24, complete-stage1-review): persist the EXPORT shards
// under verification/ alongside the manifest copy. Before this, the only
// committed evidence that Stage 1 actually produced the shards was the
// dist-manifest-stage1-baseline.json file — but the shards themselves
// lived under dist/data/ which is gitignored, so reviewers had no way to
// sample real shard structure without re-running the baseline. The shards
// are now mirrored into verification/baseline-shards/ on every baseline
// run, providing a frozen reference set for downstream regression checks.
const baselineShardsDir = path.join(verificationDir, "baseline-shards");
// Wipe the prior copy so removed entries don't linger across baseline runs.
await rm(baselineShardsDir, { recursive: true, force: true });
await mkdir(baselineShardsDir, { recursive: true });
async function copyDir(src, dst) {
  await mkdir(dst, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await copyFile(s, d);
  }
}
await copyDir(exportOut, baselineShardsDir);

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
