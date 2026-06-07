/**
 * MonsterScaling.ts — monster stat scaling by dungeon level (Stage 4C).
 *
 * DNF monster stats = baseCurve(dungeonLevel) × abilityCategory modifier.
 *
 * PVF provides:
 *   - abilityCategory: per-monster-type percentage/absolute modifiers (PVF tier3)
 *   - mob.level: monster level range [min, max]
 *   - dgn.basisLevel: dungeon reference level
 *
 * PVF does NOT provide:
 *   - The absolute base curve per level (hardcoded in DNF.exe C++)
 *
 * The base curve below is local_baseline, calibrated so that a LV70 goblin
 * (abilityCategory hp×65%) dies in ~4 basic attacks from a LV70 swordman
 * (physicalAttack=89). requiresManualVerification.
 */

export interface AbilityCategory {
  readonly "hp max"?: { op: "*" | "+"; value: number };
  readonly "equipment_physical_attack"?: { op: "*" | "+"; value: number };
  readonly "equipment_physical_defense"?: { op: "*" | "+"; value: number };
}

export interface MonsterStats {
  readonly hpMax: number;
  readonly physicalAttack: number;
  readonly physicalDefense: number;
  readonly moveSpeed: number;
}

function applyMod(base: number, mod?: { op: "*" | "+"; value: number }): number {
  if (!mod) return base;
  return mod.op === "*" ? base * mod.value / 100 : base + mod.value;
}

// local_baseline base curves — calibrated for ~4-hit-kill on goblin (65% HP)
// at LV70 with swordman physicalAttack=89
function baseHP(level: number): number { return 50 + level * 6.5; }
function baseATK(level: number): number { return 5 + level * 0.8; }
function baseDEF(level: number): number { return 2 + level * 0.15; }

export function monsterStatsAtLevel(
  dungeonLevel: number,
  abilityCategory: AbilityCategory,
  moveSpeed = 350,
): MonsterStats {
  const lv = Math.max(1, Math.min(dungeonLevel, 70));
  return {
    hpMax: Math.round(applyMod(baseHP(lv), abilityCategory["hp max"])),
    physicalAttack: Math.round(applyMod(baseATK(lv), abilityCategory["equipment_physical_attack"]) * 10) / 10,
    physicalDefense: Math.round(applyMod(baseDEF(lv), abilityCategory["equipment_physical_defense"]) * 10) / 10,
    moveSpeed,
  };
}
