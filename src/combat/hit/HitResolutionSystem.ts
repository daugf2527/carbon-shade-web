import type { CombatSystem } from "../kernel/CombatSystem.js";
import type { SystemContext } from "../kernel/SystemContext.js";
import type { CombatEventBus } from "../events/CombatEventBus.js";
import type { Actor, ActionName, HitDecision } from "../types.js";
import { getAction } from "../actions/FrameDataAction.js";
import { CombatEventPriority } from "../events/CombatEventBus.js";
import { nextId } from "../util/ids.js";
import { DEFAULT_COMBO_CORRECTION_CONFIG, applyComboCorrectionFromHit } from "../combo/ComboCorrection.js";

export class HitResolutionSystem implements CombatSystem {
  readonly name = "ResolveHits";
  readonly phase = "DETECTION" as const;

  tick(ctx: SystemContext, bus: CombatEventBus): void {
    for (const attacker of ctx.actors) {
      const inst = attacker.currentAction;
      if (!inst || attacker.flags.dead || ctx.hitStop.isFrozen(attacker.id)) continue;
      const action = getAction(inst.actionName);
      for (const hitbox of action.active.filter(w => inst.localFrame >= w.start && inst.localFrame <= w.end)) {
        const query = ctx.hitResolver.buildQuery(ctx.tickCount, attacker, hitbox);
        bus.emit("HitQueryBuilt", CombatEventPriority.HitDecision, ctx.tickCount, query, { sourceActorId: attacker.id });
        let targetCount = 0;
        for (const target of ctx.actors) {
          if (target.id === attacker.id) continue;
          const geometry = ctx.hitResolver.geometry(query, target);
          const decision = ctx.hitDecisionResolver.decide(ctx.tickCount, query, hitbox, attacker, target, geometry);
          if (!decision.accepted) {
            if (geometry.overlap) bus.emit("HitRejected", CombatEventPriority.HitDecision, ctx.tickCount, decision, { sourceActorId: attacker.id, targetActorId: target.id });
            continue;
          }
          if (targetCount >= query.maxTargets) continue;
          targetCount++;
          this.applyHitDecision(ctx, bus, attacker, target, decision);
        }
      }
    }
  }

  applyHitDecision(ctx: SystemContext, bus: CombatEventBus, attacker: Actor, target: Actor, decision: HitDecision): void {
    const corr = nextId("corr");
    const inst = attacker.currentAction;
    if (inst) {
      if (!inst.alreadyHitByGroup.has(decision.hitbox.hitGroupId)) inst.alreadyHitByGroup.set(decision.hitbox.hitGroupId, new Set());
      inst.alreadyHitByGroup.get(decision.hitbox.hitGroupId)?.add(target.id);
      inst.hitConfirmed = true;
    }
    bus.emit("HitConfirmed", CombatEventPriority.HitDecision, ctx.tickCount, decision, { sourceActorId: attacker.id, targetActorId: target.id, correlationId: corr });
    if (decision.armorDecision?.controlBlocked) bus.emit("ArmorHit", CombatEventPriority.HitDecision, ctx.tickCount, decision, { sourceActorId: attacker.id, targetActorId: target.id, correlationId: corr });
    if (decision.downedDecision?.attempted) bus.emit("DownedHit", CombatEventPriority.HitDecision, ctx.tickCount, decision, { sourceActorId: attacker.id, targetActorId: target.id, correlationId: corr });
    if (decision.grabDecision?.attempted) {
      bus.emit("GrabAttempted", CombatEventPriority.HitDecision, ctx.tickCount, decision, { sourceActorId: attacker.id, targetActorId: target.id, correlationId: corr });
      bus.emit(decision.grabDecision.success ? "GrabSucceeded" : "GrabFailed", CombatEventPriority.HitDecision, ctx.tickCount, decision, { sourceActorId: attacker.id, targetActorId: target.id, correlationId: corr });
    }
    if (this.shouldStartBloodlustGrab(attacker, decision)) {
      ctx.startBloodlustGrab(attacker, target, decision, corr);
      return;
    }

    const forceStandKnockdown = this.shouldForceStandKnockdown(target, decision);
    if (forceStandKnockdown && decision.armorDecision) decision.armorDecision.finalReaction = "downed";
    this.updateComboCorrection(ctx, bus, target, decision, corr);
    const targetWasBleeding = target.statusEffects.some(s => s.type === "bleed");
    const req = ctx.damageResolver.requestFromHit(decision, corr, attacker.currentAction?.actionName, attacker.ai?.damage, { strength: attacker.strength, intelligence: attacker.intelligence, physAtk: attacker.physAtk, magAtk: attacker.magAtk, independentAtk: attacker.independentAtk, elementalDamage: attacker.elemStrength }, { defense: target.defense, elemResist: target.elemResist }, "physical_percent", attacker.level);
    bus.emit("DamageRequested", CombatEventPriority.Damage, ctx.tickCount, req, { sourceActorId: attacker.id, targetActorId: target.id, correlationId: corr });
    const damage = ctx.damageResolver.apply(target, req, { isCounter: decision.isCounter, isBackAttack: decision.isBackAttack, isCritical: decision.isCritical }, decision.armorDecision?.damageAllowed ?? true, this.damageMultipliersFor(ctx, attacker, target, req.actionName));
    ctx.lastHit.updateFromDamage(ctx.tickCount, damage);
    bus.emit("DamageApplied", CombatEventPriority.Damage, ctx.tickCount, damage, { sourceActorId: attacker.id, targetActorId: target.id, correlationId: corr });

    const finalReaction = ctx.reactionResolver.resolve(target, decision);
    ctx.lastHit.updateFromHit(ctx.tickCount, decision, finalReaction, corr);
    if (req.reactionPolicy === "normal_hit_reaction") {
      bus.emit("ReactionRequested", CombatEventPriority.Reaction, ctx.tickCount, { targetId: target.id, finalReaction }, { targetActorId: target.id, correlationId: corr });
      ctx.reactionResolver.apply(target, finalReaction, decision, attacker, ctx.tickCount);
      bus.emit("ReactionApplied", CombatEventPriority.Reaction, ctx.tickCount, { targetId: target.id, finalReaction }, { targetActorId: target.id, correlationId: corr });
      if (forceStandKnockdown) {
        bus.emit("ComboStandKnockdown", CombatEventPriority.Reaction, ctx.tickCount, {
          targetId: target.id,
          state: { ...target.comboCorrection },
        }, { targetActorId: target.id, correlationId: corr });
      }
      this.applyForcedWakeIfQueued(ctx, bus, target, corr);

      const action = getAction(attacker.currentAction?.actionName ?? "Idle");
      const controlBlocked = decision.armorDecision?.controlBlocked === true;
      const baseHs = decision.armorDecision?.hitStopAllowed === false ? 0 : action.hitStopProfile.frames;
      let attackerHs = baseHs;
      let victimHs = baseHs;
      if (controlBlocked) {
        attackerHs = target.armorProfile.baseType === "boss_super_armor" ? Math.min(baseHs, 5) : Math.min(baseHs, 3);
        victimHs = target.armorProfile.baseType === "boss_super_armor" ? 2 : 1;
      } else {
        const cap = target.armorProfile.baseType === "building_armor" ? action.hitStopProfile.buildingCapFrames : target.armorProfile.baseType === "boss_super_armor" ? action.hitStopProfile.bossCapFrames : action.hitStopProfile.frames;
        const hs = Math.min(baseHs, cap ?? baseHs);
        attackerHs = hs;
        victimHs = hs;
      }
      ctx.hitStop.start([attacker.id], attackerHs);
      ctx.hitStop.start([target.id], victimHs);
      const hs = Math.max(attackerHs, victimHs);
      if (hs > 0) bus.emit("HitStopStarted", CombatEventPriority.Reaction, ctx.tickCount, { actorIds: [attacker.id, target.id], frames: hs, attackerFrames: attackerHs, victimFrames: victimHs }, { sourceActorId: attacker.id, targetActorId: target.id, correlationId: corr });
      ctx.recoil.start(attacker.id, action.recoilProfile.frames);
      if (action.recoilProfile.frames > 0) bus.emit("RecoilStarted", CombatEventPriority.Reaction, ctx.tickCount, { actorId: attacker.id, frames: action.recoilProfile.frames }, { sourceActorId: attacker.id, correlationId: corr });
    }

    bus.emit("DamageNumberRequested", CombatEventPriority.Feedback, ctx.tickCount, { actorId: target.id, amount: damage.finalDamage, sourceKind: damage.sourceKind }, { targetActorId: target.id, correlationId: corr });
    bus.emit("VfxRequested", CombatEventPriority.Feedback, ctx.tickCount, { actorId: target.id, vfx: decision.armorDecision?.controlBlocked ? "armor_spark" : "hit_spark" }, { targetActorId: target.id, correlationId: corr });
    if (attacker.id === "player") {
      if (decision.isCritical) {
        bus.emit("CameraShakeRequested", CombatEventPriority.Feedback, ctx.tickCount, { intensity: 18, durationMs: 250 }, { sourceActorId: attacker.id, targetActorId: target.id, correlationId: corr });
      } else if (finalReaction === "launch") {
        bus.emit("CameraShakeRequested", CombatEventPriority.Feedback, ctx.tickCount, { intensity: 12, durationMs: 150 }, { sourceActorId: attacker.id, targetActorId: target.id, correlationId: corr });
      } else if (decision.hitbox.baseDamage >= 34 || decision.armorDecision?.controlBlocked) {
        bus.emit("CameraShakeRequested", CombatEventPriority.Feedback, ctx.tickCount, { intensity: 12, durationMs: 150 }, { sourceActorId: attacker.id, targetActorId: target.id, correlationId: corr });
      } else {
        bus.emit("CameraShakeRequested", CombatEventPriority.Feedback, ctx.tickCount, { intensity: 5, durationMs: 80 }, { sourceActorId: attacker.id, targetActorId: target.id, correlationId: corr });
      }
    }
    if (damage.hpAfter <= 0) {
      this.applyFrenzyBleedKillRestore(bus, ctx.tickCount, attacker, targetWasBleeding);
      ctx.death.kill(target, ctx.tickCount, bus, undefined, corr);
    }
    this.applyVimAndVigorBleed(ctx, bus, attacker, target, attacker.currentAction?.actionName);
    this.updateScenarioFlags(ctx, bus, decision, finalReaction, damage);
  }

  private shouldStartBloodlustGrab(attacker: Actor, decision: HitDecision): boolean {
    return attacker.currentAction?.actionName === "Bloodlust" && decision.hitbox.hitType === "grab" && decision.grabDecision?.success === true;
  }

  shouldForceStandKnockdown(target: Actor, decision: HitDecision): boolean {
    if (target.comboCorrection.standGauge < DEFAULT_COMBO_CORRECTION_CONFIG.barMax) return false;
    if (target.reactionState !== "none" && target.reactionState !== "micro_stagger" && target.reactionState !== "light_stagger" && target.reactionState !== "heavy_stagger") return false;
    if (decision.hitbox.canGrab || decision.hitbox.hitType === "grab") return false;
    if (decision.armorDecision?.controlBlocked) return false;
    return true;
  }

  updateComboCorrection(ctx: SystemContext, bus: CombatEventBus, target: Actor, decision: HitDecision, correlationId: string): void {
    const update = applyComboCorrectionFromHit(target.comboCorrection, target.reactionState, decision);
    bus.emit("ComboCorrectionUpdated", CombatEventPriority.HitDecision, ctx.tickCount, {
      targetId: target.id,
      bucket: update.bucket,
      standAdded: update.standAdded,
      airAdded: update.airAdded,
      downAdded: update.downAdded,
      hitRecoveryAdded: update.hitRecoveryAdded,
      state: { ...target.comboCorrection },
    }, { targetActorId: target.id, correlationId });
  }

  applyForcedWakeIfQueued(ctx: SystemContext, bus: CombatEventBus, target: Actor, correlationId: string): void {
    if (!target.comboCorrection.forcedWakeQueued || target.flags.dead) return;
    target.comboCorrection.forcedWakeQueued = false;
    target.reactionState = "getting_up";
    target.handfeel.downRemaining = 0;
    target.handfeel.reactionRemaining = 0;
    target.handfeel.getUpRemaining = Math.max(target.handfeel.getUpRemaining, DEFAULT_COMBO_CORRECTION_CONFIG.forcedWakeInvulFrames);
    target.velocity.x = 0;
    target.velocity.z = 0;
    target.velocity.y = 0;
    target.position.y = 0;
    target.armorProfile.temporaryFlags.getUpArmorUntilTick = ctx.tickCount + DEFAULT_COMBO_CORRECTION_CONFIG.forcedWakeInvulFrames;
    target.armorProfile.temporaryFlags.invulnerableUntilTick = ctx.tickCount + DEFAULT_COMBO_CORRECTION_CONFIG.forcedWakeInvulFrames;
    bus.emit("ComboForcedWake", CombatEventPriority.Reaction, ctx.tickCount, {
      targetId: target.id,
      invulnerableUntilTick: target.armorProfile.temporaryFlags.invulnerableUntilTick,
      state: { ...target.comboCorrection },
    }, { targetActorId: target.id, correlationId });
  }

  applyFrenzyBleedKillRestore(bus: CombatEventBus, tickCount: number, attacker: Actor, targetWasBleeding: boolean): void {
    if (!targetWasBleeding || !attacker.buffs.some(b => b.type === "frenzy") || attacker.resources.hp <= 0) return;
    const hpBefore = attacker.resources.hp;
    const restored = Math.max(1, Math.floor(attacker.resources.maxHp * 0.03));
    attacker.resources.hp = Math.min(attacker.resources.maxHp, attacker.resources.hp + restored);
    if (attacker.resources.hp > hpBefore) {
      bus.emit("BuffTicked", CombatEventPriority.Buff, tickCount, { actorId: attacker.id, type: "frenzy", reason: "bleeding_kill_restore", restored: attacker.resources.hp - hpBefore, hp: attacker.resources.hp }, { targetActorId: attacker.id });
    }
  }

  applyVimAndVigorBleed(ctx: SystemContext, bus: CombatEventBus, attacker: Actor, target: Actor, actionName?: ActionName): void {
    if (!actionName || !attacker.buffs.some(b => b.type === "vim_and_vigor")) return;
    if (!this.isVimAndVigorBleedAction(actionName)) return;
    ctx.status.applyBleed(target, attacker.id, actionName, ctx.tickCount, bus, 1, { durationFrames: 420, dotDamagePerStack: 14 });
  }

  damageMultipliersFor(ctx: SystemContext, attacker: Actor, target: Actor, actionName?: ActionName): Array<{ name: string; value: number }> {
    const multipliers: Array<{ name: string; value: number }> = [];
    if (actionName && this.isFrenzySkillAttackAction(actionName)) {
      const value = attacker.buffs.find(b => b.type === "frenzy")?.modifiers.find(modifier => modifier.key === "berserker_skill_attack")?.value;
      if (value && value !== 1) multipliers.push({ name: "frenzy_skill_attack", value });
      const derangeValue = attacker.buffs.find(b => b.type === "derange")?.modifiers.find(modifier => modifier.key === "derange_skill_attack")?.value;
      if (derangeValue && derangeValue !== 1) multipliers.push({ name: "derange_skill_attack", value: derangeValue });
      const bloodyCrossValue = attacker.buffs.find(b => b.type === "bloody_cross")?.modifiers.find(modifier => modifier.key === "bloody_cross_skill_attack")?.value;
      if (bloodyCrossValue && bloodyCrossValue !== 1) multipliers.push({ name: "bloody_cross_skill_attack", value: bloodyCrossValue });
      const thirstValue = attacker.buffs.find(b => b.type === "thirst")?.modifiers.find(modifier => modifier.key === "thirst_skill_attack_percent")?.value;
      if (thirstValue && thirstValue !== 0) multipliers.push({ name: "thirst_skill_attack", value: 1 + thirstValue / 100 });
    }
    const bmStrength = attacker.buffs.find(b => b.type === "blood_memory")?.modifiers.find(modifier => modifier.key === "blood_memory_strength_percent")?.value;
    if (bmStrength && bmStrength !== 0) multipliers.push({ name: "ratio_7_atk_reinforce", value: 1 + bmStrength / 100 });
    const bmDef = attacker.buffs.find(b => b.type === "blood_memory")?.modifiers.find(modifier => modifier.key === "blood_memory_incoming_damage_reduction_percent")?.value;
    if (bmDef && bmDef !== 0) multipliers.push({ name: "ratio_9_misc", value: 1 - bmDef / 100 });
    const ruptureStacks = target.statusEffects.filter(status => status.type === "rupture").reduce((sum, status) => sum + status.stacks, 0);
    const ruptureMultiplierPerStack = ctx.status.profile("rupture")?.incomingDirectDamageMultiplierPerStack ?? 0.1;
    if (ruptureStacks > 0) multipliers.push({ name: "rupture_incoming_damage", value: 1 + ruptureStacks * ruptureMultiplierPerStack });
    if (this.isPveComboProtectedTarget(target) && target.comboCorrection.damageScale < 1) {
      multipliers.push({ name: "combo_damage_scale", value: target.comboCorrection.damageScale });
    }
    return multipliers;
  }

  isPveComboProtectedTarget(target: Actor): boolean {
    return target.type === "boss" || target.armorProfile.baseType === "boss_super_armor" || target.armorProfile.baseType === "super_armor";
  }

  isFrenzySkillAttackAction(actionName: ActionName): boolean {
    return actionName === "FrenzyBasic1" || actionName === "FrenzyBasic2" || actionName === "FrenzyBasic3" || actionName === "DashAttack" || actionName === "JumpAttack" || actionName === "RagingFury" || actionName === "Bloodlust" || actionName === "GoreCross" || actionName === "OutrageBreak" || actionName === "ExtremeOverkill" || actionName === "RagingFury2" || actionName === "BloodRuin" || actionName === "BloodSword" || actionName === "BurstFury" || actionName === "EarthShatter" || actionName === "UpwardSlash" || actionName === "MountainousWheel";
  }

  isVimAndVigorBleedAction(actionName: ActionName): boolean {
    return actionName === "MountainousWheel" || actionName === "RagingFury" || actionName === "Bloodlust" || actionName === "GoreCross" || actionName === "RagingFury2" || actionName === "BurstFury";
  }

  updateScenarioFlags(ctx: SystemContext, bus: CombatEventBus, decision: HitDecision, finalReaction: string, damage: { sourceKind: string; reactionPolicy: string; finalDamage: number }): void {
    if (decision.accepted && decision.hitbox.id === "nb1") ctx.scenario.normalHitObserved = true;
    if (finalReaction === "launch") ctx.scenario.launchObserved = true;
    const rfHits = bus.archive.filter(e => e.type === "HitConfirmed" && JSON.stringify(e.payload).includes("rf_pillar")).length;
    if (rfHits >= 4 || decision.hitbox.id.startsWith("rf_pillar_08")) ctx.scenario.ragingFuryMultiHitObserved = true;
    if (decision.armorDecision?.baseType === "boss_super_armor") ctx.scenario.armorHitObserved = true;
    if (decision.armorDecision?.baseType === "building_armor" && finalReaction === "armor_feedback_only" && damage.finalDamage > 0) ctx.scenario.buildingArmorBlockedControlObserved = true;
    if (damage.sourceKind === "status_dot" && damage.reactionPolicy === "status_tick_feedback_only") ctx.scenario.bleedObserved = true;
  }
}
