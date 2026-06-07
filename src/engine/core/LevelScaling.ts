/**
 * LevelScaling.ts — PVF growth curve evaluation (Stage 4C-C1).
 *
 * DNF chr.growth arrays have 17 values:
 *   values[0] = base stat at LV1
 *   values[1..16] = per-segment increment, each segment spans 4 levels
 *
 * Segment 1 covers LV 2-5, segment 2 covers LV 6-9, ..., segment 16 covers LV 62-65.
 * LV 66-70 extrapolates from the last segment's rate.
 *
 * statAtLevel(values, lv) returns the cumulative stat at that level.
 */

const SEGMENT_SIZE = 4;
const MAX_LEVEL = 70;

export function statAtLevel(values: readonly number[], level: number): number {
  if (!values?.length) return 0;
  if (level <= 1) return values[0];

  const lv = Math.min(level, MAX_LEVEL);
  const growthLevels = lv - 1;
  let stat = values[0];

  for (let seg = 1; seg < values.length; seg++) {
    const segStartLevel = (seg - 1) * SEGMENT_SIZE;
    if (growthLevels <= segStartLevel) break;
    const covered = Math.min(growthLevels - segStartLevel, SEGMENT_SIZE);
    stat += values[seg] * (covered / SEGMENT_SIZE);
  }

  // Extrapolate beyond last segment using last segment's rate
  const lastSegEnd = (values.length - 1) * SEGMENT_SIZE;
  if (growthLevels > lastSegEnd && values.length > 1) {
    const extra = growthLevels - lastSegEnd;
    const lastRate = values[values.length - 1] / SEGMENT_SIZE;
    stat += lastRate * extra;
  }

  return stat;
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
