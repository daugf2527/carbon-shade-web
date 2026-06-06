/**
 * ReactionResolver.ts — Apply hit reaction to defender Actor.
 *
 * PVF-truth-driven (Wave 2, 2026-06-05). Upgraded from the Phase-3 stub that only
 * read two bools (liftUp/pushAside). Now routes from the atk `hitReaction` string and
 * derives the vertical launch velocity from PVF truth (atk `liftUp.value` ×
 * weaponHitInfo `launch` × weightFactor), mirroring the combat-side
 * `src/combat/reaction/ReactionResolver.ts` (`routeFromHitReaction` +
 * `calculatePvfVelocity`) but adapted to the engine Actor model.
 *
 * ── ARCHITECTURE BOUNDARY (engine Actor has no velocity tri-axis) ────────────────
 * `src/engine/core/Actor.ts` exposes only x/y/z position, facing, and
 * `airborne: AirborneState | null` (which carries a single vertical `vy`). It has NO
 * `velocity.{x,y,z}` field (combat does). Therefore:
 *   ✅ vertical launch (velocityY)  → mapped to AirborneState.vy via launchAirborne()
 *   ⚠️ horizontal knockback (velocityX = pushAside × pushBack × facing) and depth
 *      knockback (velocityZ) have NO field on the engine Actor and are NOT modelled
 *      here. See "P4 GAP" below. We deliberately do NOT add a velocity field to Actor —
 *      that would break the stateHash determinism contract.
 *
 * ── TRUTH SOURCING ──────────────────────────────────────────────────────────────
 *   hitReaction / liftUp.value / pushAside.value / causesDown  ← swordman-attacks.json
 *   weaponHitInfo[slot].launch / .pushBack                     ← swordman.json chr
 * The caller (CombatResolutionSystem) is responsible for the table lookup + slot
 * routing; this resolver consumes already-parsed numbers (keeps swordman-specific
 * data coupling out of the generic reaction logic). See the wiring spec returned to
 * the integrator.
 *
 * Hitstun: swordman-attacks.json carries NO hitstun field (verified — every attack
 * entry lacks it). We keep DEFAULT_HITSTUN_MS=600 as local_baseline rather than
 * pretend a non-existent value was truth-sourced. Override via flags.hitstunMs.
 */

import { Actor } from "./Actor.js";
import { ActorState } from "./ActorStateMachine.js";
import { launchAirborne } from "./AirbornePhysicsSystem.js";

export type HitReaction = "hit_lift_up" | "hit_down" | "hit_horizon" | "none";

export interface AtkFlags {
  /**
   * PVF atk hitReaction string. When provided, drives routing (preferred).
   * When absent, falls back to the legacy liftUp/pushAside bool path below.
   */
  readonly hitReaction?: HitReaction;
  /** PVF atk `liftUp.value` (px/s vertical-velocity magnitude). e.g. attack3=300, weaponcomboshort3=400. */
  readonly liftUpValue?: number;
  /** PVF atk `causesDown`: hit_down + causesDown=true → knock to ground vs. plain hit. */
  readonly causesDown?: boolean;
  /** PVF atk `attackLevel` (hit_horizon ≥2 → heavy, <2 → light; engine records but folds both to HIT). */
  readonly attackLevel?: number;
  /** PVF weaponHitInfo[slot].launch coefficient for the routed slot (e.g. slot0=0, slot2=-0.95). */
  readonly weaponLaunch?: number;

  // ── Legacy bool path (backward compat with the old stub caller) ────────────────
  /** @deprecated prefer hitReaction. Legacy bool: any lift → airborne. */
  readonly liftUp?: boolean;
  /** @deprecated prefer hitReaction. Legacy bool: pushAside → down. */
  readonly pushAside?: boolean;

  /** Hitstun duration override (ms). Default 600 (local_baseline). */
  readonly hitstunMs?: number;
}

const DEFAULT_HITSTUN_MS = 600; // fallback only — real hitstun = defender.stats.hitRecovery (PVF)
const TICK_MS = 1000 / 60;

// ── PVF velocity stub coefficients (D9=B stub, ported verbatim from combat) ──────
// TODO Phase E: replace with real target weight read from entity data + client-measured
// gravity/launch curves. weightFactor = max(0.1, 1 - targetWeight/150000), targetWeight
// stubbed at 68000 (swordman chr default) → weightFactor ≈ 0.5467.
const WEIGHT_THRESHOLD = 150000;
const MIN_WEIGHT_FACTOR = 0.1;
const STUB_TARGET_WEIGHT = 68000;

/** ReactionState.kind: airborne (launch) | down (knockdown) | stagger (hit_horizon) | hit (plain). */
export type ReactionKind = "hit" | "down" | "airborne" | "stagger";

export interface ReactionState {
  active: boolean;
  remainingTicks: number;
  kind: ReactionKind;
  /** Vertical launch velocity actually applied (px/s); 0 when not a launch. P4: horizontal vx unmodelled. */
  launchVy: number;
}

/** Weight factor stub (D9=B). Phase E: read actual target weight from entity data. */
function stubWeightFactor(): number {
  return Math.max(MIN_WEIGHT_FACTOR, 1 - STUB_TARGET_WEIGHT / WEIGHT_THRESHOLD);
}

/**
 * Compute vertical launch velocity from PVF truth.
 * Main formula (ported from combat calculatePvfVelocity): vy = liftUp × weaponLaunch × weightFactor.
 *
 * ENGINE-LOCAL FALLBACK: every normal swordman combo routes to weaponHitInfo slot0 whose
 * `launch` is 0 (verified) — so the main formula yields vy=0 for all of them, which would
 * never actually launch the defender. The combat side hides this by falling back to a
 * ReactionProfiles constant (`profile.launchVelocityY`) when the PVF product is 0. The engine
 * has no ReactionProfiles; the honest engine-side equivalent is to fall back to the atk
 * `liftUp.value` itself, which is already a px/s vertical-velocity magnitude (the real driver
 * of launch height) rather than an invented constant. This keeps the formula truth-driven:
 * different liftUp values still produce different vy.
 */
function computeLaunchVy(liftUpValue: number, weaponLaunch: number): number {
  const wf = stubWeightFactor();
  const pvfProduct = liftUpValue * weaponLaunch * wf;
  // slot.launch=0 → fall back to liftUp body (truth, px/s), not a hardcoded constant.
  return pvfProduct !== 0 ? pvfProduct : liftUpValue * wf;
}

/** Route a hitReaction string + causesDown/attackLevel to an engine ReactionKind. */
function routeFromHitReaction(
  hitReaction: HitReaction,
  causesDown: boolean,
  attackLevel: number,
): ReactionKind {
  switch (hitReaction) {
    case "hit_lift_up":
      return "airborne";
    case "hit_down":
      // combat distinguishes downed vs. knockback; engine has no knockback state (needs
      // horizontal velocity it lacks), so non-down hit_down folds to a plain HIT. P4 GAP.
      return causesDown ? "down" : "hit";
    case "hit_horizon":
      // attackLevel ≥2 is heavy in combat; engine folds heavy/light into one "stagger"
      // (FSM has no stagger state — both map to HIT). attackLevel kept for parity/intent.
      void attackLevel;
      return "stagger";
    case "none":
      return "hit";
  }
}

/** Legacy bool routing (old stub caller path; used only when hitReaction absent). */
function routeFromLegacyBools(flags: AtkFlags): ReactionKind {
  if (flags.liftUp) return "airborne";
  if (flags.pushAside) return "down";
  return "hit";
}

export function applyHitReaction(
  defender: Actor,
  flags: AtkFlags,
  damage: number,
  tick: number,
): ReactionState {
  defender.hp = Math.max(0, defender.hp - damage);

  // Hitstun duration = the DEFENDER's hit-recovery (PVF truth: swordman chr.growth.hitRecovery
  // base 600ms, goblin mob.hitRecovery 500ms — hitstun is a property of who's hit, not the attack;
  // swordman-attacks.json carries no hitstun field). flags.hitstunMs overrides (synthetic anims);
  // DEFAULT_HITSTUN_MS is the final fallback for actors with no hitRecovery stat.
  const hitstunMs = flags.hitstunMs ?? defender.stats.hitRecovery ?? DEFAULT_HITSTUN_MS;
  const hitstunTicks = Math.round(hitstunMs / TICK_MS);

  // Route: prefer PVF hitReaction string; fall back to legacy bools for old callers.
  const kind: ReactionKind = flags.hitReaction
    ? routeFromHitReaction(flags.hitReaction, flags.causesDown ?? false, flags.attackLevel ?? 1)
    : routeFromLegacyBools(flags);

  // Vertical launch (velocityY → AirborneState.vy). Only meaningful for airborne.
  // P4 GAP: engine Actor has no horizontal velocity field; pushAside knockback
  //         (velocityX = pushAside × pushBack × facing) and velocityZ are unmodelled.
  let launchVy = 0;
  if (kind === "airborne") {
    const liftUpValue = flags.liftUpValue ?? 0;
    const weaponLaunch = flags.weaponLaunch ?? 0;
    launchVy = computeLaunchVy(liftUpValue, weaponLaunch);
    if (launchVy > 0 && defender.hp > 0) {
      // Set airborne inside the resolver (cohesive with hp/fsm mutation here) so the
      // integrator no longer needs its own launchAirborne() call.
      defender.airborne = launchAirborne(launchVy, defender.y);
    }
  }

  const ctx = {
    tick,
    hp: defender.hp,
    maxHp: defender.stats.hpMax,
    inputAttack: false,
    hitReceived: true,
    // "stagger" and plain "hit" both enter FSM as HIT (no stagger state in the 9-state FSM).
    knockedDown: kind === "down",
    launchedAirborne: kind === "airborne",
    animationDone: false,
    targetInRange: false,
    targetInSight: false,
  };
  defender.fsm.update(ctx);

  return { active: true, remainingTicks: hitstunTicks, kind, launchVy };
}

/** Tick down hitstun; when done, push animationDone transition. */
export function tickReaction(defender: Actor, reaction: ReactionState, tick: number): void {
  if (!reaction.active) return;
  reaction.remainingTicks--;
  if (reaction.remainingTicks <= 0) {
    reaction.active = false;
    if (defender.hp > 0) {
      defender.fsm.update({
        tick,
        hp: defender.hp,
        maxHp: defender.stats.hpMax,
        inputAttack: false,
        hitReceived: false,
        knockedDown: false,
        launchedAirborne: false,
        animationDone: true,
        targetInRange: false,
        targetInSight: false,
      });
    } else {
      defender.fsm.force(ActorState.DEAD, tick);
    }
  }
}
