import type { Actor, StatusEffect, StatusEffectType, ActionName } from "../types.js";
import { CombatEventBus, CombatEventPriority } from "../events/CombatEventBus.js";
import { nextId } from "../util/ids.js";
import { DamageResolver } from "../damage/DamageResolver.js";

interface StatusProfile {
  durationFrames: number;
  tickIntervalFrames?: number;
  dotDamagePerStack?: number;
  maxStacks: number;
  splashRadius?: number;
  splashDamagePerStack?: number;
  dispelPolicy: StatusEffect["dispelPolicy"];
}

const STATUS_PROFILES: Partial<Record<StatusEffectType, StatusProfile>> = {
  bleed: { durationFrames:180, tickIntervalFrames:30, dotDamagePerStack:6, maxStacks:5, dispelPolicy:"death_clear" },
  poison: { durationFrames:180, tickIntervalFrames:30, dotDamagePerStack:5, maxStacks:5, dispelPolicy:"death_clear" },
  burn: { durationFrames:180, tickIntervalFrames:30, dotDamagePerStack:5, splashRadius:150, splashDamagePerStack:3, maxStacks:5, dispelPolicy:"death_clear" },
  shock: { durationFrames:180, tickIntervalFrames:30, dotDamagePerStack:4, maxStacks:5, dispelPolicy:"death_clear" },
  rupture: { durationFrames:180, maxStacks:5, dispelPolicy:"death_clear" },
};

export class StatusEffectSystem {
  constructor(private damage = new DamageResolver()) {}

  profile(type: StatusEffectType): StatusProfile | undefined {
    return STATUS_PROFILES[type];
  }

  applyStatus(actor: Actor, type: StatusEffectType, sourceActorId: string | undefined, sourceAction: string | undefined, tick: number, bus: CombatEventBus, chance=1): StatusEffect | null {
    const profile = STATUS_PROFILES[type] ?? { durationFrames:180, maxStacks:1, dispelPolicy:"death_clear" as const };
    bus.emit("StatusApplyRequested", CombatEventPriority.Status, tick, {actorId:actor.id, type, chance}, {targetActorId:actor.id, sourceActorId});
    if (chance < 1 && Math.random() > chance) { bus.emit("StatusResisted", CombatEventPriority.Status, tick, {actorId:actor.id, type, reason:"chance_failed"}, {targetActorId:actor.id}); return null; }
    const existing = actor.statusEffects.find(s=>s.type===type);
    if (existing) {
      existing.stacks = Math.min(existing.maxStacks, existing.stacks + 1);
      existing.expiresAtTick = tick + profile.durationFrames;
      if (profile.tickIntervalFrames !== undefined && existing.nextTickFrame === undefined) existing.nextTickFrame = tick + profile.tickIntervalFrames;
      bus.emit("StatusApplied", CombatEventPriority.Status, tick, {actorId:actor.id, type, stacks:existing.stacks}, {targetActorId:actor.id, sourceActorId});
      return existing;
    }
    const effect: StatusEffect = {
      id:nextId("status"),
      type,
      ownerId:actor.id,
      sourceActorId,
      sourceAction:sourceAction as ActionName,
      appliedAtTick:tick,
      expiresAtTick:tick+profile.durationFrames,
      tickIntervalFrames:profile.tickIntervalFrames,
      nextTickFrame:profile.tickIntervalFrames === undefined ? undefined : tick+profile.tickIntervalFrames,
      stacks:1,
      maxStacks:profile.maxStacks,
      resistanceCheck:{accepted:true},
      dispelPolicy:profile.dispelPolicy
    };
    actor.statusEffects.push(effect); bus.emit("StatusApplied", CombatEventPriority.Status, tick, {actorId:actor.id, type, statusId:effect.id}, {targetActorId:actor.id, sourceActorId}); return effect;
  }

  applyBleed(actor: Actor, sourceActorId: string | undefined, sourceAction: string | undefined, tick: number, bus: CombatEventBus, chance=1): StatusEffect | null {
    return this.applyStatus(actor, "bleed", sourceActorId, sourceAction, tick, bus, chance);
  }
  tick(actor: Actor, tick: number, bus: CombatEventBus, frozen: boolean, actors: Actor[] = [actor]): boolean {
    if (frozen) return false;
    let appliedAny = false;
    for (const s of [...actor.statusEffects]) {
      if (s.expiresAtTick <= tick) { actor.statusEffects = actor.statusEffects.filter(x=>x.id!==s.id); bus.emit("StatusExpired", CombatEventPriority.Status, tick, {actorId:actor.id, type:s.type}, {targetActorId:actor.id}); continue; }
      const profile = STATUS_PROFILES[s.type];
      if (profile?.dotDamagePerStack !== undefined && s.nextTickFrame !== undefined && s.nextTickFrame <= tick) {
        bus.emit("StatusTickRequested", CombatEventPriority.Status, tick, {actorId:actor.id, statusId:s.id, type:s.type}, {targetActorId:actor.id, sourceActorId:s.sourceActorId});
        const applied = this.applyDotDamage(actor, s, profile.dotDamagePerStack * s.stacks, tick, bus);
        if (profile.splashRadius !== undefined && profile.splashDamagePerStack !== undefined) this.applySplash(actor, s, profile, actors, tick, bus);
        bus.emit("StatusTicked", CombatEventPriority.Status, tick, {actorId:actor.id, statusId:s.id, type:s.type, damage:applied.finalDamage}, {targetActorId:actor.id, sourceActorId:s.sourceActorId});
        s.nextTickFrame += s.tickIntervalFrames ?? profile.tickIntervalFrames ?? 30;
        appliedAny = true;
      }
    }
    return appliedAny;
  }

  private applyDotDamage(actor: Actor, status: StatusEffect, baseDamage: number, tick: number, bus: CombatEventBus) {
    const applied = this.damage.apply(actor, { targetId:actor.id, attackerId:status.sourceActorId, sourceStatusId:status.id, sourceKind:"status_dot", reactionPolicy:"status_tick_feedback_only", baseDamage, canTriggerCounter:false, canTriggerBackAttack:false, canTriggerCritical:false, canTriggerDeath:true, correlationId:nextId("corr") }, {isCounter:false,isBackAttack:false,isCritical:false}, true);
    bus.emit("DamageApplied", CombatEventPriority.Damage, tick, applied, {targetActorId:actor.id, sourceActorId:status.sourceActorId});
    bus.emit("DamageNumberRequested", CombatEventPriority.Feedback, tick, {actorId:actor.id, amount:applied.finalDamage, sourceKind:"status_dot"}, {targetActorId:actor.id});
    return applied;
  }

  private applySplash(actor: Actor, status: StatusEffect, profile: StatusProfile, actors: Actor[], tick: number, bus: CombatEventBus): void {
    const source = actors.find(a=>a.id===status.sourceActorId);
    for (const target of actors) {
      if (target.id === actor.id || target.flags.dead) continue;
      if (source && target.faction === source.faction) continue;
      const dx = target.position.x - actor.position.x;
      const dz = target.position.z - actor.position.z;
      const radius = profile.splashRadius ?? 0;
      if (dx * dx + dz * dz > radius * radius) continue;
      const applied = this.applyDotDamage(target, status, (profile.splashDamagePerStack ?? 0) * status.stacks, tick, bus);
      bus.emit("StatusSplashTicked", CombatEventPriority.Status, tick, {actorId:actor.id, targetActorId:target.id, statusId:status.id, type:status.type, damage:applied.finalDamage, radius}, {targetActorId:target.id, sourceActorId:status.sourceActorId});
    }
  }

  deathCleanup(actor:Actor, tick:number, bus:CombatEventBus): void { const removed = actor.statusEffects.filter(s=>s.dispelPolicy!=="death_keep"); actor.statusEffects = actor.statusEffects.filter(s=>s.dispelPolicy==="death_keep"); if (removed.length) bus.emit("StatusDeathCleanup", CombatEventPriority.Status, tick, {actorId:actor.id, removed:removed.map(s=>s.type)}, {targetActorId:actor.id}); }
}
