import type { EnemyAIState } from "./ai/EnemyAIState.js";

export type ActorId = string;
export type ActionName =
  | "Idle" | "Walk" | "Run"
  | "NormalBasic1" | "NormalBasic2" | "NormalBasic3" | "DashAttack" | "Jump" | "JumpAttack"
  | "FrenzyToggle" | "FrenzyBasic1" | "FrenzyBasic2" | "FrenzyBasic3"
  | "UpwardSlash" | "MountainousWheel" | "RagingFury" | "Bloodlust" | "Backstep"
  | "QuickRebound" | "Derange" | "Diehard" | "DebugReset"
  | "ForceDownPlayer" | "ForceBleed" | "SpawnTargets" | "RunScreenshotScenario"
  | "GoreCross" | "OutrageBreak" | "ExtremeOverkill" | "RagingFury2"
  | "BloodRuin" | "BloodSword" | "BurstFury" | "EarthShatter"
  | "Thirst" | "BloodMemory" | "VimAndVigor"
  | "EnemyBasic";
export type ActorType = "player" | "enemy" | "dummy" | "boss" | "building";
export type Faction = "player" | "enemy" | "neutral";
export type Facing = "left" | "right";
export type ReactionKind = "none" | "micro_stagger" | "light_stagger" | "heavy_stagger" | "knockback" | "launch" | "air_hitstun" | "falling" | "downed" | "getting_up" | "quick_rebound" | "grabbed" | "dead" | "armor_feedback_only";
export type BaseArmorType = "none" | "super_armor" | "boss_super_armor" | "building_armor";
export type DamageSourceKind = "direct_hit" | "enemy_normal" | "status_dot" | "environment" | "self_cost" | "debug";
export type DamageReactionPolicy = "normal_hit_reaction" | "no_reaction" | "status_tick_feedback_only";
export type ActionPhase = "request" | "enter" | "startup" | "active" | "hitstop_freeze" | "cancel_window" | "recovery" | "exit" | "interrupted" | "ended";
export type HitType = "slash" | "shockwave" | "blood_pillar" | "grab" | "debug";
export type HitboxShape = "rect" | "circle" | "sweep" | "grab_attach";
export type DamageType = "physical" | "status" | "debug";
export type ProvenanceSourceType = "official_api" | "official_page" | "dfo_wiki" | "local_baseline" | "needs_calibration" | "experimental";
export type ProvenanceConfidence = "low" | "medium" | "high";
export interface Provenance {
  sourceType: ProvenanceSourceType;
  confidence: ProvenanceConfidence;
  sourceRef: string;
  capturedAt: string;
  version: string;
  requiresCalibration: boolean;
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
export type StatusEffectType = "bleed" | "poison" | "shock" | "burn" | "rupture" | "stun" | "freeze" | "stone" | "bind" | "sleep" | "slow" | "defense_down" | "attack_down" | "curse";
export type BuffType = "frenzy" | "derange" | "bloody_cross" | "vim_and_vigor" | "diehard" | "thirst" | "blood_memory";

export interface Vec3 { x: number; z: number; y: number; }
export interface Rect2D5 { x: number; z: number; y: number; w: number; d: number; h: number; }
export interface RawBox6 { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number; }
export interface HitGeometrySnapshot {
  queryBox: Rect2D5;
  rawBox6: RawBox6;
  shape: HitboxShape;
  radius?: number;
  hurtRects: Rect2D5[];
  overlap: boolean;
  zMismatch: boolean;
  yMismatch: boolean;
}
export interface FrameWindow { start: number; end: number; }
export interface ActorFlags { dead: boolean; playerControlled?: boolean; }
export interface HandfeelState {
  reactionRemaining: number;
  downRemaining: number;
  getUpRemaining: number;
  lastReactionAppliedAt?: number;
  hitFlashRemaining?: number;
  visualRecoilRemaining?: number;
  visualRecoilX?: number;
  visualRecoilZ?: number;
}
export interface ComboCorrectionState {
  standGauge: number;
  airGauge: number;
  downGauge: number;
  hitRecoveryGauge: number;
  comboElapsedFrames: number;
  framesSinceLastHit: number;
  comboHitCount: number;
  lastState: "stand" | "aerial" | "down" | "none";
  forcedWakeQueued: boolean;
  gravityScale: number;
  launchResistance: number;
  damageScale: number;
  stunReliefFrames: number;
  recoveryRuleVersion: string;
  evasionGauge: number;
}
export interface ComboCorrectionConfig {
  barMax: number;
  standHitAdd: number;
  standHeavyBonus: number;
  airHitAdd: number;
  airLaunchBonus: number;
  downHitAdd: number;
  hitRecoveryAddPerFrame: number;
  gravityScaleMax: number;
  launchResistanceMax: number;
  damageScaleMin: number;
  maxStunReliefFrames: number;
  forcedWakeInvulFrames: number;
  comboResetFrames: number;
}
export interface LocomotionState {
  mode: "idle" | "walk" | "run";
  xDirection: -1 | 0 | 1;
  zDirection: -1 | 0 | 1;
  speedScale: number;
  lastRunDirection?: Facing;
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
export interface ResourceState { hp: number; maxHp: number; mp: number; maxMp: number; cube: number; }
export interface CooldownState { remaining: Map<ActionName, number>; globalRemaining: number; }

export interface ArmorProfile {
  baseType: BaseArmorType;
  canTakeDamage: boolean;
  canBeLaunched: boolean;
  canBeKnockedDown: boolean;
  canBeKnockedBack: boolean;
  canReceiveHitStop: boolean;
  immunities: { grab: boolean; control: boolean; damage: boolean; hitStop?: boolean };
  temporaryFlags: { invulnerableUntilTick?: number; getUpArmorUntilTick?: number; superArmorUntilTick?: number };
  hitStopCapFrames?: number;
  reactionOverride?: ReactionKind;
}

export interface PushBox { w: number; d: number; immovable?: boolean; }
export interface HurtBox { offset: Vec3; w: number; d: number; h: number; }
export interface Actor {
  id: ActorId;
  type: ActorType;
  faction: Faction;
  name: string;
  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3;
  facing: Facing;
  pushBox: PushBox;
  hurtBoxes: HurtBox[];
  resources: ResourceState;
  cooldowns: CooldownState;
  buffs: Buff[];
  statusEffects: StatusEffect[];
  armorProfile: ArmorProfile;
  reactionState: ReactionKind;
  locomotion: LocomotionState;
  ai?: EnemyAIState;
  currentAction?: ActionInstance;
  flags: ActorFlags;
  handfeel: HandfeelState;
  comboCorrection: ComboCorrectionState;
}

export interface ActionInstance {
  id: string;
  actionName: ActionName;
  ownerId: ActorId;
  startTick: number;
  localFrame: number;
  phase: ActionPhase;
  commandSource: "command" | "hotkey" | "debug" | "ai";
  lockedFacing: Facing;
  facingLocked: boolean;
  movementLocked: boolean;
  activeHitboxIds: string[];
  alreadyHitByGroup: Map<string, Set<ActorId>>;
  hitConfirmed: boolean;
  armorHitConfirmed: boolean;
  downedHitConfirmed: boolean;
  whiffed: boolean;
  cancelTokens: string[];
  interrupted: boolean;
  hitStopFrozen: boolean;
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
export interface ActionTimeline { startup: FrameWindow[]; emitters: HitEmitter[]; recovery: FrameWindow[]; }

export interface CostProfile { hpCost?: number; hpPercentCost?: number; mpCost?: number; cubeCost?: number; costTiming: "on_request" | "on_startup" | "on_active"; cannotReduceHpBelow?: number; }
export interface CooldownProfile { actionName: ActionName; independentCooldownFrames: number; globalCooldownFrames: number; sharedCooldownGroup?: string; cooldownStartsAt: "on_request" | "on_action_enter" | "on_active"; freezesDuringHitStop: boolean; canBeReducedByFrenzy?: boolean; }
export interface RootMotionStep { frame: number; dx: number; dz: number; dy?: number; collisionPolicy: "block" | "slide" | "ignore"; }
export interface RootMotionTrack { frames: RootMotionStep[]; speedXPerTick?: number; appliesEveryFrame?: boolean; }
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
  sourcePolicy: { sourceType: ProvenanceSourceType; confidence: ProvenanceConfidence; requiresManualVerification: boolean };
  fieldProvenance?: FieldProvenanceMap;
  maxHoldFrames?: number;
}

export interface HitQuery {
  id: string;
  tick: number;
  attackerId: ActorId;
  actionInstanceId: string;
  actionName: ActionName;
  hitboxId: string;
  hitGroupId: string;
  shape: HitboxShape;
  radius?: number;
  rawBox6?: RawBox6;
  box: Rect2D5;
  facing: Facing;
  hitType: HitType;
  damageType: DamageType;
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

export interface ArmorDecision { baseType: BaseArmorType; damageAllowed: boolean; controlBlocked: boolean; hitStopAllowed: boolean; finalReaction: ReactionKind; reason?: string; }
export interface DownedHitDecision { attempted: boolean; accepted: boolean; reason?: string; }
export interface GrabDecision { attempted: boolean; success: boolean; failedReason?: "not_grab_action" | "target_out_of_range" | "target_dead" | "target_invulnerable" | "target_grab_immune" | "building_armor" | "already_grabbed"; }
export interface HitDecision {
  id: string;
  queryId: string;
  attackerId: ActorId;
  targetId: ActorId;
  geometryOverlapped: boolean;
  accepted: boolean;
  rejectedReason?: "same_faction" | "target_dead" | "target_invulnerable" | "damage_immune" | "z_mismatch" | "y_mismatch" | "already_hit_in_group" | "target_limit_reached" | "downed_not_allowed" | "grab_immune" | "out_of_active_frame";
  armorDecision?: ArmorDecision;
  downedDecision?: DownedHitDecision;
  grabDecision?: GrabDecision;
  isCounter: boolean;
  isBackAttack: boolean;
  isCritical: boolean;
  hitbox: HitBoxFrameWindow;
}

export interface DamageRequest {
  attackerId?: ActorId;
  targetId: ActorId;
  actionName?: ActionName;
  sourceStatusId?: string;
  sourceKind: DamageSourceKind;
  reactionPolicy: DamageReactionPolicy;
  baseDamage: number;
  canTriggerCounter: boolean;
  canTriggerBackAttack: boolean;
  canTriggerCritical: boolean;
  canTriggerDeath: boolean;
  sourceHitDecisionId?: string;
  correlationId: string;
  attackerStats?: { strength?: number; elementalDamage?: number };
  targetStats?: { defense?: number };
}
export interface DamageApplied { attackerId?: ActorId; targetId: ActorId; actionName?: ActionName; sourceKind: DamageSourceKind; reactionPolicy: DamageReactionPolicy; baseDamage: number; finalDamage: number; hpBefore: number; hpAfter: number; isCounter: boolean; isBackAttack: boolean; isCritical: boolean; multipliers: Array<{name:string; value:number}>; sourceHitDecisionId?: string; sourceStatusId?: string; }

export interface Buff { id: string; type: BuffType; ownerId: ActorId; sourceAction?: ActionName; appliedAtTick: number; expiresAtTick?: number; stacks: number; maxStacks: number; refreshPolicy: "refresh_duration" | "add_stack" | "replace" | "ignore" | "highest_value"; dispelPolicy: "dispellable" | "not_dispellable" | "death_clear" | "death_keep"; modifiers: Array<{key:string; value:number}>; }
export interface StatusEffect { id: string; type: StatusEffectType; ownerId: ActorId; sourceActorId?: ActorId; sourceAction?: ActionName; appliedAtTick: number; expiresAtTick: number; tickIntervalFrames?: number; nextTickFrame?: number; dotDamagePerStack?: number; stacks: number; maxStacks: number; resistanceCheck: { accepted: boolean; reason?: string }; dispelPolicy: "dispellable" | "not_dispellable" | "death_clear" | "death_keep"; }

export interface ScenarioBooleans {
  normalHitObserved: boolean;
  launchObserved: boolean;
  ragingFuryMultiHitObserved: boolean;
  armorHitObserved: boolean;
  buildingArmorBlockedControlObserved: boolean;
  bleedObserved: boolean;
  quickReboundObserved: boolean;
}

export interface HandfeelReport {
  version: string;
  generatedAtTick: number;
  scenario: ScenarioBooleans;
  player: { hp: number; facing: Facing; x: number; z: number; action: ActionName | null; reaction: ReactionKind };
  actors: Array<{ id: ActorId; type: ActorType; hp: number; x: number; z: number; y: number; action: ActionName | null; reaction: ReactionKind; armor: BaseArmorType }>;
  attacks: Record<string, { hits: number; armorHits: number; targets: ActorId[] }>;
  reactions: Record<string, number>;
  hitstop: { count: number; totalFrames: number; maxFrames: number };
  pushbox: { note: string; playerSoftEnemyRule: string; hardBlockerRule: string };
  keyEvents: Array<Record<string, unknown>>;
}
