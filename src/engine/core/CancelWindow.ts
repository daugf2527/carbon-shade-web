/**
 * CancelWindow.ts — Skill cancel-window parsing + frame predicate (cancel-window truth wiring).
 *
 * DNF actions expose a CANCEL WINDOW: a frame range during the action's animation where the
 * player may cancel into another action (the basis of combo/cancel chains). The skill .skl shard
 * carries this as real PVF truth (19/205 swordman skills have it), e.g. cancelgrabblastblood:
 *   cancelWindowStart 50 · cancelWindowDuration 30 · cancelGroup 2 · cancelWeaponMask [..] ·
 *   cancelTargetSlots [3].
 * The engine already ships a flatbuffers `CancelWindow` schema (skl-def.ts) but NO runtime logic
 * consumes it. This module is the runtime-side parse + pure predicate.
 *
 * ── TRUTH SOURCING (CLAUDE.md confidence tiers) ──────────────────────────────────
 * All fields are PVF-extracted from skills[id].cancelWindow (tier1-ish — concrete numbers, not
 * invented). Unlike combo-correction's hand-tuned gauge constants, these are real client data.
 *
 * ── HONEST WIRING STATUS (predicate wired into ActionSystem.tick, but config never supplied) ──
 * `isInCancelWindow` IS now called by the runtime (ActionSystem.tick:69, skill-action §3 wiring).
 * BUT it is effectively a no-op today: ActionSystem's `cancelWindows` map is populated only by
 * `define(name, anim, cancelWindow)` — and EVERY define() call in CombatScene passes just 2 args
 * (no cancelWindow), so the map is ALWAYS empty → cancelCfg is always undefined → the predicate is
 * never evaluated against real config. The basic attacks engine DOES run (attack1-3) carry NO
 * cancelWindow in the shard, so we do NOT invent cancel frames for them (that would be
 * local_baseline guessing, the combo-gauge mistake). This stays the verifiable foundation (parse +
 * frame test) the future cancel/combo system will sit on — once a skill action registers a real
 * cancelWindow config, the wiring lights up. `canCancelInto` / `cancelAllowedForWeapon` below have
 * NO caller yet (the group/weapon gates the future cancel resolver will use); kept as the
 * companion predicates of that foundation, not dead code to delete.
 */

export interface CancelWindowConfig {
  /** First frame (0-based) at which the action may be canceled. PVF cancelWindowStart. */
  readonly startFrame: number;
  /** Number of frames the window stays open. PVF cancelWindowDuration. */
  readonly durationFrames: number;
  /** Cancel group id — actions cancel only into compatible groups. PVF cancelGroup. */
  readonly cancelGroup: number;
  /** Per-weapon-slot mask (1 = cancelable with that weapon). PVF cancelWeaponMask. */
  readonly weaponMask: readonly number[];
  /** Target action slots this can cancel into. PVF cancelTargetSlots. */
  readonly targetSlots: readonly number[];
}

/** Parse a skill shard's `cancelWindow` object into a config, or null if the skill has none. */
export function parseCancelWindow(raw: unknown): CancelWindowConfig | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const start = o.cancelWindowStart;
  const duration = o.cancelWindowDuration;
  if (typeof start !== "number" || typeof duration !== "number") return null;
  return {
    startFrame: start,
    durationFrames: duration,
    cancelGroup: typeof o.cancelGroup === "number" ? o.cancelGroup : 0,
    weaponMask: Array.isArray(o.cancelWeaponMask) ? (o.cancelWeaponMask as number[]) : [],
    targetSlots: Array.isArray(o.cancelTargetSlots) ? (o.cancelTargetSlots as number[]) : [],
  };
}

/**
 * Is `frame` inside the cancel window? Half-open range [startFrame, startFrame+durationFrames).
 * Pure + deterministic — the core gate a future cancel system asks before allowing a cancel.
 */
export function isInCancelWindow(config: CancelWindowConfig, frame: number): boolean {
  return frame >= config.startFrame && frame < config.startFrame + config.durationFrames;
}

/** Can this action cancel into the given target slot? (targetSlots membership.) */
export function canCancelInto(config: CancelWindowConfig, targetSlot: number): boolean {
  return config.targetSlots.includes(targetSlot);
}

/** Is the cancel allowed for the weapon in `slot`? (weaponMask is 1 at that slot.) */
export function cancelAllowedForWeapon(config: CancelWindowConfig, slot: number): boolean {
  return config.weaponMask[slot] === 1;
}
