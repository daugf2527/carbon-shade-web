import type { Actor, ActionName, ScenarioBooleans, HitDecision, Facing, HandfeelReport } from "../types.js";
import { createActor } from "../actors/ActorFactory.js";
import { getAction } from "../actions/FrameDataAction.js";
import { BrowserInputState, CommandInputParser, InputBuffer, type BufferedInput } from "../input/BrowserInputState.js";
import { RunCommandDetector } from "../input/RunCommandDetector.js";
import { CombatEventBus, CombatEventPriority } from "../events/CombatEventBus.js";
import { nextId, resetIds } from "../util/ids.js";
import { cloneVec3 } from "../util/geometry.js";
import { HitResolver2D5 } from "../hit/HitResolver2D5.js";
import { HitDecisionResolver } from "../hit/HitDecisionResolver.js";
import { DamageResolver } from "../damage/DamageResolver.js";
import { ReactionResolver } from "../reaction/ReactionResolver.js";
import { HitStopController } from "../reaction/HitStopController.js";
import { RecoilController } from "../reaction/RecoilController.js";
import { CooldownResourceKernel } from "../resources/CooldownResourceKernel.js";
import { BuffLifecycleSystem } from "../buffs/BuffLifecycleSystem.js";
import { StatusEffectSystem } from "../status/StatusEffectSystem.js";
import { PushBoxResolver } from "../motion/PushBoxResolver.js";
import { RootMotionController } from "../motion/RootMotionController.js";
import { MovementInputProvider } from "../motion/MovementInputProvider.js";
import { LocomotionController } from "../motion/LocomotionController.js";
import { DeathLoop } from "../death/DeathLoop.js";
import { LastHitTrace } from "../debug/LastHitTrace.js";
import { DebugOverlay, type DebugSnapshot } from "../debug/DebugOverlay.js";
import { ReplayRecorder } from "../replay/ReplayRecorder.js";
import { EnemyAIController } from "../ai/EnemyAI.js";

export interface CombatKernelOptions { enableReplay?: boolean; }

export class CombatKernel {
  tickCount = 0;
  readonly bus = new CombatEventBus();
  readonly inputState = new BrowserInputState();
  readonly parser = new CommandInputParser();
  readonly inputBuffer = new InputBuffer();
  readonly actors: Actor[] = [];
  readonly hitResolver = new HitResolver2D5();
  readonly hitDecisionResolver = new HitDecisionResolver();
  readonly damageResolver = new DamageResolver();
  readonly reactionResolver = new ReactionResolver();
  readonly hitStop = new HitStopController();
  readonly recoil = new RecoilController();
  readonly cooldowns = new CooldownResourceKernel();
  readonly buffs = new BuffLifecycleSystem();
  readonly status = new StatusEffectSystem();
  readonly push = new PushBoxResolver();
  readonly rootMotion = new RootMotionController();
  readonly movementInput = new MovementInputProvider();
  readonly locomotion = new LocomotionController();
  readonly death = new DeathLoop();
  readonly lastHit = new LastHitTrace();
  readonly debug = new DebugOverlay();
  readonly runDetector = new RunCommandDetector();
  readonly enemyAI = new EnemyAIController();
  readonly replay = new ReplayRecorder();
  readonly worldBounds = { xMin: 64, xMax: 1820, zMin: -120, zMax: 120 };
  scenario: ScenarioBooleans = {
    normalHitObserved:false,
    launchObserved:false,
    ragingFuryMultiHitObserved:false,
    armorHitObserved:false,
    buildingArmorBlockedControlObserved:false,
    bleedObserved:false,
    quickReboundObserved:false,
  };
  notes: string[] = [];

  constructor(readonly options: CombatKernelOptions = {}) {
    this.reset();
    this.bus.blockPolicy = (event) => {
      const target = event.targetActorId ?? (event.payload as {actorId?:string}).actorId;
      return target ? this.death.blocks(target, event.type) : null;
    };
  }

  get player(): Actor {
    const p=this.actors.find(a=>a.id==="player");
    if(!p) throw new Error("player missing");
    return p;
  }

  reset(): void {
    resetIds();
    this.tickCount=0;
    this.actors.length=0;
    this.actors.push(
      createActor("player","player","player",260,0),
      createActor("grunt","enemy","enemy",520,0),
      createActor("dummy","dummy","enemy",720,28),
      createActor("imp","enemy","enemy",930,-36),
      createActor("boss","boss","enemy",1210,-20),
      createActor("building","building","enemy",1560,0),
    );
    this.bus.clear();
    this.inputBuffer.clearAll();
    this.inputState.clearAll();
    this.runDetector.reset();
    this.hitStop.clear();
    this.recoil.clear();
    this.death.clear();
    this.replay.clear();
    this.scenario = { normalHitObserved:false, launchObserved:false, ragingFuryMultiHitObserved:false, armorHitObserved:false, buildingArmorBlockedControlObserved:false, bleedObserved:false, quickReboundObserved:false };
  }

  onLargeDelta(deltaMs:number): void { this.notes.push(`large-delta:${deltaMs}`); }
  emitLongFrameWarning(deltaMs:number): void { this.notes.push(`long-frame:${deltaMs}`); }

  tick(): void {
    const replayArchiveStart = this.bus.archive.length;
    this.tickCount += 1;
    this.bus.emit("TickStarted", CombatEventPriority.Debug, this.tickCount, {tick:this.tickCount});

    const endedHitStop = this.hitStop.tick();
    for (const id of endedHitStop) this.bus.emit("HitStopEnded", CombatEventPriority.Reaction, this.tickCount, {actorId:id}, {targetActorId:id});

    const endedRecoil = this.recoil.tick(id => this.hitStop.isFrozen(id));
    for (const id of endedRecoil) this.bus.emit("RecoilEnded", CombatEventPriority.Reaction, this.tickCount, {actorId:id}, {targetActorId:id});

    this.collectInput();
    this.consumeInput();
    this.applyLocomotionFromHeldInput();
    this.tickEnemyAI();
    this.updateActions();
    this.applyRootMotion();
    this.push.resolve(this.actors);
    for (const actor of this.actors) this.clampToBounds(actor);
    this.resolveHitQueries();
    this.updateReactionMotion();

    for (const a of this.actors) {
      if (a.handfeel.hitFlashRemaining && a.handfeel.hitFlashRemaining > 0) a.handfeel.hitFlashRemaining -= 1;
      if (a.handfeel.visualRecoilRemaining && a.handfeel.visualRecoilRemaining > 0) a.handfeel.visualRecoilRemaining -= 1;
      if (this.status.tick(a, this.tickCount, this.bus, this.hitStop.isFrozen(a.id))) this.scenario.bleedObserved = true;
      this.buffs.tick(a, this.tickCount, this.bus, this.hitStop.isFrozen(a.id));
      this.cooldowns.tick(a, this.tickCount, this.bus, this.hitStop.isFrozen(a.id));
      if(a.resources.hp<=0) this.death.kill(a,this.tickCount,this.bus);
    }

    this.bus.emit("TickEnded", CombatEventPriority.Debug, this.tickCount, {tick:this.tickCount});
    this.bus.flush();
    if (this.options.enableReplay !== false) {
      const flushedEvents = this.bus.archive.slice(replayArchiveStart);
      this.replay.record(this.tickCount, this.actors, flushedEvents, this.inputState.snapshot(this.tickCount));
    }
    this.inputState.endTick();
  }

  private collectInput(): void {
    const frame=this.inputState.snapshot(this.tickCount);
    const player=this.player;
    const movementFacing=this.resolveMovementFacing(frame, player.facing);
    const canFaceFromLocomotion = !player.currentAction && ["none", "getting_up"].includes(player.reactionState);
    if (movementFacing && canFaceFromLocomotion) player.facing = movementFacing;

    this.bus.emit("RawInputCollected", CombatEventPriority.Debug, this.tickCount, {held:[...frame.held], pressed:[...frame.pressed]});
    for(const input of this.runDetector.detect(frame, player.facing)) {
      this.inputBuffer.push(input);
      this.bus.emit("InputBuffered", CombatEventPriority.Debug, this.tickCount, input);
    }
    const parsed=this.parser.parse(frame,{facing:player.facing,isDowned:player.reactionState==="downed"});
    for(const input of parsed){
      this.inputBuffer.push(input);
      this.bus.emit("InputBuffered", CombatEventPriority.Debug, this.tickCount, input);
    }
  }

  private consumeInput(): void {
    const player=this.player;
    if(player.flags.dead) return;
    const allowed = new Set<ActionName>(["Walk","Run","NormalBasic1","DashAttack","Jump","JumpAttack","UpwardSlash","MountainousWheel","RagingFury","Bloodlust","Backstep","QuickRebound","FrenzyToggle","Derange","Diehard","ForceDownPlayer","ForceBleed","RunScreenshotScenario"]);
    const item=this.inputBuffer.consumeAllowed(this.tickCount, allowed, this.hitStop.isFrozen(player.id) || this.recoil.isRecoiling(player.id));
    if(!item) return;

    if (item.actionName === "Walk" || item.actionName === "Run") {
      this.consumeLocomotionCommand(player, item);
      return;
    }

    this.bus.emit("InputConsumed", CombatEventPriority.Debug, this.tickCount, item);
    this.requestAction(player, this.mapPlayerAction(item.actionName), item.source, item.facing ?? player.facing);
  }

  private consumeLocomotionCommand(player: Actor, item: BufferedInput): void {
    if (!this.isMovementHeld()) return;
    if (item.facing) player.facing = item.facing;
    if (item.actionName === "Run") this.locomotion.armRun(player, item.facing ?? player.facing);
    else this.locomotion.armWalk(player, item.facing);
    this.bus.emit("InputConsumed", CombatEventPriority.Debug, this.tickCount, item);
  }

  private applyLocomotionFromHeldInput(): void {
    const player = this.player;
    const movement = this.movementInput.snapshot(this.inputState);
    if (!this.isMovementHeld()) {
      this.locomotion.stop(player);
      return;
    }
    this.locomotion.apply(player, movement, this.hitStop.isFrozen(player.id) || this.recoil.isRecoiling(player.id));
    this.clampToBounds(player);
  }

  private tickEnemyAI(): void {
    for (const actor of this.actors) if (actor.faction === "enemy") this.enemyAI.tick(actor, this);
  }

  private mapPlayerAction(action:ActionName): ActionName {
    if(action==="NormalBasic1" && this.player.currentAction?.actionName==="Jump") return "JumpAttack";
    if(action==="NormalBasic1" && this.player.locomotion.mode==="run") return "DashAttack";
    if(action==="NormalBasic1" && this.player.buffs.some(b=>b.type==="frenzy")) return "FrenzyBasic1";
    return action;
  }

  private resolveMovementFacing(frame: { held: Set<string>; pressed: Set<string> }, currentFacing: Facing): Facing | null {
    const leftHeld = frame.held.has("ArrowLeft") || frame.held.has("KeyA");
    const rightHeld = frame.held.has("ArrowRight") || frame.held.has("KeyD");
    if (leftHeld && rightHeld) return currentFacing;
    if (rightHeld || frame.pressed.has("ArrowRight") || frame.pressed.has("KeyD")) return "right";
    if (leftHeld || frame.pressed.has("ArrowLeft") || frame.pressed.has("KeyA")) return "left";
    return null;
  }

  private isMovementHeld(): boolean {
    return this.inputState.isHeld("ArrowLeft") || this.inputState.isHeld("ArrowRight") || this.inputState.isHeld("ArrowUp") || this.inputState.isHeld("ArrowDown") || this.inputState.isHeld("KeyA") || this.inputState.isHeld("KeyD") || this.inputState.isHeld("KeyW") || this.inputState.isHeld("KeyS");
  }

  requestAction(actor: Actor, actionName: ActionName, source:"command"|"hotkey"|"debug"|"ai"="debug", facing?: Facing): boolean {
    if(actionName==="Walk" || actionName==="Run") {
      if (actionName === "Run") this.locomotion.armRun(actor, facing ?? actor.facing);
      else this.locomotion.armWalk(actor, facing);
      return true;
    }
    if(actor.flags.dead) {
      this.bus.emit("ActionRequested", CombatEventPriority.Interrupt, this.tickCount, {actorId:actor.id, actionName, rejected:"dead"}, {targetActorId:actor.id});
      return false;
    }
    if(actor.id==="player" && actionName==="EnemyBasic") {
      this.bus.emit("ActionRequested", CombatEventPriority.Interrupt, this.tickCount, {actorId:actor.id, actionName, rejected:"busy"}, {targetActorId:actor.id});
      return false;
    }
    if(actionName==="ForceDownPlayer") return this.applyDebugAction(actor, actionName, () => { actor.reactionState="downed"; return true; });
    if(actionName==="ForceBleed") return this.applyDebugAction(actor, actionName, () => { this.status.applyBleed(this.actors.find(a=>a.id==="grunt") ?? actor, actor.id, "ForceBleed", this.tickCount, this.bus, 1); return true; });
    if(actionName==="RunScreenshotScenario") { const scenario=this.runDeterministicScenario(); this.bus.emit("DebugActionApplied", CombatEventPriority.Debug, this.tickCount, {actorId:actor.id, actionName, source:"debug", scenario}, {sourceActorId:actor.id, targetActorId:actor.id}); return true; }
    if(actionName==="FrenzyToggle") { if(actor.buffs.some(b=>b.type==="frenzy")) this.buffs.remove(actor,"frenzy",this.tickCount,this.bus); else this.buffs.apply(actor,"frenzy",this.tickCount,this.bus); return true; }
    if(actionName==="Derange") this.buffs.apply(actor,"derange",this.tickCount,this.bus,180);

    const resolvedActionName = this.resolveRequestedAction(actor, actionName);
    if (!resolvedActionName) {
      this.bus.emit("ActionRequested", CombatEventPriority.Interrupt, this.tickCount, {actorId:actor.id, actionName, rejected:"busy"}, {targetActorId:actor.id});
      return false;
    }

    if (facing) actor.facing = facing;
    const lockedFacing = facing ?? actor.facing;
    const action = getAction(resolvedActionName);
    this.bus.emit("ActionRequested", CombatEventPriority.ResourceCooldown, this.tickCount, {actorId:actor.id, actionName:resolvedActionName}, {targetActorId:actor.id});
    if(!this.cooldowns.gate(actor, action, this.tickCount, this.bus)) return false;

    actor.currentAction = {
      id:nextId("act"),
      actionName:resolvedActionName,
      ownerId:actor.id,
      startTick:this.tickCount,
      localFrame:0,
      phase:"enter",
      commandSource:source,
      lockedFacing,
      facingLocked:true,
      movementLocked:true,
      activeHitboxIds:[],
      alreadyHitByGroup:new Map(),
      hitConfirmed:false,
      armorHitConfirmed:false,
      downedHitConfirmed:false,
      whiffed:false,
      cancelTokens:[],
      interrupted:false,
      hitStopFrozen:false,
    };
    actor.locomotion.mode = "idle";
    actor.facing = lockedFacing;
    this.bus.emit("ActionEntered", CombatEventPriority.ResourceCooldown, this.tickCount, {actorId:actor.id, actionName:resolvedActionName}, {targetActorId:actor.id});
    if(action.cooldownProfile?.cooldownStartsAt === "on_action_enter") this.cooldowns.start(actor, action, this.tickCount, this.bus);
    if(action.costProfile?.costTiming === "on_startup") this.cooldowns.pay(actor, action, this.tickCount, this.bus);
    return true;
  }

  private canCancelInto(actor: Actor, actionName: ActionName): boolean {
    const current = actor.currentAction;
    if (!current) return true;
    const action = getAction(current.actionName);
    const threshold = current.hitConfirmed ? action.cancelPolicy.hitCancelFrom : action.cancelPolicy.whiffCancelFrom;
    if (threshold === undefined || current.localFrame < threshold) return false;
    return action.cancelPolicy.into?.includes(actionName) ?? false;
  }

  private applyDebugAction(actor: Actor, actionName: ActionName, apply: () => boolean): boolean {
    const corr = nextId("corr");
    this.bus.emit("DebugActionRequested", CombatEventPriority.Debug, this.tickCount, {actorId:actor.id, actionName, source:"debug"}, {sourceActorId:actor.id, targetActorId:actor.id, correlationId:corr});
    const applied = apply();
    this.bus.emit("DebugActionApplied", CombatEventPriority.Debug, this.tickCount, {actorId:actor.id, actionName, source:"debug", applied}, {sourceActorId:actor.id, targetActorId:actor.id, correlationId:corr});
    return applied;
  }

  private resolveRequestedAction(actor: Actor, actionName: ActionName): ActionName | null {
    const current = actor.currentAction;
    if (!current) return actionName;
    if (actionName === "NormalBasic1") {
      if (current.actionName === "NormalBasic1") return this.canCancelInto(actor, "NormalBasic2") ? "NormalBasic2" : null;
      if (current.actionName === "NormalBasic2") return this.canCancelInto(actor, "NormalBasic3") ? "NormalBasic3" : null;
      if (current.actionName === "NormalBasic3") return this.canCancelInto(actor, "NormalBasic1") ? "NormalBasic1" : null;
    }
    if (actionName === "FrenzyBasic1") {
      if (current.actionName === "FrenzyBasic1") return this.canCancelInto(actor, "FrenzyBasic2") ? "FrenzyBasic2" : null;
      if (current.actionName === "FrenzyBasic2") return this.canCancelInto(actor, "FrenzyBasic3") ? "FrenzyBasic3" : null;
      if (current.actionName === "FrenzyBasic3") return this.canCancelInto(actor, "FrenzyBasic1") ? "FrenzyBasic1" : null;
    }
    return this.canCancelInto(actor, actionName) ? actionName : null;
  }

  private updateActions(): void {
    for(const actor of this.actors){
      const inst=actor.currentAction;
      if(!inst || actor.flags.dead) continue;
      actor.facing = inst.lockedFacing;
      if(this.hitStop.isFrozen(actor.id)) {
        inst.hitStopFrozen=true;
        inst.phase="hitstop_freeze";
        continue;
      }
      inst.hitStopFrozen=false;
      const action=getAction(inst.actionName);
      inst.localFrame += 1;
      if(inst.actionName==="QuickRebound") this.updateQuickRebound(actor, action.maxHoldFrames ?? 180);
      if(inst.localFrame <= (action.startup[0]?.end ?? 0)) inst.phase="startup";
      else if(action.active.some(w=>inst.localFrame>=w.start && inst.localFrame<=w.end)) inst.phase="active";
      else if(inst.localFrame < action.totalFrames) inst.phase="recovery";
      else {
        inst.phase="ended";
        this.bus.emit("ActionEnded", CombatEventPriority.ResourceCooldown, this.tickCount, {actorId:actor.id, actionName:inst.actionName}, {targetActorId:actor.id});
        actor.currentAction = undefined;
        if(actor.reactionState==="getting_up") actor.reactionState="none";
      }
    }
  }

  private updateQuickRebound(actor:Actor, maxHold:number): void {
    actor.reactionState="quick_rebound";
    actor.armorProfile.temporaryFlags.invulnerableUntilTick=this.tickCount+1;
    const held = this.inputState.isHeld("KeyC") || this.inputState.isHeld("KeyL");
    if(!held || (actor.currentAction?.localFrame ?? 0) >= maxHold){
      actor.currentAction=undefined;
      actor.reactionState="getting_up";
      actor.handfeel.getUpRemaining = Math.max(actor.handfeel.getUpRemaining, 10);
      actor.armorProfile.temporaryFlags.getUpArmorUntilTick=this.tickCount+18;
      this.scenario.quickReboundObserved = true;
    }
  }

  private applyRootMotion(): void {
    for(const actor of this.actors){
      if(!actor.currentAction || actor.flags.dead || this.hitStop.isFrozen(actor.id)) continue;
      actor.previousPosition=cloneVec3(actor.position);
      this.rootMotion.apply(actor,getAction(actor.currentAction.actionName));
      this.clampToBounds(actor);
    }
  }

  private clampToBounds(actor: Actor): void {
    actor.position.x = Math.max(this.worldBounds.xMin, Math.min(this.worldBounds.xMax, actor.position.x));
    actor.position.z = Math.max(this.worldBounds.zMin, Math.min(this.worldBounds.zMax, actor.position.z));
  }

  private resolveHitQueries(): void {
    for(const attacker of this.actors){
      const inst=attacker.currentAction;
      if(!inst || attacker.flags.dead || this.hitStop.isFrozen(attacker.id)) continue;
      const action=getAction(inst.actionName);
      for(const hitbox of action.active.filter(w=>inst.localFrame>=w.start && inst.localFrame<=w.end)){
        const query=this.hitResolver.buildQuery(this.tickCount, attacker, hitbox);
        this.bus.emit("HitQueryBuilt", CombatEventPriority.HitDecision, this.tickCount, query, {sourceActorId:attacker.id});
        let targetCount=0;
        for(const target of this.actors){
          if(target.id===attacker.id) continue;
          const geometry=this.hitResolver.geometry(query,target);
          const decision=this.hitDecisionResolver.decide(this.tickCount, query, hitbox, attacker, target, geometry);
          if(!decision.accepted){
            if(geometry.overlap) this.bus.emit("HitRejected", CombatEventPriority.HitDecision, this.tickCount, decision, {sourceActorId:attacker.id,targetActorId:target.id});
            continue;
          }
          if(targetCount>=query.maxTargets) continue;
          targetCount++;
          this.applyHitDecision(attacker,target,decision);
        }
      }
    }
  }

  private applyHitDecision(attacker:Actor, target:Actor, decision:HitDecision): void {
    const corr=nextId("corr");
    const inst=attacker.currentAction;
    if(inst){
      if(!inst.alreadyHitByGroup.has(decision.hitbox.hitGroupId)) inst.alreadyHitByGroup.set(decision.hitbox.hitGroupId,new Set());
      inst.alreadyHitByGroup.get(decision.hitbox.hitGroupId)?.add(target.id);
      inst.hitConfirmed=true;
    }
    this.bus.emit("HitConfirmed", CombatEventPriority.HitDecision, this.tickCount, decision, {sourceActorId:attacker.id,targetActorId:target.id, correlationId:corr});
    if(decision.armorDecision?.controlBlocked) this.bus.emit("ArmorHit", CombatEventPriority.HitDecision, this.tickCount, decision, {sourceActorId:attacker.id,targetActorId:target.id, correlationId:corr});
    if(decision.downedDecision?.attempted) this.bus.emit("DownedHit", CombatEventPriority.HitDecision, this.tickCount, decision, {sourceActorId:attacker.id,targetActorId:target.id, correlationId:corr});
    if(decision.grabDecision?.attempted) {
      this.bus.emit("GrabAttempted", CombatEventPriority.HitDecision, this.tickCount, decision, {sourceActorId:attacker.id,targetActorId:target.id, correlationId:corr});
      this.bus.emit(decision.grabDecision.success ? "GrabSucceeded" : "GrabFailed", CombatEventPriority.HitDecision, this.tickCount, decision, {sourceActorId:attacker.id,targetActorId:target.id, correlationId:corr});
    }

    const targetWasBleeding = target.statusEffects.some(s => s.type === "bleed");
    const req=this.damageResolver.requestFromHit(decision,corr,attacker.currentAction?.actionName, attacker.ai?.damage);
    this.bus.emit("DamageRequested", CombatEventPriority.Damage, this.tickCount, req, {sourceActorId:attacker.id,targetActorId:target.id, correlationId:corr});
    const damage=this.damageResolver.apply(target, req, {isCounter:decision.isCounter,isBackAttack:decision.isBackAttack,isCritical:decision.isCritical}, decision.armorDecision?.damageAllowed ?? true, this.damageMultipliersFor(attacker, req.actionName));
    this.lastHit.updateFromDamage(this.tickCount,damage);
    this.bus.emit("DamageApplied", CombatEventPriority.Damage, this.tickCount, damage, {sourceActorId:attacker.id,targetActorId:target.id, correlationId:corr});

    const finalReaction=this.reactionResolver.resolve(target,decision);
    this.lastHit.updateFromHit(this.tickCount,decision,finalReaction,corr);
    if(req.reactionPolicy==="normal_hit_reaction"){
      this.bus.emit("ReactionRequested", CombatEventPriority.Reaction, this.tickCount, {targetId:target.id, finalReaction}, {targetActorId:target.id, correlationId:corr});
      this.reactionResolver.apply(target,finalReaction,decision,attacker,this.tickCount);
      this.bus.emit("ReactionApplied", CombatEventPriority.Reaction, this.tickCount, {targetId:target.id, finalReaction}, {targetActorId:target.id, correlationId:corr});

      const action=getAction(attacker.currentAction?.actionName ?? "Idle");
      const controlBlocked = decision.armorDecision?.controlBlocked === true;
      const baseHs = decision.armorDecision?.hitStopAllowed === false ? 0 : action.hitStopProfile.frames;
      let attackerHs = baseHs;
      let victimHs = baseHs;
      if (controlBlocked) {
        attackerHs = target.armorProfile.baseType === "boss_super_armor" ? Math.min(baseHs, 5) : Math.min(baseHs, 3);
        victimHs = target.armorProfile.baseType === "boss_super_armor" ? 2 : 1;
      } else {
        const cap=target.armorProfile.baseType==="building_armor" ? action.hitStopProfile.buildingCapFrames : target.armorProfile.baseType==="boss_super_armor" ? action.hitStopProfile.bossCapFrames : action.hitStopProfile.frames;
        const hs = Math.min(baseHs, cap ?? baseHs);
        attackerHs = hs;
        victimHs = hs;
      }
      this.hitStop.start([attacker.id], attackerHs);
      this.hitStop.start([target.id], victimHs);
      const hs = Math.max(attackerHs, victimHs);
      if(hs>0) this.bus.emit("HitStopStarted", CombatEventPriority.Reaction, this.tickCount, {actorIds:[attacker.id,target.id], frames:hs, attackerFrames:attackerHs, victimFrames:victimHs}, {sourceActorId:attacker.id,targetActorId:target.id, correlationId:corr});
      this.recoil.start(attacker.id, action.recoilProfile.frames);
      if(action.recoilProfile.frames>0) this.bus.emit("RecoilStarted", CombatEventPriority.Reaction, this.tickCount, {actorId:attacker.id, frames:action.recoilProfile.frames}, {sourceActorId:attacker.id, correlationId:corr});
    }

    this.bus.emit("DamageNumberRequested", CombatEventPriority.Feedback, this.tickCount, {actorId:target.id, amount:damage.finalDamage, sourceKind:damage.sourceKind}, {targetActorId:target.id, correlationId:corr});
    this.bus.emit("VfxRequested", CombatEventPriority.Feedback, this.tickCount, {actorId:target.id, vfx:decision.armorDecision?.controlBlocked?"armor_spark":"hit_spark"}, {targetActorId:target.id, correlationId:corr});
    if (attacker.id === "player" && (decision.hitbox.baseDamage >= 34 || finalReaction === "launch" || decision.armorDecision?.controlBlocked)) {
      this.bus.emit("CameraShakeRequested", CombatEventPriority.Feedback, this.tickCount, { intensity: decision.armorDecision?.controlBlocked ? 0.003 : 0.005, durationMs: decision.hitbox.baseDamage >= 34 ? 110 : 80 }, { sourceActorId: attacker.id, targetActorId: target.id, correlationId: corr });
    }
    if(damage.hpAfter<=0) {
      this.applyFrenzyBleedKillRestore(attacker, targetWasBleeding);
      this.death.kill(target,this.tickCount,this.bus,undefined,corr);
    }
    if(req.actionName==="RagingFury" && decision.hitbox.hitType==="blood_pillar" && attacker.buffs.some(b=>b.type==="vim_and_vigor")) this.status.applyBleed(target,attacker.id,"RagingFury",this.tickCount,this.bus,1);
    this.updateScenarioFlags(decision, finalReaction, damage);
  }

  private applyFrenzyBleedKillRestore(attacker: Actor, targetWasBleeding: boolean): void {
    if (!targetWasBleeding || !attacker.buffs.some(b=>b.type==="frenzy") || attacker.resources.hp <= 0) return;
    const hpBefore = attacker.resources.hp;
    const restored = Math.max(1, Math.floor(attacker.resources.maxHp * 0.03));
    attacker.resources.hp = Math.min(attacker.resources.maxHp, attacker.resources.hp + restored);
    if (attacker.resources.hp > hpBefore) {
      this.bus.emit("BuffTicked", CombatEventPriority.Buff, this.tickCount, {actorId:attacker.id, type:"frenzy", reason:"bleeding_kill_restore", restored:attacker.resources.hp-hpBefore, hp:attacker.resources.hp}, {targetActorId:attacker.id});
    }
  }

  private damageMultipliersFor(attacker: Actor, actionName?: ActionName): Array<{name:string; value:number}> {
    if (!actionName || !this.isFrenzySkillAttackAction(actionName)) return [];
    const value = attacker.buffs.find(b=>b.type==="frenzy")?.modifiers.find(modifier => modifier.key === "berserker_skill_attack")?.value;
    return value && value !== 1 ? [{name:"frenzy_skill_attack", value}] : [];
  }

  private isFrenzySkillAttackAction(actionName: ActionName): boolean {
    return actionName === "FrenzyBasic1" || actionName === "FrenzyBasic2" || actionName === "FrenzyBasic3" || actionName === "DashAttack" || actionName === "JumpAttack" || actionName === "RagingFury" || actionName === "Bloodlust";
  }

  private updateScenarioFlags(decision:HitDecision, finalReaction:string, damage:{sourceKind:string; reactionPolicy:string; finalDamage:number}): void {
    if(decision.accepted && decision.hitbox.id==="nb1") this.scenario.normalHitObserved=true;
    if(finalReaction==="launch") this.scenario.launchObserved=true;
    const rfHits=this.bus.archive.filter(e=>e.type==="HitConfirmed" && JSON.stringify(e.payload).includes("rf_pillar")).length;
    if(rfHits>=4 || decision.hitbox.id.startsWith("rf_pillar_08")) this.scenario.ragingFuryMultiHitObserved=true;
    if(decision.armorDecision?.baseType==="boss_super_armor") this.scenario.armorHitObserved=true;
    if(decision.armorDecision?.baseType==="building_armor" && finalReaction==="armor_feedback_only" && damage.finalDamage>0) this.scenario.buildingArmorBlockedControlObserved=true;
    if(damage.sourceKind==="status_dot" && damage.reactionPolicy==="status_tick_feedback_only") this.scenario.bleedObserved=true;
  }

  private updateReactionMotion(): void {
    for(const a of this.actors){
      if(a.flags.dead) continue;
      if(this.hitStop.isFrozen(a.id)) continue;
      const friction = a.currentAction ? 0.82 : 0.74;
      if(a.reactionState==="launch" || a.reactionState==="air_hitstun" || a.reactionState==="falling" || a.reactionState==="knockback" || a.reactionState==="downed") {
        a.previousPosition=cloneVec3(a.position);
        a.position.x += a.velocity.x;
        a.position.z += a.velocity.z;
        a.position.y += a.velocity.y;
        a.velocity.x *= friction;
        a.velocity.z *= friction;
        a.velocity.y -= 0.56;
        if((a.reactionState==="launch" || a.reactionState==="air_hitstun") && a.velocity.y < 0) a.reactionState="falling";
        if(a.position.y<=0){
          a.position.y=0;
          a.velocity.y=0;
          if(a.reactionState==="launch" || a.reactionState==="air_hitstun" || a.reactionState==="falling" || a.reactionState==="knockback") {
            a.reactionState="downed";
            a.handfeel.downRemaining = Math.max(a.handfeel.downRemaining, 24);
          }
        }
        this.clampToBounds(a);
      }
      if(a.reactionState==="light_stagger" || a.reactionState==="heavy_stagger" || a.reactionState==="micro_stagger") {
        a.previousPosition=cloneVec3(a.position);
        a.position.x += a.velocity.x;
        a.position.z += a.velocity.z;
        a.velocity.x *= 0.72;
        a.velocity.z *= 0.72;
        a.handfeel.reactionRemaining -= 1;
        if(a.handfeel.reactionRemaining<=0){ a.reactionState="none"; a.velocity.x=0; a.velocity.z=0; }
        this.clampToBounds(a);
      }
      if(a.reactionState==="armor_feedback_only") {
        a.handfeel.reactionRemaining -= 1;
        if(a.handfeel.reactionRemaining<=0) a.reactionState="none";
      }
      if(a.reactionState==="downed") {
        a.handfeel.downRemaining -= 1;
        a.velocity.x *= 0.82;
        a.velocity.z *= 0.82;
        if(a.handfeel.downRemaining<=0){
          a.reactionState="getting_up";
          a.handfeel.getUpRemaining = Math.max(a.handfeel.getUpRemaining, 12);
          a.armorProfile.temporaryFlags.getUpArmorUntilTick=this.tickCount+12;
        }
      } else if(a.reactionState==="getting_up") {
        a.handfeel.getUpRemaining -= 1;
        if(a.handfeel.getUpRemaining<=0) a.reactionState="none";
      }
    }
  }


  exportHandfeelReport(): HandfeelReport {
    const attacks: HandfeelReport["attacks"] = {};
    const reactions: HandfeelReport["reactions"] = {};
    const keyEvents: HandfeelReport["keyEvents"] = [];
    let hitstopCount = 0;
    let hitstopTotal = 0;
    let hitstopMax = 0;

    for (const event of this.bus.archive) {
      if (event.type === "HitConfirmed") {
        const payload = event.payload as HitDecision;
        const action = payload.hitbox?.hitGroupId ?? payload.hitbox?.id ?? "unknown";
        const bucket = attacks[action] ?? { hits: 0, armorHits: 0, targets: [] };
        bucket.hits += 1;
        if (payload.armorDecision?.controlBlocked) bucket.armorHits += 1;
        if (event.targetActorId && !bucket.targets.includes(event.targetActorId)) bucket.targets.push(event.targetActorId);
        attacks[action] = bucket;
        keyEvents.push({
          tick: event.tick, type: "hit", source: event.sourceActorId, target: event.targetActorId,
          action: payload.hitbox?.hitGroupId, hitbox: payload.hitbox?.id, armorBlocked: payload.armorDecision?.controlBlocked ?? false
        });
      } else if (event.type === "ReactionApplied") {
        const payload = event.payload as { finalReaction?: string };
        const reaction = payload.finalReaction ?? "unknown";
        reactions[reaction] = (reactions[reaction] ?? 0) + 1;
        keyEvents.push({ tick: event.tick, type: "reaction", target: event.targetActorId, reaction });
      } else if (event.type === "DamageApplied") {
        const payload = event.payload as { finalDamage?: number; actionName?: string };
        keyEvents.push({ tick: event.tick, type: "damage", source: event.sourceActorId, target: event.targetActorId, action: payload.actionName, damage: payload.finalDamage });
      } else if (event.type === "HitStopStarted") {
        const payload = event.payload as { frames?: number };
        const frames = payload.frames ?? 0;
        hitstopCount += 1;
        hitstopTotal += frames;
        hitstopMax = Math.max(hitstopMax, frames);
        keyEvents.push({ tick: event.tick, type: "hitstop", source: event.sourceActorId, target: event.targetActorId, hitstopFrames: frames });
      }
    }

    const player = this.player;
    return {
      version: "0.2.7-handfeel-fix4-assets",
      generatedAtTick: this.tickCount,
      scenario: this.scenario,
      player: { hp: player.resources.hp, facing: player.facing, x: player.position.x, z: player.position.z, action: player.currentAction?.actionName ?? null, reaction: player.reactionState },
      actors: this.actors.map(actor => ({ id: actor.id, type: actor.type, hp: actor.resources.hp, x: actor.position.x, z: actor.position.z, y: actor.position.y, action: actor.currentAction?.actionName ?? null, reaction: actor.reactionState, armor: actor.armorProfile.baseType })),
      attacks,
      reactions,
      hitstop: { count: hitstopCount, totalFrames: hitstopTotal, maxFrames: hitstopMax },
      pushbox: {
        note: "Screen overlay is intentionally quiet; use this report plus replay/video for handfeel diagnosis.",
        playerSoftEnemyRule: "player keeps X authority; ordinary enemies yield lane and body spacing",
        hardBlockerRule: "boss/building block body overlap; player slides by Z before small X correction"
      },
      keyEvents: keyEvents.slice(-80)
    };
  }

  debugSnapshot(): DebugSnapshot { return this.debug.snapshot(this.tickCount,this.actors,this.lastHit.snapshot,this.bus.archive.length,this.scenario); }
  runTicks(n:number): void { for(let i=0;i<n;i++) this.tick(); }
  press(code:string): void { this.inputState.keyDown(code); }
  release(code:string): void { this.inputState.keyUp(code); }

  runDeterministicScenario(): ScenarioBooleans {
    this.reset();
    const player=this.player;
    const grunt=this.actors.find(a=>a.id==="grunt")!;
    const boss=this.actors.find(a=>a.id==="boss")!;
    const building=this.actors.find(a=>a.id==="building")!;
    grunt.position.x=350; this.requestAction(player,"NormalBasic1"); this.runTicks(9); this.hitStop.clear(); this.recoil.clear();
    grunt.position.x=350; this.requestAction(player,"UpwardSlash"); this.runTicks(12); this.hitStop.clear(); this.recoil.clear();
    grunt.position.x=350; grunt.reactionState="downed"; this.requestAction(player,"RagingFury"); this.runTicks(36); this.hitStop.clear(); this.recoil.clear();
    boss.position.x=350; this.requestAction(player,"UpwardSlash"); this.runTicks(12); this.hitStop.clear(); this.recoil.clear(); boss.position.x=1210;
    building.position.x=350; this.requestAction(player,"UpwardSlash"); this.runTicks(12); this.hitStop.clear(); this.recoil.clear(); building.position.x=1560;
    this.status.applyBleed(grunt,player.id,"ForceBleed",this.tickCount,this.bus,1); this.runTicks(31);
    player.reactionState="downed"; this.press("KeyC"); this.tick(); this.release("KeyC"); this.tick();
    this.bus.drainAll();
    this.replay.record(this.tickCount,this.actors,this.bus.archive,this.inputState.snapshot(this.tickCount),"scenario-complete");
    return this.scenario;
  }
}
