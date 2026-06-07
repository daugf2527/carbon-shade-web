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
 * `src/engine/core/Actor.ts` exposes only x/y/z position, facing, and per-actor physics work
 * states. It has NO `velocity.{x,y,z}` field (combat does). Both launch directions are modelled
 * via dedicated work states (the proven airborne pattern), NOT a velocity tri-axis:
 *   ✅ vertical launch (velocityY)   → AirborneState.vy   via launchAirborne()  (actor.y in hash)
 *   ✅ horizontal knockback (velocityX) → KnockbackState.vx via applyKnockback() (actor.x in hash)
 *   ⚠️ depth knockback (velocityZ) is still unmodelled (engine has no z-knockback need yet).
 * We deliberately do NOT add a velocity tri-axis to Actor — that would risk the stateHash
 * contract. Adding a knockback WORK STATE (like airborne) does not, since actor.x already exists.
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
import { applyKnockback } from "./KnockbackPhysics.js";

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
  /** PVF atk `pushAside.value` (px/s horizontal-push magnitude). e.g. attack1=30, attack3=40. */
  readonly pushAsideValue?: number;
  /** PVF weaponHitInfo[slot].pushBack coefficient for the routed slot (slot0=0, slot3=0.2). */
  readonly weaponPushBack?: number;
  /** Attacker facing (+1 right / -1 left): the defender is pushed away in this direction. */
  readonly attackerFacing?: number;

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

// ── PVF velocity weight-factor (D9=B partial) ──────
// weightFactor = max(0.1, 1 - DEFENDER_weight / 150000). The DEFENDER weight is now PVF truth
// (chr.weight 68000 / mob.weight 45000), passed in per-hit. The THRESHOLD 150000 + the formula
// SHAPE are still research推测 (reaction-formula-reverse-engineering.md H2, range 100000-200000) —
// requiresManualVerification. Fallback weight 68000 only when an actor has no weight stat.
const WEIGHT_THRESHOLD = 150000;
const MIN_WEIGHT_FACTOR = 0.1;
const FALLBACK_WEIGHT = 68000; // swordman chr default, used only when defender.stats.weight absent

/** ReactionState.kind: airborne (launch) | down (knockdown) | stagger (hit_horizon) | hit (plain). */
export type ReactionKind = "hit" | "down" | "airborne" | "stagger";

export interface ReactionState {
  active: boolean;
  remainingTicks: number;
  kind: ReactionKind;
  /** Vertical launch velocity actually applied (px/s); 0 when not a launch. P4: horizontal vx unmodelled. */
  launchVy: number;
}

/** weightFactor from DEFENDER weight (PVF truth). Heavier target → smaller factor → launches less.
 *  Threshold/shape still research推测 (D9=B); the weight VALUE is now real PVF per-entity. */
function weightFactor(defenderWeight: number | undefined): number {
  const w = defenderWeight && defenderWeight > 0 ? defenderWeight : FALLBACK_WEIGHT;
  return Math.max(MIN_WEIGHT_FACTOR, 1 - w / WEIGHT_THRESHOLD);
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
function computeLaunchVy(liftUpValue: number, weaponLaunch: number, defenderWeight: number | undefined): number {
  const wf = weightFactor(defenderWeight);
  const pvfProduct = liftUpValue * weaponLaunch * wf;
  // slot.launch=0 → fall back to liftUp body (truth, px/s), not a hardcoded constant.
  return pvfProduct !== 0 ? pvfProduct : liftUpValue * wf;
}

/**
 * Compute horizontal knockback velocity (signed px/s) from PVF truth:
 *   velocityX = pushAside × pushBack × facing × weightFactor.
 * UNLIKE computeLaunchVy, we do NOT fall back when pushBack=0 — a 0 pushBack IS the truth that the
 * attack doesn't push horizontally (basic attacks route to slot0, pushBack=0 → no knockback, zero
 * regression). Inventing a push there would be local_baseline guessing. Returns 0 → no slide.
 */
function computeKnockbackVx(pushAsideValue: number, weaponPushBack: number, attackerFacing: number, defenderWeight: number | undefined): number {
  return pushAsideValue * weaponPushBack * attackerFacing * weightFactor(defenderWeight);
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
  let launchVy = 0;
  if (kind === "airborne") {
    const liftUpValue = flags.liftUpValue ?? 0;
    const weaponLaunch = flags.weaponLaunch ?? 0;
    launchVy = computeLaunchVy(liftUpValue, weaponLaunch, defender.stats.weight);
    if (launchVy > 0 && defender.hp > 0) {
      // Set airborne inside the resolver (cohesive with hp/fsm mutation here) so the
      // integrator no longer needs its own launchAirborne() call.
      defender.airborne = launchAirborne(launchVy, defender.y);
    }
  }

  // Horizontal knockback (velocityX → KnockbackState.vx) — twin of the vertical launch above
  // (P4 GAP now filled). Truth: pushAside × pushBack × facing × weightFactor. pushBack=0 (basic
  // attacks, slot0) → no slide → zero regression. Applied for grounded reactions (not airborne,
  // which already carries the actor through the air).
  if (kind !== "airborne" && defender.hp > 0) {
    const knockVx = computeKnockbackVx(
      flags.pushAsideValue ?? 0, flags.weaponPushBack ?? 0, flags.attackerFacing ?? defender.facing, defender.stats.weight,
    );
    if (knockVx !== 0) defender.knockback = applyKnockback(knockVx, defender.x);
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
