/**
 * InputSystem.ts — 01-Input domain system (P3.0).
 *
 * Reads each actor's per-tick intent (Actor.intent — written by the scene / InputRecorder
 * for the player, or by AI for monsters) and turns it into ActionSystem requests + facing
 * updates. This is the engine-side input layer; it's decoupled from CombatScene's
 * BrowserInputState (which stays in the Phaser layer and only writes abstract intent).
 *
 * Phase INPUT, registered BEFORE ActionSystem isn't required — both are INPUT phase and
 * this only enqueues a request that ActionSystem (also INPUT) drains the SAME tick because
 * the kernel runs same-phase systems in insertion order. Register InputSystem before
 * ActionSystem so the attack request lands before ActionSystem drains.
 *
 * Determinism: pure read of actor.intent, no Math.random / wall-clock.
 */
import type { ActionSystem } from "./ActionSystem.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

export class InputSystem implements EngineSystem {
  readonly name = "Input";
  readonly phase = "INPUT" as const;

  /** Action name requested when intent.attack is set. */
  constructor(
    private readonly actions: ActionSystem,
    private readonly attackAction = "attack",
  ) {}

  tick(ctx: EngineContext): void {
    for (const actor of ctx.actors) {
      const intent = actor.intent;
      if (intent.dir !== 0) actor.facing = intent.dir;
      if (intent.attack) {
        this.actions.request(actor.id, this.attackAction);
      }
    }
  }
}
