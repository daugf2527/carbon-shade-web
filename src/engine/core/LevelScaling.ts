/**
 * LevelScaling.ts — PVF growth curve evaluation (Stage 4C-C1).
 *
 * DNF chr.growth arrays have 17 values (PVF truth):
 *   values[0]    = base stat at LV1
 *   values[1..16] = 16 cumulative increments that sum to the LV70 (cap) total.
 *
 * Cross-check (research/reaction-formula-reverse-engineering.md:71): the full
 * 17-value sum equals the LV70 stat (swordman hpMax sum 952.5 = LV70). So LV70
 * returns the full sum — NO extrapolation beyond it.
 *
 * ⚠️ requiresManualVerification: the PER-LEVEL mapping (which level each of the 16
 * increments lands on) is DNF.exe internal logic and is NOT carried in PVF — PVF only
 * has the 17 raw numbers. We distribute the 16 increments linearly across LV1→LV70
 * (69 / 16 = 4.3125 levels per increment). Only the LV1 base and LV70 full-sum
 * endpoints are PVF-anchored; intermediate levels are an interpolation assumption.
 */

const MAX_LEVEL = 70;

export function statAtLevel(values: readonly number[], level: number): number {
  if (!values?.length) return 0;
  if (level <= 1) return values[0];

  const increments = values.length - 1; // 16 for a full growth array
  if (increments <= 0) return values[0];

  const lv = Math.min(level, MAX_LEVEL);
  const levelsPerSegment = (MAX_LEVEL - 1) / increments; // 69/16 = 4.3125
  const growthLevels = lv - 1; // 0..69
  let stat = values[0];

  for (let seg = 1; seg < values.length; seg++) {
    const segStart = (seg - 1) * levelsPerSegment;
    if (growthLevels <= segStart) break;
    const covered = Math.min(growthLevels - segStart, levelsPerSegment);
    stat += values[seg] * (covered / levelsPerSegment);
  }

  return stat; // LV70 → full sum (all increments covered), no extrapolation
}

export interface LevelStats {
  hpMax: number;
  mpMax: number;
  physicalAttack: number;
  physicalDefense: number;
  mpRegenSpeed: number;
  hitRecovery: number;
}

export function statsAtLevel(
  growth: Record<string, { values: number[] }>,
  level: number,
): LevelStats {
  return {
    hpMax: statAtLevel(growth.hpMax?.values ?? [180], level),
    mpMax: statAtLevel(growth.mpMax?.values ?? [140], level),
    physicalAttack: statAtLevel(growth.physicalAttack?.values ?? [7.5], level),
    physicalDefense: statAtLevel(growth.physicalDefense?.values ?? [7.5], level),
    mpRegenSpeed: statAtLevel(growth.mpRegenSpeed?.values ?? [50], level),
    hitRecovery: statAtLevel(growth.hitRecovery?.values ?? [600], level),
  };
}
