/**
 * engine-armor.test.ts — super-armor / boss / building armor test (Batch 3, 2026-06-07)
 *
 * Verifies: an armored defender still TAKES DAMAGE but its launch/knockdown is suppressed
 * (folds to a plain HIT); hit-stop freeze is capped by the armor profile; unarmored actors
 * are unaffected (zero regression).
 *
 * ⚠️ All armor flags + hit-stop caps are local_baseline (ArmorProfile.ts), mirrored from the old
 * kernel ActorFactory. This guards the MECHANISM (armor suppresses control + caps freeze), not the
 * truth of the values.
 */
import { assert } from "./test-utils.js";
import { Actor } from "../../src/engine/core/Actor.js";
import { ActorState } from "../../src/engine/core/ActorStateMachine.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import {
  ARMOR_PROFILES, NONE_ARMOR, SUPER_ARMOR, BOSS_SUPER_ARMOR, BUILDING_ARMOR, armorProfileFor,
} from "../../src/engine/core/ArmorProfile.js";
import { applyArmorToKind } from "../../src/engine/core/ReactionResolver.js";
import type { ArmorProfile } from "../../src/engine/core/ArmorProfile.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../../src/engine/kernel/systems/CombatResolutionSystem.js";
import { HitstunSystem } from "../../src/engine/kernel/systems/HitstunSystem.js";
import { AirborneSystem } from "../../src/engine/kernel/systems/AirborneSystem.js";
import { HitStopSystem } from "../../src/engine/kernel/systems/HitStopSystem.js";

// liftUp attack: startup → active(box) → recovery. liftVy launches an UNARMORED defender airborne.
const LIFT_ATTACK: AniDef = {
  framesCount: 3,
  loop: false,
  liftVy: 400,
  frames: [
    { index: 0, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
    { index: 1, delay: 1000 / 60, attackBoxes: [{ x1: 0, y1: 0, z1: -30, x2: 50, y2: 80, z2: 30 }], damageBoxes: [] },
    { index: 2, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
  ],
};

interface Froze { attackerFrames: number; defenderFrames: number }

function buildArmorScene(defenderArmor: ArmorProfile): { kernel: EngineKernel; atk: Actor; def: Actor; getFroze: () => Froze | null } {
  const kernel = new EngineKernel(42);
  const atk = new Actor("atk", "player", { hpMax: 100, mpMax: 0, moveSpeed: 0, physicalAttack: 10, physicalDefense: 0 });
  const def = new Actor("def", "monster", { hpMax: 100, mpMax: 0, moveSpeed: 0, physicalAttack: 0, physicalDefense: 0 });
  atk.x = 0; def.x = 30;
  def.armorProfile = defenderArmor;
  kernel.addActor(atk, true); kernel.addActor(def, false);
  kernel.registerSystem(new AnimationSystem());
  kernel.registerSystem(new CombatResolutionSystem());
  kernel.registerSystem(new HitstunSystem());
  kernel.registerSystem(new AirborneSystem());
  kernel.registerSystem(new HitStopSystem());
  let froze: Froze | null = null;
  kernel.bus.on("HitStopStarted", (e) => { if (!froze) froze = e.payload as Froze; });
  atk.animationPlayer.play(LIFT_ATTACK);
  return { kernel, atk, def, getFroze: () => froze };
}

/** Run the scene up to `ticks`, tracking peak height, AIRBORNE state, + the reaction kind on hit. */
function runScene(s: ReturnType<typeof buildArmorScene>, ticks = 60): { maxY: number; sawAirborne: boolean; reactionKind: string | null } {
  let maxY = 0; let sawAirborne = false; let reactionKind: string | null = null;
  for (let i = 0; i < ticks; i++) {
    s.kernel.tick();
    if (s.def.y > maxY) maxY = s.def.y;
    if (s.def.fsm.state === ActorState.AIRBORNE) sawAirborne = true;
    if (reactionKind === null && s.def.reaction) reactionKind = s.def.reaction.kind; // first reaction = the hit
  }
  return { maxY, sawAirborne, reactionKind };
}

// ── A1: profile data shape (local_baseline mirror) ──
{
  assert.equal(Object.keys(ARMOR_PROFILES).length, 4, "A1 four armor base types");
  assert.equal(NONE_ARMOR.canBeLaunched, true, "A1 none can be launched");
  assert.equal(NONE_ARMOR.hitStopCapFrames, null, "A1 none has no hit-stop cap");
  assert.equal(SUPER_ARMOR.canBeLaunched, false, "A1 super cannot be launched");
  assert.equal(SUPER_ARMOR.canBeKnockedBack, true, "A1 super CAN be knocked back");
  assert.equal(SUPER_ARMOR.hitStopCapFrames, 3, "A1 super cap 3");
  assert.equal(BOSS_SUPER_ARMOR.canBeKnockedBack, false, "A1 boss cannot be knocked back");
  assert.equal(BOSS_SUPER_ARMOR.hitStopCapFrames, 2, "A1 boss cap 2");
  assert.equal(BUILDING_ARMOR.hitStopCapFrames, 1, "A1 building cap 1");
  assert.equal(armorProfileFor("boss_super_armor"), BOSS_SUPER_ARMOR, "A1 lookup by type");
  assert.equal(armorProfileFor("nonsense"), NONE_ARMOR, "A1 unknown → none");
  console.log("A1 OK: 4 armor profiles, super knockback-only, caps 3/2/1, none uncapped");
}

// ── A2: applyArmorToKind pure logic ──
{
  assert.equal(applyArmorToKind(NONE_ARMOR, "airborne"), "airborne", "A2 none keeps airborne");
  assert.equal(applyArmorToKind(NONE_ARMOR, "down"), "down", "A2 none keeps down");
  assert.equal(applyArmorToKind(SUPER_ARMOR, "airborne"), "hit", "A2 super airborne→hit");
  assert.equal(applyArmorToKind(SUPER_ARMOR, "down"), "hit", "A2 super down→hit");
  assert.equal(applyArmorToKind(BOSS_SUPER_ARMOR, "airborne"), "hit", "A2 boss airborne→hit");
  assert.equal(applyArmorToKind(BUILDING_ARMOR, "down"), "hit", "A2 building down→hit");
  assert.equal(applyArmorToKind(BOSS_SUPER_ARMOR, "hit"), "hit", "A2 plain hit unchanged");
  console.log("A2 OK: armor downgrades airborne+down→hit, none is a no-op");
}

// ── A3: boss-armored defender is NOT launched but TAKES DAMAGE ──
{
  const s = buildArmorScene(BOSS_SUPER_ARMOR);
  const startHp = s.def.hp;
  const { maxY, sawAirborne, reactionKind } = runScene(s);
  assert.equal(maxY, 0, `A3 boss never leaves the ground, maxY=${maxY}`);
  assert.equal(sawAirborne, false, "A3 boss FSM never enters AIRBORNE");
  assert.ok(s.def.hp < startHp, `A3 boss still takes damage (hp ${startHp}→${s.def.hp})`);
  assert.equal(reactionKind, "hit", "A3 launch folded to plain HIT");
  console.log(`A3 OK: boss armor took ${startHp - s.def.hp} dmg, NOT launched (reaction=hit)`);
}

// ── A4: control — unarmored defender IS launched by the same attack ──
{
  const s = buildArmorScene(NONE_ARMOR);
  const startHp = s.def.hp;
  const { maxY, sawAirborne, reactionKind } = runScene(s);
  assert.ok(maxY > 0, `A4 unarmored is launched airborne, maxY=${maxY}`);
  assert.ok(sawAirborne, "A4 unarmored FSM enters AIRBORNE");
  assert.ok(s.def.hp < startHp, "A4 unarmored takes damage too");
  assert.equal(reactionKind, "airborne", "A4 unarmored reaction is airborne");
  console.log(`A4 OK: unarmored launched to y=${maxY.toFixed(1)} (control proves A3 is armor, not a dead attack)`);
}

// ── A5: hit-stop freeze capped by armor (shorter thunk) ──
{
  const boss = buildArmorScene(BOSS_SUPER_ARMOR);
  runScene(boss, 10);
  const bf = boss.getFroze();
  assert.ok(bf, "A5 boss hit produced a HitStopStarted");
  assert.ok((bf as Froze).defenderFrames <= 2, `A5 boss defender freeze capped ≤2, got ${(bf as Froze).defenderFrames}`);
  assert.ok((bf as Froze).attackerFrames <= 2, `A5 boss attacker freeze capped ≤2, got ${(bf as Froze).attackerFrames}`);

  const none = buildArmorScene(NONE_ARMOR);
  runScene(none, 10);
  const nf = none.getFroze();
  assert.ok(nf, "A5 unarmored hit produced a HitStopStarted");
  // hitStopFor(null) = DEFAULT frames 4 → defender 1.5× = 6, uncapped.
  assert.equal((nf as Froze).defenderFrames, 6, `A5 unarmored defender freeze uncapped (6), got ${(nf as Froze).defenderFrames}`);
  assert.ok((nf as Froze).defenderFrames > (bf as Froze).defenderFrames, "A5 armor freeze < unarmored freeze");
  console.log(`A5 OK: boss freeze capped (def ${(bf as Froze).defenderFrames}) < unarmored (def ${(nf as Froze).defenderFrames})`);
}

// ── A6: armored hit is deterministic (same seed → same trail) ──
{
  const trail = (): string => {
    const s = buildArmorScene(BOSS_SUPER_ARMOR);
    const out: number[] = [];
    for (let i = 0; i < 12; i++) { s.kernel.tick(); out.push(s.def.frozenFrames, Math.round(s.def.hp)); }
    return out.join(",");
  };
  assert.equal(trail(), trail(), "A6 deterministic armored-hit trail");
  console.log("A6 OK: boss-armored hit deterministic");
}

console.log("\n✅ armor (Batch 3) all tests passed");
