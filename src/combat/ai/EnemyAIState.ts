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
}

export function cloneEnemyAIState(state: EnemyAIState): EnemyAIState {
  return { ...state };
}
