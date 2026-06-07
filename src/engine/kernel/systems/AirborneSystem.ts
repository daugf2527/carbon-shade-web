/**
 * AirborneSystem.ts — 07-Physics (airborne/launch) domain system (P3.0).
 *
 * Integrates gravity for actors launched by liftUp attacks. CombatResolutionSystem sets
 * defender.airborne = launchAirborne(liftVy) on a liftUp hit; this system advances the
 * trajectory each tick (vy += GRAVITY*dt; y += vy*dt) via tickAirborne and syncs height
 * onto actor.y. On landing (y<=0) the airborne handle is cleared.
 *
 * FSM recovery from AIRBORNE is driven by HitstunSystem's reaction timer — physics height
 * (actor.y) and state-recovery timer are decoupled in P3.0 (a known simplification; real
 * DNF ties down-state to the landing frame).
 *
 * Gravity is the DNF truth value (-1500 game units/s²) inside tickAirborne. Phase CLEANUP:
 * physics integrates after detection/reaction settled this tick. actor.y participates in
 * the kernel stateHash, so launch trajectories are replay-deterministic.
 */
import { tickAirborne } from "../../core/AirbornePhysicsSystem.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

export class AirborneSystem implements EngineSystem {
  readonly name = "Airborne";
  readonly phase = "CLEANUP" as const;

  tick(ctx: EngineContext): void {
    for (const actor of ctx.actors) {
      if (actor.frozenFrames > 0) continue; // hit-stop: gravity pauses while frozen (mid-air freeze)
      if (actor.airborne?.active) {
        const landed = tickAirborne(actor.airborne, ctx.tickMs);
        actor.y = actor.airborne.y;
        if (landed) actor.airborne = null;
      }
    }
  }
}
