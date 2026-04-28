import type { Actor, GrabDecision, HitQuery } from "../types.js";
export class GrabResolver {
  decide(target: Actor, query: HitQuery): GrabDecision {
    if (!query.canGrab) return { attempted:false, success:false, failedReason:"not_grab_action" };
    if (target.flags.dead) return { attempted:true, success:false, failedReason:"target_dead" };
    if (target.armorProfile.baseType === "building_armor") return { attempted:true, success:false, failedReason:"building_armor" };
    if (target.armorProfile.immunities.grab) return { attempted:true, success:false, failedReason:"target_grab_immune" };
    if (target.reactionState === "grabbed") return { attempted:true, success:false, failedReason:"already_grabbed" };
    return { attempted:true, success:true };
  }
}
