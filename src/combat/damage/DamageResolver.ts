import type { Actor, ActionName, DamageApplied, DamageRequest, HitDecision } from "../types.js";
export class DamageResolver {
  requestFromHit(decision: HitDecision, correlationId: string, actionName?: ActionName, baseDamageOverride?: number): DamageRequest {
    return { attackerId:decision.attackerId, targetId:decision.targetId, actionName, sourceKind:actionName==="EnemyBasic" ? "enemy_normal" : "direct_hit", reactionPolicy:"normal_hit_reaction", baseDamage:baseDamageOverride ?? decision.hitbox.baseDamage, canTriggerCounter:true, canTriggerBackAttack:true, canTriggerCritical:true, canTriggerDeath:true, sourceHitDecisionId:decision.id, correlationId };
  }
  apply(target: Actor, req: DamageRequest, flags: {isCounter:boolean; isBackAttack:boolean; isCritical:boolean}, damageAllowed=true): DamageApplied {
    const hpBefore = target.resources.hp;
    const multipliers = [{name:"base", value:1}];
    let mult = 1;
    if (flags.isCounter && req.canTriggerCounter) { mult *= 1.25; multipliers.push({name:"counter", value:1.25}); }
    if (flags.isBackAttack && req.canTriggerBackAttack) { mult *= 1.0; multipliers.push({name:"back_attack", value:1.0}); }
    if (flags.isCritical && req.canTriggerCritical) { mult *= 1.5; multipliers.push({name:"critical", value:1.5}); }
    const finalDamage = damageAllowed ? Math.max(0, Math.floor(req.baseDamage * mult)) : 0;
    target.resources.hp = Math.max(0, hpBefore - finalDamage);
    return { attackerId:req.attackerId, targetId:req.targetId, actionName:req.actionName, sourceKind:req.sourceKind, reactionPolicy:req.reactionPolicy, baseDamage:req.baseDamage, finalDamage, hpBefore, hpAfter:target.resources.hp, isCounter:flags.isCounter, isBackAttack:flags.isBackAttack, isCritical:flags.isCritical, multipliers, sourceHitDecisionId:req.sourceHitDecisionId, sourceStatusId:req.sourceStatusId };
  }
}
