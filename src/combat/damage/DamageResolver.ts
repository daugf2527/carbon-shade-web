import type { Actor, ActionName, DamageApplied, DamageRequest, HitDecision } from "../types.js";
import { DamageFormulaResolver, type DamageFormulaFlags } from "./DamageFormula.js";

export class DamageResolver {
  constructor(private readonly formula = new DamageFormulaResolver()) {}

  requestFromHit(decision: HitDecision, correlationId: string, actionName?: ActionName, baseDamageOverride?: number): DamageRequest {
    return { attackerId:decision.attackerId, targetId:decision.targetId, actionName, sourceKind:actionName==="EnemyBasic" ? "enemy_normal" : "direct_hit", reactionPolicy:"normal_hit_reaction", baseDamage:baseDamageOverride ?? decision.hitbox.baseDamage, canTriggerCounter:true, canTriggerBackAttack:true, canTriggerCritical:true, canTriggerDeath:true, sourceHitDecisionId:decision.id, correlationId };
  }

  apply(target: Actor, req: DamageRequest, flags: DamageFormulaFlags, damageAllowed=true): DamageApplied {
    const hpBefore = target.resources.hp;
    const resolved = this.formula.resolve(req, flags, damageAllowed);
    target.resources.hp = Math.max(0, hpBefore - resolved.finalDamage);
    return { attackerId:req.attackerId, targetId:req.targetId, actionName:req.actionName, sourceKind:req.sourceKind, reactionPolicy:req.reactionPolicy, baseDamage:req.baseDamage, finalDamage:resolved.finalDamage, hpBefore, hpAfter:target.resources.hp, isCounter:flags.isCounter, isBackAttack:flags.isBackAttack, isCritical:flags.isCritical, multipliers:resolved.multipliers, sourceHitDecisionId:req.sourceHitDecisionId, sourceStatusId:req.sourceStatusId };
  }
}
