import type { BaseArmorType } from "./CombatDataTypes.js";

export type EnemyAIPhase =
  | "idle"
  | "approach"
  | "windup"
  | "attacking"
  | "recover"
  | "flinched"
  | "launched"
  | "knocked_down"
  | "getting_up";

export function isHitReactionPhase(phase: EnemyAIPhase): boolean {
  return phase === "flinched" || phase === "launched" || phase === "knocked_down" || phase === "getting_up";
}

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
  baseDamage: number;
  armor: BaseArmorType;
  bossPhase?: number;
  bossPhaseEnteredTick?: number;
  patternWeights?: Record<string, number>;
  currentPattern?: string;
  sightRange?: number;
  aggressiveness?: number;
  targetSwitchTime?: number;
  longRangeReactionChance?: number;
  behaviorWeights?: { chase: number; retreat: number; hold: number };
  flinchDurationTicks?: number;
  launchDurationTicks?: number;
  knockdownDurationTicks?: number;
  getupDurationTicks?: number;
  hitReactionTicksRemaining?: number;
  launchVelocityY?: number;
  launchGrounded?: boolean;
}

export function cloneEnemyAIState(state: EnemyAIState): EnemyAIState {
  return { ...state, baseDamage: state.baseDamage };
}
