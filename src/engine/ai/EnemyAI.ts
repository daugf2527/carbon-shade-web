/**
 * EnemyAI.ts — Threshold-based AI: IDLE→CHASE→ATTACK→RETREAT (Phase 4 T4.3)
 */

import { Actor } from "../core/Actor.js";
import { ActorState } from "../core/ActorStateMachine.js";

export interface AIConfig {
  readonly sightRange: number;  // px
  readonly warlike: number;     // 0-100, aggression threshold
  readonly attackRange: number; // px, when to switch CHASE→ATTACK
  readonly attackDelayMs: number;
}

export interface AIContext {
  readonly nowMs: number;
  readonly distToTarget: number;
}

export class EnemyAI {
  private lastAttackMs = -Infinity;

  constructor(
    private readonly actor: Actor,
    private readonly cfg: AIConfig,
  ) {}

  update(ctx: AIContext, tick: number): void {
    const { distToTarget, nowMs } = ctx;
    const state = this.actor.fsm.state;

    // Dead or in hitstun — don't override
    if (state === ActorState.DEAD || state === ActorState.HIT || state === ActorState.DOWN) return;

    const inSight = distToTarget <= this.cfg.sightRange;
    const inAttackRange = distToTarget <= this.cfg.attackRange;
    const cooldownReady = nowMs - this.lastAttackMs >= this.cfg.attackDelayMs;

    const fsmCtx = {
      tick,
      hp: this.actor.hp,
      maxHp: this.actor.stats.hpMax,
      inputAttack: false,
      hitReceived: false,
      knockedDown: false,
      launchedAirborne: false,
      animationDone: false,
      targetInRange: inAttackRange,
      targetInSight: inSight,
    };

    if (inAttackRange && cooldownReady) {
      fsmCtx.inputAttack = true;
      this.lastAttackMs = nowMs;
      this.actor.fsm.update({ ...fsmCtx, inputAttack: true });
    } else if (inSight) {
      this.actor.fsm.update(fsmCtx);
    } else if (state === ActorState.CHASE) {
      // Lost sight — retreat
      this.actor.fsm.update(fsmCtx);
    }
  }
}

/** Parse AIConfig from mob shard. */
export function parseAIConfig(mob: Record<string, unknown>): AIConfig {
  const scalarVal = (f: unknown): number => {
    if (f == null) return 0;
    if (typeof f === "number") return f;
    const r = f as Record<string, unknown>;
    if (typeof r.value === "number") return r.value;
    if (Array.isArray(r.values)) return r.values[0] as number;
    return 0;
  };
  return {
    sightRange: scalarVal(mob.sight),
    warlike: scalarVal(mob.warlike),
    attackRange: 80, // px — standard melee range
    attackDelayMs: scalarVal(mob.attackDelay),
  };
}
