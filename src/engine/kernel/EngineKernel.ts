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
import type { EngineContext, EngineEventBus } from "./EngineContext.js";
import type { EngineSystem } from "./EngineSystem.js";
import { Fnv1aPrng } from "./Fnv1aPrng.js";
import { phaseIndex, type SystemPhase } from "./SystemPhase.js";
import type { IDataStore } from "./systems/DataStoreSystem.js";
import type { IMath } from "./systems/MathSystem.js";
import type { IPredicate } from "./systems/PredicateSystem.js";
import type { ITime } from "./systems/TimeSystem.js";
import type { ITimer } from "./systems/TimerSystem.js";

// ── Simple event bus (skeleton — full implementation in P2) ──

class SimpleEventBus implements EngineEventBus {
  readonly archive: Array<{ type: string; tick: number; payload: unknown }> = [];

  emit(type: string, payload: unknown): void {
    this.archive.push({ type, tick: this._tick, payload });
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
