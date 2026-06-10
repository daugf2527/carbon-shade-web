export type BaseArmorType = "none" | "super_armor" | "boss_super_armor" | "building_armor";

export type ProvenanceSourceType =
  | "official_api"
  | "official_page"
  | "dfo_wiki"
  | "pvf_extraction"
  | "local_baseline"
  | "needs_calibration"
  | "experimental";

export type ProvenanceConfidence = "low" | "medium" | "high";

export interface Provenance {
  sourceType: ProvenanceSourceType;
  confidence: ProvenanceConfidence;
  sourceRef: string;
  capturedAt: string;
  version: string;
  requiresCalibration: boolean;
  notes?: string;
  hypothesis?: string;
  falsifiableBy?: string;
  requiresManualVerification?: boolean;
}

export type ProvenanceSource =
  | "local_baseline"
  | "neople_api"
  | "dfo_world_wiki"
  | "namu_wiki"
  | "pvf_extraction"
  | "ani_extraction"
  | "community_audit";

export interface SourceProvenance {
  source: ProvenanceSource;
  verifiedAt?: string;
  sourceUrl?: string;
  confidence: "low" | "medium" | "high";
  notes?: string;
}

export type FrameDataProvenanceField =
  | "totalFrames"
  | "active"
  | "hitbox"
  | "reactionProfile"
  | "hitStopProfile"
  | "recoilProfile"
  | "cancelPolicy"
  | "rootMotion"
  | "costProfile"
  | "cooldownProfile"
  | "feedbackProfile";

export type FieldProvenanceMap = Partial<Record<FrameDataProvenanceField, Provenance>>;

export type StatusEffectType =
  | "bleed"
  | "poison"
  | "shock"
  | "burn"
  | "rupture"
  | "stun"
  | "freeze"
  | "stone"
  | "bind"
  | "sleep"
  | "slow"
  | "defense_down"
  | "attack_down"
  | "curse";

export type StatusDispelPolicy = "dispellable" | "not_dispellable" | "death_clear" | "death_keep";
export type StatusTolerance = Partial<Record<StatusEffectType, number>>;

export type StatusProvenanceField =
  | "durationFrames"
  | "tickIntervalFrames"
  | "dotDamagePerStack"
  | "maxStacks"
  | "splashRadius"
  | "splashDamagePerStack"
  | "incomingDirectDamageMultiplierPerStack"
  | "dispelPolicy";

export type StatusFieldProvenanceMap = Partial<Record<StatusProvenanceField, Provenance>>;

export interface StatusProfile {
  type: StatusEffectType;
  durationFrames: number;
  tickIntervalFrames?: number;
  dotDamagePerStack?: number;
  maxStacks: number;
  splashRadius?: number;
  splashDamagePerStack?: number;
  incomingDirectDamageMultiplierPerStack?: number;
  dispelPolicy: StatusDispelPolicy;
  isHardControl?: boolean;
  breakThreshold?: number;
  fieldProvenance: StatusFieldProvenanceMap;
  sourceProvenance?: SourceProvenance;
}

export interface StatusManifest {
  manifestVersion: "status-manifest-v1";
  sourcePolicyVersion: string;
  profiles: Partial<Record<StatusEffectType, StatusProfile>>;
  sourceProvenance?: SourceProvenance;
}

export interface HitReactionProfile {
  hitStunFrames?: number;
  knockbackX?: number;
  knockbackZ?: number;
  launchVelocityY?: number;
  downFrames?: number;
  getUpFrames?: number;
  horizontalFriction?: number;
}
