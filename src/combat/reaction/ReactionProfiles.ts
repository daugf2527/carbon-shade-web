import type { HitReactionProfile, ReactionKind } from "../types.js";

export interface ResolvedReactionProfile {
  hitStunFrames: number;
  knockbackX: number;
  knockbackZ: number;
  launchVelocityY: number;
  downFrames: number;
  getUpFrames: number;
  horizontalFriction: number;
}

const DEFAULT_REACTION_PROFILES: Record<string, ResolvedReactionProfile> = {
  micro_stagger: { hitStunFrames: 5, knockbackX: 1.2, knockbackZ: 0.1, launchVelocityY: 0, downFrames: 0, getUpFrames: 0, horizontalFriction: 0.70 },
  light_stagger: { hitStunFrames: 10, knockbackX: 2.6, knockbackZ: 0.20, launchVelocityY: 0, downFrames: 0, getUpFrames: 0, horizontalFriction: 0.72 },
  heavy_stagger: { hitStunFrames: 14, knockbackX: 3.4, knockbackZ: 0.30, launchVelocityY: 0, downFrames: 0, getUpFrames: 0, horizontalFriction: 0.74 },
  knockback: { hitStunFrames: 11, knockbackX: 4.4, knockbackZ: 0.38, launchVelocityY: 1.4, downFrames: 24, getUpFrames: 12, horizontalFriction: 0.78 },
  launch: { hitStunFrames: 0, knockbackX: 1.8, knockbackZ: 0.18, launchVelocityY: 5.8, downFrames: 30, getUpFrames: 14, horizontalFriction: 0.84 },
  downed: { hitStunFrames: 0, knockbackX: 3.8, knockbackZ: 0.30, launchVelocityY: 1.4, downFrames: 30, getUpFrames: 14, horizontalFriction: 0.80 },
  armor_feedback_only: { hitStunFrames: 12, knockbackX: 0, knockbackZ: 0, launchVelocityY: 0, downFrames: 0, getUpFrames: 0, horizontalFriction: 0.70 },
};

export function resolveReactionProfile(reaction: ReactionKind, hitboxProfile?: HitReactionProfile): ResolvedReactionProfile {
  const base = DEFAULT_REACTION_PROFILES[reaction] ?? DEFAULT_REACTION_PROFILES.light_stagger;
  if (reaction === "armor_feedback_only") return { ...DEFAULT_REACTION_PROFILES.armor_feedback_only };
  return { ...base, ...(hitboxProfile ?? {}) };
}
