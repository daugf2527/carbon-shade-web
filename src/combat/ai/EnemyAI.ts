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

export class EnemyAIController {
  tick(actor: Actor, kernel: EnemyAITickKernel): void {
    const state = actor.ai;
    if (!state) return;

    if (actor.flags.dead || state.detectRange <= 0 || kernel.player.flags.dead || kernel.player.resources.hp <= 0) {
      this.transition(state, "idle", kernel.tickCount);
      return;
    }
    if (kernel.hitStop.isFrozen(actor.id)) return;

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

    if (state.phase !== "idle" && detectDistance > state.loseAggroRange) {
      this.transition(state, "idle", kernel.tickCount);
      return;
    }

    switch (state.phase) {
      case "idle": {
        if (detectDistance <= state.detectRange) this.transition(state, "approach", kernel.tickCount);
        return;
      }
      case "approach": {
        actor.facing = dx >= 0 ? "right" : "left";
        actor.previousPosition = cloneVec3(actor.position);

        if (zDistance > zLaneTolerance) {
          actor.position.z += Math.sign(dz) * Math.min(Math.abs(dz), Math.max(1, state.moveSpeedPerTick * 0.72));
          return;
        }

        if (distance <= state.attackRange && zDistance <= attackLineTolerance) {
          this.transition(state, "windup", kernel.tickCount);
          return;
        }

        actor.position.x += (actor.facing === "right" ? 1 : -1) * state.moveSpeedPerTick;
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
        this.transition(state, "recover", kernel.tickCount);
        return;
      }
      case "recover": {
        state.recoverRemaining -= 1;
        if (state.recoverRemaining <= 0) this.transition(state, "idle", kernel.tickCount);
        return;
      }
      case "stunned":
      default:
        return;
    }
  }

  private transition(state: EnemyAIState, phase: EnemyAIState["phase"], tick: number): void {
    state.phase = phase;
    state.phaseEnteredTick = tick;
    state.windupRemaining = phase === "windup" ? state.preAttackFrames : 0;
    state.recoverRemaining = phase === "recover" ? state.postCooldown : 0;
  }
}
