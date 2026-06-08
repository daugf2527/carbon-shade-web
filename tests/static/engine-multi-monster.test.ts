/**
 * engine-multi-monster.test.ts — multi-monster combat with per-monster PVF truth (Stage 4B-B4, 2026-06-08)
 *
 * Verifies B4: 3 distinct monster types (goblinthrower / goblin / skeleton), each built from its own
 * re-extracted PVF .mob truth (abilityCategory / sight / attackDelay / moveSpeed / weight / hitRecovery),
 * have DISTINCT stats + AI, and all fight in one kernel (multi-target hit).
 *
 * Truth values re-extracted 2026-06-08 from data/Script.pvf (monster/<folder>/<name>.mob). See monsterTruth.ts.
 */
import { assert } from "./test-utils.js";
import { Actor } from "../../src/engine/core/Actor.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import { MONSTER_TRUTH, statsForMonster, aiConfigForMonster, type CharGrowth } from "../../src/engine/core/monsterTruth.js";
import { SWORDMAN_TRUTH } from "../../src/data/manifest/truth/swordman.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../../src/engine/kernel/systems/CombatResolutionSystem.js";
import { HitstunSystem } from "../../src/engine/kernel/systems/HitstunSystem.js";
import { HitStopSystem } from "../../src/engine/kernel/systems/HitStopSystem.js";

const G = SWORDMAN_TRUTH.chr.growth as unknown as {
  hpMax: { values: number[] }; physicalAttack: { values: number[] }; physicalDefense: { values: number[] };
};
const GROWTH: CharGrowth = { hpMax: G.hpMax.values, physicalAttack: G.physicalAttack.values, physicalDefense: G.physicalDefense.values };
const LV = 31; // PVF jungle.dgn basisLevel
const TICK_MS = 1000 / 60;

// M1: 3 monsters have DISTINCT PVF-truth stats (ability/move/hitRecovery flow per-monster)
{
  const thrower = statsForMonster("goblinthrower", LV, GROWTH);
  const goblin = statsForMonster("goblin", LV, GROWTH);
  const skeleton = statsForMonster("skeleton", LV, GROWTH);
  const spider = statsForMonster("spider", LV, GROWTH);
  assert.ok(skeleton.hpMax !== goblin.hpMax, `M1 skeleton hp ${skeleton.hpMax} ≠ goblin ${goblin.hpMax} (ability ×100 vs ×70)`);
  assert.ok(goblin.physicalAttack > thrower.physicalAttack, `M1 goblin atk(×90) > thrower(×75): ${goblin.physicalAttack} > ${thrower.physicalAttack}`);
  assert.equal(skeleton.moveSpeed, 700, "M1 skeleton moveSpeed 700 (PVF)");
  assert.equal(goblin.moveSpeed, 300, "M1 goblin moveSpeed 300 (PVF)");
  assert.equal(skeleton.hitRecovery, 800, "M1 skeleton hitRecovery 800 (PVF)");
  assert.equal(goblin.hitRecovery, 500, "M1 goblin hitRecovery 500 (PVF)");
  // spider (4th, hp×110): tankiest hp, mid move 400, long hit-recovery 800.
  assert.ok(spider.hpMax > skeleton.hpMax, `M1 spider hp(×110) > skeleton(×100): ${spider.hpMax} > ${skeleton.hpMax}`);
  assert.equal(spider.moveSpeed, 400, "M1 spider moveSpeed 400 (PVF)");
  assert.equal(spider.hitRecovery, 800, "M1 spider hitRecovery 800 (PVF)");
  console.log(`M1 OK: distinct stats — thrower hp${thrower.hpMax}/atk${thrower.physicalAttack}, goblin hp${goblin.hpMax}/atk${goblin.physicalAttack}, skeleton hp${skeleton.hpMax}/move${skeleton.moveSpeed}, spider hp${spider.hpMax}/move${spider.moveSpeed}`);
}

// M2: AI config distinct per monster (sight + attackDelay PVF truth)
{
  const goblin = aiConfigForMonster("goblin");
  const skeleton = aiConfigForMonster("skeleton");
  const thrower = aiConfigForMonster("goblinthrower");
  const spider = aiConfigForMonster("spider");
  assert.equal(skeleton.sightRange, 350, "M2 skeleton sight 350");
  assert.equal(goblin.sightRange, 300, "M2 goblin sight 300");
  assert.equal(goblin.attackDelayTicks, Math.round(1500 / TICK_MS), "M2 goblin attackDelay 1500ms → 90 ticks");
  assert.equal(skeleton.attackDelayTicks, Math.round(2000 / TICK_MS), "M2 skeleton attackDelay 2000ms → 120 ticks");
  assert.equal(thrower.attackDelayTicks, Math.round(3000 / TICK_MS), "M2 thrower attackDelay 3000ms → 180 ticks");
  assert.equal(spider.sightRange, 300, "M2 spider sight 300");
  assert.equal(spider.attackDelayTicks, Math.round(1500 / TICK_MS), "M2 spider attackDelay 1500ms → 90 ticks");
  console.log(`M2 OK: distinct AI — goblin sight300/delay${goblin.attackDelayTicks}, skeleton sight350/delay${skeleton.attackDelayTicks}, thrower delay${thrower.attackDelayTicks}, spider sight300/delay${spider.attackDelayTicks}`);
}

// M3: integration — goblin + skeleton both fight in one kernel (multi-target hit, distinct truth hp)
{
  const ATTACK: AniDef = { framesCount: 3, loop: true, frames: [
    { index: 0, delay: TICK_MS, attackBoxes: [], damageBoxes: [] },
    { index: 1, delay: TICK_MS, attackBoxes: [{ x1: 0, y1: 0, z1: -40, x2: 60, y2: 80, z2: 40 }], damageBoxes: [] },
    { index: 2, delay: TICK_MS, attackBoxes: [], damageBoxes: [] },
  ] };
  const kernel = new EngineKernel(42);
  const player = new Actor("player", "player", { hpMax: 2000, mpMax: 0, moveSpeed: 0, physicalAttack: 60, physicalDefense: 0 });
  const goblin = new Actor("goblin", "monster", statsForMonster("goblin", LV, GROWTH));
  const skeleton = new Actor("skeleton", "monster", statsForMonster("skeleton", LV, GROWTH));
  player.x = 0; goblin.x = 30; skeleton.x = 35; // both inside the attack box [0,60]
  kernel.addActor(player, true); kernel.addActor(goblin, false); kernel.addActor(skeleton, false);
  kernel.registerSystem(new AnimationSystem());
  kernel.registerSystem(new CombatResolutionSystem());
  kernel.registerSystem(new HitstunSystem());
  kernel.registerSystem(new HitStopSystem());
  player.animationPlayer.play(ATTACK);
  const gobHp0 = goblin.hp, skelHp0 = skeleton.hp;
  assert.ok(gobHp0 !== skelHp0, `M3 distinct truth hp at spawn: goblin ${gobHp0} ≠ skeleton ${skelHp0}`);
  let i = 0;
  for (; i < 600 && !(goblin.isDead && skeleton.isDead); i++) kernel.tick();
  assert.ok(goblin.isDead, `M3 goblin killed (hp ${gobHp0}→${goblin.hp})`);
  assert.ok(skeleton.isDead, `M3 skeleton killed (hp ${skelHp0}→${skeleton.hp})`);
  console.log(`M3 OK: multi-monster combat — goblin(hp${gobHp0}) + skeleton(hp${skelHp0}) both killed in ${i} ticks`);
}

// M4: determinism — same seed → identical multi-monster hash trail
{
  const run = (): string[] => {
    const ATTACK: AniDef = { framesCount: 3, loop: true, frames: [
      { index: 0, delay: TICK_MS, attackBoxes: [], damageBoxes: [] },
      { index: 1, delay: TICK_MS, attackBoxes: [{ x1: 0, y1: 0, z1: -40, x2: 60, y2: 80, z2: 40 }], damageBoxes: [] },
      { index: 2, delay: TICK_MS, attackBoxes: [], damageBoxes: [] },
    ] };
    const kernel = new EngineKernel(7);
    const player = new Actor("player", "player", { hpMax: 2000, mpMax: 0, moveSpeed: 0, physicalAttack: 60, physicalDefense: 0 });
    const goblin = new Actor("goblin", "monster", statsForMonster("goblin", LV, GROWTH));
    const skeleton = new Actor("skeleton", "monster", statsForMonster("skeleton", LV, GROWTH));
    player.x = 0; goblin.x = 30; skeleton.x = 35;
    kernel.addActor(player, true); kernel.addActor(goblin, false); kernel.addActor(skeleton, false);
    kernel.registerSystem(new AnimationSystem());
    kernel.registerSystem(new CombatResolutionSystem());
    kernel.registerSystem(new HitstunSystem());
    kernel.registerSystem(new HitStopSystem());
    player.animationPlayer.play(ATTACK);
    const hashes: string[] = [];
    for (let i = 0; i < 40; i++) { kernel.tick(); hashes.push(kernel.lastStateHash); }
    return hashes;
  };
  const h1 = run(), h2 = run();
  assert.equal(h1.length, h2.length, "M4 hash count");
  for (let i = 0; i < h1.length; i++) assert.equal(h1[i], h2[i], `M4 hash match at ${i}`);
  console.log(`M4 OK: 3-actor multi-monster combat deterministic (${h1.length} frames)`);
}

console.log(`\n✅ multi-monster (B4: ${Object.keys(MONSTER_TRUTH).length} PVF-truth types) all tests passed`);
