/**
 * EngineSystem.ts — Uniform system interface for the EngineKernel pipeline.
 *
 * Every system declares its name (debug label) and phase (ordering constraint).
 * The `tick(ctx)` method receives the read-only EngineContext — systems mutate Actors
 * (which ctx owns) and push events through ctx.bus; they never call each other directly.
 *
 * Three optional capabilities (P2 cross-cutting support layer):
 *   - `provides`: declares the system supplies a cross-cutting service (Math / DataStore /
 *     Timer / Time / Predicate). The kernel routes it onto EngineContext so domain systems
 *     (and P3 consumers) reach it via ctx.math / ctx.dataStore / ...
 *   - `snapshot()`: returns a deterministic string of the system's mutable state. The kernel
 *     folds every system's snapshot into the per-tick stateHash, so cross-cutting state
 *     (timers, script vars, clock) participates in replay determinism.
 *   - `reset()`: clears mutable state on kernel.reset() (scene switch).
 */

import type { EngineContext } from "./EngineContext.js";
import type { SystemPhase } from "./SystemPhase.js";

/** Cross-cutting service kinds a system can expose on EngineContext (P2b). */
export type CrossCuttingKind = "math" | "dataStore" | "timer" | "time" | "predicate";

export interface EngineSystem {
  readonly name: string;
  readonly phase: SystemPhase;
  /** If set, kernel exposes this system on EngineContext[provides] as a service. */
  readonly provides?: CrossCuttingKind;
  tick(ctx: EngineContext): void;
  /** Optional deterministic state snapshot folded into the per-tick stateHash. */
  snapshot?(): string;
  /** Optional: clear mutable state on kernel.reset() (scene switch). */
  reset?(): void;
}
