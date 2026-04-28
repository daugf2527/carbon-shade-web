import type { Actor, HitDecision, ReactionKind } from "../types.js";
import { signedFacingScale } from "../util/geometry.js";
import { resolveReactionProfile } from "./ReactionProfiles.js";
import { applyReactionHandfeel, interruptControlForReaction } from "./ReactionHandfeelApplier.js";

export class ReactionResolver {
  resolve(_target: Actor, decision: HitDecision): ReactionKind {
    if (decision.armorDecision?.finalReaction) return decision.armorDecision.finalReaction;
    if (decision.hitbox.canLaunch) return "launch";
    if (decision.hitbox.canKnockdown) return "downed";
    return decision.hitbox.attackLevel >= 2 ? "heavy_stagger" : "light_stagger";
  }

  apply(target: Actor, reaction: ReactionKind, decision?: HitDecision, attacker?: Actor, tick = 0): void {
    if (target.flags.dead) return;
    const profile = resolveReactionProfile(reaction, decision?.hitbox.reactionProfile);
    const sourceFacing = attacker?.currentAction?.lockedFacing ?? attacker?.facing;
    const facingScale = sourceFacing ? signedFacingScale(sourceFacing) : signedFacingScale(target.facing) * -1;
    const zDelta = attacker ? target.position.z - attacker.position.z : 0;
    const zScale = zDelta === 0 ? 0 : Math.sign(zDelta);

    applyReactionHandfeel(target, reaction, profile, decision, tick);
    target.handfeel.visualRecoilX = reaction === "armor_feedback_only" ? 0 : Math.min(10, decision?.hitbox.impactSnapX ?? 4) * facingScale;
    target.handfeel.visualRecoilZ = reaction === "armor_feedback_only" ? 0 : Math.min(3, Math.abs(profile.knockbackZ)) * zScale;
    interruptControlForReaction(target, reaction);

    if (reaction === "launch") {
      target.position.x += (decision?.hitbox.impactSnapX ?? 4) * facingScale;
      target.velocity.y = Math.max(target.velocity.y, profile.launchVelocityY);
      target.velocity.x = profile.knockbackX * facingScale;
      target.velocity.z = profile.knockbackZ * zScale;
      return;
    }

    if (reaction === "downed" || reaction === "knockback") {
      target.position.x += (decision?.hitbox.impactSnapX ?? 5) * facingScale;
      target.velocity.y = Math.max(target.velocity.y, profile.launchVelocityY);
      target.velocity.x = profile.knockbackX * facingScale;
      target.velocity.z = profile.knockbackZ * zScale;
      return;
    }

    if (reaction === "light_stagger" || reaction === "heavy_stagger" || reaction === "micro_stagger") {
      target.position.x += (decision?.hitbox.impactSnapX ?? (reaction === "heavy_stagger" ? 7 : 4)) * facingScale;
      target.velocity.x = profile.knockbackX * facingScale;
      target.velocity.z = profile.knockbackZ * zScale;
      target.velocity.y = 0;
      return;
    }

    if (reaction === "armor_feedback_only") {
      // Armor takes the hit feedback but keeps control/no-launch/no-knockdown.
      target.velocity.x = 0;
      target.velocity.z = 0;
      target.velocity.y = 0;
    }
  }
}
