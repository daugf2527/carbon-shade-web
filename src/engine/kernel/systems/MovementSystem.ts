/**
 * MovementSystem.ts — horizontal + depth movement domain system (Stage 4A).
 *
 * Reads actor.intent.dir (X axis) and intent.zDir (Z depth axis) and applies
 * stats.moveSpeed as displacement. Z speed is halved (DNF convention: depth
 * movement is slower than horizontal). Only mobile states move; airborne/
 * attack/hitstun/dead suppress movement.
 *
 * Phase INPUT, registered AFTER InputSystem (so facing is already updated).
 *
 * Determinism: pure read of intent + stats, fractional px via tickMs.
 */
import { ActorState } from "../../core/ActorStateMachine.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

const Z_SPEED_RATIO = 0.5;

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
    const dt = ctx.tickMs / 1000;
    for (const actor of ctx.actors) {
      if (actor.isDead) continue;
      if (!MOBILE_STATES.has(actor.fsm.state)) continue;
      if (actor.airborne?.active) continue;
      const speed = actor.stats.moveSpeed;
      const dir = actor.intent.dir;
      if (dir !== 0) actor.x += dir * speed * dt;
      const zDir = actor.intent.zDir ?? 0;
      if (zDir !== 0) actor.z += zDir * speed * Z_SPEED_RATIO * dt;
    }
  }
}
