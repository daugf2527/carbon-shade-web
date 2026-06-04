/**
 * engine-airborne-loop.test.ts — P3.0 liftUp airborne end-to-end verification.
 *
 * Proves cross-system integration: a liftUp attack animation (anim.liftVy > 0) launches
 * the defender airborne, gravity integrates the trajectory, and the actor lands.
 *   AnimationSystem (liftUp attack frame)
 *     → CombatResolutionSystem (hit + flags.liftUp → defender.airborne = launchAirborne)
 *       → AirborneSystem (gravity integration → actor.y rises then falls to 0)
 *
 *   E1 liftUp hit launches the goblin upward (y > 0) + FSM AIRBORNE
 *   E2 gravity brings it back down (lands: y == 0, airborne cleared)
 *   E3 the launch trajectory is deterministic (same seed → same y sequence)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Actor, statsFromPlayerShard, statsFromMonsterShard } from "../../src/engine/core/Actor.js";
import { ActorState } from "../../src/engine/core/ActorStateMachine.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../../src/engine/kernel/systems/CombatResolutionSystem.js";
import { HitstunSystem } from "../../src/engine/kernel/systems/HitstunSystem.js";
import { AirborneSystem } from "../../src/engine/kernel/systems/AirborneSystem.js";

const ROOT = process.cwd();
const swShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const gobShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/monsters/goblin.json"), "utf-8"));

// Single liftUp attack: startup → active(attackBox) → recovery. liftVy launches on hit.
const LIFT_ATTACK: AniDef = {
  framesCount: 3,
  loop: false,
  liftVy: 400, // px/s upward launch
  frames: [
    { index: 0, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
    {
      index: 1,
      delay: 1000 / 60,
      attackBoxes: [{ x1: 0, y1: 0, z1: -30, x2: 50, y2: 80, z2: 30 }],
      damageBoxes: [],
    },
    { index: 2, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
  ],
};

function buildLiftScene(seed = 42): { kernel: EngineKernel; sw: Actor; gob: Actor } {
  const kernel = new EngineKernel(seed);
  const sw = new Actor("sw", "player", statsFromPlayerShard(swShard.chr));
  const gob = new Actor("gob", "monster", statsFromMonsterShard(gobShard.mob));
  sw.x = 0;
  gob.x = 30;
  kernel.addActor(sw, true);
  kernel.addActor(gob, false);
  kernel.registerSystem(new AnimationSystem());
  kernel.registerSystem(new CombatResolutionSystem());
  kernel.registerSystem(new HitstunSystem());
  kernel.registerSystem(new AirborneSystem());
  sw.animationPlayer.play(LIFT_ATTACK);
  return { kernel, sw, gob };
}

// ── E1: liftUp hit launches goblin airborne ──
{
  const { kernel, gob } = buildLiftScene(42);
  let maxY = 0;
  let sawAirborneState = false;
  for (let i = 0; i < 60; i++) {
    kernel.tick();
    if (gob.y > maxY) maxY = gob.y;
    if (gob.fsm.state === ActorState.AIRBORNE) sawAirborneState = true;
  }
  assert.ok(maxY > 0, `goblin should rise airborne, maxY=${maxY}`);
  assert.ok(sawAirborneState, "goblin FSM should enter AIRBORNE on liftUp hit");
  console.log(`E1 OK: liftUp attack launched goblin to peak y=${maxY.toFixed(1)} (FSM hit AIRBORNE)`);
}

// ── E2: goblin lands ──
{
  const { kernel, gob } = buildLiftScene(42);
  for (let i = 0; i < 120; i++) kernel.tick();
  assert.equal(gob.airborne, null, "airborne handle cleared after landing");
  assert.equal(gob.y, 0, `goblin back on ground, y=${gob.y}`);
  console.log("E2 OK: gravity returned goblin to ground (y=0, airborne cleared)");
}

// ── E3: launch trajectory deterministic ──
{
  const runY = (seed: number): number[] => {
    const { kernel, gob } = buildLiftScene(seed);
    const ys: number[] = [];
    for (let i = 0; i < 60; i++) {
      kernel.tick();
      ys.push(gob.y);
    }
    return ys;
  };
  const y1 = runY(42);
  const y2 = runY(42);
  assert.equal(y1.length, y2.length, "y sample count");
  for (let i = 0; i < y1.length; i++) {
    assert.equal(y1[i], y2[i], `y trajectory mismatch at frame ${i}`);
  }
  assert.ok(y1.some((y) => y > 0), "trajectory actually left the ground");
  console.log(`E3 OK: airborne trajectory deterministic across ${y1.length} frames`);
}

console.log("\n✅ P3.0 engine airborne-loop test passed");
