import type { BaseArmorType } from "../types.js";

export type EnemyAIPhase = "idle" | "approach" | "windup" | "attacking" | "recover" | "stunned";

export interface EnemyAIState {
  phase: EnemyAIPhase;
  phaseEnteredTick: number;
  windupRemaining: number;
  recoverRemaining: number;
  detectRange: number;
  attackRange: number;
  preAttackFrames: number;
  postCooldown: number;
  moveSpeedPerTick: number;
  loseAggroRange: number;
  hp: number;
  damage: number;
  armor: BaseArmorType;
  // Phase 5: Boss state fields
  bossPhase?: number;
  bossPhaseEnteredTick?: number;
  patternWeights?: Record<string, number>;
  currentPattern?: string;
  // Phase 5: DNF AI parameter fields (loaded from manifest)
  sightRange?: number;
  aggressiveness?: number;
  targetSwitchTime?: number;
  longRangeReactionChance?: number;
  behaviorWeights?: { chase: number; retreat: number; hold: number };
}

export function cloneEnemyAIState(state: EnemyAIState): EnemyAIState {
  return { ...state };
}
