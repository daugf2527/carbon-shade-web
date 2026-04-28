import type { Actor, HitDecision, ReactionKind } from "../types.js";
import type { ResolvedReactionProfile } from "./ReactionProfiles.js";

export function applyReactionHandfeel(target: Actor, reaction: ReactionKind, profile: ResolvedReactionProfile, decision?: HitDecision, tick = 0, hitRecoveryMultiplier = 1): void {
  target.reactionState = reaction;
  target.handfeel.reactionRemaining = Math.max(0, Math.floor(profile.hitStunFrames * hitRecoveryMultiplier));
  target.handfeel.downRemaining = Math.max(0, profile.downFrames);
  target.handfeel.getUpRemaining = Math.max(0, profile.getUpFrames);
  target.handfeel.lastReactionAppliedAt = tick;
  target.handfeel.hitFlashRemaining = reaction === "armor_feedback_only" ? 10 : 6;
  target.handfeel.visualRecoilRemaining = decision?.hitbox.visualRecoilFrames ?? (reaction === "armor_feedback_only" ? 3 : 5);
}

export function interruptControlForReaction(target: Actor, reaction: ReactionKind): void {
  if (reaction === "armor_feedback_only") return;
  target.currentAction = undefined;
  target.locomotion.mode = "idle";
}
