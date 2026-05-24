/**
 * Stage 1 hardening — double-run smoke test for the contentFingerprint
 * incremental-skip path (Day 17).
 *
 * Day 15 surfaced a caveat: raw-sha256 incremental skip can NEVER fire after
 * a fresh dnf-extract, because every PvfFact.provenance.extractTimestamp gets
 * a new value. RuntimeExporter now supports `useContentFingerprint:true`
 * which compares a timestamp-stripped fingerprint instead. This smoke test
 * runs the full EXTRACT → PARSE → VALIDATE → LOAD → EXPORT pipeline twice
 * end-to-end against the real Script.pvf, and asserts the second run skips
 * at least one shard (the player shard — swordman.chr content is stable
 * across both extractor invocations).
 *
 * Env-gated: requires `DNF_PVF_PATH`; exits 0 with SKIP message when unset.
 *
 * Asserts:
 *   1. Both runs complete (stage="export").
 *   2. Run 1 has 0 skipped shards (clean baseline).
 *   3. Run 2 skips ≥1 shard via the contentFingerprint match.
 *   4. The skipped shard's contentSha256 is byte-identical across runs.
 *   5. The skipped shard's RAW sha256 differs across runs (proving that the
 *      timestamps actually changed — i.e. this test is exercising the
 *      fingerprint path, not coincidentally getting byte-equivalent JSON).
 *
 * Cleans up the smoke output dir on success; preserves on failure.
 */

import { mkdir, rm } from "node:fs/promises";
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
  console.log("SKIP: full-pipeline-double-run smoke — DNF_PVF_PATH not set.");
  console.log("      To run, set DNF_PVF_PATH to a Script.pvf path:");
  console.log("        DNF_PVF_PATH=/path/to/Script.pvf npm run smoke:pipeline");
  process.exit(0);
}

const smokeRoot = join(tmpdir(), `smoke-double-${Date.now()}`);
await mkdir(smokeRoot, { recursive: true });

// Same curated 5-file set as the single-run smoke. Player shard is the most
// likely candidate to skip on run 2 — swordman.chr + its skl + atks compose
// the bulk of bytes and stay byte-identical at the semantic level.
const files = [
  "character/swordman/swordman.chr",
  "character/swordman/attackinfo/attack3.atk",
  "skill/swordman/upperslash.skl",
  "monster/goblin/goblin.mob",
  "map/test_lorien/4.map",
];

function stringifyKeys(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) out[String(k)] = String(v);
  return out;
}

const sharedEnumsArg = {
  tables: {
    ATTACKTYPE: stringifyKeys(ATTACKTYPE as unknown as Record<string, unknown>),
    ELEMENT: stringifyKeys(ELEMENT as unknown as Record<string, unknown>),
    DAMAGEACT: stringifyKeys(DAMAGEACT as unknown as Record<string, unknown>),
    KNOCK_BACK_TYPE: stringifyKeys(KNOCK_BACK_TYPE as unknown as Record<string, unknown>),
    DOWN_PARAM_TYPE: stringifyKeys(DOWN_PARAM_TYPE as unknown as Record<string, unknown>),
    CUSTOM_ATTACKINFO: stringifyKeys(CUSTOM_ATTACKINFO as unknown as Record<string, unknown>),
  },
  field_to_enum: FIELD_TO_ENUM,
};

// ─── Run 1 ────────────────────────────────────────────────────────────────
const run1Started = Date.now();
const run1 = await runExtractParsePipeline({
  pvfPath,
  files,
  debugOut: join(smokeRoot, "run1", "debug"),
  verificationOutDir: join(smokeRoot, "run1", "verification"),
  sqliteDbPath: join(smokeRoot, "run1.db"),
  exportOutDir: join(smokeRoot, "run1", "dist", "data"),
  sharedPhysics: DNF_PHYSICS_CONSTANTS,
  sharedEnums: sharedEnumsArg,
  exportUseContentFingerprint: true,
});
const run1DurationMs = Date.now() - run1Started;

assert.equal(run1.stage, "export", `run1: stage must reach 'export' (got '${run1.stage}')`);
assert.equal(run1.exportResult?.filesSkipped, 0,
  `run1: baseline should have 0 skipped shards (got ${run1.exportResult?.filesSkipped})`);
assert.ok(run1.exportResult && run1.exportResult.manifest.files.length >= 4,
  `run1: ≥4 manifest entries (got ${run1.exportResult?.manifest.files.length})`);

// Every entry must carry contentSha256 (since useContentFingerprint=true was set).
for (const entry of run1.exportResult!.manifest.files) {
  assert.ok(typeof entry.contentSha256 === "string" && /^[0-9a-f]{64}$/.test(entry.contentSha256),
    `run1: contentSha256 is 64-char hex on ${entry.path} (got ${entry.contentSha256})`);
}

// ─── Run 2 — re-extract, pass run1's manifest as incremental base ─────────
// Sleep well across a second boundary so the C++ extractor (which stamps
// `%Y-%m-%dT%H:%M:%SZ`, 1s precision) is guaranteed to emit a fresh
// timestamp per file. We sleep > 1s to make this robust even when run1
// finished near the end of a second (so run2 extract is well into the
// next second). If both runs land in the same second window, raw sha256
// will match too — fingerprint can't be uniquely proven from this smoke
// alone (H15-9/H15-10 cover that synthetically). We still validate
// functional skip behavior either way.
await new Promise(resolve => setTimeout(resolve, 1500));

const run2Started = Date.now();
const run2 = await runExtractParsePipeline({
  pvfPath,
  files,
  debugOut: join(smokeRoot, "run2", "debug"),
  verificationOutDir: join(smokeRoot, "run2", "verification"),
  sqliteDbPath: join(smokeRoot, "run2.db"),
  exportOutDir: join(smokeRoot, "run2", "dist", "data"),
  sharedPhysics: DNF_PHYSICS_CONSTANTS,
  sharedEnums: sharedEnumsArg,
  exportBaseManifest: run1.exportResult!.manifest,
  exportUseContentFingerprint: true,
});
const run2DurationMs = Date.now() - run2Started;

assert.equal(run2.stage, "export", `run2: stage must reach 'export' (got '${run2.stage}')`);
assert.ok(run2.exportResult, "run2: exportResult present");

// ── KEY ASSERTION: at least one shard skipped via fingerprint match ──────
assert.ok(run2.exportResult!.filesSkipped >= 1,
  `run2: filesSkipped ≥ 1 (got ${run2.exportResult!.filesSkipped}) — ` +
  `if this is 0, contentFingerprint path isn't firing; check that ` +
  `useContentFingerprint propagated through pipelineRunner`);

// Build by-path indices to cross-check skipped shards.
const run1ByPath = new Map(run1.exportResult!.manifest.files.map(e => [e.path, e]));
const run2ByPath = new Map(run2.exportResult!.manifest.files.map(e => [e.path, e]));
assert.equal(run2ByPath.size, run1ByPath.size,
  `manifest entry count must match across runs (run1=${run1ByPath.size}, run2=${run2ByPath.size})`);

// For each shard present in both runs, count contentSha256 matches. A match
// proves either:
//   (a) the fingerprint path skipped this shard, OR
//   (b) the raw sha256 also happened to match (e.g. shared/*.json have no
//       timestamps inside, so raw and content fingerprints always agree)
// The control run below disambiguates: it re-runs run2 with
// useContentFingerprint=false. If skip-count drops between fingerprint and
// raw modes, that delta is unambiguously attributable to the fingerprint
// path doing real work (stripping timestamps that the raw mode could not).
let skippedContentMatchCount = 0;
for (const [path, e1] of run1ByPath) {
  const e2 = run2ByPath.get(path);
  if (!e2) continue;
  if (e1.contentSha256 && e2.contentSha256 && e1.contentSha256 === e2.contentSha256) {
    skippedContentMatchCount += 1;
  }
}
assert.ok(skippedContentMatchCount >= 1,
  `at least one shard must have matching contentSha256 across runs (got ${skippedContentMatchCount})`);

// ── Control run — re-extract again, same base manifest, but
// useContentFingerprint=false. If timestamps actually changed since run1 (the
// case we want to validate), raw-sha256 skip cannot match any
// timestamp-bearing shard. Skip count here MUST be strictly less than run2's,
// and the delta proves the fingerprint path was doing real work.
// Sleep across another second boundary first so the control's timestamps
// also differ from run1's.
await new Promise(resolve => setTimeout(resolve, 1500));

const runCtlStarted = Date.now();
const runCtl = await runExtractParsePipeline({
  pvfPath,
  files,
  debugOut: join(smokeRoot, "ctl", "debug"),
  verificationOutDir: join(smokeRoot, "ctl", "verification"),
  sqliteDbPath: join(smokeRoot, "ctl.db"),
  exportOutDir: join(smokeRoot, "ctl", "dist", "data"),
  sharedPhysics: DNF_PHYSICS_CONSTANTS,
  sharedEnums: sharedEnumsArg,
  exportBaseManifest: run1.exportResult!.manifest,
  // Crucial: disabled. Only raw sha256 compared. Same incremental base.
  exportUseContentFingerprint: false,
});
const runCtlDurationMs = Date.now() - runCtlStarted;

const fingerprintAttributedSkips =
  run2.exportResult!.filesSkipped - runCtl.exportResult!.filesSkipped;

// At least 1 skip must be uniquely attributable to fingerprint mode.
// (Run2 should have skipped player+monster+shared/2; control should skip
// only the shared/2 because they carry no timestamps.)
assert.ok(fingerprintAttributedSkips >= 1,
  `fingerprint-attributed skip delta must be ≥1 ` +
  `(run2.skip=${run2.exportResult!.filesSkipped}, ` +
  `control.skip=${runCtl.exportResult!.filesSkipped}, ` +
  `delta=${fingerprintAttributedSkips}) — if 0, the extractor produced ` +
  `byte-identical output across runs (so fingerprint mode could not be ` +
  `uniquely proven from this smoke). Increase the sleep above to span ` +
  `more second boundaries, or rely on H15-9/H15-10 synthetic tests for ` +
  `proof.`);

console.log("");
console.log(`smoke/full-pipeline-double-run: PASS`);
console.log(`  run1: ${run1DurationMs}ms, ${run1.exportResult!.filesWritten} written, 0 skipped`);
console.log(`  run2: ${run2DurationMs}ms, ${run2.exportResult!.filesWritten} written, ${run2.exportResult!.filesSkipped} skipped (useContentFingerprint=true)`);
console.log(`  ctl : ${runCtlDurationMs}ms, ${runCtl.exportResult!.filesWritten} written, ${runCtl.exportResult!.filesSkipped} skipped (useContentFingerprint=false)`);
console.log(`  fingerprint matches across runs (run1↔run2): ${skippedContentMatchCount}`);
console.log(`  fingerprint-attributed skip delta (run2 - ctl): ${fingerprintAttributedSkips} — these skips would NOT have fired in raw-sha256 mode`);

await rm(smokeRoot, { recursive: true, force: true });
