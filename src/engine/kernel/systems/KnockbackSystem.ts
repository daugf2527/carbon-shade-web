/**
 * KnockbackSystem.ts — horizontal knockback integration domain system (P4-GAP fill).
 *
 * The horizontal twin of AirborneSystem. CombatResolutionSystem sets defender.knockback =
 * applyKnockback(vx) on a hit that carries horizontal push; this system advances the slide each
 * tick (x += vx*dt; vx *= friction) via tickKnockback and syncs the result onto actor.x. When the
 * slide stops (|vx| below threshold) the handle is cleared.
 *
 * Phase CLEANUP: physics integrates after detection/reaction settled this tick (same as
 * AirborneSystem). actor.x participates in the kernel stateHash, so knockback slides are
 * replay-deterministic. Pure integration, no randomness.
 */
import { tickKnockback } from "../../core/KnockbackPhysics.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

export class KnockbackSystem implements EngineSystem {
  readonly name = "Knockback";
  readonly phase = "CLEANUP" as const;

  tick(ctx: EngineContext): void {
    for (const actor of ctx.actors) {
      if (actor.knockback?.active) {
        const stopped = tickKnockback(actor.knockback, ctx.tickMs);
        actor.x = actor.knockback.x;
        if (stopped) actor.knockback = null;
      }
    }
  }
}
