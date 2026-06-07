/**
 * HitStop.ts — 命中停帧 (hit-stop / hit-freeze) — Stage 4C 机制移植.
 *
 * Ported from old kernel src/combat/reaction/HitStopController.ts. The engine uses a per-actor
 * `frozenFrames` field (like reaction/airborne/knockback work-state) instead of the old central
 * Map — so it folds into computeStateHash automatically and matches engine conventions.
 *
 * DNF hit-stop = on a hit, both attacker and defender freeze for N frames (the punchy "stop" that
 * sells impact). Frozen actors skip ALL time-advancing work (animation frames, movement, gravity,
 * hitstun decrement, DOT, AI, cooldowns) — time is paused for them.
 *
 * ⚠️ requiresManualVerification — ALL frame counts here are local_baseline (mirrored from old
 * kernel FrameDataAction.hitStopProfile, sourceRef docs/design/tuning-baseline.md). DNF's real
 * hit-stop frames are hardcoded in DNF.exe / .skl and NOT extractable from PVF. These are
 * playable approximations, NOT truth.
 */

export interface HitStopProfile {
  readonly frames: number;          // base freeze frames on a normal hit
}

/** local_baseline per-action hit-stop (mirrors old kernel attack1=4/attack2=5/attack3=7).
 *  Armor caps the freeze at hit time via ArmorProfile.hitStopCapFrames (Batch 3) — not stored here. */
export const HIT_STOP_PROFILES: Record<string, HitStopProfile> = {
  attack1: { frames: 4 },
  attack2: { frames: 5 },
  attack3: { frames: 7 },
  dashattack: { frames: 5 },
  jumpattack: { frames: 5 },
  hardattack: { frames: 6 },
};

export const DEFAULT_HIT_STOP: HitStopProfile = { frames: 4 };

/** Profile for an action name (falls back to DEFAULT). */
export function hitStopFor(actionName: string | null | undefined): HitStopProfile {
  return (actionName && HIT_STOP_PROFILES[actionName]) || DEFAULT_HIT_STOP;
}

/**
 * Compute the new frozenFrames value when applying a freeze. Uses the old kernel's `frames + 1`
 * offset: HitStopSystem decrements at tick end, so +1 makes "N freeze frames" last N ticks. Takes
 * the max so overlapping hits don't shorten an existing freeze.
 */
export function applyHitStop(currentFrozen: number, frames: number): number {
  if (frames <= 0) return currentFrozen;
  return Math.max(currentFrozen, frames + 1);
}
