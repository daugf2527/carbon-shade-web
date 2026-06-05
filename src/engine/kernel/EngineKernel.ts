/**
 * EngineKernel.ts — Deterministic tick orchestrator for the engine pipeline.
 *
 * Implements Tickable (GameLoop.ts:19) so GameLoop / FixedStepSimulation can drive
 * it with zero changes.  The kernel is a pure container:
 *   - Owns the Actor roster + tick counter + seeded PRNG.
 *   - Runs EngineSystem[] once per tick in phase-sorted order.
 *   - Computes a deterministic stateHash after every tick.
 *
 * Systems never call each other directly — they read prior-system output from the
 * EngineContext (read-only facade).  This is the engine's native orchestrator;
 * combat's CombatKernel (src/combat/kernel/CombatKernel.ts) is the old reference.
 */

import type { Actor } from "../core/Actor.js";
import type { Tickable } from "../core/GameLoop.js";
import type { ReactionState } from "../core/ReactionResolver.js";
import type { EngineContext, EngineEvent, EngineEventBus, EngineEventHandler } from "./EngineContext.js";
import type { EngineSystem } from "./EngineSystem.js";
import { Fnv1aPrng } from "./Fnv1aPrng.js";
import { phaseIndex, type SystemPhase } from "./SystemPhase.js";
import type { ActionSystem } from "./systems/ActionSystem.js";
import type { CombatResolutionSystem } from "./systems/CombatResolutionSystem.js";
import type { IDataStore } from "./systems/DataStoreSystem.js";
import type { IMath } from "./systems/MathSystem.js";
import type { IPredicate } from "./systems/PredicateSystem.js";
import type { ITime } from "./systems/TimeSystem.js";
import type { ITimer } from "./systems/TimerSystem.js";

// ── Helpers ──

/** Map engine ReactionState.kind → combat-style reaction label for snapshot consumers. */
function reactionKindToLabel(reaction: ReactionState | null): string {
  if (!reaction) return "none";
  switch (reaction.kind) {
    case "hit": return "light_stagger";
    case "down": return "downed";
    case "airborne": return "launch";
    default: return "none";
  }
}

// ── Simple event bus (with subscriber support for render/debug consumers) ──

class SimpleEventBus implements EngineEventBus {
  private _archive: EngineEvent[] = [];
  private _handlers = new Map<string, Set<EngineEventHandler>>();

  get archive(): readonly EngineEvent[] {
    return this._archive;
  }

  emit(type: string, payload: unknown): void {
    const event: EngineEvent = { type, tick: this._tick, payload };
    this._archive.push(event);
    // Notify matching subscribers synchronously.
    const handlers = this._handlers.get(type);
    if (handlers) {
      for (const h of handlers) h(event);
    }
  }

  on(type: string, handler: EngineEventHandler): void {
    let set = this._handlers.get(type);
    if (!set) {
      set = new Set();
      this._handlers.set(type, set);
    }
    set.add(handler);
  }

  off(type: string, handler: EngineEventHandler): void {
    this._handlers.get(type)?.delete(handler);
  }

  private _tick = 0;
  setTick(t: number): void {
    this._tick = t;
  }
}

// ── Kernel ──

export class EngineKernel implements EngineContext, Tickable {
  readonly tickMs = 1000 / 60;

  private _tickCount = 0;
  private _actors: Actor[] = [];
  private _player: Actor | null = null;
  private _systems: EngineSystem[] = [];
  private _actionSystem: ActionSystem | null = null;
  private _combatResolutionSystem: CombatResolutionSystem | null = null;
  private _prng: Fnv1aPrng;
  private _bus: SimpleEventBus;

  // P2b cross-cutting services, populated from systems that declare `provides`.
  private _services: {
    math?: IMath;
    dataStore?: IDataStore;
    timer?: ITimer;
    time?: ITime;
    predicate?: IPredicate;
  } = {};

  // Per-tick stateHash
  private _lastStateHash = "";

  /** World boundary (P3.1 — hardcoded, same as combat kernel default). */
  readonly worldBounds = { xMin: 96, xMax: 2730, zMin: -180, zMax: 180 };

  constructor(seed: number = 0) {
    this._prng = new Fnv1aPrng(seed);
    this._bus = new SimpleEventBus();
  }

  // ── Tickable (GameLoop contract) ──

  tick(): void {
    this._tickCount++;
    this._bus.setTick(this._tickCount);

    for (const sys of this._systems) {
      sys.tick(this);
    }

    this._lastStateHash = this.computeStateHash();
  }

  onLargeDelta?(_deltaMs: number): void {
    // No-op for now; can log / throttle.
  }

  emitLongFrameWarning?(_deltaMs: number, _droppedSeconds: number): void {
    // No-op for now; can log.
  }

  // ── Actor management ──

  addActor(actor: Actor, isPlayer = false): void {
    this._actors.push(actor);
    if (isPlayer) this._player = actor;
  }

  removeActor(id: string): void {
    this._actors = this._actors.filter((a) => a.id !== id);
    if (this._player?.id === id) this._player = null;
  }

  /** Reset actors + tick without rebuilding systems. */
  reset(actors: Array<{ actor: Actor; isPlayer?: boolean }>): void {
    this._actors = [];
    this._player = null;
    this._tickCount = 0;
    this._bus = new SimpleEventBus();
    // Clear cross-cutting system state (timers, script vars, clock) on scene switch.
    for (const sys of this._systems) sys.reset?.();
    for (const { actor, isPlayer } of actors) this.addActor(actor, isPlayer ?? false);
  }

  // ── System registration ──

  registerSystem(system: EngineSystem): void {
    this._systems.push(system);
    // A system that declares `provides` doubles as a cross-cutting service — expose it.
    if (system.provides) {
      (this._services as Record<string, unknown>)[system.provides] = system;
    }
    // Capture domain systems for public API delegation (P3.1).
    if (system.name === "Action") this._actionSystem = system as unknown as ActionSystem;
    if (system.name === "CombatResolution") this._combatResolutionSystem = system as unknown as CombatResolutionSystem;
    // Keep sorted by phase so insertion order is irrelevant.
    this._systems.sort((a, b) => phaseIndex(a.phase) - phaseIndex(b.phase));
  }

  // ── EngineContext (read-only façade) ──

  get tickCount(): number {
    return this._tickCount;
  }

  get actors(): readonly Actor[] {
    return this._actors;
  }

  get player(): Actor {
    if (!this._player) throw new Error("EngineKernel: no player actor registered");
    return this._player;
  }

  get prng(): Fnv1aPrng {
    return this._prng;
  }

  get bus(): EngineEventBus {
    return this._bus;
  }

  // ── P2b cross-cutting service handles (EngineContext) ──

  get math(): IMath | undefined {
    return this._services.math;
  }
  get dataStore(): IDataStore | undefined {
    return this._services.dataStore;
  }
  get timer(): ITimer | undefined {
    return this._services.timer;
  }
  get time(): ITime | undefined {
    return this._services.time;
  }
  get predicate(): IPredicate | undefined {
    return this._services.predicate;
  }

  // Exposed for tests / debug snapshot consumers.
  get lastStateHash(): string {
    return this._lastStateHash;
  }

  // ── Public API (P3.1 — runtime consumers) ──

  /** Request an actor perform an action. Delegates to ActionSystem. */
  requestAction(actorId: string, actionName: string): void {
    this._actionSystem?.request(actorId, actionName);
  }

  /** Return world-space hitboxes for an actor's current attack frame (debug visualization). */
  debugHitBoxes(actorId: string): Array<{ x: number; y: number; w: number; h: number; color: number }> {
    return this._combatResolutionSystem?.debugHitBoxes(this, actorId) ?? [];
  }

  /** Produce a render-oriented snapshot of the current tick (equivalent to combat's debugSnapshot). */
  debugSnapshot(tickCostMs?: number): Record<string, unknown> {
    const actors = this._actors.map((a) => ({
      id: a.id,
      hp: a.hp,
      maxHp: a.stats.hpMax,
      pos: { x: a.x, y: a.y, z: (a as Actor & { z?: number }).z ?? 0 },
      reaction: reactionKindToLabel(a.reaction),
      action: a.currentActionName,
      dead: a.isDead,
      facing: a.facing === 1 ? "right" : "left",
      lockedFacing: undefined as string | undefined,
      locomotion: undefined as string | undefined,
      hitFlashRemaining: 0,
      visualRecoilRemaining: 0,
      visualRecoilX: 0,
      visualRecoilZ: 0,
      buffs: a.buffs,
      localFrame: a.animationPlayer.currentFrame?.index ?? 0,
      status: [] as unknown[],
    }));
    return {
      tick: this._tickCount,
      actors,
      lastHit: { actionName: null, finalReaction: null, targetActorId: null, damage: 0 },
      eventCount: this._bus.archive.length,
      scenario: undefined,
      performance: {
        actorCount: this._actors.length,
        eventArchiveSize: this._bus.archive.length,
        poolStatus: "ok",
        tickCostMs,
      },
    };
  }

  /** Stub for combat's runDeterministicScenario (P3.1 — engine has no reference frames yet). */
  runDeterministicScenario(): { booleans: Record<string, boolean> } {
    return { booleans: {} };
  }

  /** Stub getters for runtime evidence collector compatibility. */
  get scenario(): Record<string, unknown> {
    return {};
  }
  get replay(): { export?: () => unknown } {
    return { export: () => null };
  }

  // ── Determinism ──

  /**
   * Compute a deterministic hash of the current tick's full state.
   * Same (actors, tickCount, PRNG seed) → same hash string every replay.
   */
  private computeStateHash(): string {
    const parts: string[] = [`t=${this._tickCount}`];
    for (const a of this._actors) {
      parts.push(`${a.id}:hp=${a.hp},st=${a.fsm.state},y=${a.y.toFixed(3)}`);
    }
    // Fold cross-cutting system snapshots (timers, script vars, clock) into the hash
    // so their mutable state participates in replay determinism.
    for (const sys of this._systems) {
      if (sys.snapshot) parts.push(`${sys.name}=${sys.snapshot()}`);
    }
    parts.push(`prng=${this._prng.nextU32().toString(16)}`);
    return parts.join("|");
  }
}
