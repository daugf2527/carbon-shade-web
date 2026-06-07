/**
 * engine-hitstop.test.ts — hit-stop freeze test (Batch 2, 2026-06-07)
 *
 * Verifies: on hit, attacker + defender freeze (frozenFrames>0); frozen actors skip
 * animation/hitstun/movement; HitStopSystem decrements; determinism holds.
 *
 * ⚠️ frame counts are local_baseline (HitStop.ts HIT_STOP_PROFILES). This guards the
 * MECHANISM (freeze pauses time-advance), not the truth of the frame values.
 */
import { assert } from "./test-utils.js";
import { Actor } from "../../src/engine/core/Actor.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import { applyHitStop, hitStopFor, HIT_STOP_PROFILES } from "../../src/engine/core/HitStop.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { HitStopSystem } from "../../src/engine/kernel/systems/HitStopSystem.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../../src/engine/kernel/systems/CombatResolutionSystem.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";

// HS1: applyHitStop pure logic — frames+1 offset, max-merge
{
  assert.equal(applyHitStop(0, 4), 5, "HS1 frames+1 offset");
  assert.equal(applyHitStop(3, 4), 5, "HS1 max merge (5>3)");
  assert.equal(applyHitStop(9, 4), 9, "HS1 keep larger existing freeze");
  assert.equal(applyHitStop(0, 0), 0, "HS1 zero frames → no freeze");
  console.log("HS1 OK: applyHitStop frames+1 offset + max-merge");
}

// HS2: profile lookup
{
  assert.equal(hitStopFor("attack1").frames, 4, "HS2 attack1=4");
  assert.equal(hitStopFor("attack3").frames, 7, "HS2 attack3=7");
  assert.equal(hitStopFor("unknown").frames, 4, "HS2 fallback default=4");
  assert.equal(hitStopFor(null).frames, 4, "HS2 null → default");
  console.log(`HS2 OK: profiles attack1=4 attack3=7 (${Object.keys(HIT_STOP_PROFILES).length} actions)`);
}

// HS3: HitStopSystem decrements frozenFrames each tick, emits HitStopEnded at 0
{
  const k = new EngineKernel(42);
  k.registerSystem(new HitStopSystem());
  const a = new Actor("a", "monster", { hpMax: 100, mpMax: 0, moveSpeed: 0, physicalAttack: 0, physicalDefense: 0 });
  k.addActor(a, true);
  a.frozenFrames = 3;
  let ended = false;
  k.bus.on("HitStopEnded", () => { ended = true; });
  k.tick(); assert.equal(a.frozenFrames, 2, "HS3 tick1 → 2");
  k.tick(); assert.equal(a.frozenFrames, 1, "HS3 tick2 → 1");
  k.tick(); assert.equal(a.frozenFrames, 0, "HS3 tick3 → 0");
  assert.ok(ended, "HS3 HitStopEnded emitted at 0");
  console.log("HS3 OK: HitStopSystem decrements 3→2→1→0 + HitStopEnded");
}

// HS4: frozen actor skips animation advance
{
  const k = new EngineKernel(42);
  const actions = new ActionSystem();
  const anim: AniDef = { framesCount: 10, loop: false, frames: Array.from({ length: 10 }, (_, i) => ({ index: i, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] })) };
  actions.define("swing", anim);
  k.registerSystem(actions);
  k.registerSystem(new AnimationSystem());
  k.registerSystem(new HitStopSystem());
  const a = new Actor("a", "player", { hpMax: 100, mpMax: 0, moveSpeed: 0, physicalAttack: 0, physicalDefense: 0 });
  k.addActor(a, true);
  k.requestAction("a", "swing");
  k.tick(); // action starts, anim frame 0
  const frameBeforeFreeze = a.animationPlayer.currentFrame?.index ?? -1;
  a.frozenFrames = 5;
  k.tick(); // frozen → animation should NOT advance
  const frameAfterFreeze = a.animationPlayer.currentFrame?.index ?? -1;
  assert.equal(frameBeforeFreeze, frameAfterFreeze, `HS4 frozen anim frame stays ${frameBeforeFreeze} (got ${frameAfterFreeze})`);
  console.log(`HS4 OK: frozen actor animation frozen at index ${frameAfterFreeze}`);
}

// HS5: real combat hit triggers freeze on BOTH attacker and defender (victim longer)
{
  const k = new EngineKernel(42);
  // 3-frame loop: startup → active(box) → recovery — box on frame 1 reaches def at x=30 (combat-loop layout)
  const atkAnim: AniDef = { framesCount: 3, loop: true, frames: [
    { index: 0, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
    { index: 1, delay: 1000 / 60, attackBoxes: [{ x1: 0, y1: 0, z1: -30, x2: 50, y2: 80, z2: 30 }], damageBoxes: [] },
    { index: 2, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
  ] };
  k.registerSystem(new AnimationSystem());
  k.registerSystem(new CombatResolutionSystem());
  k.registerSystem(new HitStopSystem());
  const atk = new Actor("atk", "player", { hpMax: 100, mpMax: 0, moveSpeed: 0, physicalAttack: 10, physicalDefense: 0 });
  const def = new Actor("def", "monster", { hpMax: 100, mpMax: 0, moveSpeed: 0, physicalAttack: 0, physicalDefense: 0 });
  k.addActor(atk, true); k.addActor(def, false);
  atk.x = 0; def.x = 30;
  atk.animationPlayer.play(atkAnim);
  // Capture the freeze the moment it starts (HitStopStarted event, immune to decrement timing)
  let froze: { attackerFrames: number; defenderFrames: number } | null = null;
  k.bus.on("HitStopStarted", (e) => { froze = e.payload as { attackerFrames: number; defenderFrames: number }; });
  for (let i = 0; i < 5 && !froze; i++) k.tick();
  assert.ok(froze, "HS5 hit-stop started on a real hit");
  const f = froze as unknown as { attackerFrames: number; defenderFrames: number };
  assert.ok(f.attackerFrames > 0, `HS5 attacker frozen: ${f.attackerFrames}`);
  assert.ok(f.defenderFrames > f.attackerFrames, `HS5 victim longer: ${f.defenderFrames} > ${f.attackerFrames}`);
  console.log(`HS5 OK: hit froze attacker=${f.attackerFrames} defender=${f.defenderFrames} (victim hangs longer)`);
}

// HS6: determinism — same seed + same hit → same frozen trail
{
  function run(): string {
    const k = new EngineKernel(7);
    const atkAnim: AniDef = { framesCount: 3, loop: true, frames: [
      { index: 0, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
      { index: 1, delay: 1000 / 60, attackBoxes: [{ x1: 0, y1: 0, z1: -30, x2: 50, y2: 80, z2: 30 }], damageBoxes: [] },
      { index: 2, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
    ] };
    k.registerSystem(new AnimationSystem());
    k.registerSystem(new CombatResolutionSystem());
    k.registerSystem(new HitStopSystem());
    const atk = new Actor("atk", "player", { hpMax: 100, mpMax: 0, moveSpeed: 0, physicalAttack: 10, physicalDefense: 0 });
    const def = new Actor("def", "monster", { hpMax: 100, mpMax: 0, moveSpeed: 0, physicalAttack: 0, physicalDefense: 0 });
    k.addActor(atk, true); k.addActor(def, false);
    atk.x = 0; def.x = 30;
    atk.animationPlayer.play(atkAnim);
    const trail: number[] = [];
    for (let i = 0; i < 12; i++) { k.tick(); trail.push(def.frozenFrames); }
    return trail.join(",");
  }
  assert.equal(run(), run(), "HS6 deterministic frozen trail");
  console.log(`HS6 OK: frozen trail deterministic (${run()})`);
}

console.log("\n✅ hit-stop (Batch 2) all tests passed");
