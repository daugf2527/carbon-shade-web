import type { Actor, ActionName, ScenarioBooleans, HitDecision, Facing, HandfeelReport, HitBoxFrameWindow } from "../types.js";
import { createActor } from "../actors/ActorFactory.js";
import { getAction } from "../actions/FrameDataAction.js";
import { BrowserInputState, CommandInputParser, InputBuffer, type BufferedInput } from "../input/BrowserInputState.js";
import { SOCDCleaner } from "../input/SOCDCleaner.js";
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
import { AirbornePhysicsSystem } from "../motion/AirbornePhysicsSystem.js";
import { MovementInputProvider } from "../motion/MovementInputProvider.js";
import { LocomotionController } from "../motion/LocomotionController.js";
import { DeathLoop } from "../death/DeathLoop.js";
import { LastHitTrace } from "../debug/LastHitTrace.js";
import { DebugOverlay, type DebugSnapshot } from "../debug/DebugOverlay.js";
import { ReplayRecorder } from "../replay/ReplayRecorder.js";
import { EnemyAIController } from "../ai/EnemyAI.js";
import { BOSS_CONFIGS } from "../../data/manifest/ai.js";
import { DEFAULT_COMBO_CORRECTION_CONFIG, hasComboCorrectionPressure, resetComboCorrectionState } from "../combo/ComboCorrection.js";
import type { CombatSystem } from "./CombatSystem.js";
import { ReactionMotionSystem } from "../reaction/ReactionMotionSystem.js";
import { HitResolutionSystem } from "../hit/HitResolutionSystem.js";

export interface CombatKernelOptions { enableReplay?: boolean; }

interface BloodlustGrabHold {
  attackerId: string;
  targetId: string;
  actionInstanceId: string;
  startedTick: number;
  releaseTick: number;
  attachOffsetX: number;
  attachOffsetZ: number;
  decision: HitDecision;
  correlationId: string;
}

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
  readonly socd = new SOCDCleaner();
  readonly enemyAI = new EnemyAIController(BOSS_CONFIGS);
  readonly replay = new ReplayRecorder();
  readonly bloodlustGrabHolds = new Map<string, BloodlustGrabHold>();
  readonly bloodlustWhiffEruptions = new Set<string>();
  readonly hitResolution = new HitResolutionSystem();
  readonly worldBounds = { xMin: 96, xMax: 2730, zMin: -180, zMax: 180 };

  /** Ordered pipeline of combat subsystems executed each tick.
   *  Each stage is a named system with a phase. The kernel iterates
   *  this array in order, calling each system's tick() method. */
  readonly pipeline: CombatSystem[] = [];
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
    this.buildPipeline();
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
      createActor("player","player","player",390,0),
      createActor("grunt","enemy","enemy",780,0),
      createActor("dummy","dummy","enemy",1080,28),
      createActor("imp","enemy","enemy",1395,-36),
      createActor("boss","boss","enemy",1815,-30),
      createActor("building","building","enemy",2340,0),
    );
    this.bus.clear();
    this.inputBuffer.clearAll();
    this.inputState.clearAll();
    this.runDetector.reset();
    this.socd.reset();
    this.hitStop.clear();
    this.recoil.clear();
    this.death.clear();
    this.replay.clear();
    this.bloodlustGrabHolds.clear();
    this.bloodlustWhiffEruptions.clear();
    this.scenario = { normalHitObserved:false, launchObserved:false, ragingFuryMultiHitObserved:false, armorHitObserved:false, buildingArmorBlockedControlObserved:false, bleedObserved:false, quickReboundObserved:false };
  }

  onLargeDelta(deltaMs:number): void { this.notes.push(`large-delta:${deltaMs}`); }
  emitLongFrameWarning(deltaMs:number): void { this.notes.push(`long-frame:${deltaMs}`); }

  /** Build the ordered pipeline of combat subsystems executed each tick.
   *  Systems are grouped by phase and executed in fixed order for determinism.
   *  Each stage wraps a logical group of the original monolithic tick(). */
  private buildPipeline(): void {
    this.pipeline.length = 0;
    const self = this;

    // ── INPUT phase ──
    this.pipeline.push({ name: "ReactionTick", phase: "INPUT", tick: () => {
      const endedHitStop = self.hitStop.tick();
      for (const id of endedHitStop) self.bus.emit("HitStopEnded", CombatEventPriority.Reaction, self.tickCount, {actorId:id}, {targetActorId:id});
      const endedRecoil = self.recoil.tick(id => self.hitStop.isFrozen(id));
      for (const id of endedRecoil) self.bus.emit("RecoilEnded", CombatEventPriority.Reaction, self.tickCount, {actorId:id}, {targetActorId:id});
    }});
    this.pipeline.push({ name: "CollectInput", phase: "INPUT", tick: () => self.collectInput() });
    this.pipeline.push({ name: "ConsumeInput", phase: "INPUT", tick: () => self.consumeInput() });
    this.pipeline.push({ name: "LocomotionInput", phase: "INPUT", tick: () => self.applyLocomotionFromHeldInput() });
    this.pipeline.push({ name: "EnemyAI", phase: "INPUT", tick: () => self.tickEnemyAI() });

    // ── LOGIC phase ──
    this.pipeline.push({ name: "UpdateActions", phase: "LOGIC", tick: () => self.updateActions() });
    this.pipeline.push({ name: "RootMotion", phase: "LOGIC", tick: () => self.applyRootMotion() });
    this.pipeline.push({ name: "BloodlustGrab", phase: "LOGIC", tick: () => self.updateBloodlustGrabHolds() });
    this.pipeline.push({ name: "BloodlustEruption", phase: "LOGIC", tick: () => self.updateBloodlustWhiffEruptions() });

    // ── DETECTION phase ──
    this.pipeline.push({ name: "PushBoxResolve", phase: "DETECTION", tick: () => self.push.resolve(self.actors) });
    this.pipeline.push({ name: "ClampBounds", phase: "DETECTION", tick: () => { for (const a of self.actors) self.clampToBounds(a); }});
    this.pipeline.push(this.hitResolution);
    this.pipeline.push(new AirbornePhysicsSystem());
    this.pipeline.push(new ReactionMotionSystem());

    // ── RESOLVE phase (per-actor) ──
    this.pipeline.push({ name: "PerActorTick", phase: "RESOLVE", tick: () => {
      for (const a of self.actors) {
        self.tickComboCorrection(a);
        if (a.handfeel.hitFlashRemaining && a.handfeel.hitFlashRemaining > 0) a.handfeel.hitFlashRemaining -= 1;
        if (a.handfeel.visualRecoilRemaining && a.handfeel.visualRecoilRemaining > 0) a.handfeel.visualRecoilRemaining -= 1;
        if (self.status.tick(a, self.tickCount, self.bus, self.hitStop.isFrozen(a.id), self.actors)) self.scenario.bleedObserved = true;
        self.buffs.tick(a, self.tickCount, self.bus, self.hitStop.isFrozen(a.id));
        self.cooldowns.tick(a, self.tickCount, self.bus, self.hitStop.isFrozen(a.id));
        if(a.resources.hp<=0) self.death.kill(a,self.tickCount,self.bus);
      }
    }});

    // ── RECORD / FLUSH phase ──
    this.pipeline.push({ name: "TickEndEmit", phase: "RECORD", tick: () => {
      self.bus.emit("TickEnded", CombatEventPriority.Debug, self.tickCount, {tick:self.tickCount});
    }});
    this.pipeline.push({ name: "EventFlush", phase: "FLUSH", tick: () => { self.lastFlushedEvents = self.bus.flush(); } });
    this.pipeline.push({ name: "ReplayRecord", phase: "RECORD", tick: () => {
      if (self.options.enableReplay !== false) {
        self.replay.record(self.tickCount, self.actors, self.lastFlushedEvents, self.inputState.snapshot(self.tickCount));
      }
    }});
    this.pipeline.push({ name: "InputEndTick", phase: "FLUSH", tick: () => self.inputState.endTick() });
  }

  private _replayArchiveStart = 0;
  private lastFlushedEvents: readonly import("../events/CombatEventBus.js").CombatEvent[] = [];

  get commandParser(): CommandInputParser { return this.parser; }
  get socdCleaner(): SOCDCleaner { return this.socd; }
  get replayArchiveStart(): number { return this._replayArchiveStart; }
  get enableReplay(): boolean { return this.options.enableReplay !== false; }

  tick(): void {
    this._replayArchiveStart = this.bus.archive.length;
    this.tickCount += 1;
    this.bus.emit("TickStarted", CombatEventPriority.Debug, this.tickCount, {tick:this.tickCount});
    for (const system of this.pipeline) system.tick(this, this.bus);
  }

  private collectInput(): void {
    const frame=this.socd.cleanFrame(this.inputState.snapshot(this.tickCount));
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
    const allowed = new Set<ActionName>(["Walk","Run","NormalBasic1","DashAttack","Jump","JumpAttack","UpwardSlash","MountainousWheel","RagingFury","Bloodlust","Backstep","QuickRebound","FrenzyToggle","Derange","Diehard","Thirst","BloodMemory","VimAndVigor","ForceDownPlayer","ForceBleed","RunScreenshotScenario"]);
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
    const leftHeld = frame.held.has("ArrowLeft");
    const rightHeld = frame.held.has("ArrowRight");
    if (leftHeld && rightHeld) return currentFacing;
    if (rightHeld || frame.pressed.has("ArrowRight")) return "right";
    if (leftHeld || frame.pressed.has("ArrowLeft")) return "left";
    return null;
  }

  private isMovementHeld(): boolean {
    return this.inputState.isHeld("ArrowLeft") || this.inputState.isHeld("ArrowRight") || this.inputState.isHeld("ArrowUp") || this.inputState.isHeld("ArrowDown");
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

    const resolvedActionName = this.resolveRequestedAction(actor, actionName);
    if (!resolvedActionName) {
      this.bus.emit("ActionRequested", CombatEventPriority.Interrupt, this.tickCount, {actorId:actor.id, actionName, rejected:"busy"}, {targetActorId:actor.id});
      return false;
    }

    if (facing) actor.facing = facing;
    const lockedFacing = facing ?? actor.facing;
    const action = getAction(resolvedActionName);
    this.bus.emit("ActionRequested", CombatEventPriority.ResourceCooldown, this.tickCount, {actorId:actor.id, actionName:resolvedActionName}, {targetActorId:actor.id});
    if (resolvedActionName === "Diehard" && !this.buffs.canApplyDiehard(actor)) {
      this.bus.emit("ActionRequested", CombatEventPriority.ResourceCooldown, this.tickCount, {actorId:actor.id, actionName:resolvedActionName, rejected:"hp_threshold", hp:actor.resources.hp, maxHp:actor.resources.maxHp}, {targetActorId:actor.id});
      return false;
    }
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
    this.applyInstantActionEffect(actor, resolvedActionName);
    return true;
  }

  private applyInstantActionEffect(actor: Actor, actionName: ActionName): void {
    if(actionName==="FrenzyToggle") {
      if(actor.buffs.some(b=>b.type==="frenzy")) this.buffs.remove(actor,"frenzy",this.tickCount,this.bus);
      else this.buffs.apply(actor,"frenzy",this.tickCount,this.bus);
    } else if(actionName==="Derange") {
      this.buffs.applyDerange(actor,this.tickCount,this.bus);
    } else if(actionName==="Diehard") {
      this.buffs.applyDiehard(actor,this.tickCount,this.bus);
    } else if(actionName==="Thirst") {
      this.buffs.apply(actor,"thirst",this.tickCount,this.bus);
    } else if(actionName==="BloodMemory") {
      this.buffs.apply(actor,"blood_memory",this.tickCount,this.bus);
    } else if(actionName==="VimAndVigor") {
      this.buffs.apply(actor,"vim_and_vigor",this.tickCount,this.bus);
    }
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

  private tickComboCorrection(actor: Actor): void {
    if (!hasComboCorrectionPressure(actor.comboCorrection)) return;
    actor.comboCorrection.comboElapsedFrames += 1;
    actor.comboCorrection.framesSinceLastHit += 1;
    if (actor.comboCorrection.framesSinceLastHit <= DEFAULT_COMBO_CORRECTION_CONFIG.comboResetFrames) return;
    resetComboCorrectionState(actor.comboCorrection);
    this.bus.emit("ComboCorrectionReset", CombatEventPriority.HitDecision, this.tickCount, {
      targetId: actor.id,
      reason: "timeout",
      comboResetFrames: DEFAULT_COMBO_CORRECTION_CONFIG.comboResetFrames,
      state: { ...actor.comboCorrection },
    }, {targetActorId:actor.id});
  }

  startBloodlustGrab(attacker: Actor, target: Actor, decision: HitDecision, correlationId: string): void {
    this.startBloodlustGrabHold(attacker, target, decision, correlationId);
  }

  private startBloodlustGrabHold(attacker: Actor, target: Actor, decision: HitDecision, correlationId: string): void {
    const attachOffsetX = 42;
    const attachOffsetZ = 0;
    const hold: BloodlustGrabHold = {
      attackerId: attacker.id,
      targetId: target.id,
      actionInstanceId: attacker.currentAction?.id ?? "none",
      startedTick: this.tickCount,
      releaseTick: this.tickCount + 10,
      attachOffsetX,
      attachOffsetZ,
      decision,
      correlationId,
    };
    this.bloodlustGrabHolds.set(target.id, hold);
    this.attachBloodlustTarget(attacker, target, hold);
    target.reactionState = "grabbed";
    target.velocity.x = 0;
    target.velocity.z = 0;
    target.velocity.y = 0;
    target.handfeel.reactionRemaining = Math.max(target.handfeel.reactionRemaining, 12);
    this.bus.emit("GrabAttached", CombatEventPriority.Grab, this.tickCount, {attackerId:attacker.id,targetId:target.id, releaseTick:hold.releaseTick, attachOffsetX, attachOffsetZ}, {sourceActorId:attacker.id,targetActorId:target.id, correlationId});
  }

  private updateBloodlustGrabHolds(): void {
    for (const hold of [...this.bloodlustGrabHolds.values()]) {
      const attacker = this.actors.find(a => a.id === hold.attackerId);
      const target = this.actors.find(a => a.id === hold.targetId);
      if (!attacker || !target || attacker.flags.dead || target.flags.dead) {
        this.bloodlustGrabHolds.delete(hold.targetId);
        continue;
      }
      if (attacker.currentAction?.id !== hold.actionInstanceId) {
        this.releaseBloodlustGrabHold(attacker, target, hold, false);
        continue;
      }
      this.attachBloodlustTarget(attacker, target, hold);
      target.reactionState = "grabbed";
      target.velocity.x = 0;
      target.velocity.z = 0;
      target.velocity.y = 0;
      if (this.tickCount >= hold.releaseTick) this.releaseBloodlustGrabHold(attacker, target, hold, true);
    }
  }

  private attachBloodlustTarget(attacker: Actor, target: Actor, hold: BloodlustGrabHold): void {
    const facingScale = attacker.currentAction?.lockedFacing === "left" ? -1 : 1;
    target.previousPosition = cloneVec3(target.position);
    target.position.x = attacker.position.x + hold.attachOffsetX * facingScale;
    target.position.z = attacker.position.z + hold.attachOffsetZ;
    target.position.y = attacker.position.y;
    this.clampToBounds(target);
  }

  private releaseBloodlustGrabHold(attacker: Actor, target: Actor, hold: BloodlustGrabHold, applyDamage: boolean): void {
    this.bloodlustGrabHolds.delete(hold.targetId);
    if (!applyDamage) {
      if (target.reactionState === "grabbed") target.reactionState = "none";
      return;
    }
    const eruptionDecision = this.toBloodlustEruptionDecision(hold.decision);
    this.bus.emit("BloodlustEruptionReleased", CombatEventPriority.HitDecision, this.tickCount, eruptionDecision, {sourceActorId:attacker.id,targetActorId:target.id, correlationId:hold.correlationId});
    this.applyBloodlustEruptionDamage(attacker, target, eruptionDecision, hold.correlationId);
  }

  private toBloodlustEruptionDecision(decision: HitDecision): HitDecision {
    const hitbox: HitBoxFrameWindow = {
      ...decision.hitbox,
      id: "bloodlust_eruption",
      hitGroupId: "bloodlust_eruption",
      shape: "grab_attach",
      canGrab: false,
      baseDamage: 34,
      hitType: "grab",
      impactSnapX: 7,
      visualRecoilFrames: 8,
      reactionProfile: { hitStunFrames:18, knockbackX:8.8, knockbackZ:0.25, horizontalFriction:0.74 },
    };
    return { ...decision, hitbox, grabDecision:{ attempted:false, success:false, failedReason:"not_grab_action" } };
  }

  private applyBloodlustEruptionDamage(attacker: Actor, target: Actor, decision: HitDecision, correlationId: string): void {
    const targetWasBleeding = target.statusEffects.some(s => s.type === "bleed");
    const req=this.damageResolver.requestFromHit(decision,correlationId,"Bloodlust", undefined, {strength:attacker.strength, intelligence:attacker.intelligence, physAtk:attacker.physAtk, magAtk:attacker.magAtk, independentAtk:attacker.independentAtk, elementalDamage:attacker.elemStrength}, {defense:target.defense, elemResist:target.elemResist}, "physical_percent", attacker.level);
    this.bus.emit("HitConfirmed", CombatEventPriority.HitDecision, this.tickCount, decision, {sourceActorId:attacker.id,targetActorId:target.id, correlationId});
    this.hitResolution.updateComboCorrection(this, this.bus, target, decision, correlationId);
    this.bus.emit("DamageRequested", CombatEventPriority.Damage, this.tickCount, req, {sourceActorId:attacker.id,targetActorId:target.id, correlationId});
    const damage=this.damageResolver.apply(target, req, {isCounter:decision.isCounter,isBackAttack:decision.isBackAttack,isCritical:decision.isCritical}, decision.armorDecision?.damageAllowed ?? true, this.hitResolution.damageMultipliersFor(this, attacker, target, req.actionName));
    this.lastHit.updateFromDamage(this.tickCount,damage);
    this.bus.emit("DamageApplied", CombatEventPriority.Damage, this.tickCount, damage, {sourceActorId:attacker.id,targetActorId:target.id, correlationId});
    const finalReaction=this.reactionResolver.resolve(target,decision);
    this.lastHit.updateFromHit(this.tickCount,decision,finalReaction,correlationId);
    this.bus.emit("ReactionRequested", CombatEventPriority.Reaction, this.tickCount, {targetId:target.id, finalReaction}, {targetActorId:target.id, correlationId});
    this.reactionResolver.apply(target,finalReaction,decision,attacker,this.tickCount);
    this.bus.emit("ReactionApplied", CombatEventPriority.Reaction, this.tickCount, {targetId:target.id, finalReaction}, {targetActorId:target.id, correlationId});
    this.hitResolution.applyForcedWakeIfQueued(this, this.bus, target, correlationId);
    const action=getAction("Bloodlust");
    this.hitStop.start([attacker.id], action.hitStopProfile.frames);
    this.hitStop.start([target.id], action.hitStopProfile.frames);
    if(action.hitStopProfile.frames>0) this.bus.emit("HitStopStarted", CombatEventPriority.Reaction, this.tickCount, {actorIds:[attacker.id,target.id], frames:action.hitStopProfile.frames, attackerFrames:action.hitStopProfile.frames, victimFrames:action.hitStopProfile.frames}, {sourceActorId:attacker.id,targetActorId:target.id, correlationId});
    this.recoil.start(attacker.id, action.recoilProfile.frames);
    if(action.recoilProfile.frames>0) this.bus.emit("RecoilStarted", CombatEventPriority.Reaction, this.tickCount, {actorId:attacker.id, frames:action.recoilProfile.frames}, {sourceActorId:attacker.id, correlationId});
    this.bus.emit("DamageNumberRequested", CombatEventPriority.Feedback, this.tickCount, {actorId:target.id, amount:damage.finalDamage, sourceKind:damage.sourceKind}, {targetActorId:target.id, correlationId});
    this.bus.emit("VfxRequested", CombatEventPriority.Feedback, this.tickCount, {actorId:target.id, vfx:"bloodlust_eruption"}, {targetActorId:target.id, correlationId});
    if(damage.hpAfter<=0) {
      this.hitResolution.applyFrenzyBleedKillRestore(this.bus, this.tickCount, attacker, targetWasBleeding);
      this.death.kill(target,this.tickCount,this.bus,undefined,correlationId);
    }
    this.hitResolution.updateScenarioFlags(this, this.bus, decision, finalReaction, damage);
  }

  private updateBloodlustWhiffEruptions(): void {
    for (const actor of this.actors) {
      const inst = actor.currentAction;
      if (!inst || inst.actionName !== "Bloodlust" || inst.localFrame !== 14 || inst.hitConfirmed || this.bloodlustWhiffEruptions.has(inst.id)) continue;
      this.bloodlustWhiffEruptions.add(inst.id);
      const corr = nextId("corr");
      this.bus.emit("BloodlustWhiffEruption", CombatEventPriority.Feedback, this.tickCount, {actorId:actor.id, actionInstanceId:inst.id}, {sourceActorId:actor.id, correlationId:corr});
      this.bus.emit("VfxRequested", CombatEventPriority.Feedback, this.tickCount, {actorId:actor.id, vfx:"bloodlust_whiff_eruption"}, {sourceActorId:actor.id, correlationId:corr});
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

  debugSnapshot(tickCostMs?: number): DebugSnapshot { return this.debug.snapshot(this.tickCount,this.actors,this.lastHit.snapshot,this.bus.archive.length,this.scenario,tickCostMs); }
  runTicks(n:number): void { for(let i=0;i<n;i++) this.tick(); }
  press(code:string): void { this.inputState.keyDown(code); }
  release(code:string): void { this.inputState.keyUp(code); }

  runDeterministicScenario(): ScenarioBooleans {
    this.reset();
    const player=this.player;
    const grunt=this.actors.find(a=>a.id==="grunt")!;
    const boss=this.actors.find(a=>a.id==="boss")!;
    const building=this.actors.find(a=>a.id==="building")!;
    grunt.position.x=525; this.requestAction(player,"NormalBasic1"); this.runTicks(9); this.hitStop.clear(); this.recoil.clear();
    grunt.position.x=525; this.requestAction(player,"UpwardSlash"); this.runTicks(12); this.hitStop.clear(); this.recoil.clear();
    grunt.position.x=525; grunt.reactionState="downed"; this.requestAction(player,"RagingFury"); this.runTicks(36); this.hitStop.clear(); this.recoil.clear();
    boss.position.x=525; this.requestAction(player,"UpwardSlash"); this.runTicks(12); this.hitStop.clear(); this.recoil.clear(); boss.position.x=1815;
    building.position.x=525; this.requestAction(player,"UpwardSlash"); this.runTicks(12); this.hitStop.clear(); this.recoil.clear(); building.position.x=2340;
    this.status.applyBleed(grunt,player.id,"ForceBleed",this.tickCount,this.bus,1); this.runTicks(31);
    player.reactionState="downed"; this.press("KeyC"); this.tick(); this.release("KeyC"); this.tick();
    this.bus.drainAll();
    this.replay.record(this.tickCount,this.actors,this.bus.archive,this.inputState.snapshot(this.tickCount),"scenario-complete");
    return this.scenario;
  }
}
