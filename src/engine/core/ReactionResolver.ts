/**
 * ReactionResolver.ts — Apply hit reaction to defender Actor.
 *
 * PVF-truth-driven (Wave 2, 2026-06-05). Upgraded from the Phase-3 stub that only
 * read two bools (liftUp/pushAside). Now routes from the atk `hitReaction` string and
 * derives the vertical launch velocity from PVF truth (atk `liftUp.value` ×
 * weaponHitInfo `launch`), mirroring the combat-side
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
import type { ArmorProfile } from "./ArmorProfile.js";
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

// ── weight does NOT participate in launch/knockback physics (Tier-1 TRUTH) ──────
// PVF /sqr/dnf_enum_header.nut (Korean comments, dnf-extract first-evidence — 2026-05-21 air-physics
// Phase 1) proves chr.weight is an AUDIO classification key only: its sole .nut reference is
// sq_GetObjectWeight() for sound selection; it is NOT read by the velocity loop. The earlier
// weightFactor (reaction-formula H2, Tier-3 推测) is OVERTURNED — launch/knockback use the px/s
// force directly (lift_up / push_aside → sq_SetCurrentAttacknUpForce/BackForce, also Tier-1).

/** ReactionState.kind: airborne (launch) | down (knockdown) | stagger (hit_horizon) | hit (plain). */
export type ReactionKind = "hit" | "down" | "airborne" | "stagger";

export interface ReactionState {
  active: boolean;
  remainingTicks: number;
  kind: ReactionKind;
  /** Vertical launch velocity actually applied (px/s); 0 when not a launch. P4: horizontal vx unmodelled. */
  launchVy: number;
}

/**
 * Compute vertical launch velocity from PVF truth (Tier-1): vy = liftUp × weaponLaunch (px/s).
 * lift_up is the px/s force passed straight to sq_SetCurrentAttacknUpForce (Korean-comment closure),
 * so it IS the initial vertical velocity. weaponHitInfo.launch is a per-slot multiplier (slot2=-0.95
 * downward); every normal swordman combo routes to slot0 (launch=0), so the product is 0 → fall back
 * to lift_up directly. attack3 liftUp=300 → vy=300 → peak = 300²/(2·1500) = 30px (matches air-physics
 * Phase 1). NO weightFactor — chr.weight is audio-only (Tier-1); the old factor is overturned.
 */
function computeLaunchVy(liftUpValue: number, weaponLaunch: number): number {
  const pvfProduct = liftUpValue * weaponLaunch;
  // slot.launch=0 → fall back to lift_up body (truth, px/s), not a hardcoded constant.
  return pvfProduct !== 0 ? pvfProduct : liftUpValue;
}

/**
 * Compute horizontal knockback velocity (signed px/s) from PVF truth (Tier-1):
 *   velocityX = pushAside × pushBack × facing  (px/s, NO weightFactor — chr.weight is audio-only).
 * We do NOT fall back when pushBack=0 — a 0 pushBack IS the truth that the attack doesn't push
 * horizontally (basic attacks route to slot0, pushBack=0 → no knockback, zero regression).
 */
function computeKnockbackVx(pushAsideValue: number, weaponPushBack: number, attackerFacing: number): number {
  return pushAsideValue * weaponPushBack * attackerFacing;
}

/** Route a hitReaction string + causesDown/attackLevel to an engine ReactionKind. */
export function routeFromHitReaction(
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
export function routeFromLegacyBools(flags: AtkFlags): ReactionKind {
  if (flags.liftUp) return "airborne";
  if (flags.pushAside) return "down";
  return "hit";
}

/**
 * Downgrade a reaction kind for an armored defender (Stage 4C Batch 3). A super-armored / boss /
 * building target still TAKES DAMAGE (applied before routing) but its launch/knockdown is
 * suppressed, folding to a plain HIT. Horizontal knockback is suppressed separately in
 * applyHitReaction via armorProfile.canBeKnockedBack. Pure — exported for the armor guard test.
 */
export function applyArmorToKind(armor: ArmorProfile, kind: ReactionKind): ReactionKind {
  if (kind === "airborne" && !armor.canBeLaunched) return "hit";
  if (kind === "down" && !armor.canBeKnockedDown) return "hit";
  return kind;
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
  const rawKind: ReactionKind = flags.hitReaction
    ? routeFromHitReaction(flags.hitReaction, flags.causesDown ?? false, flags.attackLevel ?? 1)
    : routeFromLegacyBools(flags);
  // Armor (Stage 4C Batch 3): super-armor/boss/building suppress launch+knockdown — damage still
  // landed above; the reaction folds to a plain HIT. defender.armorProfile defaults to NONE_ARMOR,
  // so unarmored players/grunts are zero-regression.
  const kind: ReactionKind = applyArmorToKind(defender.armorProfile, rawKind);

  // Vertical launch (velocityY → AirborneState.vy). Only meaningful for airborne.
  let launchVy = 0;
  if (kind === "airborne") {
    const liftUpValue = flags.liftUpValue ?? 0;
    const weaponLaunch = flags.weaponLaunch ?? 0;
    launchVy = computeLaunchVy(liftUpValue, weaponLaunch);
    // Combo (Batch 4): a juggled target resists launch — divide by launchResistance (1 on the first
    // aerial hit, climbs with airGauge). Single-launch tests have launchResistance=1 → unchanged.
    launchVy = launchVy / defender.combo.launchResistance;
    if (launchVy > 0 && defender.hp > 0) {
      // Set airborne inside the resolver (cohesive with hp/fsm mutation here) so the
      // integrator no longer needs its own launchAirborne() call. Capture combo.gravityScale NOW
      // (reflects prior aerial hits only — launch hit's airGauge accumulates after, in CombatResolution
      // — so a fresh launch is pure gravity = Batch-6 truth peak; re-launches in a juggle fall faster).
      defender.airborne = launchAirborne(launchVy, defender.y, defender.combo.gravityScale);
    }
  }

  // Horizontal knockback (velocityX → KnockbackState.vx) — twin of the vertical launch above
  // (P4 GAP now filled). Truth: pushAside × pushBack × facing (NO weightFactor — chr.weight is
  // audio-only, Tier-1; see the OVERTURNED note above). pushBack=0 (basic
  // attacks, slot0) → no slide → zero regression. Applied for grounded reactions (not airborne,
  // which already carries the actor through the air).
  if (kind !== "airborne" && defender.hp > 0 && defender.armorProfile.canBeKnockedBack) {
    const knockVx = computeKnockbackVx(
      flags.pushAsideValue ?? 0, flags.weaponPushBack ?? 0, flags.attackerFacing ?? defender.facing,
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
