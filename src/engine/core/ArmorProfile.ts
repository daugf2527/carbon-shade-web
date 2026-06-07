/**
 * ArmorProfile.ts — 霸体 (super-armor) + 建筑/Boss armor — Stage 4C Batch 3 机制移植.
 *
 * Ported from old kernel src/combat/actors/ActorFactory.ts `armor()` + src/combat/armor/
 * ArmorResolver.ts. DNF armor decides whether a hit's CONTROL effects (launch / knockdown /
 * knockback) land — a super-armored boss still TAKES DAMAGE but is not staggered or launched.
 *
 * The engine consumes a focused subset of the old ArmorProfile: the three control-suppression
 * booleans + a hit-stop cap. Damage immunity / grab immunity (PvP-leaning) are intentionally
 * omitted — every PVE armor profile takes damage, so damage always lands; armor only downgrades
 * the REACTION. This keeps the type lean and the hit path's only armor question "does the control
 * effect apply?".
 *
 * ⚠️ requiresManualVerification — ALL values here are local_baseline, mirrored from the old kernel
 * (sourceRef docs/design/tuning-baseline.md). DNF's real armor flags + hit-stop caps live in
 * DNF.exe / .mob behaviour and are NOT extractable from PVF. These are playable approximations.
 *
 * No dependency on ReactionResolver (avoids a core cycle): this module exports only data + the
 * boolean capability queries. The reaction-kind downgrade itself lives in ReactionResolver, which
 * owns ReactionKind and reads these booleans.
 */

export type ArmorBaseType = "none" | "super_armor" | "boss_super_armor" | "building_armor";

export interface ArmorProfile {
  readonly baseType: ArmorBaseType;
  /** false → a hit_lift_up reaction is downgraded (target is NOT launched airborne). */
  readonly canBeLaunched: boolean;
  /** false → a knockdown (hit_down + causesDown) is downgraded (target is NOT knocked to the ground). */
  readonly canBeKnockedDown: boolean;
  /** false → horizontal knockback slide is suppressed (no pushAside push). */
  readonly canBeKnockedBack: boolean;
  /** Cap (frames) on hit-stop freeze when THIS actor is the one hit. null → no cap (normal freeze).
   *  Hitting armor gives a shorter "thunk": building=1, boss=2, super=3 (local_baseline). */
  readonly hitStopCapFrames: number | null;
}

/** No armor — every control effect lands, no hit-stop cap. The default for players + grunts. */
export const NONE_ARMOR: ArmorProfile = {
  baseType: "none",
  canBeLaunched: true,
  canBeKnockedDown: true,
  canBeKnockedBack: true,
  hitStopCapFrames: null,
};

/** Super armor (mini-boss / charging move): immune to launch + knockdown, but CAN be knocked back. */
export const SUPER_ARMOR: ArmorProfile = {
  baseType: "super_armor",
  canBeLaunched: false,
  canBeKnockedDown: false,
  canBeKnockedBack: true,
  hitStopCapFrames: 3,
};

/** Boss super armor: immune to launch + knockdown + knockback (only damage + tiny thunk). */
export const BOSS_SUPER_ARMOR: ArmorProfile = {
  baseType: "boss_super_armor",
  canBeLaunched: false,
  canBeKnockedDown: false,
  canBeKnockedBack: false,
  hitStopCapFrames: 2,
};

/** Building armor (destructibles): immune to all control, shortest thunk (cap=1). */
export const BUILDING_ARMOR: ArmorProfile = {
  baseType: "building_armor",
  canBeLaunched: false,
  canBeKnockedDown: false,
  canBeKnockedBack: false,
  hitStopCapFrames: 1,
};

export const ARMOR_PROFILES: Record<ArmorBaseType, ArmorProfile> = {
  none: NONE_ARMOR,
  super_armor: SUPER_ARMOR,
  boss_super_armor: BOSS_SUPER_ARMOR,
  building_armor: BUILDING_ARMOR,
};

/** Look up an armor profile by base type (falls back to NONE_ARMOR for unknown strings). */
export function armorProfileFor(baseType: string | null | undefined): ArmorProfile {
  return (baseType && ARMOR_PROFILES[baseType as ArmorBaseType]) || NONE_ARMOR;
}
