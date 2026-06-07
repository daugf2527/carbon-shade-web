/**
 * HitStopSystem.ts — decrements per-actor hit-stop freeze (Stage 4C).
 *
 * Phase FLUSH (last): after every domain system ran this tick, decrement each actor's
 * frozenFrames. The `frames + 1` offset in applyHitStop compensates for this end-of-tick
 * decrement so "N freeze frames" pauses the actor for N ticks.
 *
 * Frozen actors are skipped by every time-advancing system (they check actor.frozenFrames > 0).
 * This system only ticks the counter down; it never sets it (CombatResolutionSystem does, on hit).
 *
 * Determinism: pure counter decrement; frozenFrames folds into computeStateHash when >0.
 */
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

export class HitStopSystem implements EngineSystem {
  readonly name = "HitStop";
  readonly phase = "FLUSH" as const;

  tick(ctx: EngineContext): void {
    for (const actor of ctx.actors) {
      if (actor.frozenFrames > 0) {
        actor.frozenFrames--;
        if (actor.frozenFrames === 0) {
          ctx.bus.emit("HitStopEnded", { actorId: actor.id });
        }
      }
    }
  }
}
