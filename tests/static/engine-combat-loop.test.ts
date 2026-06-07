/**
 * engine-combat-loop.test.ts — P3.0 real attack-loop verification.
 *
 * Proves EngineKernel drives the ACTUAL combat chain (no mock systems):
 *   AnimationSystem (advance frames → attackBoxes)
 *     → CombatResolutionSystem (detectHit → calcPhysicalDamage → applyHitReaction)
 *       → HitstunSystem (tickReaction → FSM back to IDLE / force DEAD)
 *
 *   D1 swordman's looping attack animation kills the goblin
 *   D2 the whole loop is deterministic (same seed → same stateHash sequence)
 *   D3 the goblin's FSM actually reaches DEAD (not just hp<=0)
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
import { HitStopSystem } from "../../src/engine/kernel/systems/HitStopSystem.js";

const ROOT = process.cwd();
const swShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const gobShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/monsters/goblin.json"), "utf-8"));

// 3-frame looping attack: startup(no box) → active(attackBox) → recovery(no box).
// The active box reaches the goblin at x=30 (world x [0,50] vs goblin body [10,50]).
const ATTACK_ANIM: AniDef = {
  framesCount: 3,
  loop: true,
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

function buildScene(seed = 42): { kernel: EngineKernel; sw: Actor; gob: Actor } {
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
  kernel.registerSystem(new HitStopSystem());
  sw.animationPlayer.play(ATTACK_ANIM);
  return { kernel, sw, gob };
}

// ── D1: attack loop kills the goblin ──
{
  const { kernel, gob } = buildScene(42);
  const startHp = gob.hp;
  let i = 0;
  for (; i < 1200 && !gob.isDead; i++) kernel.tick();
  assert.ok(startHp > 0, "goblin starts alive");
  assert.ok(gob.isDead, `goblin should die from the attack loop within 1200 ticks, hp=${gob.hp}`);
  console.log(`D1 OK: real Animation→HitDetect→Reaction loop killed goblin in ${i} ticks (hp ${startHp}→${gob.hp})`);
}

// ── D2: determinism — same seed → identical stateHash sequence ──
{
  const run = (seed: number): string[] => {
    const { kernel, gob } = buildScene(seed);
    const hashes: string[] = [];
    for (let i = 0; i < 600 && !gob.isDead; i++) {
      kernel.tick();
      hashes.push(kernel.lastStateHash);
    }
    return hashes;
  };
  const h1 = run(42);
  const h2 = run(42);
  assert.ok(h1.length > 0, "produced hashes");
  assert.equal(h1.length, h2.length, `hash count ${h1.length} vs ${h2.length}`);
  for (let i = 0; i < h1.length; i++) {
    assert.equal(h1[i], h2[i], `hash mismatch at frame ${i}`);
  }
  console.log(`D2 OK: ${h1.length}-frame real attack loop deterministic across two runs`);
}

// ── D3: goblin FSM actually reaches DEAD ──
{
  const { kernel, gob } = buildScene(7);
  for (let i = 0; i < 1500 && gob.fsm.state !== ActorState.DEAD; i++) kernel.tick();
  assert.equal(gob.fsm.state, ActorState.DEAD, `goblin FSM should reach DEAD, got ${gob.fsm.state}`);
  console.log("D3 OK: goblin FSM reaches DEAD via hitstun expiry");
}

console.log("\n✅ P3.0 engine combat-loop test passed");
