// AirbornePhysicsSystem — Fallback gravity for non-reaction airborne actors.
//
// Why: ReactionMotionSystem only applies gravity during launch/falling/knockback/
// downed states. Players using normal Jump (reactionState === "none") have NO
// system applying gravity once their action ends — they get stuck mid-air if
// Jump is cancelled before its descent frames execute.
//
// This system applies DNF's verified gravity (-1500 px/s² = -0.417 px/tick² at
// 60 Hz, source: pvf:sqr/dnf_enum_header.nut) to any actor that is airborne
// AND not in a reaction state. The boundary with ReactionMotionSystem is
// exclusive — reaction states are handled there, "none" is handled here.

import type { CombatSystem } from "../kernel/CombatSystem.js";
import type { SystemContext } from "../kernel/SystemContext.js";
import type { CombatEventBus } from "../events/CombatEventBus.js";
import { cloneVec3 } from "../util/geometry.js";
import { DNF_GRAVITY_PER_TICK_60HZ } from "../../data/official/dnf/physics.js";

const G_PER_TICK = DNF_GRAVITY_PER_TICK_60HZ.value;

export class AirbornePhysicsSystem implements CombatSystem {
  readonly name = "AirbornePhysics";
  readonly phase = "DETECTION" as const;

  tick(ctx: SystemContext, _bus: CombatEventBus): void {
    for (const a of ctx.actors) {
      if (a.flags.dead) continue;
      if (ctx.hitStop.isFrozen(a.id)) continue;
      // Reaction states own their own gravity via ReactionMotionSystem.
      if (a.reactionState !== "none") continue;
      // Actions own their own y trajectory via RootMotion (e.g. Jump's dy table).
      // AirbornePhysics only acts when the actor has no active action AND is airborne.
      // This catches the cancel-out-mid-jump leak: actor cancels out of an airborne
      // action, currentAction becomes null/undefined, y is left non-zero — we pull it down.
      if (a.currentAction) continue;
      // Airborne when y > 0 (mid-air) OR velocity.y > 0 (about to leave ground).
      if (a.position.y <= 0 && a.velocity.y <= 0) continue;

      a.previousPosition = cloneVec3(a.position);
      a.position.y += a.velocity.y;
      a.velocity.y += G_PER_TICK;
      if (a.position.y <= 0) {
        a.position.y = 0;
        a.velocity.y = 0;
      }
    }
  }
}
