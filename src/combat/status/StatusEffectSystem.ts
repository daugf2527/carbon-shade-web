import type { Actor, StatusEffect, StatusEffectType, ActionName, StatusProfile } from "../types.js";
import { CombatEventBus, CombatEventPriority } from "../events/CombatEventBus.js";
import { nextId } from "../util/ids.js";
import { DamageResolver } from "../damage/DamageResolver.js";
import { STATUS_PROFILES, PVE_STATUS_CONFIG, getDefaultResistance } from "../../data/manifest/status.js";

interface StatusApplyOptions {
  durationFrames?: number;
  tickIntervalFrames?: number;
  dotDamagePerStack?: number;
  maxStacks?: number;
}

const FALLBACK_STATUS_PROFILE: StatusProfile = {
  type: "bleed",
  durationFrames:180,
  maxStacks:1,
  dispelPolicy:"death_clear",
  fieldProvenance:{}
};

const HARD_CONTROL_TYPES: ReadonlySet<StatusEffectType> = new Set([
  "stun", "freeze", "stone", "bind", "sleep"
]);

export class StatusEffectSystem {
  constructor(private damage = new DamageResolver()) {}

  profile(type: StatusEffectType): StatusProfile | undefined {
    return STATUS_PROFILES[type];
  }

  applyStatus(actor: Actor, type: StatusEffectType, sourceActorId: string | undefined, sourceAction: string | undefined, tick: number, bus: CombatEventBus, chance=1, options: StatusApplyOptions = {}): StatusEffect | null {
    const profile = STATUS_PROFILES[type] ?? FALLBACK_STATUS_PROFILE;
    const durationFrames = options.durationFrames ?? profile.durationFrames;
    const tickIntervalFrames = options.tickIntervalFrames ?? profile.tickIntervalFrames;
    const dotDamagePerStack = options.dotDamagePerStack ?? profile.dotDamagePerStack;
    const maxStacks = options.maxStacks ?? profile.maxStacks;

    bus.emit("StatusApplyRequested", CombatEventPriority.Status, tick, {actorId:actor.id, type, chance}, {targetActorId:actor.id, sourceActorId});

    // Phase 4: resistanceCheck with tolerance mechanics
    const isHardControl = HARD_CONTROL_TYPES.has(type) || (profile.isHardControl === true);
    const toleranceConfig = PVE_STATUS_CONFIG.tolerance;
    const currentTolerance = actor.statusTolerance?.[type] ?? 0;
    const baseResistance = actor.statusResistance?.[type] ?? getDefaultResistance(type);
    const breakThreshold = profile.breakThreshold ?? 0;

    // Hard control mutex: if target already has an active hard control, resist new hard controls
    if (isHardControl && toleranceConfig.hardControlMutex) {
      const hasActiveHardControl = actor.statusEffects.some(s => {
        const sp = STATUS_PROFILES[s.type];
        return HARD_CONTROL_TYPES.has(s.type) || (sp?.isHardControl === true);
      });
      if (hasActiveHardControl) {
        bus.emit("StatusResisted", CombatEventPriority.Status, tick, {actorId:actor.id, type, reason:"hard_control_mutex"}, {targetActorId:actor.id});
        return null;
      }
    }

    // Break threshold check: if actor's tolerance is below break threshold, auto-resist
    const effectiveResistance = baseResistance + currentTolerance;
    if (breakThreshold > 0 && effectiveResistance < breakThreshold) {
      bus.emit("StatusResisted", CombatEventPriority.Status, tick, {actorId:actor.id, type, reason:"below_break_threshold"}, {targetActorId:actor.id});
      return null;
    }

    // Tolerance threshold check: if tolerance exceeds threshold, resist
    if (currentTolerance >= toleranceConfig.threshold) {
      bus.emit("StatusResisted", CombatEventPriority.Status, tick, {actorId:actor.id, type, reason:"tolerance_full"}, {targetActorId:actor.id});
      return null;
    }

    // Legacy chance-based check (fallback for backward compat)
    if (chance < 1 && Math.random() > chance) {
      bus.emit("StatusResisted", CombatEventPriority.Status, tick, {actorId:actor.id, type, reason:"chance_failed"}, {targetActorId:actor.id});
      return null;
    }

    // Apply tolerance gain
    if (!actor.statusTolerance) actor.statusTolerance = {};
    actor.statusTolerance[type] = currentTolerance + toleranceConfig.gainPerApplication;

    const existing = actor.statusEffects.find(s=>s.type===type);
    if (existing) {
      existing.stacks = Math.min(existing.maxStacks, existing.stacks + 1);
      existing.expiresAtTick = tick + durationFrames;
      existing.tickIntervalFrames = tickIntervalFrames;
      existing.dotDamagePerStack = dotDamagePerStack;
      if (tickIntervalFrames !== undefined && existing.nextTickFrame === undefined) existing.nextTickFrame = tick + tickIntervalFrames;
      existing.resistanceCheck = { accepted: true, reason: "stacked" };
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
      expiresAtTick:tick+durationFrames,
      tickIntervalFrames,
      nextTickFrame:tickIntervalFrames === undefined ? undefined : tick+tickIntervalFrames,
      dotDamagePerStack,
      stacks:1,
      maxStacks,
      resistanceCheck:{accepted:true},
      dispelPolicy:profile.dispelPolicy
    };
    actor.statusEffects.push(effect);
    bus.emit("StatusApplied", CombatEventPriority.Status, tick, {actorId:actor.id, type, statusId:effect.id}, {targetActorId:actor.id, sourceActorId});
    return effect;
  }

  applyBleed(actor: Actor, sourceActorId: string | undefined, sourceAction: string | undefined, tick: number, bus: CombatEventBus, chance=1, options: StatusApplyOptions = {}): StatusEffect | null {
    return this.applyStatus(actor, "bleed", sourceActorId, sourceAction, tick, bus, chance, options);
  }

  tick(actor: Actor, tick: number, bus: CombatEventBus, frozen: boolean, actors: Actor[] = [actor]): boolean {
    // Phase 4: decay status tolerance each tick
    if (actor.statusTolerance) {
      const decay = PVE_STATUS_CONFIG.tolerance.decayPerTick;
      for (const key of Object.keys(actor.statusTolerance) as StatusEffectType[]) {
        const current = actor.statusTolerance[key] ?? 0;
        if (current > 0) {
          actor.statusTolerance[key] = Math.max(0, current - decay);
        } else {
          delete actor.statusTolerance[key];
        }
      }
    }

    if (frozen) return false;
    let appliedAny = false;
    for (const s of [...actor.statusEffects]) {
      if (s.expiresAtTick <= tick) { actor.statusEffects = actor.statusEffects.filter(x=>x.id!==s.id); bus.emit("StatusExpired", CombatEventPriority.Status, tick, {actorId:actor.id, type:s.type}, {targetActorId:actor.id}); continue; }
      const profile = STATUS_PROFILES[s.type];
      if (profile?.dotDamagePerStack !== undefined && s.nextTickFrame !== undefined && s.nextTickFrame <= tick) {
        bus.emit("StatusTickRequested", CombatEventPriority.Status, tick, {actorId:actor.id, statusId:s.id, type:s.type}, {targetActorId:actor.id, sourceActorId:s.sourceActorId});
        const applied = this.applyDotDamage(actor, s, (s.dotDamagePerStack ?? profile.dotDamagePerStack) * s.stacks, tick, bus);
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

  deathCleanup(actor:Actor, tick:number, bus:CombatEventBus): void {
    const removed = actor.statusEffects.filter(s=>s.dispelPolicy!=="death_keep");
    actor.statusEffects = actor.statusEffects.filter(s=>s.dispelPolicy==="death_keep");
    if (removed.length) bus.emit("StatusDeathCleanup", CombatEventPriority.Status, tick, {actorId:actor.id, removed:removed.map(s=>s.type)}, {targetActorId:actor.id});
  }
}
