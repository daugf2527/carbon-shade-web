import type { Actor, FrameDataAction } from "../types.js";
import { signedFacingScale } from "../util/geometry.js";

/** Root motion is reserved for committed combat actions, not base walk/run. */
export class RootMotionController {
  apply(actor: Actor, action: FrameDataAction): void {
    const inst = actor.currentAction;
    if (!inst || !action.rootMotion) return;
    const facingScale = signedFacingScale(inst.lockedFacing ?? actor.facing);

    if (action.rootMotion.appliesEveryFrame && typeof action.rootMotion.speedXPerTick === "number") {
      actor.position.x += action.rootMotion.speedXPerTick * facingScale;
    }

    for (const step of action.rootMotion.frames.filter(s => s.frame === inst.localFrame)) {
      actor.position.x += step.dx * facingScale;
      actor.position.z += step.dz;
      actor.position.y += step.dy ?? 0;
    }
  }
}
