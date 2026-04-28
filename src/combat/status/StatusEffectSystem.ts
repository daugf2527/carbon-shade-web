import type { Actor, StatusEffect } from "../types.js";
import { CombatEventBus, CombatEventPriority } from "../events/CombatEventBus.js";
import { nextId } from "../util/ids.js";
import { DamageResolver } from "../damage/DamageResolver.js";
export class StatusEffectSystem {
  constructor(private damage = new DamageResolver()) {}
  applyBleed(actor: Actor, sourceActorId: string | undefined, sourceAction: string | undefined, tick: number, bus: CombatEventBus, chance=1): StatusEffect | null {
    bus.emit("StatusApplyRequested", CombatEventPriority.Status, tick, {actorId:actor.id, type:"bleed", chance}, {targetActorId:actor.id, sourceActorId});
    if (chance < 1 && Math.random() > chance) { bus.emit("StatusResisted", CombatEventPriority.Status, tick, {actorId:actor.id, type:"bleed", reason:"chance_failed"}, {targetActorId:actor.id}); return null; }
    const existing = actor.statusEffects.find(s=>s.type==="bleed");
    if (existing) { existing.stacks = Math.min(existing.maxStacks, existing.stacks + 1); existing.expiresAtTick = tick+180; bus.emit("StatusApplied", CombatEventPriority.Status, tick, {actorId:actor.id, type:"bleed", stacks:existing.stacks}, {targetActorId:actor.id, sourceActorId}); return existing; }
    const effect: StatusEffect = { id:nextId("status"), type:"bleed", ownerId:actor.id, sourceActorId, sourceAction:sourceAction as never, appliedAtTick:tick, expiresAtTick:tick+180, tickIntervalFrames:30, nextTickFrame:tick+30, stacks:1, maxStacks:5, resistanceCheck:{accepted:true}, dispelPolicy:"death_clear" };
    actor.statusEffects.push(effect); bus.emit("StatusApplied", CombatEventPriority.Status, tick, {actorId:actor.id, type:"bleed", statusId:effect.id}, {targetActorId:actor.id, sourceActorId}); return effect;
  }
  tick(actor: Actor, tick: number, bus: CombatEventBus, frozen: boolean): boolean {
    if (frozen) return false;
    let appliedAny = false;
    for (const s of [...actor.statusEffects]) {
      if (s.expiresAtTick <= tick) { actor.statusEffects = actor.statusEffects.filter(x=>x.id!==s.id); bus.emit("StatusExpired", CombatEventPriority.Status, tick, {actorId:actor.id, type:s.type}, {targetActorId:actor.id}); continue; }
      if (s.type === "bleed" && s.nextTickFrame !== undefined && s.nextTickFrame <= tick) {
        bus.emit("StatusTickRequested", CombatEventPriority.Status, tick, {actorId:actor.id, statusId:s.id, type:"bleed"}, {targetActorId:actor.id, sourceActorId:s.sourceActorId});
        const applied = this.damage.apply(actor, { targetId:actor.id, attackerId:s.sourceActorId, sourceStatusId:s.id, sourceKind:"status_dot", reactionPolicy:"status_tick_feedback_only", baseDamage:6*s.stacks, canTriggerCounter:false, canTriggerBackAttack:false, canTriggerCritical:false, canTriggerDeath:true, correlationId:nextId("corr") }, {isCounter:false,isBackAttack:false,isCritical:false}, true);
        bus.emit("DamageApplied", CombatEventPriority.Damage, tick, applied, {targetActorId:actor.id, sourceActorId:s.sourceActorId});
        bus.emit("DamageNumberRequested", CombatEventPriority.Feedback, tick, {actorId:actor.id, amount:applied.finalDamage, sourceKind:"status_dot"}, {targetActorId:actor.id});
        bus.emit("StatusTicked", CombatEventPriority.Status, tick, {actorId:actor.id, statusId:s.id, type:"bleed", damage:applied.finalDamage}, {targetActorId:actor.id, sourceActorId:s.sourceActorId});
        s.nextTickFrame += s.tickIntervalFrames ?? 30;
        appliedAny = true;
      }
    }
    return appliedAny;
  }
  deathCleanup(actor:Actor, tick:number, bus:CombatEventBus): void { const removed = actor.statusEffects.filter(s=>s.dispelPolicy!=="death_keep"); actor.statusEffects = actor.statusEffects.filter(s=>s.dispelPolicy==="death_keep"); if (removed.length) bus.emit("StatusDeathCleanup", CombatEventPriority.Status, tick, {actorId:actor.id, removed:removed.map(s=>s.type)}, {targetActorId:actor.id}); }
}
