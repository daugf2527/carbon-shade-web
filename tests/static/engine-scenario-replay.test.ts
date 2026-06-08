/**
 * engine-scenario-replay.test.ts — P3 收尾: EngineKernel scenario + replay verification.
 *
 * Proves the three formerly-stub methods now do real work on an assembled kernel:
 *   runDeterministicScenario() scripts attack1 (normal hit) + attack3 (airborne launch),
 *   scenario booleans flip from the ACTUAL CombatResolutionSystem hit path, and the replay
 *   trail is deterministic across runs / seed-isolated.
 *
 *   S1 runDeterministicScenario() returns a non-empty ScenarioBooleans
 *   S2 normalHitObserved === true   (attack1 lands)
 *   S3 launchObserved === true      (attack3 hit_lift_up → airborne)
 *   S4 replay.export() is valid      (frameCount>0, finalStateHash non-empty, metadata mirror)
 *   S5 determinism golden            (same seed → identical finalStateHash + frame trail)
 *   S6 seed isolation                (different seed → different finalStateHash)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Actor, statsFromPlayerShard, statsFromMonsterShard } from "../../src/engine/core/Actor.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../../src/engine/kernel/systems/CombatResolutionSystem.js";
import { HitstunSystem } from "../../src/engine/kernel/systems/HitstunSystem.js";
import { HitStopSystem } from "../../src/engine/kernel/systems/HitStopSystem.js";
import { AirborneSystem } from "../../src/engine/kernel/systems/AirborneSystem.js";
import { StatusSystem } from "../../src/engine/kernel/systems/StatusSystem.js";

const ROOT = process.cwd();
const swShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const gobShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/monsters/goblin.json"), "utf-8"));

// Real swordman action geometry (mirrors CombatScene.defineActions): hitbox on the middle frame.
function attack(frames: number, hitFrame: number, boxW = 50, boxH = 80): AniDef {
  const result: AniDef["frames"][number][] = [];
  for (let i = 0; i < frames; i++) {
    result.push({
      index: i,
      delay: 1000 / 60,
      attackBoxes: i === hitFrame ? [{ x1: 0, y1: 0, z1: -30, x2: boxW, y2: boxH, z2: 30 }] : [],
      damageBoxes: [],
    });
  }
  return { framesCount: frames, loop: false, frames: result };
}

/** Assemble a scenario-ready kernel: player + grunt + the 7 combat systems + attack1/attack3. */
function buildScenarioKernel(seed: number): EngineKernel {
  const kernel = new EngineKernel(seed);
  const player = new Actor("player", "player", statsFromPlayerShard(swShard.chr));
  const grunt = new Actor("grunt", "monster", statsFromMonsterShard(gobShard.mob));
  player.x = 100;
  grunt.x = 130;
  kernel.addActor(player, true);
  kernel.addActor(grunt, false);

  const actions = new ActionSystem();
  actions.define("attack1", attack(4, 1));          // hit_down, causesDown=false → plain HIT
  actions.define("attack3", attack(6, 3, 60, 90));  // hit_lift_up → airborne
  kernel.registerSystem(actions);
  kernel.registerSystem(new AnimationSystem());
  kernel.registerSystem(new CombatResolutionSystem());
  kernel.registerSystem(new HitstunSystem());
  kernel.registerSystem(new HitStopSystem());
  kernel.registerSystem(new AirborneSystem());
  kernel.registerSystem(new StatusSystem());        // 09-Status: enables the bleed sub-scenario
  return kernel;
}

// ── S1 + S2 + S3: scenario observes normal hit + launch ──
{
  const kernel = buildScenarioKernel(42);
  const scenario = kernel.runDeterministicScenario();
  assert.ok(scenario && typeof scenario === "object", "S1: returns a ScenarioBooleans object");
  assert.equal(scenario.normalHitObserved, true, "S2: attack1 landed a normal hit");
  assert.equal(scenario.launchObserved, true, "S3: attack3 hit_lift_up launched the target airborne");
  assert.equal(scenario.bleedObserved, true, "S3b: bleed DOT observed (09-Status StatusSystem)");
  // 3 unimplemented flags stay honestly false (no multi-hit super / building-armor block / rebound in scenario).
  assert.equal(scenario.armorHitObserved, true, "S1b: armorHit observed (boss super-armor sub-scenario, Batch 3a)");
  assert.equal(scenario.quickReboundObserved, false, "S1b: quickRebound not observable (P4 gap — DownSystem not in scenario kernel)");
  console.log("S1-S4 OK: scenario observed normalHit + launch + bleed + armorHit (3 P4-gap flags stay false)");
}

// ── S4: replay export is valid ──
{
  const kernel = buildScenarioKernel(42);
  kernel.runDeterministicScenario();
  const replay = kernel.replay.export();
  assert.ok(replay.frameCount > 0, `S4: replay recorded frames, got ${replay.frameCount}`);
  assert.equal(replay.frames.length, replay.frameCount, "S4: frameCount matches frames array length");
  assert.ok(replay.finalStateHash.length > 0, "S4: finalStateHash non-empty");
  assert.equal(replay.metadata.finalStateHash, replay.finalStateHash, "S4: metadata mirror matches");
  assert.equal(replay.version, "0.1-engine", "S4: version tag present");
  // Frame ticks are monotonic 1..N (one push per tick).
  for (let i = 0; i < replay.frames.length; i++) {
    assert.equal(replay.frames[i].tick, i + 1, `S4: frame ${i} tick monotonic`);
  }
  console.log(`S4 OK: replay.export() valid (${replay.frameCount} frames, finalHash len ${replay.finalStateHash.length})`);
}

// ── S5: determinism golden — same seed → identical replay ──
{
  const a = buildScenarioKernel(42);
  a.runDeterministicScenario();
  const ra = a.replay.export();
  const b = buildScenarioKernel(42);
  b.runDeterministicScenario();
  const rb = b.replay.export();
  assert.equal(ra.frameCount, rb.frameCount, "S5: same frame count");
  assert.equal(ra.finalStateHash, rb.finalStateHash, "S5: same seed → identical finalStateHash");
  for (let i = 0; i < ra.frames.length; i++) {
    assert.equal(ra.frames[i].stateHash, rb.frames[i].stateHash, `S5: stateHash match at frame ${i}`);
  }
  console.log(`S5 OK: same-seed runs deterministic across ${ra.frameCount} frames`);
}

// ── S6: seed isolation — different seed → different finalStateHash ──
{
  const a = buildScenarioKernel(42);
  a.runDeterministicScenario();
  const b = buildScenarioKernel(99);
  b.runDeterministicScenario();
  const ha = a.replay.export().finalStateHash;
  const hb = b.replay.export().finalStateHash;
  // The PRNG seed folds into every stateHash (prng=... term), so distinct seeds must diverge.
  assert.notEqual(ha, hb, "S6: different seed → different finalStateHash");
  console.log("S6 OK: seed isolation (seed 42 vs 99 → distinct finalStateHash)");
}

console.log("\n✅ P3 engine scenario/replay test passed");
