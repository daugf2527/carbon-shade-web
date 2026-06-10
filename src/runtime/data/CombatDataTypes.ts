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

export type ActionName =
  | "stay"
  | "move"
  | "dash"
  | "attack1"
  | "attack2"
  | "attack3"
  | "dashattack"
  | "jump"
  | "jumpattack"
  | "FrenzyToggle"
  | "FrenzyBasic1"
  | "FrenzyBasic2"
  | "FrenzyBasic3"
  | "UpwardSlash"
  | "MountainousWheel"
  | "RagingFury"
  | "Bloodlust"
  | "Backstep"
  | "QuickRebound"
  | "Derange"
  | "Diehard"
  | "DebugReset"
  | "ForceDownPlayer"
  | "ForceBleed"
  | "SpawnTargets"
  | "RunScreenshotScenario"
  | "GoreCross"
  | "OutrageBreak"
  | "ExtremeOverkill"
  | "RagingFury2"
  | "BloodRuin"
  | "BloodSword"
  | "BurstFury"
  | "EarthShatter"
  | "Thirst"
  | "BloodMemory"
  | "VimAndVigor"
  | "EnemyBasic";

export type ActionPhase =
  | "request"
  | "enter"
  | "startup"
  | "active"
  | "hitstop_freeze"
  | "cancel_window"
  | "recovery"
  | "exit"
  | "interrupted"
  | "ended";

export type HitType = "slash" | "shockwave" | "blood_pillar" | "grab" | "debug";
export type HitboxShape = "rect" | "circle" | "sweep" | "grab_attach";
export type DamageType = "physical" | "status" | "debug";
export type AttackType = "physical_percent" | "magic_percent" | "physical_fixed" | "magic_fixed";

export interface FrameWindow {
  start: number;
  end: number;
}

export interface HitBoxFrameWindow extends FrameWindow {
  id: string;
  hitGroupId: string;
  shape?: HitboxShape;
  offsetX: number;
  offsetZ: number;
  offsetY: number;
  radius?: number;
  w: number;
  d: number;
  h: number;
  hitType: HitType;
  damageType: DamageType;
  baseDamage: number;
  attackLevel: number;
  controlPower: number;
  canHitDowned: boolean;
  canLaunch: boolean;
  canKnockdown: boolean;
  canGrab: boolean;
  maxTargets: number;
  reactionProfile?: HitReactionProfile;
  impactSnapX?: number;
  visualRecoilFrames?: number;
}

export type HitEmitter = HitBoxFrameWindow;

export interface ActionTimeline {
  startup: FrameWindow[];
  emitters: HitEmitter[];
  recovery: FrameWindow[];
}

export interface CostProfile {
  hpCost?: number;
  hpPercentCost?: number;
  mpCost?: number;
  cubeCost?: number;
  costTiming: "on_request" | "on_startup" | "on_active";
  cannotReduceHpBelow?: number;
}

export interface CooldownProfile {
  actionName: ActionName;
  independentCooldownFrames: number;
  globalCooldownFrames: number;
  sharedCooldownGroup?: string;
  cooldownStartsAt: "on_request" | "on_action_enter" | "on_active";
  freezesDuringHitStop: boolean;
  canBeReducedByFrenzy?: boolean;
}

export interface RootMotionStep {
  frame: number;
  dx: number;
  dz: number;
  dy?: number;
  collisionPolicy: "block" | "slide" | "ignore";
}

export interface RootMotionTrack {
  frames: RootMotionStep[];
  speedXPerTick?: number;
  appliesEveryFrame?: boolean;
}

export interface FrameDataAction {
  actionName: ActionName;
  totalFrames: number;
  startup: FrameWindow[];
  active: HitBoxFrameWindow[];
  emitters?: HitEmitter[];
  timeline?: ActionTimeline;
  recovery: FrameWindow[];
  cancelPolicy: { hitCancelFrom?: number; whiffCancelFrom?: number; into?: ActionName[] };
  hitStopProfile: { frames: number; bossCapFrames?: number; buildingCapFrames?: number };
  recoilProfile: { frames: number; canCancelRecoil: boolean };
  rootMotion?: RootMotionTrack;
  armorWindows?: FrameWindow[];
  invulnerableWindows?: FrameWindow[];
  costProfile?: CostProfile;
  cooldownProfile?: CooldownProfile;
  feedbackProfile: { sound: string; vfx: string; cameraShake: number };
  sourcePolicy: {
    sourceType: ProvenanceSourceType;
    confidence: ProvenanceConfidence;
    requiresManualVerification: boolean;
  };
  fieldProvenance?: FieldProvenanceMap;
  maxHoldFrames?: number;
}
