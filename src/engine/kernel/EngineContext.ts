/**
 * EngineContext.ts — Read-only shared state passed to every system each tick.
 *
 * Pattern ported from combat's SystemContext (src/combat/kernel/SystemContext.ts).
 * Core fields are readonly — systems read prior systems' output from ctx; they never
 * call each other directly. The EngineKernel itself satisfies this interface.
 *
 * P2b adds the cross-cutting service handles (math / dataStore / timer / time /
 * predicate). They are optional: undefined until the matching system is registered,
 * so P1-era kernels (no cross-cutting systems) still satisfy the interface.
 */

import type { Actor } from "../core/Actor.js";
import type { EngineScenarioBooleans } from "../core/ScenarioBooleans.js";
import type { Fnv1aPrng } from "./Fnv1aPrng.js";
import type { IDataStore } from "./systems/DataStoreSystem.js";
import type { IMath } from "./systems/MathSystem.js";
import type { IPredicate } from "./systems/PredicateSystem.js";
import type { ITime } from "./systems/TimeSystem.js";
import type { ITimer } from "./systems/TimerSystem.js";

/** Event shape passed to bus subscribers. */
export interface EngineEvent {
  readonly type: string;
  readonly tick: number;
  readonly payload: unknown;
}

/** Event handler callback signature. */
export type EngineEventHandler = (event: EngineEvent) => void;

/** Event bus interface — emit + subscribe + archive for render/debug consumers. */
export interface EngineEventBus {
  emit(type: string, payload: unknown): void;
  on(type: string, handler: EngineEventHandler): void;
  off(type: string, handler: EngineEventHandler): void;
  readonly archive: readonly EngineEvent[];
}

export interface EngineContext {
  readonly tickCount: number;
  readonly tickMs: number;
  readonly actors: readonly Actor[];
  readonly player: Actor;
  readonly prng: Fnv1aPrng;
  readonly bus: EngineEventBus;

  /** World boundary (P3.1 — engine doesn't enforce this; provided for render/scene consumers). */
  readonly worldBounds?: { readonly xMin: number; readonly xMax: number; readonly zMin: number; readonly zMax: number };

  /**
   * Deterministic-scenario observation flags (P3 收尾). Systems flip the booleans they
   * observe during `runDeterministicScenario()` (e.g. CombatResolutionSystem sets
   * normalHitObserved / launchObserved on hit). Undefined on bare contexts that don't
   * run scenarios; the kernel always provides a live object.
   */
  readonly scenario?: EngineScenarioBooleans;

  // ── P2b cross-cutting services (undefined until the matching system is registered) ──
  readonly math?: IMath;
  readonly dataStore?: IDataStore;
  readonly timer?: ITimer;
  readonly time?: ITime;
  readonly predicate?: IPredicate;
}
