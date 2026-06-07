/**
 * HitstunSystem.ts — ticks down each actor's hit-reaction (P3.0).
 *
 * Phase RESOLVE: after detection/reaction were applied this tick, advance hitstun
 * timers. When a reaction expires, tickReaction transitions the actor's FSM back to
 * IDLE (or forces DEAD if hp<=0), and the spent reaction handle is cleared.
 *
 * Reaction state lives on the Actor (actor.reaction), a per-actor work field like fsm —
 * so CombatResolutionSystem (writer) and HitstunSystem (ticker) share it without
 * crossing the read-only EngineContext.
 */
import { tickReaction } from "../../core/ReactionResolver.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

export class HitstunSystem implements EngineSystem {
  readonly name = "Hitstun";
  readonly phase = "RESOLVE" as const;

  tick(ctx: EngineContext): void {
    for (const actor of ctx.actors) {
      if (actor.frozenFrames > 0) continue; // hit-stop: hitstun timer pauses while frozen
      const r = actor.reaction;
      if (r?.active) {
        tickReaction(actor, r, ctx.tickCount);
        if (!r.active) actor.reaction = null;
      }
    }
  }
}
