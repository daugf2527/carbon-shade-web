import type { Actor, Facing, ReactionKind } from "../types.js";
import { cloneVec3 } from "../util/geometry.js";
import type { EnemyAIState } from "./EnemyAIState.js";

export interface EnemyAITickKernel {
  tickCount: number;
  player: Actor;
  hitStop: { isFrozen(actorId: string): boolean };
  requestAction(actor: Actor, actionName: "EnemyBasic", source: "ai", facing?: Facing): boolean;
}

const stunnedReactions = new Set<ReactionKind>([
  "light_stagger",
  "heavy_stagger",
  "knockback",
  "launch",
  "air_hitstun",
  "falling",
  "downed",
  "getting_up",
  "grabbed",
]);

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
// Evidence: docs/research/combat/dnf-dfo-combat-frame-ai-implementation-report.md
// DNF stores monster AI parameters in PVF .ai / .monster files.
// The runtime uses a layered decision model:
//   Layer 1: FSM states (Idle/Chase/Attack/Hurt/Death) — deterministic transitions
//   Layer 2: Behavior tree nodes (sight/aggro/range/cooldown/random-branch) — weighted decisions
//   Layer 3: Boss scripts (phase triggers, forced transitions, pattern sequences) — scripted
//
// Parameters loaded from manifest (ai/enemy-default.json):
//   - sightRange: max visual detection distance (distinct from detectRange for aggro)
//   - aggressiveness: 0-100, affects approach speed and retreat threshold
//   - targetSwitchTime: frames before re-evaluating target
//   - longRangeReactionChance: % chance to react when beyond attackRange
//   - behaviorWeights: { chase, hold, retreat } — weighted random branch selection
//
// Determinism note: instead of Math.random(), we use a deterministic hash of
// (tick + actorId) to drive weighted branch selection. This keeps combat replay
// and fuzz-test determinism while producing varied-looking AI behavior.

/** Deterministic pseudo-random value from tick + actorId.
 *  Uses a simple hash to produce 0–1 range from deterministic inputs. */
function deterministicRoll(tick: number, actorId: string): number {
  // FNV-1a style hash: mix tick and actorId bytes
  let hash = 2166136261;
  const str = `${tick}:${actorId}`;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Normalize to 0–1 range
  return ((hash >>> 0) % 10000) / 10000;
}

/** Execute a DNF-style behavior tree decision node.
 *  Uses weighted selection from manifest behaviorWeights,
 *  driven by a deterministic pseudo-random roll. */
function behaviorTreeBranch(state: EnemyAIState, tick: number, actorId: string): "chase" | "hold" | "retreat" {
  const weights = state.behaviorWeights ?? { chase: 60, hold: 25, retreat: 15 };
  const total = weights.chase + weights.hold + weights.retreat;
  if (total <= 0) return "chase";

  const roll = deterministicRoll(tick, actorId) * total;
  if (roll <= weights.chase) return "chase";
  if (roll <= weights.chase + weights.hold) return "hold";
  return "retreat";
}

/** DNF sight check: enemy can only "see" the player if within sightRange.
 *  sightRange is separate from detectRange — sight is visual, detect is aggro trigger. */
function canSeePlayer(actor: Actor, state: EnemyAIState, kernel: EnemyAITickKernel): boolean {
  const dx = kernel.player.position.x - actor.position.x;
  const dz = kernel.player.position.z - actor.position.z;
  const sightRange = state.sightRange ?? state.detectRange;
  const detectDistance = Math.hypot(dx, dz * 1.8);
  return detectDistance <= sightRange;
}

export class EnemyAIController {
  private bossConfigs: Record<string, BossConfig>;
  // DNF target-switch timer: prevents thrashing between targets
  private targetSwitchTimers: Map<string, number> = new Map();

  constructor(bossConfigs?: Record<string, BossConfig>) {
    this.bossConfigs = bossConfigs ?? {};
  }

  /** Load boss patterns from manifest data (Phase 5) */
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

    // Phase 5: Boss phase transition check
    this.checkBossPhase(actor, state, kernel.tickCount);

    if (stunnedReactions.has(actor.reactionState)) {
      if (state.phase !== "stunned") this.transition(state, "stunned", kernel.tickCount);
      return;
    }
    if (state.phase === "stunned") this.transition(state, "idle", kernel.tickCount);
    if (kernel.hitStop.isFrozen(kernel.player.id)) return;
    if (actor.currentAction?.actionName === "EnemyBasic" && state.phase !== "attacking") this.transition(state, "attacking", kernel.tickCount);

    const dx = kernel.player.position.x - actor.position.x;
    const dz = kernel.player.position.z - actor.position.z;
    const distance = Math.abs(dx);
    const zDistance = Math.abs(dz);
    const zLaneTolerance = 14;
    const attackLineTolerance = 18;
    const detectDistance = Math.hypot(dx, dz * 1.8);

    // DNF aggressiveness modifier: higher aggressiveness = larger effective detect range
    const aggressiveness = state.aggressiveness ?? 50;
    const aggroMultiplier = 0.8 + (aggressiveness / 100) * 0.4; // 0.8x ~ 1.2x
    const effectiveDetectRange = state.detectRange * aggroMultiplier;

    if (state.phase !== "idle" && detectDistance > state.loseAggroRange) {
      this.transition(state, "idle", kernel.tickCount);
      return;
    }

    switch (state.phase) {
      case "idle": {
        // DNF: idle → approach only if within detect range (modified by aggressiveness)
        if (detectDistance <= effectiveDetectRange) {
          // DNF long-range reaction: chance to react even beyond standard attack range
          const longRangeChance = state.longRangeReactionChance ?? 0;
          const isLongRange = distance > state.attackRange;
          if (isLongRange && longRangeChance > 0 && deterministicRoll(kernel.tickCount, actor.id) * 100 > longRangeChance) {
            return; // failed long-range reaction check, stay idle
          }
          this.transition(state, "approach", kernel.tickCount);
        }
        return;
      }
      case "approach": {
        actor.facing = dx >= 0 ? "right" : "left";
        actor.previousPosition = cloneVec3(actor.position);

        // DNF: line up on Z axis first before closing on X
        if (zDistance > zLaneTolerance) {
          const zSpeed = Math.max(1, state.moveSpeedPerTick * 0.72);
          actor.position.z += Math.sign(dz) * Math.min(Math.abs(dz), zSpeed);
          return;
        }

        // DNF behavior tree: evaluate branch before committing to attack
        if (distance <= state.attackRange && zDistance <= attackLineTolerance) {
          const branch = behaviorTreeBranch(state, kernel.tickCount, actor.id);
          switch (branch) {
            case "chase":
              // Close in further and attack
              this.transition(state, "windup", kernel.tickCount);
              return;
            case "hold":
              // Stay at current distance, re-evaluate next tick
              return;
            case "retreat":
              // Back away slightly, stay in approach
              actor.position.x -= (actor.facing === "right" ? 1 : -1) * state.moveSpeedPerTick * 0.5;
              return;
          }
        }

        // Move toward player (DNF: use sight check to decide movement speed)
        const canSee = canSeePlayer(actor, state, kernel);
        const speedMod = canSee ? 1.0 : 0.6; // slower when player not in sight
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
        // DNF: after attack completes, apply target switch cooldown before re-engaging
        this.targetSwitchTimers.set(actor.id, kernel.tickCount + (state.targetSwitchTime ?? 60));
        this.transition(state, "recover", kernel.tickCount);
        return;
      }
      case "recover": {
        state.recoverRemaining -= 1;
        if (state.recoverRemaining <= 0) {
          // DNF: target switch time must elapse before re-entering approach
          const switchReady = (this.targetSwitchTimers.get(actor.id) ?? 0) <= kernel.tickCount;
          this.transition(state, switchReady ? "idle" : "recover", kernel.tickCount);
        }
        return;
      }
      case "stunned":
      default:
        return;
    }
  }

  /** Phase 5: Check and handle boss phase transitions based on HP thresholds */
  private checkBossPhase(actor: Actor, state: EnemyAIState, tick: number): void {
    const bossId = state.bossPhase !== undefined ? (actor.type === "boss" ? "bull" : undefined) : undefined;
    if (!bossId) return;

    const config = this.bossConfigs[bossId];
    if (!config) return;

    const hpPercent = (actor.resources.hp / config.maxHp) * 100;
    const currentPhase = state.bossPhase ?? 1;

    // Find next phase that should trigger
    for (const phase of config.phases) {
      if (phase.phase > currentPhase && hpPercent <= phase.triggerHpPercent) {
        // Transition to new phase
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

  /** Phase 5: Select a boss pattern using weighted random selection.
   *  @param tick - deterministic tick for replay-consistent weighted roll */
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
