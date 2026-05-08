import type { BaseArmorType, Provenance } from "../../combat/types.js";

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
  | "longRangeReactionChance";

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
}

export interface EnemyManifest {
  manifestVersion: "enemy-manifest-v1";
  sourcePolicyVersion: string;
  profiles: Record<EnemyManifestId, EnemyRuntimeProfile>;
}
