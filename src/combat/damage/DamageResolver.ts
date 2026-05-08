import type { Actor, ActionName, AttackType, DamageApplied, DamageRequest, HitDecision } from "../types.js";
import { DamageFormulaResolver, type DamageFormulaFlags } from "./DamageFormula.js";

export class DamageResolver {
  constructor(private readonly formula = new DamageFormulaResolver()) {}

  requestFromHit(decision: HitDecision, correlationId: string, actionName?: ActionName, baseDamageOverride?: number, attackerStats?: { strength?: number; intelligence?: number; physAtk?: number; magAtk?: number; independentAtk?: number; elementalDamage?: number }, targetStats?: { defense?: number; elemResist?: number }, attackType?: AttackType, attackerLevel?: number): DamageRequest {
    return { attackerId:decision.attackerId, targetId:decision.targetId, actionName, sourceKind:actionName==="EnemyBasic" ? "enemy_normal" : "direct_hit", reactionPolicy:"normal_hit_reaction", baseDamage:baseDamageOverride ?? decision.hitbox.baseDamage, attackType: attackType ?? "physical_percent", attackerLevel: attackerLevel ?? 70, canTriggerCounter:true, canTriggerBackAttack:true, canTriggerCritical:true, canTriggerDeath:true, sourceHitDecisionId:decision.id, correlationId, attackerStats, targetStats };
  }
  apply(target: Actor, req: DamageRequest, flags: DamageFormulaFlags, damageAllowed=true, extraMultipliers: Array<{name:string; value:number}> = []): DamageApplied {
    const hpBefore = target.resources.hp;
    const resolved = this.formula.resolve(req, flags, damageAllowed, extraMultipliers);
    target.resources.hp = Math.max(0, hpBefore - resolved.finalDamage);
    return { attackerId:req.attackerId, targetId:req.targetId, actionName:req.actionName, sourceKind:req.sourceKind, reactionPolicy:req.reactionPolicy, baseDamage:req.baseDamage, finalDamage:resolved.finalDamage, hpBefore, hpAfter:target.resources.hp, isCounter:flags.isCounter, isBackAttack:flags.isBackAttack, isCritical:flags.isCritical, multipliers:resolved.multipliers, sourceHitDecisionId:req.sourceHitDecisionId, sourceStatusId:req.sourceStatusId };
  }
}
