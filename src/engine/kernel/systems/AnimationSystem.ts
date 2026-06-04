/**
 * AnimationSystem.ts — 05-Animation domain system (P3.0).
 *
 * Drives every actor's per-actor AnimationPlayer one tick. The advanced frame's
 * attackBoxes/damageBoxes are then read by CombatResolutionSystem (DETECTION phase).
 * Phase LOGIC so animation advances before hit detection within the same tick.
 *
 * Also closes the ATTACK→IDLE loop: when a non-looping animation finishes while the actor
 * is in ATTACK, it drives the FSM with animationDone so the actor becomes interruptible
 * again (can attack next). HIT/DOWN/AIRBORNE recovery is owned by HitstunSystem /
 * AirborneSystem, so this only fires for ATTACK to avoid double-driving the FSM.
 *
 * This is the first real domain system wired into EngineKernel (replacing P1's
 * test-only mock systems) — proves the kernel drives actual combat logic, not stubs.
 */
import { ActorState } from "../../core/ActorStateMachine.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

export class AnimationSystem implements EngineSystem {
  readonly name = "Animation";
  readonly phase = "LOGIC" as const;

  tick(ctx: EngineContext): void {
    for (const actor of ctx.actors) {
      if (!actor.animationPlayer.isPlaying) continue;
      const finished = actor.animationPlayer.update(ctx.tickMs);
      if (finished && actor.fsm.state === ActorState.ATTACK) {
        actor.fsm.update({
          tick: ctx.tickCount,
          hp: actor.hp,
          maxHp: actor.stats.hpMax,
          inputAttack: false,
          hitReceived: false,
          knockedDown: false,
          launchedAirborne: false,
          animationDone: true,
          targetInRange: false,
          targetInSight: false,
        });
      }
    }
  }
}

