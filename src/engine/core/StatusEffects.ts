/**
 * StatusEffects.ts — Tick-based status DOT (bleed) state + pure logic (09-Status).
 *
 * Mirrors the engine's existing per-actor work-state pattern (ReactionState in
 * ReactionResolver.ts, AirborneState in AirbornePhysicsSystem.ts): the STATE lives on the
 * Actor (actor.statusEffects), and the kernel `StatusSystem` (kernel/systems/StatusSystem.ts)
 * ticks it each frame via the pure functions here.
 *
 * ── NOT the legacy core/StatusEffectSystem.ts ────────────────────────────────────
 * That Phase-4 class is wall-clock driven (appliedAtMs/nowMs) and never wired into the
 * deterministic kernel. This module is TICK-based (frame counts) so DOT participates in the
 * kernel's replay-deterministic stateHash. Scope is intentionally minimal: bleed DOT only —
 * the combat side (src/combat/status/StatusEffectSystem.ts) has the full poison/burn/stun/
 * stack/resistance model; the engine ports just what its current actors can exercise.
 *
 * ── TRUTH SOURCING (CLAUDE.md confidence tiers) ──────────────────────────────────
 * BLEED_PROFILE numbers are **local_baseline / requiresCalibration** — mirrored verbatim from
 * src/data/manifest/status/default.json `profiles.bleed` (every fieldProvenance there is
 * sourceType:"local_baseline", confidence:"medium", requiresCalibration:true). They are NOT
 * PVF-extracted; PVF does not carry status DOT curves (same class of gap as hitstun).
 */

import type { Actor } from "./Actor.js";

/** Only bleed is ported to the engine today; poison/burn/etc remain combat-side (future). */
export type StatusKind = "bleed";

export interface ActiveStatus {
  readonly kind: StatusKind;
  /** Current stack count (1..maxStacks); more stacks → proportionally more DOT per interval. */
  stacks: number;
  /** Tick the effect was (re)applied — duration expiry measured from here. */
  appliedTick: number;
  /** Tick of the most recent DOT damage — next DOT fires tickIntervalTicks later. */
  lastDotTick: number;
}

/**
 * Bleed DOT profile — **local_baseline** (requiresCalibration), mirrored from
 * src/data/manifest/status/default.json profiles.bleed. Tick == frame (engine is 60Hz fixed).
 */
export const BLEED_PROFILE = {
  durationTicks: 180,       // 3s @ 60Hz
  tickIntervalTicks: 30,    // DOT fires every 0.5s
  dotDamagePerStack: 6,
  maxStacks: 5,
} as const;

/**
 * Apply (or refresh + stack) bleed on the target. Refreshing resets the duration window and
 * adds a stack up to maxStacks (combat's dispelPolicy for bleed is death_clear / refresh-on-reapply).
 */
export function applyBleed(target: Actor, tick: number): void {
  const existing = target.statusEffects.find((s) => s.kind === "bleed");
  if (existing) {
    existing.stacks = Math.min(BLEED_PROFILE.maxStacks, existing.stacks + 1);
    existing.appliedTick = tick; // refresh duration window
  } else {
    target.statusEffects.push({ kind: "bleed", stacks: 1, appliedTick: tick, lastDotTick: tick });
  }
}

/**
 * Advance every active status on the target by one tick. Expires effects past their duration,
 * deals DOT damage on interval boundaries (mutating target.hp, clamped ≥0), and returns the
 * total DOT dealt this tick (0 if none). Deterministic: stable array iteration, no randomness.
 */
export function tickStatus(target: Actor, tick: number): number {
  if (target.statusEffects.length === 0) return 0;
  let dotDealt = 0;
  // Reverse iteration so in-place splice of expired effects is index-safe.
  for (let i = target.statusEffects.length - 1; i >= 0; i--) {
    const s = target.statusEffects[i];
    if (tick - s.appliedTick >= BLEED_PROFILE.durationTicks) {
      target.statusEffects.splice(i, 1); // duration elapsed → expire
      continue;
    }
    if (tick - s.lastDotTick >= BLEED_PROFILE.tickIntervalTicks) {
      const dmg = BLEED_PROFILE.dotDamagePerStack * s.stacks;
      target.hp = Math.max(0, target.hp - dmg);
      s.lastDotTick = tick;
      dotDealt += dmg;
    }
  }
  return dotDealt;
}

/** Compact deterministic fingerprint of active statuses (folded into the kernel stateHash). */
export function statusFingerprint(actor: Actor): string {
  if (actor.statusEffects.length === 0) return "";
  return actor.statusEffects.map((s) => `${s.kind}:${s.stacks}@${s.appliedTick}/${s.lastDotTick}`).join(";");
}
