import type { Actor, FrameDataAction } from "../types.js";
import { CombatEventBus, CombatEventPriority } from "../events/CombatEventBus.js";
export class CooldownResourceKernel {
  gate(actor: Actor, action: FrameDataAction, tick: number, bus: CombatEventBus): boolean {
    const cp = action.cooldownProfile;
    const cost = action.costProfile;
    if (actor.cooldowns.globalRemaining > 0) { bus.emit("CooldownRejected", CombatEventPriority.ResourceCooldown, tick, { actorId:actor.id, actionName:action.actionName, reason:"global_cooldown" }, { targetActorId:actor.id }); return false; }
    const remaining = actor.cooldowns.remaining.get(action.actionName) ?? 0;
    if (remaining > 0) { bus.emit("CooldownRejected", CombatEventPriority.ResourceCooldown, tick, { actorId:actor.id, actionName:action.actionName, remaining }, { targetActorId:actor.id }); return false; }
    if (cost) {
      bus.emit("ResourceCostRequested", CombatEventPriority.ResourceCooldown, tick, { actorId:actor.id, actionName:action.actionName, cost }, { targetActorId:actor.id });
      const hpAfter = actor.resources.hp - (cost.hpCost ?? 0) - (cost.hpPercentCost ? actor.resources.maxHp * cost.hpPercentCost : 0);
      if ((cost.mpCost ?? 0) > actor.resources.mp || (cost.cubeCost ?? 0) > actor.resources.cube || hpAfter < (cost.cannotReduceHpBelow ?? 0)) { bus.emit("ResourceCostRejected", CombatEventPriority.ResourceCooldown, tick, { actorId:actor.id, actionName:action.actionName, reason:"insufficient_resource" }, { targetActorId:actor.id }); return false; }
      if (cost.costTiming === "on_request") this.pay(actor, action, tick, bus);
    }
    bus.emit("CooldownReady", CombatEventPriority.ResourceCooldown, tick, { actorId:actor.id, actionName:action.actionName }, { targetActorId:actor.id });
    if (cp?.cooldownStartsAt === "on_request") this.start(actor, action, tick, bus);
    return true;
  }
  pay(actor:Actor, action:FrameDataAction, tick:number, bus:CombatEventBus): void { const cost=action.costProfile; if(!cost) return; actor.resources.mp -= cost.mpCost ?? 0; actor.resources.cube -= cost.cubeCost ?? 0; actor.resources.hp = Math.max(cost.cannotReduceHpBelow ?? 0, actor.resources.hp - (cost.hpCost ?? 0)); bus.emit("ResourceCostPaid", CombatEventPriority.ResourceCooldown, tick, {actorId:actor.id, actionName:action.actionName}, {targetActorId:actor.id}); }
  start(actor:Actor, action:FrameDataAction, tick:number, bus:CombatEventBus): void {
    const cp=action.cooldownProfile;
    if(!cp) return;
    const frenzyReduction = cp.canBeReducedByFrenzy && actor.buffs.some(b=>b.type==="frenzy") ? 0.8 : 1;
    const independentCooldownFrames = Math.max(1, Math.floor(cp.independentCooldownFrames * frenzyReduction));
    actor.cooldowns.remaining.set(action.actionName, independentCooldownFrames);
    actor.cooldowns.globalRemaining = Math.max(actor.cooldowns.globalRemaining, cp.globalCooldownFrames);
    bus.emit("CooldownStarted", CombatEventPriority.ResourceCooldown, tick, {actorId:actor.id, actionName:action.actionName, independentCooldownFrames, baseIndependentCooldownFrames:cp.independentCooldownFrames, globalCooldownFrames:cp.globalCooldownFrames, frenzyReduction}, {targetActorId:actor.id});
  }
  tick(actor: Actor, tick: number, bus: CombatEventBus, frozen: boolean): void {
    if (frozen) return;
    if (actor.cooldowns.globalRemaining > 0) actor.cooldowns.globalRemaining -= 1;
    for (const [name, remaining] of [...actor.cooldowns.remaining]) { const next = remaining - 1; actor.cooldowns.remaining.set(name,next); bus.emit("CooldownTicked", CombatEventPriority.ResourceCooldown, tick, {actorId:actor.id, actionName:name, remaining:next}, {targetActorId:actor.id}); if(next<=0){ actor.cooldowns.remaining.delete(name); bus.emit("CooldownEnded", CombatEventPriority.ResourceCooldown, tick, {actorId:actor.id, actionName:name}, {targetActorId:actor.id}); } }
  }
}
