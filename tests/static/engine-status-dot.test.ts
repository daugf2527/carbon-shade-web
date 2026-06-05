/**
 * engine-status-dot.test.ts — 09-Status bleed DOT verification.
 *
 * Proves the tick-based status system is deterministic and kernel-integrated:
 *   T1 DOT timing — bleed deals dotDamagePerStack every tickIntervalTicks, expires at duration
 *   T2 stacking   — stacks accumulate up to maxStacks; DOT scales with stacks
 *   T3 integration — StatusSystem in the kernel deals DOT, death-by-bleed forces FSM DEAD +
 *                    clears statuses (death_clear) + emits ActorDied + flips bleedObserved
 *   T4 determinism — same seed + same bleed sequence → identical hp trail + finalStateHash
 */
import assert from "node:assert/strict";
import { Actor, type ActorStats } from "../../src/engine/core/Actor.js";
import { ActorState } from "../../src/engine/core/ActorStateMachine.js";
import { applyBleed, tickStatus, BLEED_PROFILE } from "../../src/engine/core/StatusEffects.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { StatusSystem } from "../../src/engine/kernel/systems/StatusSystem.js";

const DUMMY_STATS: ActorStats = { hpMax: 200, mpMax: 0, moveSpeed: 0, physicalAttack: 0, physicalDefense: 0 };

// ── T1: DOT timing — fires every interval, expires at duration ──
{
  const a = new Actor("a", "monster", DUMMY_STATS);
  applyBleed(a, 0); // appliedTick=0, lastDotTick=0
  const hits: number[] = [];
  for (let t = 1; t <= BLEED_PROFILE.durationTicks; t++) {
    const dot = tickStatus(a, t);
    if (dot > 0) hits.push(t);
  }
  // DOT fires at t=30,60,90,120,150 (interval=30), expires at t=180 (no DOT that tick).
  assert.deepEqual(hits, [30, 60, 90, 120, 150], `DOT tick boundaries, got ${hits}`);
  assert.equal(a.statusEffects.length, 0, "bleed expired after duration");
  assert.equal(a.hp, 200 - 5 * BLEED_PROFILE.dotDamagePerStack, "5 DOTs × 6 = 30 total dmg");
  console.log(`T1 OK: DOT at ${hits.join(",")}, expired, hp ${a.hp}`);
}

// ── T2: stacking caps at maxStacks; DOT scales with stacks ──
{
  const a = new Actor("a", "monster", DUMMY_STATS);
  for (let i = 0; i < BLEED_PROFILE.maxStacks + 3; i++) applyBleed(a, 0); // over-apply
  assert.equal(a.statusEffects[0].stacks, BLEED_PROFILE.maxStacks, "stacks capped at maxStacks");
  const dot = tickStatus(a, 30);
  assert.equal(dot, BLEED_PROFILE.maxStacks * BLEED_PROFILE.dotDamagePerStack, "DOT = stacks × perStack");
  console.log(`T2 OK: capped at ${BLEED_PROFILE.maxStacks} stacks → ${dot} dmg/interval`);
}

// ── T3: kernel integration — death-by-bleed clears status + emits ActorDied + flips bleedObserved ──
{
  const kernel = new EngineKernel(1);
  kernel.registerSystem(new StatusSystem());
  const lowHp = new Actor("dummy", "monster", { ...DUMMY_STATS, hpMax: 20 });
  kernel.addActor(lowHp, false);
  kernel.requestBleed("dummy"); // 1 stack → 6/interval → dies at 4th interval (24 > 20)

  let i = 0;
  for (; i < 200 && !lowHp.isDead; i++) kernel.tick();
  assert.ok(lowHp.isDead, `bleed should kill the 20hp dummy, hp=${lowHp.hp}`);
  assert.equal(lowHp.fsm.state, ActorState.DEAD, "FSM forced to DEAD by lethal bleed");
  assert.equal(lowHp.statusEffects.length, 0, "death_clear: statuses cleared on death");
  assert.equal(kernel.scenario.bleedObserved, true, "bleedObserved flipped by DOT");
  const died = kernel.bus.archive.filter((e) => e.type === "ActorDied");
  assert.ok(died.length >= 1, "ActorDied emitted on death-by-bleed");
  console.log(`T3 OK: bleed killed dummy in ${i} ticks (FSM DEAD, cleared, ActorDied emitted)`);
}

// ── T4: determinism — same seed + sequence → identical hp trail + finalStateHash ──
{
  const run = (seed: number): { trail: number[]; hash: string } => {
    const kernel = new EngineKernel(seed);
    kernel.registerSystem(new StatusSystem());
    const a = new Actor("a", "monster", DUMMY_STATS);
    kernel.addActor(a, false);
    kernel.requestBleed("a");
    const trail: number[] = [];
    for (let i = 0; i < 120; i++) {
      kernel.tick();
      trail.push(a.hp);
    }
    return { trail, hash: kernel.replay.export().finalStateHash };
  };
  const r1 = run(7);
  const r2 = run(7);
  assert.deepEqual(r1.trail, r2.trail, "same seed → identical hp trail");
  assert.equal(r1.hash, r2.hash, "same seed → identical finalStateHash");
  assert.ok(r1.trail[119] < 200, "bleed actually reduced hp over the run");
  console.log(`T4 OK: bleed DOT deterministic (final hp ${r1.trail[119]}, hash len ${r1.hash.length})`);
}

console.log("\n✅ 09-Status bleed DOT test passed");
