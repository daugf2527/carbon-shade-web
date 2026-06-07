/**
 * engine-equipment.test.ts — equipment stat-bonus framework (Stage 4C-C2, 2026-06-08)
 *
 * Verifies the C2 framework: a weapon's flat physAtk raises damage dealt; an armor's flat physDef
 * reduces damage taken; the default NO_EQUIPMENT is a no-op (zero regression — proven separately by
 * every existing damage test passing unchanged with the equipment field defaulted in).
 *
 * ⚠️ Equipment VALUES are local_baseline (no item parser); this guards the MECHANISM (bonuses fold
 * into the damage chain), not the truth of the numbers. See Equipment.ts.
 */
import { assert } from "./test-utils.js";
import { Actor } from "../../src/engine/core/Actor.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import { NO_EQUIPMENT, SAMPLE_LOADOUTS, sumEquipment, type EquipmentStats } from "../../src/engine/core/Equipment.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../../src/engine/kernel/systems/CombatResolutionSystem.js";
import { HitstunSystem } from "../../src/engine/kernel/systems/HitstunSystem.js";
import { HitStopSystem } from "../../src/engine/kernel/systems/HitStopSystem.js";

const ATTACK: AniDef = {
  framesCount: 3, loop: true, frames: [
    { index: 0, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
    { index: 1, delay: 1000 / 60, attackBoxes: [{ x1: 0, y1: 0, z1: -30, x2: 50, y2: 80, z2: 30 }], damageBoxes: [] },
    { index: 2, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
  ],
};

/** First HitConfirmed damage with the given attacker weapon + defender armor equipment. */
function firstHitDmg(weapon: EquipmentStats, armor: EquipmentStats): number {
  const k = new EngineKernel(42);
  const atk = new Actor("atk", "player", { hpMax: 100, mpMax: 0, moveSpeed: 0, physicalAttack: 50, physicalDefense: 0 });
  const def = new Actor("def", "monster", { hpMax: 100000, mpMax: 0, moveSpeed: 0, physicalAttack: 0, physicalDefense: 20 });
  atk.equipment = weapon; def.equipment = armor;
  atk.x = 0; def.x = 30;
  k.addActor(atk, true); k.addActor(def, false);
  k.registerSystem(new AnimationSystem());
  k.registerSystem(new CombatResolutionSystem());
  k.registerSystem(new HitstunSystem());
  k.registerSystem(new HitStopSystem());
  let dmg = -1;
  k.bus.on("HitConfirmed", (e) => { if (dmg < 0) dmg = (e.payload as { dmg: number }).dmg; });
  atk.animationPlayer.play(ATTACK);
  for (let i = 0; i < 10 && dmg < 0; i++) k.tick();
  return dmg;
}

// E1: data shape — NO_EQUIPMENT zero, sumEquipment combines pieces
{
  assert.equal(NO_EQUIPMENT.weaponPhysAtk, 0, "E1 NO_EQUIPMENT weapon 0");
  assert.equal(NO_EQUIPMENT.armorPhysDef, 0, "E1 NO_EQUIPMENT armor 0");
  const set = sumEquipment(SAMPLE_LOADOUTS.starterWeapon, SAMPLE_LOADOUTS.starterArmor);
  assert.equal(set.weaponPhysAtk, 40, "E1 sum weapon 40");
  assert.equal(set.armorPhysDef, 30, "E1 sum armor 30");
  console.log("E1 OK: NO_EQUIPMENT zero + sumEquipment combines weapon+armor");
}

// E2: weapon raises damage dealt
{
  const bare = firstHitDmg(NO_EQUIPMENT, NO_EQUIPMENT);
  const armed = firstHitDmg(SAMPLE_LOADOUTS.starterWeapon, NO_EQUIPMENT);
  assert.ok(bare > 0, `E2 baseline dmg positive: ${bare}`);
  assert.ok(armed > bare, `E2 weapon (+40 physAtk) raises damage: ${armed} > ${bare}`);
  console.log(`E2 OK: weapon raises damage ${bare}→${armed}`);
}

// E3: armor reduces damage taken
{
  const bare = firstHitDmg(NO_EQUIPMENT, NO_EQUIPMENT);
  const armored = firstHitDmg(NO_EQUIPMENT, SAMPLE_LOADOUTS.starterArmor);
  assert.ok(armored < bare, `E3 armor (+30 physDef) reduces damage taken: ${armored} < ${bare}`);
  console.log(`E3 OK: armor reduces damage ${bare}→${armored}`);
}

// E4: deterministic + full loadout composes (weapon up, armor down both apply)
{
  const a = firstHitDmg(SAMPLE_LOADOUTS.fullStarter, SAMPLE_LOADOUTS.starterArmor);
  const b = firstHitDmg(SAMPLE_LOADOUTS.fullStarter, SAMPLE_LOADOUTS.starterArmor);
  assert.equal(a, b, "E4 deterministic equipped damage");
  const bareVsArmor = firstHitDmg(NO_EQUIPMENT, SAMPLE_LOADOUTS.starterArmor);
  assert.ok(a > bareVsArmor, `E4 full-loadout weapon still raises dmg vs same armor: ${a} > ${bareVsArmor}`);
  console.log(`E4 OK: equipped damage deterministic (${a}) + weapon composes over armor`);
}

console.log("\n✅ equipment (C2 framework, values local_baseline) all tests passed");
