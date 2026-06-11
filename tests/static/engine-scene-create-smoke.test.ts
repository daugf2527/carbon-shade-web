/**
 * engine-scene-create-smoke.test.ts — guards the CombatScene.create() DATA PATH (P0-1 regression, 2026-06-08)
 *
 * WHY THIS EXISTS — the gap that let a 100%-reproducible crash ship:
 *   CombatScene.create() built the grunt via `{ ...monsterStatsAtLevel(...), hitRecovery }` — an INLINE
 *   stat object that (before the fix) omitted `mpMax`. Every OTHER test built actors from full-field
 *   stub literals (mpMax:0 always written) or from statsForMonster() (which adds mpMax:0), so NO test ever
 *   exercised the inline path. Result: `new Actor(grunt)` → `this.mp = stats.mpMax = undefined` →
 *   `EngineKernel.computeStateHash` `a.mp.toFixed(3)` threw on the FIRST tick. typecheck (strict:false),
 *   static:test, and analyze were all green; only opening the game in a browser surfaced it.
 *
 * This test reproduces the EXACT create() data path (monsterStatsAtLevel spread, NOT statsForMonster,
 * NOT a stub literal) + ticks a kernel that computes a stateHash, so a future regression that drops a
 * required ActorStats field crashes HERE (fast, in static:test) instead of only in a live browser.
 *
 * Deliberately mirrors CombatScene.create():202-211 (gruntStats) — if that construction changes, mirror it.
 */
import { assert } from "./test-utils.js";
import { Actor } from "../../src/engine/core/Actor.js";
import { monsterStatsAtLevel } from "../../src/engine/core/MonsterScaling.js";
import { statsForMonster, type CharGrowth } from "../../src/engine/core/monsterTruth.js";
import { statsFromPlayerShard } from "../../src/engine/core/Actor.js";
import { SWORDMAN_TRUTH } from "../../src/data/manifest/truth/swordman.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../../src/engine/kernel/systems/CombatResolutionSystem.js";
import { StatusSystem } from "../../src/engine/kernel/systems/StatusSystem.js";
import { ResourceSystem } from "../../src/engine/kernel/systems/ResourceSystem.js";
import type { DebugSnapshot } from "../../src/runtime/debug/DebugSnapshot.js";
import { FixedStepSimulation } from "../../src/runtime/loop/FixedStepSimulation.js";

const DUNGEON_BASIS_LEVEL = 31; // PVF jungle.dgn basisLevel (same as CombatScene)
const swGrowth = SWORDMAN_TRUTH.chr.growth as unknown as {
  hpMax: { values: number[] }; physicalAttack: { values: number[] }; physicalDefense: { values: number[] };
};
const GROWTH: CharGrowth = {
  hpMax: swGrowth.hpMax.values, physicalAttack: swGrowth.physicalAttack.values, physicalDefense: swGrowth.physicalDefense.values,
};

// S1: the grunt inline-stats path (the exact shape CombatScene.create() builds) yields a complete
// ActorStats — every field Actor's constructor reads (esp. mpMax → Actor.mp) must be a finite number.
{
  const gruntStats = {
    ...monsterStatsAtLevel(
      DUNGEON_BASIS_LEVEL,
      { "hp max": { op: "*" as const, value: 65 },
        "equipment_physical_attack": { op: "*" as const, value: 75 },
        "equipment_physical_defense": { op: "*" as const, value: 80 } },
      GROWTH,
      350,    // PVF mob.moveSpeed
      45000,  // PVF mob.weight
    ),
    hitRecovery: 500,
  };
  assert.ok(Number.isFinite(gruntStats.mpMax), `S1 gruntStats.mpMax must be a finite number (P0-1: was undefined), got ${gruntStats.mpMax}`);
  const grunt = new Actor("grunt", "monster", gruntStats);
  assert.ok(Number.isFinite(grunt.mp), `S1 grunt.mp must be finite after construction (Actor.mp = stats.mpMax), got ${grunt.mp}`);
  assert.ok(Number.isFinite(grunt.hp), `S1 grunt.hp must be finite, got ${grunt.hp}`);
  console.log(`S1 OK: inline gruntStats path complete — mp=${grunt.mp}, hp=${grunt.hp}`);
}

// S2: the FULL create() roster (player + grunt-inline + 3 statsForMonster monsters) ticks a kernel that
// computes a per-tick stateHash WITHOUT throwing. This is the runtime path that crashed: computeStateHash
// reads a.mp.toFixed(3) for every actor, so any actor with a non-finite mp throws on tick 1.
{
  const kernel = new EngineKernel(42);
  kernel.registerSystem(new AnimationSystem());
  kernel.registerSystem(new CombatResolutionSystem());
  kernel.registerSystem(new StatusSystem());
  kernel.registerSystem(new ResourceSystem());

  const player = new Actor("player", "player", statsFromPlayerShard(SWORDMAN_TRUTH.chr as unknown as Record<string, unknown>, 70));
  player.x = 390;
  kernel.addActor(player, true);

  // grunt — the inline path (P0-1 origin)
  const grunt = new Actor("grunt", "monster", {
    ...monsterStatsAtLevel(DUNGEON_BASIS_LEVEL,
      { "hp max": { op: "*" as const, value: 65 },
        "equipment_physical_attack": { op: "*" as const, value: 75 },
        "equipment_physical_defense": { op: "*" as const, value: 80 } },
      GROWTH, 350, 45000),
    hitRecovery: 500,
  });
  grunt.x = 440;
  kernel.addActor(grunt, false);

  // 3 B4 monsters — the statsForMonster path (mirrors CombatScene)
  for (const [id, x] of [["goblin", 520], ["skeleton", 600], ["spider", 680]] as const) {
    const mon = new Actor(id, "monster", statsForMonster(id, DUNGEON_BASIS_LEVEL, GROWTH));
    mon.x = x;
    kernel.addActor(mon, false);
  }

  // Tick the kernel: computeStateHash runs every tick over all 5 actors. Before the P0-1 fix this threw
  // on tick 1 (grunt.mp.toFixed of undefined). 120 ticks ≈ 2 seconds of real play.
  let threw: Error | null = null;
  try {
    for (let i = 0; i < 120; i++) kernel.tick();
  } catch (e) {
    threw = e as Error;
  }
  assert.ok(threw === null, `S2 kernel.tick must not throw over the full create() roster (P0-1 was: ${threw?.message})`);
  assert.equal(kernel.tickCount, 120, "S2 kernel advanced 120 ticks");
  assert.ok(kernel.lastStateHash.length > 0, "S2 stateHash computed (non-empty) every tick");
  for (const a of kernel.actors) {
    assert.ok(Number.isFinite(a.mp), `S2 ${a.id}.mp stayed finite through 120 ticks, got ${a.mp}`);
  }
  console.log(`S2 OK: full create() roster (5 actors) ticked 120× without throw — stateHash=${kernel.lastStateHash.slice(0, 40)}…`);
}

// S3: runtime shell lock — the scene path must use the runtime-owned fixed-step loop and expose
// a runtime DebugSnapshot shape from the engine kernel.
{
  const kernel = new EngineKernel(42);
  const simulation = new FixedStepSimulation(kernel);
  const snapshot: DebugSnapshot = kernel.debugSnapshot();

  assert.equal(kernel.constructor.name, "EngineKernel", "S3 kernel should stay on the engine mainline");
  assert.equal(simulation.constructor.name, "FixedStepSimulation", "S3 scene loop should use the runtime-owned fixed-step shell");
  assert.equal(typeof snapshot.tick, "number", "S3 debug snapshot should expose a numeric tick");
  assert.equal(typeof snapshot.lastHit.tick, "number", "S3 debug snapshot should expose runtime lastHit shape");
  assert.equal(typeof snapshot.performance.actorCount, "number", "S3 debug snapshot should expose runtime performance counters");
  console.log(`S3 OK: runtime loop + debug snapshot contract locked (tick=${snapshot.tick})`);
}
