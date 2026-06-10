import type { BaseArmorType, Provenance } from "../../runtime/data/CombatDataTypes.js";

export type EnemyManifestId = "grunt" | "dummy" | "imp" | "boss" | "building";
export type EnemyManifestField =
  | "detectRange"
  | "attackRange"
  | "preAttackFrames"
  | "postCooldown"
  | "moveSpeedPerTick"
  | "loseAggroRange"
  | "hp"
  | "damage"
  | "armor"
  | "sightRange"
  | "aggressiveness"
  | "targetSwitchTime"
  | "longRangeReactionChance"
  // CRT-004: Hit-reaction substate durations
  | "flinchDurationTicks"
  | "launchDurationTicks"
  | "knockdownDurationTicks"
  | "getupDurationTicks";

export interface EnemyRuntimeProfile {
  id: EnemyManifestId;
  detectRange: number;
  attackRange: number;
  preAttackFrames: number;
  postCooldown: number;
  moveSpeedPerTick: number;
  loseAggroRange: number;
  hp: number;
  damage: number;
  armor: BaseArmorType;
  fieldProvenance: Partial<Record<EnemyManifestField, Provenance>>;
  // Phase 5: DNF AI parameters
  sightRange?: number;
  aggressiveness?: number;
  targetSwitchTime?: number;
  longRangeReactionChance?: number;
  behaviorWeights?: { chase: number; retreat: number; hold: number };
  // CRT-004: Hit-reaction substate durations (in ticks at 60fps)
  flinchDurationTicks?: number;
  launchDurationTicks?: number;
  knockdownDurationTicks?: number;
  getupDurationTicks?: number;
}

export interface EnemyManifest {
  manifestVersion: "enemy-manifest-v1";
  sourcePolicyVersion: string;
  profiles: Record<EnemyManifestId, EnemyRuntimeProfile>;
}

export interface BossPattern {
  name: string;
  weight: number;
  cooldownFrames: number;
  damageMultiplier: number;
}

export interface BossPhase {
  phase: number;
  triggerHpPercent: number;
  enterPattern: string;
  patterns: BossPattern[];
}

export interface BossConfig {
  id: string;
  name: string;
  maxHp: number;
  phases: BossPhase[];
}
