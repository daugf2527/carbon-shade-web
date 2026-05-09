import type { BaseArmorType } from "../types.js";

// CRT-004: Split monolithic "stunned" into DNF-accurate hit-reaction substates.
// flinched = brief hit stun (~200-400ms), launched = airborne from launcher,
// knocked_down = grounded after launch/KD, getting_up = recovery animation (~300ms).
export type EnemyAIPhase = "idle" | "approach" | "windup" | "attacking" | "recover" | "flinched" | "launched" | "knocked_down" | "getting_up";

/** CRT-004: Returns true if the phase is any hit-reaction substate.
 *  Replaces old `state.phase === "stunned"` for backward compatibility. */
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
  // CRT-004: Hit-reaction substate durations (loaded from manifest, in ticks at 60fps)
  flinchDurationTicks?: number;
  launchDurationTicks?: number;
  knockdownDurationTicks?: number;
  getupDurationTicks?: number;
  // CRT-004: Runtime hit-reaction timer — ticks remaining in current substate
  hitReactionTicksRemaining?: number;
  // CRT-004: Launch velocity tracking — Y velocity from launcher hits
  launchVelocityY?: number;
  launchGrounded?: boolean;
}

export function cloneEnemyAIState(state: EnemyAIState): EnemyAIState {
  return { ...state };
}
