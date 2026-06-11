/**
 * MonsterScaling.ts — monster stat scaling by dungeon level (Stage 4C, truth-path 2026-06-07).
 *
 * DNF monster stats = CHARACTER_growth(baseLevel) × abilityCategory modifier.
 *
 * Truth basis (22-system field-matrix.md:245 — "abilityCategory['hp max'] is a percentage
 * RELATIVE TO CHARACTER HP"). So the per-level base is the CHARACTER growth curve (PVF
 * chr.growth, fully extracted), NOT an invented curve. abilityCategory % is PVF tier3.
 *
 * baseLevel = the dungeon's basisLevel (PVF dgn.basisLevel, e.g. jungle=31) — DNF scales
 * dungeon monsters to the dungeon's reference level, which is why a LV2-6 goblin in a LV31
 * dungeon fights at LV31 strength.
 *
 * ⚠️ requiresManualVerification (the one remaining approximation): we use the SWORDMAN growth
 * curve as the generic "character base". DNF actually has a dedicated standard-character ability
 * template; using swordman growth is a shape-correct PVF approximation until that template is
 * extracted. The PER-LEVEL mapping caveat from LevelScaling also applies.
 */
import { statAtLevel } from "./LevelScaling.js";

export interface AbilityCategory {
  readonly "hp max"?: { op: "*" | "+"; value: number };
  readonly "equipment_physical_attack"?: { op: "*" | "+"; value: number };
  readonly "equipment_physical_defense"?: { op: "*" | "+"; value: number };
}

/** Character base growth curves (PVF chr.growth arrays) used as the monster scaling base. */
export interface CharacterGrowthBase {
  readonly hpMax: readonly number[];
  readonly physicalAttack: readonly number[];
  readonly physicalDefense: readonly number[];
}

export interface MonsterStats {
  readonly hpMax: number;
  readonly mpMax: number;
  readonly physicalAttack: number;
  readonly physicalDefense: number;
  readonly moveSpeed: number;
  readonly weight: number;
}

function applyMod(base: number, mod?: { op: "*" | "+"; value: number }): number {
  if (!mod) return base;
  return mod.op === "*" ? base * mod.value / 100 : base + mod.value;
}

export function monsterStatsAtLevel(
  baseLevel: number,
  abilityCategory: AbilityCategory,
  charGrowth: CharacterGrowthBase,
  moveSpeed = 350,
  weight = 45000, // PVF mob.weight (goblin default); audio-only classification, NOT launch physics
): MonsterStats {
  const lv = Math.max(1, Math.min(baseLevel, 70));
  const baseHP = statAtLevel(charGrowth.hpMax, lv);
  const baseATK = statAtLevel(charGrowth.physicalAttack, lv);
  const baseDEF = statAtLevel(charGrowth.physicalDefense, lv);
  return {
    hpMax: Math.round(applyMod(baseHP, abilityCategory["hp max"])),
    mpMax: 0, // monsters have no MP pool (08-Resource); explicit so Actor.mp is never undefined
    physicalAttack: Math.round(applyMod(baseATK, abilityCategory["equipment_physical_attack"]) * 10) / 10,
    physicalDefense: Math.round(applyMod(baseDEF, abilityCategory["equipment_physical_defense"]) * 10) / 10,
    moveSpeed,
    weight,
  };
}
