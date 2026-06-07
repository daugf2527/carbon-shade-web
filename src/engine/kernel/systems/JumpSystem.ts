/**
 * JumpSystem.ts — active jump domain system (Stage 4A).
 *
 * Reads actor.intent.button === "jump" and launches the actor airborne using
 * stats.jumpPower as the initial vertical velocity. Only grounded actors in
 * mobile states (IDLE/READY) can jump — already airborne / attacking / hitstun
 * actors are blocked.
 *
 * Phase INPUT (after MovementSystem, before ActionSystem). Uses the existing
 * AirbornePhysicsSystem (launchAirborne) for the actual trajectory; AirborneSystem
 * (CLEANUP phase) integrates gravity each subsequent tick.
 *
 * Determinism: pure read of intent + stats, no Math.random / wall-clock.
 */
import { ActorState } from "../../core/ActorStateMachine.js";
import { launchAirborne } from "../../core/AirbornePhysicsSystem.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

const JUMPABLE_STATES = new Set<string>([
  ActorState.IDLE,
  ActorState.READY,
]);

export class JumpSystem implements EngineSystem {
  readonly name = "Jump";
  readonly phase = "INPUT" as const;

  tick(ctx: EngineContext): void {
    for (const actor of ctx.actors) {
      if (actor.isDead) continue;
      if (!JUMPABLE_STATES.has(actor.fsm.state)) continue;
      if (actor.airborne?.active) continue;
      if (actor.intent.button !== "jump") continue;
      const jp = actor.stats.jumpPower;
      if (!jp) continue;
      actor.airborne = launchAirborne(jp, actor.y);
      actor.y = actor.airborne.y;
      ctx.bus.emit("ActorJumped", { actorId: actor.id, jumpPower: jp });
    }
  }
}
