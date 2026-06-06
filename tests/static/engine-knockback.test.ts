/**
 * engine-knockback.test.ts — horizontal knockback physics + pushAside truth wiring.
 *
 * Fills ReactionResolver's documented "horizontal knockback velocityX NOT modelled" P4 GAP, via
 * the same dedicated-work-state pattern as airborne (KnockbackState, no velocity tri-axis). Proves
 * the slide physics + friction + that pushAside truth drives it AND that basic attacks (slot0
 * pushBack=0) produce zero knockback (zero regression).
 *
 *   K1 slide physics   — x advances by vx*dt, vx decays by friction, stops below threshold
 *   K2 direction        — attacker facing signs the push (right vs left)
 *   K3 no-push truth    — pushBack=0 → no knockback handle (basic attacks don't slide)
 *   K4 truth-driven      — larger pushAside → larger initial vx (attack3 40 > attack1 30)
 *   K5 determinism + hash — same seed → identical x trajectory + finalStateHash, x folded into hash
 */
import assert from "node:assert/strict";
import { Actor, type ActorStats } from "../../src/engine/core/Actor.js";
import {
  applyKnockback, tickKnockback, KNOCKBACK_FRICTION,
} from "../../src/engine/core/KnockbackPhysics.js";
import { applyHitReaction } from "../../src/engine/core/ReactionResolver.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { KnockbackSystem } from "../../src/engine/kernel/systems/KnockbackSystem.js";

const TICK_MS = 1000 / 60;
const DUMMY: ActorStats = { hpMax: 100, mpMax: 0, moveSpeed: 0, physicalAttack: 0, physicalDefense: 0 };

// ── K1: slide physics — advance, decay, stop ──
{
  const s = applyKnockback(120, 0); // 120 px/s rightward from x=0
  const x1 = s.x;
  const stopped1 = tickKnockback(s, TICK_MS);
  assert.ok(s.x > x1, "x advances in vx direction");
  assert.equal(stopped1, false, "still sliding after 1 tick");
  assert.ok(Math.abs(s.vx - 120 * KNOCKBACK_FRICTION) < 1e-6, "vx decayed by friction");
  // Run to stop.
  let ticks = 1;
  while (s.active && ticks < 200) { tickKnockback(s, TICK_MS); ticks++; }
  assert.equal(s.active, false, "slide stops (friction decays vx below threshold)");
  console.log(`K1 OK: slide advanced + decayed + stopped after ${ticks} ticks at x=${s.x.toFixed(1)}`);
}

// ── K2: direction signed by velocity ──
{
  const right = applyKnockback(100, 0); tickKnockback(right, TICK_MS);
  const left = applyKnockback(-100, 0); tickKnockback(left, TICK_MS);
  assert.ok(right.x > 0, "positive vx → +x");
  assert.ok(left.x < 0, "negative vx → -x");
  console.log("K2 OK: vx sign drives push direction");
}

// ── K3: no-push truth — a hit with pushBack=0 leaves no knockback (basic-attack case) ──
{
  const d = new Actor("d", "monster", DUMMY);
  d.x = 0; d.facing = 1;
  // hit_down with pushAside present but weaponPushBack 0 (slot0) → computeKnockbackVx = 0.
  applyHitReaction(d, { hitReaction: "hit_down", pushAsideValue: 30, weaponPushBack: 0, attackerFacing: 1 }, 5, 0);
  assert.equal(d.knockback, null, "pushBack=0 → no knockback (zero regression for basic attacks)");
  console.log("K3 OK: pushBack=0 → no slide (basic attacks don't knock back)");
}

// ── K4: truth-driven magnitude — pushAside scales initial vx ──
{
  const make = (pushAside: number): number => {
    const d = new Actor("d", "monster", DUMMY); d.x = 0; d.facing = 1;
    applyHitReaction(d, { hitReaction: "hit_down", pushAsideValue: pushAside, weaponPushBack: 0.2, attackerFacing: 1 }, 5, 0);
    return d.knockback?.vx ?? 0;
  };
  const vxAttack1 = make(30); // attack1 pushAside
  const vxAttack3 = make(40); // attack3 pushAside
  assert.ok(vxAttack1 > 0, "non-zero pushBack → knockback applied");
  assert.ok(vxAttack3 > vxAttack1, `larger pushAside → larger vx (40→${vxAttack3.toFixed(1)} > 30→${vxAttack1.toFixed(1)})`);
  console.log(`K4 OK: pushAside truth scales vx (30→${vxAttack1.toFixed(1)}, 40→${vxAttack3.toFixed(1)} px/s)`);
}

// ── K5: kernel determinism + x folded into stateHash ──
{
  const run = (seed: number): { xs: number[]; hash: string } => {
    const kernel = new EngineKernel(seed);
    kernel.registerSystem(new KnockbackSystem());
    const d = new Actor("d", "monster", DUMMY); d.x = 100; d.facing = 1;
    d.knockback = applyKnockback(150, 100);
    kernel.addActor(d, false);
    const xs: number[] = [];
    for (let i = 0; i < 40; i++) { kernel.tick(); xs.push(d.x); }
    return { xs, hash: kernel.replay.export().finalStateHash };
  };
  const a = run(3), b = run(3);
  assert.deepEqual(a.xs, b.xs, "same seed → identical x trajectory");
  assert.equal(a.hash, b.hash, "same seed → identical finalStateHash");
  assert.ok(a.xs[39] > 100, "knockback actually moved the actor right");
  assert.ok(a.hash.includes("x="), "x folded into stateHash");
  console.log(`K5 OK: knockback deterministic (x 100→${a.xs[39].toFixed(1)}), x in hash`);
}

console.log("\n✅ horizontal knockback test passed");
