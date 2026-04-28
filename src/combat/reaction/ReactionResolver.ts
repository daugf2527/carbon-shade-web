import type { Actor, HitDecision, ReactionKind } from "../types.js";
import { signedFacingScale } from "../util/geometry.js";

const defaultProfiles: Record<string, {hitStunFrames:number; knockbackX:number; knockbackZ:number; launchVelocityY:number; downFrames:number; getUpFrames:number; horizontalFriction:number}> = {
  micro_stagger: { hitStunFrames:5, knockbackX:1.2, knockbackZ:0.1, launchVelocityY:0, downFrames:0, getUpFrames:0, horizontalFriction:0.70 },
  light_stagger: { hitStunFrames:10, knockbackX:2.6, knockbackZ:0.20, launchVelocityY:0, downFrames:0, getUpFrames:0, horizontalFriction:0.72 },
  heavy_stagger: { hitStunFrames:14, knockbackX:3.4, knockbackZ:0.30, launchVelocityY:0, downFrames:0, getUpFrames:0, horizontalFriction:0.74 },
  knockback: { hitStunFrames:11, knockbackX:4.4, knockbackZ:0.38, launchVelocityY:1.4, downFrames:24, getUpFrames:12, horizontalFriction:0.78 },
  launch: { hitStunFrames:0, knockbackX:1.8, knockbackZ:0.18, launchVelocityY:5.8, downFrames:30, getUpFrames:14, horizontalFriction:0.84 },
  downed: { hitStunFrames:0, knockbackX:3.8, knockbackZ:0.30, launchVelocityY:1.4, downFrames:30, getUpFrames:14, horizontalFriction:0.80 },
  armor_feedback_only: { hitStunFrames:12, knockbackX:0.0, knockbackZ:0.0, launchVelocityY:0, downFrames:0, getUpFrames:0, horizontalFriction:0.70 }
};

export class ReactionResolver {
  resolve(_target: Actor, decision: HitDecision): ReactionKind {
    if (decision.armorDecision?.finalReaction) return decision.armorDecision.finalReaction;
    if (decision.hitbox.canLaunch) return "launch";
    if (decision.hitbox.canKnockdown) return "downed";
    return decision.hitbox.attackLevel >= 2 ? "heavy_stagger" : "light_stagger";
  }

  apply(target: Actor, reaction: ReactionKind, decision?: HitDecision, attacker?: Actor, tick = 0): void {
    if (target.flags.dead) return;
    const profile = reaction === "armor_feedback_only"
      ? (defaultProfiles.armor_feedback_only ?? defaultProfiles.light_stagger)
      : { ...(defaultProfiles[reaction] ?? defaultProfiles.light_stagger), ...(decision?.hitbox.reactionProfile ?? {}) };
    const sourceFacing = attacker?.currentAction?.lockedFacing ?? attacker?.facing;
    const facingScale = sourceFacing ? signedFacingScale(sourceFacing) : signedFacingScale(target.facing) * -1;
    const zDelta = attacker ? target.position.z - attacker.position.z : 0;
    const zScale = zDelta === 0 ? 0 : Math.sign(zDelta);

    target.reactionState = reaction;
    target.handfeel.reactionRemaining = Math.max(0, profile.hitStunFrames ?? 0);
    target.handfeel.downRemaining = Math.max(0, profile.downFrames ?? 0);
    target.handfeel.getUpRemaining = Math.max(0, profile.getUpFrames ?? 0);
    target.handfeel.lastReactionAppliedAt = tick;
    target.handfeel.hitFlashRemaining = reaction === "armor_feedback_only" ? 10 : 6;
    target.handfeel.visualRecoilRemaining = decision?.hitbox.visualRecoilFrames ?? (reaction === "armor_feedback_only" ? 3 : 5);
    target.handfeel.visualRecoilX = reaction === "armor_feedback_only" ? 0 : Math.min(10, decision?.hitbox.impactSnapX ?? 4) * facingScale;
    target.handfeel.visualRecoilZ = reaction === "armor_feedback_only" ? 0 : Math.min(3, Math.abs(profile.knockbackZ ?? 0)) * zScale;

    if (reaction !== "armor_feedback_only") {
      target.currentAction = undefined;
      target.locomotion.mode = "idle";
    }

    if (reaction === "launch") {
      target.position.x += (decision?.hitbox.impactSnapX ?? 4) * facingScale;
      target.velocity.y = Math.max(target.velocity.y, profile.launchVelocityY ?? 5.8);
      target.velocity.x = (profile.knockbackX ?? 0) * facingScale;
      target.velocity.z = (profile.knockbackZ ?? 0) * zScale;
      return;
    }

    if (reaction === "downed" || reaction === "knockback") {
      target.position.x += (decision?.hitbox.impactSnapX ?? 5) * facingScale;
      target.velocity.y = Math.max(target.velocity.y, profile.launchVelocityY ?? 1.4);
      target.velocity.x = (profile.knockbackX ?? 0) * facingScale;
      target.velocity.z = (profile.knockbackZ ?? 0) * zScale;
      return;
    }

    if (reaction === "light_stagger" || reaction === "heavy_stagger" || reaction === "micro_stagger") {
      target.position.x += (decision?.hitbox.impactSnapX ?? (reaction === "heavy_stagger" ? 7 : 4)) * facingScale;
      target.velocity.x = (profile.knockbackX ?? 0) * facingScale;
      target.velocity.z = (profile.knockbackZ ?? 0) * zScale;
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
