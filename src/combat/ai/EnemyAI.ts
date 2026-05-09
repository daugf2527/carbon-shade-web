import type { Actor, Facing, ReactionKind } from "../types.js";
import { cloneVec3 } from "../util/geometry.js";
import { isHitReactionPhase, type EnemyAIState } from "./EnemyAIState.js";

export interface EnemyAITickKernel {
  tickCount: number;
  player: Actor;
  hitStop: { isFrozen(actorId: string): boolean };
  requestAction(actor: Actor, actionName: "EnemyBasic", source: "ai", facing?: Facing): boolean;
}

// CRT-004: Map DNF reaction kinds to hit-reaction AI substates.
const FLINCH_REACTIONS = new Set<ReactionKind>([
  "light_stagger",
  "heavy_stagger",
  "knockback",
  "micro_stagger",
  "grabbed",
]);

const LAUNCH_REACTIONS = new Set<ReactionKind>([
  "launch",
  "air_hitstun",
]);

const KNOCKDOWN_REACTIONS = new Set<ReactionKind>([
  "falling",
  "downed",
]);

const GETUP_REACTIONS = new Set<ReactionKind>([
  "getting_up",
]);

/** CRT-004: Map actor.reactionState to the appropriate AI hit-reaction substate. */
function reactionToAIPhase(reaction: ReactionKind): "flinched" | "launched" | "knocked_down" | "getting_up" | null {
  if (FLINCH_REACTIONS.has(reaction)) return "flinched";
  if (LAUNCH_REACTIONS.has(reaction)) return "launched";
  if (KNOCKDOWN_REACTIONS.has(reaction)) return "knocked_down";
  if (GETUP_REACTIONS.has(reaction)) return "getting_up";
  return null;
}

/** CRT-004: Get duration in ticks for a hit-reaction substate from config.
 *  DNF classic feel defaults at 60fps (logicFps):
 *  - flinch: ~15-24 ticks (250-400ms)
 *  - launched: ~30-45 ticks (500-750ms)
 *  - knocked_down: ~60-90 ticks (1.0-1.5s)
 *  - getting_up: ~18 ticks (300ms) */
function getHitReactionDuration(state: EnemyAIState, phase: "flinched" | "launched" | "knocked_down" | "getting_up"): number {
  switch (phase) {
    case "flinched": return state.flinchDurationTicks ?? 20;
    case "launched": return state.launchDurationTicks ?? 36;
    case "knocked_down": return state.knockdownDurationTicks ?? 72;
    case "getting_up": return state.getupDurationTicks ?? 18;
  }
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

// ============================================================
// DNF 70-85 classic monster AI: FSM + behavior tree hybrid
// ============================================================

/** Deterministic pseudo-random value from tick + actorId. */
function deterministicRoll(tick: number, actorId: string): number {
  let hash = 2166136261;
  const str = `${tick}:${actorId}`;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function behaviorTreeBranch(state: EnemyAIState, tick: number, actorId: string): "chase" | "hold" | "retreat" {
  const weights = state.behaviorWeights ?? { chase: 60, hold: 25, retreat: 15 };
  const total = weights.chase + weights.hold + weights.retreat;
  if (total <= 0) return "chase";
  const roll = deterministicRoll(tick, actorId) * total;
  if (roll <= weights.chase) return "chase";
  if (roll <= weights.chase + weights.hold) return "hold";
  return "retreat";
}

function canSeePlayer(actor: Actor, state: EnemyAIState, kernel: EnemyAITickKernel): boolean {
  const dx = kernel.player.position.x - actor.position.x;
  const dz = kernel.player.position.z - actor.position.z;
  const sightRange = state.sightRange ?? state.detectRange;
  const detectDistance = Math.hypot(dx, dz * 1.8);
  return detectDistance <= sightRange;
}

export class EnemyAIController {
  private bossConfigs: Record<string, BossConfig>;
  private targetSwitchTimers: Map<string, number> = new Map();

  constructor(bossConfigs?: Record<string, BossConfig>) {
    this.bossConfigs = bossConfigs ?? {};
  }

  loadBossConfigs(configs: Record<string, BossConfig>): void {
    this.bossConfigs = configs;
  }

  tick(actor: Actor, kernel: EnemyAITickKernel): void {
    const state = actor.ai;
    if (!state) return;

    if (actor.flags.dead || state.detectRange <= 0 || kernel.player.flags.dead || kernel.player.resources.hp <= 0) {
      this.transition(state, "idle", kernel.tickCount);
      return;
    }
    if (kernel.hitStop.isFrozen(actor.id)) return;

    this.checkBossPhase(actor, state, kernel.tickCount);

    // CRT-004: Hit-reaction substate FSM — enter/exit transitions
    const reactionPhase = reactionToAIPhase(actor.reactionState);
    if (reactionPhase !== null) {
      if (state.phase !== reactionPhase) {
        this.transition(state, reactionPhase, kernel.tickCount);
        state.hitReactionTicksRemaining = getHitReactionDuration(state, reactionPhase);
        if (reactionPhase === "launched") {
          state.launchVelocityY = actor.velocity.y;
          state.launchGrounded = false;
        }
      }
      return;
    }
    // Actor is no longer in any hit reaction — if we were in one, recover
    if (isHitReactionPhase(state.phase)) {
      this.transition(state, "idle", kernel.tickCount);
      return;
    }
    if (kernel.hitStop.isFrozen(kernel.player.id)) return;
    if (actor.currentAction?.actionName === "EnemyBasic" && state.phase !== "attacking") this.transition(state, "attacking", kernel.tickCount);

    const dx = kernel.player.position.x - actor.position.x;
    const dz = kernel.player.position.z - actor.position.z;
    const distance = Math.abs(dx);
    const zDistance = Math.abs(dz);
    const zLaneTolerance = 14;
    const attackLineTolerance = 18;
    const detectDistance = Math.hypot(dx, dz * 1.8);

    const aggressiveness = state.aggressiveness ?? 50;
    const aggroMultiplier = 0.8 + (aggressiveness / 100) * 0.4;
    const effectiveDetectRange = state.detectRange * aggroMultiplier;

    if (state.phase !== "idle" && !isHitReactionPhase(state.phase) && detectDistance > state.loseAggroRange) {
      this.transition(state, "idle", kernel.tickCount);
      return;
    }

    switch (state.phase) {
      case "idle": {
        if (detectDistance <= effectiveDetectRange) {
          const longRangeChance = state.longRangeReactionChance ?? 0;
          const isLongRange = distance > state.attackRange;
          if (isLongRange && longRangeChance > 0 && deterministicRoll(kernel.tickCount, actor.id) * 100 > longRangeChance) {
            return;
          }
          this.transition(state, "approach", kernel.tickCount);
        }
        return;
      }
      case "approach": {
        actor.facing = dx >= 0 ? "right" : "left";
        actor.previousPosition = cloneVec3(actor.position);

        if (zDistance > zLaneTolerance) {
          const zSpeed = Math.max(1, state.moveSpeedPerTick * 0.72);
          actor.position.z += Math.sign(dz) * Math.min(Math.abs(dz), zSpeed);
          return;
        }

        if (distance <= state.attackRange && zDistance <= attackLineTolerance) {
          const branch = behaviorTreeBranch(state, kernel.tickCount, actor.id);
          switch (branch) {
            case "chase":
              this.transition(state, "windup", kernel.tickCount);
              return;
            case "hold":
              return;
            case "retreat":
              actor.position.x -= (actor.facing === "right" ? 1 : -1) * state.moveSpeedPerTick * 0.5;
              return;
          }
        }

        const canSee = canSeePlayer(actor, state, kernel);
        const speedMod = canSee ? 1.0 : 0.6;
        actor.position.x += (actor.facing === "right" ? 1 : -1) * state.moveSpeedPerTick * speedMod;
        if (zDistance > 2) actor.position.z += Math.sign(dz) * Math.min(Math.abs(dz), state.moveSpeedPerTick * 0.28);
        return;
      }
      case "windup": {
        actor.facing = dx >= 0 ? "right" : "left";
        if (zDistance > attackLineTolerance || distance > state.attackRange + 10) {
          this.transition(state, "approach", kernel.tickCount);
          return;
        }
        state.windupRemaining -= 1;
        if (state.windupRemaining > 0) return;
        const requested = kernel.requestAction(actor, "EnemyBasic", "ai", actor.facing);
        this.transition(state, requested ? "attacking" : "recover", kernel.tickCount);
        return;
      }
      case "attacking": {
        if (actor.currentAction?.actionName === "EnemyBasic") return;
        this.targetSwitchTimers.set(actor.id, kernel.tickCount + (state.targetSwitchTime ?? 60));
        this.transition(state, "recover", kernel.tickCount);
        return;
      }
      case "recover": {
        state.recoverRemaining -= 1;
        if (state.recoverRemaining <= 0) {
          const switchReady = (this.targetSwitchTimers.get(actor.id) ?? 0) <= kernel.tickCount;
          this.transition(state, switchReady ? "idle" : "recover", kernel.tickCount);
        }
        return;
      }
      // CRT-004: Hit-reaction substates
      case "flinched": {
        if (state.hitReactionTicksRemaining !== undefined) {
          state.hitReactionTicksRemaining -= 1;
          if (state.hitReactionTicksRemaining > 0) return;
        }
        return;
      }
      case "launched": {
        if (state.hitReactionTicksRemaining !== undefined) {
          state.hitReactionTicksRemaining -= 1;
          if (state.hitReactionTicksRemaining <= 0) {
            actor.position.y = 0;
            actor.velocity.y = 0;
            this.transition(state, "knocked_down", kernel.tickCount);
            state.hitReactionTicksRemaining = getHitReactionDuration(state, "knocked_down");
          }
        }
        return;
      }
      case "knocked_down": {
        if (state.hitReactionTicksRemaining !== undefined) {
          state.hitReactionTicksRemaining -= 1;
          if (state.hitReactionTicksRemaining > 0) return;
        }
        this.transition(state, "getting_up", kernel.tickCount);
        state.hitReactionTicksRemaining = getHitReactionDuration(state, "getting_up");
        return;
      }
      case "getting_up": {
        if (state.hitReactionTicksRemaining !== undefined) {
          state.hitReactionTicksRemaining -= 1;
          if (state.hitReactionTicksRemaining > 0) return;
        }
        state.launchVelocityY = undefined;
        state.launchGrounded = undefined;
        return;
      }
      default:
        return;
    }
  }

  private checkBossPhase(actor: Actor, state: EnemyAIState, tick: number): void {
    const bossId = state.bossPhase !== undefined ? (actor.type === "boss" ? "bull" : undefined) : undefined;
    if (!bossId) return;

    const config = this.bossConfigs[bossId];
    if (!config) return;

    const hpPercent = (actor.resources.hp / config.maxHp) * 100;
    const currentPhase = state.bossPhase ?? 1;

    for (const phase of config.phases) {
      if (phase.phase > currentPhase && hpPercent <= phase.triggerHpPercent) {
        state.bossPhase = phase.phase;
        state.bossPhaseEnteredTick = tick;
        state.currentPattern = phase.enterPattern;
        state.patternWeights = Object.fromEntries(
          phase.patterns.map(p => [p.name, p.weight])
        );
        return;
      }
    }
  }

  selectBossPattern(state: EnemyAIState, tick: number = 0): BossPattern | undefined {
    const bossId = state.bossPhase !== undefined ? "bull" : undefined;
    if (!bossId) return undefined;

    const config = this.bossConfigs[bossId];
    if (!config) return undefined;

    const phase = config.phases.find(p => p.phase === state.bossPhase);
    if (!phase) return undefined;

    const patterns = phase.patterns;
    const totalWeight = patterns.reduce((sum, p) => sum + p.weight, 0);
    let roll = deterministicRoll(tick, state.bossPhaseEnteredTick?.toString() ?? "0") * totalWeight;
    for (const pattern of patterns) {
      roll -= pattern.weight;
      if (roll <= 0) return pattern;
    }
    return patterns[0];
  }

  private transition(state: EnemyAIState, phase: EnemyAIState["phase"], tick: number): void {
    state.phase = phase;
    state.phaseEnteredTick = tick;
    state.windupRemaining = phase === "windup" ? state.preAttackFrames : 0;
    state.recoverRemaining = phase === "recover" ? state.postCooldown : 0;
  }
}
