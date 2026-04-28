import type { Actor, Buff, BuffType } from "../types.js";
import { CombatEventBus, CombatEventPriority } from "../events/CombatEventBus.js";
import { nextId } from "../util/ids.js";
export class BuffLifecycleSystem {
  apply(actor: Actor, type: BuffType, tick: number, bus: CombatEventBus, duration?: number): Buff {
    bus.emit("BuffApplyRequested", CombatEventPriority.Buff, tick, {actorId:actor.id, type}, {targetActorId:actor.id});
    const existing = actor.buffs.find(b=>b.type===type);
    if (existing) { existing.expiresAtTick = duration ? tick+duration : existing.expiresAtTick; bus.emit("BuffRefreshed", CombatEventPriority.Buff, tick, {actorId:actor.id, type}, {targetActorId:actor.id}); return existing; }
    const buff: Buff = { id:nextId("buff"), type, ownerId:actor.id, appliedAtTick:tick, expiresAtTick:duration ? tick+duration : undefined, stacks:1, maxStacks:type==="bloody_cross"?3:1, refreshPolicy:"refresh_duration", dispelPolicy:type==="frenzy"?"death_clear":"dispellable", modifiers:[] };
    actor.buffs.push(buff); bus.emit("BuffApplied", CombatEventPriority.Buff, tick, {actorId:actor.id, type, buffId:buff.id}, {targetActorId:actor.id}); return buff;
  }
  remove(actor:Actor, type:BuffType, tick:number, bus:CombatEventBus): void { actor.buffs = actor.buffs.filter(b=>b.type!==type); bus.emit("BuffDispelled", CombatEventPriority.Buff, tick, {actorId:actor.id, type}, {targetActorId:actor.id}); }
  tick(actor: Actor, tick: number, bus: CombatEventBus, frozen: boolean): void {
    if (frozen) return;
    if (actor.buffs.some(b=>b.type==="frenzy")) {
      if (tick % 60 === 0 && actor.resources.hp > 1) { actor.resources.hp = Math.max(1, actor.resources.hp - Math.max(1, Math.floor(actor.resources.maxHp * 0.005))); bus.emit("BuffTicked", CombatEventPriority.Buff, tick, {actorId:actor.id, type:"frenzy", hp:actor.resources.hp}, {targetActorId:actor.id}); }
    }
    if (actor.resources.hp <= actor.resources.maxHp * 0.35) this.apply(actor,"bloody_cross",tick,bus,60);
    for (const b of [...actor.buffs]) if (b.expiresAtTick !== undefined && b.expiresAtTick <= tick) { actor.buffs = actor.buffs.filter(x=>x.id!==b.id); bus.emit("BuffExpired", CombatEventPriority.Buff, tick, {actorId:actor.id, type:b.type}, {targetActorId:actor.id}); }
  }
  deathCleanup(actor:Actor, tick:number, bus:CombatEventBus): void { const removed = actor.buffs.filter(b=>b.dispelPolicy!=="death_keep"); actor.buffs = actor.buffs.filter(b=>b.dispelPolicy==="death_keep"); if (removed.length) bus.emit("BuffDeathCleanup", CombatEventPriority.Buff, tick, {actorId:actor.id, removed:removed.map(b=>b.type)}, {targetActorId:actor.id}); }
}
