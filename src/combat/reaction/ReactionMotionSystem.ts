import type { CombatSystem } from "../kernel/CombatSystem.js";
import type { SystemContext } from "../kernel/SystemContext.js";
import type { CombatEventBus } from "../events/CombatEventBus.js";
import { cloneVec3 } from "../util/geometry.js";
import { DNF_GRAVITY_PER_TICK_60HZ } from "../../data/official/dnf/physics.js";

// DNF verified gravity (-1500 px/s^2 ÷ 60^2 ≈ -0.4167 px/tick^2).
// Source: pvf:sqr/dnf_enum_header.nut. See src/data/official/dnf/physics.ts.
const G_PER_TICK = DNF_GRAVITY_PER_TICK_60HZ.value;

export class ReactionMotionSystem implements CombatSystem {
  readonly name = "ReactionMotion";
  readonly phase = "DETECTION" as const;

  tick(ctx: SystemContext, _bus: CombatEventBus): void {
    for (const a of ctx.actors) {
      if (a.flags.dead) continue;
      if (ctx.hitStop.isFrozen(a.id)) continue;
      const friction = a.currentAction ? 0.82 : 0.74;
      if (a.reactionState === "launch" || a.reactionState === "air_hitstun" || a.reactionState === "falling" || a.reactionState === "knockback" || a.reactionState === "downed") {
        a.previousPosition = cloneVec3(a.position);
        a.position.x += a.velocity.x;
        a.position.z += a.velocity.z;
        a.position.y += a.velocity.y;
        a.velocity.x *= friction;
        a.velocity.z *= friction;
        a.velocity.y += G_PER_TICK * a.comboCorrection.gravityScale;
        if ((a.reactionState === "launch" || a.reactionState === "air_hitstun") && a.velocity.y < 0) a.reactionState = "falling";
        if (a.position.y <= 0) {
          a.position.y = 0;
          a.velocity.y = 0;
          if (a.reactionState === "launch" || a.reactionState === "air_hitstun" || a.reactionState === "falling" || a.reactionState === "knockback") {
            a.reactionState = "downed";
            a.handfeel.downRemaining = Math.max(a.handfeel.downRemaining, 24);
          }
        }
        this.clamp(a, ctx);
      }
      if (a.reactionState === "light_stagger" || a.reactionState === "heavy_stagger" || a.reactionState === "micro_stagger") {
        a.previousPosition = cloneVec3(a.position);
        a.position.x += a.velocity.x;
        a.position.z += a.velocity.z;
        a.velocity.x *= 0.72;
        a.velocity.z *= 0.72;
        a.handfeel.reactionRemaining -= 1;
        if (a.handfeel.reactionRemaining <= 0) { a.reactionState = "none"; a.velocity.x = 0; a.velocity.z = 0; }
        this.clamp(a, ctx);
      }
      if (a.reactionState === "armor_feedback_only") {
        a.handfeel.reactionRemaining -= 1;
        if (a.handfeel.reactionRemaining <= 0) a.reactionState = "none";
      }
      if (a.reactionState === "downed") {
        a.handfeel.downRemaining -= 1;
        a.velocity.x *= 0.82;
        a.velocity.z *= 0.82;
        if (a.handfeel.downRemaining <= 0) {
          a.reactionState = "getting_up";
          a.handfeel.getUpRemaining = Math.max(a.handfeel.getUpRemaining, 12);
          a.armorProfile.temporaryFlags.getUpArmorUntilTick = ctx.tickCount + 12;
        }
      } else if (a.reactionState === "getting_up") {
        a.handfeel.getUpRemaining -= 1;
        if (a.handfeel.getUpRemaining <= 0) a.reactionState = "none";
      }
    }
  }

  private clamp(a: { position: { x: number; z: number } }, ctx: SystemContext): void {
    a.position.x = Math.max(ctx.worldBounds.xMin, Math.min(ctx.worldBounds.xMax, a.position.x));
    a.position.z = Math.max(ctx.worldBounds.zMin, Math.min(ctx.worldBounds.zMax, a.position.z));
  }
}
