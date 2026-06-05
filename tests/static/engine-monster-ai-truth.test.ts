/**
 * engine-monster-ai-truth.test.ts — 03-Monster/AI PVF-truth wiring verification.
 *
 * EnemyAISystem used a hardcoded DEFAULT_CFG (sight 200 / attackDelay 60 ticks). This proves
 * the config now comes from the goblin .mob shard truth (sight 300px, attackDelay 3000ms→180
 * ticks) and that those values actually drive AI behavior — distinguishably from the defaults.
 *
 *   A1 config parse   — aiConfigFromMobShard reads sight/attackDelay; ms→ticks; partial-safe
 *   A2 goblin truth   — aiConfigFromGoblinTruth = {sight 300, attackDelay 180 ticks}
 *   A3 sight drives chase — a monster at 250px chases under goblin truth (sight 300) but idles
 *                           under the old default (sight 200): the truth value is observable
 *   A4 attackDelay drives cadence — goblin truth (180 ticks) attacks slower than default (60)
 *   A5 determinism    — same seed + config → identical attack-tick sequence
 */
import assert from "node:assert/strict";
import { Actor, statsFromGoblinTruth, type ActorStats } from "../../src/engine/core/Actor.js";
import {
  aiConfigFromMobShard, aiConfigFromGoblinTruth, DEFAULT_MONSTER_AI_CONFIG,
} from "../../src/engine/core/MonsterAIConfig.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";
import { EnemyAISystem } from "../../src/engine/kernel/systems/EnemyAISystem.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";

const PLAYER_STATS: ActorStats = {
  hpMax: 180, mpMax: 0, moveSpeed: 0, physicalAttack: 45, physicalDefense: 20,
};

// ── A1: config parse from a mob shard ──
{
  const cfg = aiConfigFromMobShard({ sight: { value: 300 }, attackDelay: { value: 3000 } });
  assert.equal(cfg.sightRange, 300, "sight from shard");
  assert.equal(cfg.attackDelayTicks, 180, "3000ms → 180 ticks @60Hz");
  // Partial shard falls back gracefully.
  const partial = aiConfigFromMobShard({});
  assert.equal(partial.sightRange, DEFAULT_MONSTER_AI_CONFIG.sightRange, "missing sight → default");
  assert.equal(partial.attackDelayTicks, DEFAULT_MONSTER_AI_CONFIG.attackDelayTicks, "missing delay → default");
  console.log("A1 OK: shard parse (sight 300 / 3000ms→180 ticks) + partial-safe fallback");
}

// ── A2: goblin truth config ──
{
  const cfg = aiConfigFromGoblinTruth();
  assert.equal(cfg.sightRange, 300, "goblin sight 300px (PVF tier1)");
  assert.equal(cfg.attackDelayTicks, 180, "goblin attackDelay 3000ms → 180 ticks");
  console.log("A2 OK: goblin truth = sight 300 / attackDelay 180 ticks");
}

// A short NON-looping attack anim: completes in 4 ticks so the FSM returns to IDLE between
// attacks, letting attackDelayTicks (not the animation) gate the cadence in A4. (A3 never plays
// it — the chasing monster is out of attack range — so its shape only matters for A4/A5.)
const ATTACK_ANIM: AniDef = {
  framesCount: 4, loop: false,
  frames: [0, 1, 2, 3].map((i) => ({ index: i, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] })),
};

function buildAiKernel(seed: number, gruntConfig: ReturnType<typeof aiConfigFromGoblinTruth> | undefined, gruntX: number) {
  const kernel = new EngineKernel(seed);
  const player = new Actor("player", "player", PLAYER_STATS);
  player.x = 0;
  const grunt = new Actor("grunt", "monster", statsFromGoblinTruth());
  grunt.x = gruntX;
  if (gruntConfig) grunt.aiConfig = gruntConfig;
  kernel.addActor(player, true);
  kernel.addActor(grunt, false);
  const actions = new ActionSystem();
  actions.define("attack", ATTACK_ANIM);
  kernel.registerSystem(actions);
  kernel.registerSystem(new AnimationSystem());  // advances frames → completes attack → FSM back to IDLE
  kernel.registerSystem(new EnemyAISystem(actions));
  return { kernel, grunt };
}

// ── A3: sight range drives chase (goblin truth 300 vs default 200) ──
{
  // Grunt 250px from player: within goblin sight (300) → chase; outside default sight (200) → idle.
  const truth = buildAiKernel(1, aiConfigFromGoblinTruth(), 250);
  truth.kernel.tick();
  assert.notEqual(truth.grunt.intent.dir, 0, "goblin truth (sight 300): chases player at 250px");

  const dflt = buildAiKernel(1, undefined, 250); // no aiConfig → DEFAULT (sight 200)
  dflt.kernel.tick();
  assert.equal(dflt.grunt.intent.dir, 0, "default (sight 200): idle at 250px (out of sight)");
  console.log("A3 OK: sight 300 truth chases at 250px where default 200 idles");
}

// ── A4: attackDelay drives attack cadence (truth 180 ticks vs default 60) ──
{
  const countAttacks = (cfg: ReturnType<typeof aiConfigFromGoblinTruth> | undefined): number => {
    const { kernel } = buildAiKernel(2, cfg, 50); // 50px ≤ attackRange 80 → attack range
    let attacks = 0;
    for (let i = 0; i < 360; i++) {
      kernel.tick();
      attacks = kernel.bus.archive.filter((e) => e.type === "ActionStarted").length;
    }
    return attacks;
  };
  const truthAttacks = countAttacks(aiConfigFromGoblinTruth()); // delay 180 → ~2 in 360 ticks
  const defaultAttacks = countAttacks(undefined);               // delay 60  → ~6 in 360 ticks
  assert.ok(truthAttacks < defaultAttacks, `truth delay slower: ${truthAttacks} < ${defaultAttacks}`);
  assert.ok(truthAttacks >= 1, "truth still attacks at least once in 360 ticks");
  console.log(`A4 OK: attackDelay 180 → ${truthAttacks} attacks vs default 60 → ${defaultAttacks} (360 ticks)`);
}

// ── A5: determinism — same seed + config → identical attack-tick sequence ──
{
  const run = (): number[] => {
    const { kernel } = buildAiKernel(5, aiConfigFromGoblinTruth(), 50);
    const ticks: number[] = [];
    for (let i = 0; i < 400; i++) {
      kernel.tick();
      const a = kernel.bus.archive.filter((e) => e.type === "ActionStarted");
      if (a.length > ticks.length) ticks.push(kernel.tickCount);
    }
    return ticks;
  };
  assert.deepEqual(run(), run(), "same seed + config → identical attack-tick sequence");
  console.log(`A5 OK: AI attack cadence deterministic (attacks at ticks ${run().join(",")})`);
}

console.log("\n✅ 03-Monster/AI truth-wiring test passed");
