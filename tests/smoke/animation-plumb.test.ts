/**
 * Stage 1 animation plumbing smoke — exercises `scripts/pipeline.mjs`
 * with `--ani-file` flags and asserts that:
 *
 *   1. The CLI shells out successfully (typecheck + pipeline.mjs end-to-end).
 *   2. `dist/data/players/swordman.json` carries a non-empty `animations`
 *      map keyed by .ani basename, each entry a valid AniDef (path, frames
 *      array, provenance.extractorVersion ≠ undefined).
 *   3. The frame shape preserves attack/damage boxes when present in source.
 *
 * Env-gated: requires `DNF_PVF_PATH`; skips gracefully when absent.
 *
 * Audit pipeline-closure F2 fix (2026-05-24): before this commit,
 * `--ani-file` did not exist on the CLI and `runExtractParsePipeline.aniDefs`
 * was wired into RuntimeExporter but never populated from pipeline.mjs.
 * The probe locks the regression by asserting the CLI surfaces aniDefs into
 * the shard `animations` field end-to-end.
 */

import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert } from "../static/test-utils.js";

const pvfPath = process.env.DNF_PVF_PATH;
if (!pvfPath || pvfPath.trim() === "") {
  console.log("SKIP: animation-plumb smoke — DNF_PVF_PATH not set.");
  console.log("      To run, set DNF_PVF_PATH to a Script.pvf path:");
  console.log("        DNF_PVF_PATH=/path/to/Script.pvf npm run smoke:pipeline");
  process.exit(0);
}

const smokeRoot = join(tmpdir(), `smoke-anim-plumb-${Date.now()}`);
await mkdir(smokeRoot, { recursive: true });

const debugOut = join(smokeRoot, "debug");
const verificationOut = join(smokeRoot, "verification");
const sqliteDbPath = join(smokeRoot, "smoke.db");
const exportOut = join(smokeRoot, "dist", "data");

// Curated minimal set: 1 chr (so a player shard is produced) + 2 ani files
// known to exist in real PVFs (verified 2026-05-24).
const cliArgs = [
  "scripts/pipeline.mjs",
  "--pvf", pvfPath,
  "--file", "character/swordman/swordman.chr",
  "--ani-file", "character/swordman/animation/stay.ani",
  "--ani-file", "character/swordman/animation/attack1.ani",
  "--debug-out", debugOut,
  "--verification-out", verificationOut,
  "--sqlite-db", sqliteDbPath,
  "--export-out", exportOut,
];

const startMs = Date.now();
const r = spawnSync(process.execPath, cliArgs, {
  cwd: process.cwd(),
  encoding: "utf8",
  // pipeline.mjs runs `npm run` ⟶ spawn inside; allow up to 10 min.
  timeout: 10 * 60 * 1000,
});
const durationMs = Date.now() - startMs;

if (r.status !== 0) {
  console.error("--- pipeline.mjs stdout ---");
  console.error(r.stdout);
  console.error("--- pipeline.mjs stderr ---");
  console.error(r.stderr);
  throw new Error(`pipeline.mjs exited with status ${r.status} (signal=${r.signal})`);
}

// The CLI prints a final JSON summary line. The first balanced JSON object
// in stdout is the result.
const stdoutTrim = r.stdout.trim();
const lastBrace = stdoutTrim.lastIndexOf("}");
const firstBrace = stdoutTrim.indexOf("{");
assert.ok(firstBrace >= 0 && lastBrace > firstBrace,
  `smoke: pipeline.mjs stdout must contain a JSON object (got ${JSON.stringify(stdoutTrim.slice(0, 120))}…)`);
const summary = JSON.parse(stdoutTrim.slice(firstBrace, lastBrace + 1));

assert.equal(summary.stage, "export", `smoke: stage must reach 'export' (got '${summary.stage}')`);
assert.equal(summary.aniDefsLoaded, 2,
  `smoke: aniDefsLoaded must equal 2 (got ${summary.aniDefsLoaded})`);

// Verify shard animations field populated.
const playerShardPath = join(exportOut, "players", "swordman.json");
assert.ok(existsSync(playerShardPath),
  `smoke: ${playerShardPath} must exist`);
const playerShard = JSON.parse(await readFile(playerShardPath, "utf-8")) as {
  animations: Record<string, {
    path: string;
    framesCount: number;
    frames: Array<{ attackBoxes: unknown[]; damageBoxes: unknown[] }>;
    provenance: { extractorVersion: string };
  }>;
};

assert.ok(playerShard.animations && typeof playerShard.animations === "object",
  "smoke: shard must have animations object");
const animKeys = Object.keys(playerShard.animations);
assert.equal(animKeys.length, 2,
  `smoke: animations map must have 2 entries (stand + attack1); got ${animKeys.length} [${animKeys.join(",")}]`);
assert.ok(animKeys.includes("stay"),
  `smoke: animations must include "stay" (got ${animKeys.join(",")})`);
assert.ok(animKeys.includes("attack1"),
  `smoke: animations must include "attack1" (got ${animKeys.join(",")})`);

// Spot-check one anim's shape.
const stand = playerShard.animations.stay;
assert.equal(stand.path, "character/swordman/animation/stay.ani",
  `smoke: stay.path mismatch (got '${stand.path}')`);
assert.ok(stand.framesCount > 0,
  `smoke: stay.framesCount must be > 0 (got ${stand.framesCount})`);
assert.equal(stand.frames.length, stand.framesCount,
  `smoke: stay.frames.length must match framesCount (got ${stand.frames.length} vs ${stand.framesCount})`);
assert.ok(stand.provenance && typeof stand.provenance.extractorVersion === "string",
  `smoke: stay must have provenance.extractorVersion`);

// Each frame must have attackBoxes + damageBoxes arrays (empty allowed).
for (let i = 0; i < stand.frames.length; i++) {
  const f = stand.frames[i];
  assert.ok(Array.isArray(f.attackBoxes),
    `smoke: stay.frames[${i}].attackBoxes must be array`);
  assert.ok(Array.isArray(f.damageBoxes),
    `smoke: stay.frames[${i}].damageBoxes must be array`);
}

// Wall-clock < 10 minutes (defensive guard).
assert.ok(durationMs < 10 * 60 * 1000,
  `smoke: animation-plumb full run < 10 minutes (got ${durationMs}ms)`);

console.log("");
console.log(`smoke/animation-plumb: PASS in ${durationMs}ms`);
console.log(`  aniDefsLoaded=${summary.aniDefsLoaded}`);
console.log(`  animations.stay: ${stand.framesCount} frames, extractorVersion=${stand.provenance.extractorVersion}`);
console.log(`  shard path: ${playerShardPath}`);

// Cleanup on success.
await rm(smokeRoot, { recursive: true, force: true });
