import type { Actor, HitDecision, ReactionKind } from "../types.js";
import { signedFacingScale } from "../util/geometry.js";
import { resolveReactionProfile } from "./ReactionProfiles.js";
import { applyReactionHandfeel, interruptControlForReaction } from "./ReactionHandfeelApplier.js";
import SWORDMAN_ATTACKS from "../../data/manifest/truth/swordman-attacks.json" with { type: "json" };
import SWORDMAN_DATA from "../../../verification/baseline-shards/players/swordman.json" with { type: "json" };

type HitReaction = "hit_lift_up" | "hit_down" | "hit_horizon" | "none";

interface AttackConfig {
  hitReaction: HitReaction;
  causesDown: boolean;
  liftUp?: { value: number };
  pushAside?: { value: number };
}

interface WeaponHitInfo {
  launch: number;
  pushBack: number;
  damageScalePct: number;
}

// H2.1: weaponHitInfo slot routing (hardcoded, D9=B降级路径)
const WEAPON_SLOT_ROUTING: Record<string, number> = {
  attack1: 0,
  attack2: 0,
  attack3: 0,
  dashattack: 0,
  jumpattack: 0,
  hardattack: 3,
  chargecrash: 3,
  chargecrashfinish: 3,
};

// H2: stub constants (待 Phase E 客户端实测校准)
const WEIGHT_THRESHOLD = 150000;
const MIN_WEIGHT_FACTOR = 0.1;

export class ReactionResolver {
  resolve(_target: Actor, decision: HitDecision, attacker?: Actor): ReactionKind {
    // Armor override takes precedence ONLY when armor actually intervened.
    // ArmorResolver always fills finalReaction (defaults to the passed-through
    // rawReaction), so a non-empty value alone does NOT mean armor acted — that
    // would let the hitbox-derived rawReaction silently shadow PVF reaction
    // routing (F8: attack3 hit_lift_up was being overridden to light_stagger).
    // Real armor intervention is signalled by controlBlocked, or by the armor /
    // combo-correction sentinels (armor_feedback_only / downed via forceStand).
    const armor = decision.armorDecision;
    if (armor && (armor.controlBlocked || armor.finalReaction === "armor_feedback_only" || armor.finalReaction === "downed")) {
      return armor.finalReaction;
    }

    // Try to route from PVF truth data (swordman-attacks.json)
    const actionName = attacker?.currentAction?.actionName;
    if (actionName && actionName in SWORDMAN_ATTACKS) {
      const config = SWORDMAN_ATTACKS[actionName as keyof typeof SWORDMAN_ATTACKS] as AttackConfig;
      return this.routeFromHitReaction(config.hitReaction, config.causesDown, decision.hitbox.attackLevel);
    }

    // Fallback to legacy logic (local_baseline)
    if (decision.hitbox.canLaunch) return "launch";
    if (decision.hitbox.canKnockdown) return "downed";
    return decision.hitbox.attackLevel >= 2 ? "heavy_stagger" : "light_stagger";
  }

  private routeFromHitReaction(hitReaction: HitReaction, causesDown: boolean, attackLevel: number): ReactionKind {
    switch (hitReaction) {
      case "hit_lift_up":
        return "launch";
      case "hit_down":
        return causesDown ? "downed" : "knockback";
      case "hit_horizon":
        return attackLevel >= 2 ? "heavy_stagger" : "light_stagger";
      case "none":
        return "none";
    }
  }

  apply(target: Actor, reaction: ReactionKind, decision?: HitDecision, attacker?: Actor, tick = 0): void {
    if (target.flags.dead) return;
    const profile = resolveReactionProfile(reaction, decision?.hitbox.reactionProfile);
    const sourceFacing = attacker?.currentAction?.lockedFacing ?? attacker?.facing;
    const facingScale = sourceFacing ? signedFacingScale(sourceFacing) : signedFacingScale(target.facing) * -1;
    const zDelta = attacker ? target.position.z - attacker.position.z : 0;
    const zScale = zDelta === 0 ? 0 : Math.sign(zDelta);

    const hitRecoveryMultiplier = reaction === "armor_feedback_only" ? 1 : target.buffs.find(b=>b.type==="frenzy")?.modifiers.find(modifier => modifier.key === "hit_recovery_received_stun_multiplier")?.value ?? 1;
    applyReactionHandfeel(target, reaction, profile, decision, tick, hitRecoveryMultiplier);
    if (reaction !== "armor_feedback_only" && profile.hitStunFrames > 0) {
      target.handfeel.reactionRemaining = Math.max(0, target.handfeel.reactionRemaining - target.comboCorrection.stunReliefFrames);
    }
    target.handfeel.visualRecoilX = reaction === "armor_feedback_only" ? 0 : Math.min(10, decision?.hitbox.impactSnapX ?? 4) * facingScale;
    target.handfeel.visualRecoilZ = reaction === "armor_feedback_only" ? 0 : Math.min(3, Math.abs(profile.knockbackZ)) * zScale;
    interruptControlForReaction(target, reaction);

    // Try PVF-driven velocity calculation (D9=B stub coefficients)
    const actionName = attacker?.currentAction?.actionName;
    const pvfVelocity = actionName ? this.calculatePvfVelocity(actionName, target, facingScale) : null;

    if (reaction === "launch") {
      target.position.x += (decision?.hitbox.impactSnapX ?? 4) * facingScale;
      if (pvfVelocity) {
        const velocityY = pvfVelocity.y !== 0 ? pvfVelocity.y : profile.launchVelocityY;
        const velocityX = pvfVelocity.x !== 0 ? pvfVelocity.x : profile.knockbackX * facingScale;
        target.velocity.y = Math.max(target.velocity.y, velocityY / target.comboCorrection.launchResistance);
        target.velocity.x = velocityX;
      } else {
        target.velocity.y = Math.max(target.velocity.y, profile.launchVelocityY / target.comboCorrection.launchResistance);
        target.velocity.x = profile.knockbackX * facingScale;
      }
      target.velocity.z = profile.knockbackZ * zScale;
      return;
    }

    if (reaction === "downed" || reaction === "knockback") {
      target.position.x += (decision?.hitbox.impactSnapX ?? 5) * facingScale;
      if (pvfVelocity) {
        target.velocity.y = Math.max(target.velocity.y, pvfVelocity.y);
        target.velocity.x = pvfVelocity.x;
      } else {
        target.velocity.y = Math.max(target.velocity.y, profile.launchVelocityY);
        target.velocity.x = profile.knockbackX * facingScale;
      }
      target.velocity.z = profile.knockbackZ * zScale;
      return;
    }

    if (reaction === "light_stagger" || reaction === "heavy_stagger" || reaction === "micro_stagger") {
      target.position.x += (decision?.hitbox.impactSnapX ?? (reaction === "heavy_stagger" ? 7 : 4)) * facingScale;
      if (pvfVelocity) {
        target.velocity.x = pvfVelocity.x;
      } else {
        target.velocity.x = profile.knockbackX * facingScale;
      }
      target.velocity.z = profile.knockbackZ * zScale;
      target.velocity.y = 0;
      return;
    }

    if (reaction === "armor_feedback_only") {
      target.velocity.x = 0;
      target.velocity.z = 0;
      target.velocity.y = 0;
    }
  }

  private calculatePvfVelocity(actionName: string, target: Actor, facingScale: number): { x: number; y: number } | null {
    if (!(actionName in SWORDMAN_ATTACKS)) return null;
    const config = SWORDMAN_ATTACKS[actionName as keyof typeof SWORDMAN_ATTACKS] as AttackConfig;
    if (!config.liftUp || !config.pushAside) return null;

    const slot = WEAPON_SLOT_ROUTING[actionName] ?? 0;
    const weaponHitInfo = (SWORDMAN_DATA.chr.weaponHitInfo as WeaponHitInfo[])[slot];
    if (!weaponHitInfo) return null;

    // H2: weight factor formula (D9=B stub: assume target weight = 68000, swordman chr default)
    // TODO Phase E: read actual target.chr.weight from entity data
    const stubTargetWeight = 68000;
    const weightFactor = Math.max(MIN_WEIGHT_FACTOR, 1 - stubTargetWeight / WEIGHT_THRESHOLD);

    // velocityY = liftUp × launch × weightFactor
    const velocityY = config.liftUp.value * weaponHitInfo.launch * weightFactor;

    // velocityX = pushAside × pushBack × weightFactor × direction
    const velocityX = config.pushAside.value * weaponHitInfo.pushBack * weightFactor * facingScale;

    return { x: velocityX, y: velocityY };
  }
}
