/**
 * MovementSystem.ts — horizontal movement domain system (Stage 4A).
 *
 * Reads actor.intent.dir and applies stats.moveSpeed as horizontal displacement
 * on actor.x. Only actors in mobile states (IDLE/READY/CHASE/RETREAT) move;
 * ATTACK/HIT/DOWN/AIRBORNE/DEAD suppress movement (attack commitment / hitstun).
 *
 * Phase INPUT, registered AFTER InputSystem (so facing is already updated).
 *
 * Determinism: pure read of intent + stats, fractional px via tickMs.
 */
import { ActorState } from "../../core/ActorStateMachine.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

const MOBILE_STATES = new Set<string>([
  ActorState.IDLE,
  ActorState.READY,
  ActorState.CHASE,
  ActorState.RETREAT,
]);

export class MovementSystem implements EngineSystem {
  readonly name = "Movement";
  readonly phase = "INPUT" as const;

  tick(ctx: EngineContext): void {
    const dt = ctx.tickMs / 1000; // seconds per tick (1/60 ≈ 0.01667)
    for (const actor of ctx.actors) {
      if (actor.isDead) continue;
      if (!MOBILE_STATES.has(actor.fsm.state)) continue;
      const dir = actor.intent.dir;
      if (dir === 0) continue;
      actor.x += dir * actor.stats.moveSpeed * dt;
    }
  }
}
