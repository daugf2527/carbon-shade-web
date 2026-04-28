import type { Actor, HitDecision, HitQuery, HitBoxFrameWindow, DownedHitDecision } from "../types.js";
import { nextId } from "../util/ids.js";
import { ArmorResolver } from "../armor/ArmorResolver.js";
import { GrabResolver } from "../armor/GrabResolver.js";
export class HitDecisionResolver {
  constructor(private armor = new ArmorResolver(), private grab = new GrabResolver()) {}
  decide(tick: number, query: HitQuery, hitbox: HitBoxFrameWindow, attacker: Actor, target: Actor, geometry: {overlap:boolean;zMismatch:boolean;yMismatch:boolean}): HitDecision {
    const id = nextId("decision");
    const action = attacker.currentAction;
    const alreadyHit = action?.alreadyHitByGroup.get(query.hitGroupId)?.has(target.id) ?? false;
    const downed: DownedHitDecision = { attempted: target.reactionState === "downed", accepted: target.reactionState !== "downed" || query.canHitDowned, reason: target.reactionState === "downed" && !query.canHitDowned ? "downed_not_allowed" : undefined };
    const grabDecision = this.grab.decide(target, query);
    let accepted = geometry.overlap;
    let rejectedReason: HitDecision["rejectedReason"] | undefined;
    if (!geometry.overlap) rejectedReason = geometry.zMismatch ? "z_mismatch" : geometry.yMismatch ? "y_mismatch" : "out_of_active_frame";
    else if (attacker.faction === target.faction) rejectedReason = "same_faction";
    else if (target.flags.dead) rejectedReason = "target_dead";
    else if (this.armor.isInvulnerable(target, tick)) rejectedReason = "target_invulnerable";
    else if (target.armorProfile.immunities.damage) rejectedReason = "damage_immune";
    else if (alreadyHit) rejectedReason = "already_hit_in_group";
    else if (!downed.accepted) rejectedReason = "downed_not_allowed";
    if (rejectedReason) accepted = false;
    const rawReaction = query.canLaunch ? "launch" : query.canKnockdown ? "downed" : "light_stagger";
    const armorDecision = this.armor.decide(target, query, rawReaction);
    const isBackAttack = (target.facing === "right" && attacker.position.x < target.position.x) || (target.facing === "left" && attacker.position.x > target.position.x);
    const isCounter = target.currentAction !== undefined && !["Idle","QuickRebound"].includes(target.currentAction.actionName) && !target.flags.dead;
    return { id, queryId:query.id, attackerId:attacker.id, targetId:target.id, geometryOverlapped:geometry.overlap, accepted, rejectedReason, armorDecision, downedDecision:downed, grabDecision, isCounter, isBackAttack, isCritical:false, hitbox };
  }
}
