/**
 * StatusSystem.ts — 09-Status DOT domain system (bleed), kernel-integrated (09-Status).
 *
 * Phase CLEANUP: after detection/reaction/hitstun settled this tick, advance every actor's
 * active status effects (StatusEffects.tickStatus): expire elapsed ones, deal interval DOT,
 * and — if DOT drops an actor to 0 hp — force its FSM to DEAD and emit the same ActorDied /
 * DamageNumberRequested events CombatResolutionSystem emits, so death-by-bleed flows through
 * the existing scene/evidence consumers identically to death-by-hit.
 *
 * Determinism: stable actor iteration + tick-based intervals (no wall clock, no randomness);
 * actor.hp + statusFingerprint participate in the kernel stateHash via snapshot(), so DOT is
 * replay-deterministic. Apply path: StatusSystem.requestBleed(actorId) queues a bleed that is
 * applied at the next tick (mirrors ActionSystem's request→dispatch queue).
 */
import { ActorState } from "../../core/ActorStateMachine.js";
import { applyBleed, tickStatus } from "../../core/StatusEffects.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

export class StatusSystem implements EngineSystem {
  readonly name = "Status";
  readonly phase = "CLEANUP" as const;

  // Pending bleed applications (actorId), drained each tick (deterministic, ActionSystem-style).
  private pendingBleed = new Set<string>();

  /** Queue a bleed application on an actor; applied at the start of the next tick. */
  requestBleed(actorId: string): void {
    this.pendingBleed.add(actorId);
  }

  tick(ctx: EngineContext): void {
    // 1. Apply queued bleeds (before ticking, so the freshly-applied stack is live this frame).
    if (this.pendingBleed.size > 0) {
      for (const actor of ctx.actors) {
        if (this.pendingBleed.has(actor.id) && !actor.isDead) {
          applyBleed(actor, ctx.tickCount);
        }
      }
      this.pendingBleed.clear();
    }

    // 2. Tick DOT on every actor; handle death-by-bleed identically to death-by-hit.
    for (const actor of ctx.actors) {
      if (actor.isDead || actor.statusEffects.length === 0) continue;
      const dot = tickStatus(actor, ctx.tickCount);
      if (dot <= 0) continue;

      ctx.bus.emit("DamageNumberRequested", { actorId: actor.id, amount: dot, source: "bleed", tick: ctx.tickCount });
      if (ctx.scenario) ctx.scenario.bleedObserved = true;

      if (actor.isDead && actor.fsm.state !== ActorState.DEAD) {
        actor.fsm.force(ActorState.DEAD, ctx.tickCount);
        actor.statusEffects.length = 0; // death_clear dispel policy
        ctx.bus.emit("ActorDied", { targetActorId: actor.id, actorId: actor.id, source: "bleed", tick: ctx.tickCount });
      }
    }
  }

  /** Per-actor status state (actor.hp + statusFingerprint) is folded into the kernel stateHash
   *  by EngineKernel.computeStateHash, so this system needs no own snapshot(). */
  reset(): void {
    this.pendingBleed.clear();
  }
}
