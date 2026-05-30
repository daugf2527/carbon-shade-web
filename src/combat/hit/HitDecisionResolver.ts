import type { Actor, HitDecision, HitQuery, HitBoxFrameWindow, DownedHitDecision } from "../types.js";
import { nextId } from "../util/ids.js";
import { ArmorResolver } from "../armor/ArmorResolver.js";
import { GrabResolver } from "../armor/GrabResolver.js";
import { HitRejectionResolver, type HitGeometryResult } from "./HitRejectionResolver.js";

export class HitDecisionResolver {
  constructor(private armor = new ArmorResolver(), private grab = new GrabResolver(), private rejection = new HitRejectionResolver(armor)) {}

  decide(tick: number, query: HitQuery, hitbox: HitBoxFrameWindow, attacker: Actor, target: Actor, geometry: HitGeometryResult): HitDecision {
    const id = nextId("decision");
    const action = attacker.currentAction;
    const alreadyHit = action?.alreadyHitByGroup.get(query.hitGroupId)?.has(target.id) ?? false;
    const downed: DownedHitDecision = { attempted: target.reactionState === "downed", accepted: target.reactionState !== "downed" || query.canHitDowned, reason: target.reactionState === "downed" && !query.canHitDowned ? "downed_not_allowed" : undefined };
    const grabDecision = this.grab.decide(target, query);
    const rejectedReason = this.rejection.resolve(tick, query, attacker, target, geometry, alreadyHit);
    const accepted = geometry.overlap && !rejectedReason;
    const rawReaction = query.canLaunch ? "launch" : query.canKnockdown ? "downed" : "light_stagger";
    const armorDecision = this.armor.decide(target, query, rawReaction);
    const isBackAttack = (target.facing === "right" && attacker.position.x < target.position.x) || (target.facing === "left" && attacker.position.x > target.position.x);
    const isCounter = target.currentAction !== undefined && !["stay","QuickRebound"].includes(target.currentAction.actionName) && !target.flags.dead;
    return { id, queryId:query.id, attackerId:attacker.id, targetId:target.id, geometryOverlapped:geometry.overlap, accepted, rejectedReason, armorDecision, downedDecision:downed, grabDecision, isCounter, isBackAttack, isCritical:false, hitbox };
  }
}
