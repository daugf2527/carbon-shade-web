import type { Actor } from "../types.js";
import type { MovementInputSnapshot } from "./MovementInputProvider.js";

export interface LocomotionControllerOptions {
  walkSpeed: number;
  runSpeed: number;
}

const defaultOptions: LocomotionControllerOptions = {
  walkSpeed: 2.75,
  runSpeed: 8.5,
};

const freeMovementReactions = new Set(["none", "getting_up"]);

/**
 * DNF-like baseline locomotion.
 *
 * Walk/Run are no longer frame-data actions. They are a direct movement layer
 * that updates position from held input while combat actions, hitstop and hit
 * reactions own their own lockout/root-motion rules.
 */
export class LocomotionController {
  constructor(private readonly options: LocomotionControllerOptions = defaultOptions) {}

  apply(actor: Actor, movement: MovementInputSnapshot, frozen: boolean): void {
    actor.locomotion.xDirection = movement.xDirection;
    actor.locomotion.zDirection = movement.zDirection;
    actor.locomotion.speedScale = movement.speedScale;

    if (actor.flags.dead || frozen || actor.currentAction) {
      actor.locomotion.mode = "idle";
      return;
    }

    if (actor.reactionState === "downed" && actor.handfeel.downRemaining <= 0) {
      actor.reactionState = "none";
    }

    if (!freeMovementReactions.has(actor.reactionState)) {
      actor.locomotion.mode = "idle";
      return;
    }

    if (movement.xDirection === 0 && movement.zDirection === 0) {
      actor.locomotion.mode = "idle";
      return;
    }

    if (movement.xDirection !== 0) {
      actor.facing = movement.xDirection < 0 ? "left" : "right";
    }

    const canRun = actor.locomotion.mode === "run" && movement.xDirection !== 0;
    const mode = canRun ? "run" : "walk";
    const speed = (mode === "run" ? this.options.runSpeed : this.options.walkSpeed) * movement.speedScale;

    actor.previousPosition = { ...actor.position };
    actor.position.x += speed * movement.xDirection;
    actor.position.z += speed * movement.zDirection;
    actor.locomotion.mode = mode;
  }

  armRun(actor: Actor, facing: "left" | "right"): void {
    actor.locomotion.mode = "run";
    actor.locomotion.lastRunDirection = facing;
    actor.facing = facing;
  }

  armWalk(actor: Actor, facing?: "left" | "right"): void {
    if (facing) actor.facing = facing;
    if (actor.locomotion.mode !== "run") actor.locomotion.mode = "walk";
  }

  stop(actor: Actor): void {
    actor.locomotion.mode = "idle";
    actor.locomotion.xDirection = 0;
    actor.locomotion.zDirection = 0;
    actor.locomotion.speedScale = 1;
  }
}
