/**
 * TimerSystem.ts — 18-Timer cross-cutting service (P2b).
 *
 * Truth anchor: src/data/manifest/truth/system-api-map.ts "18-Timer" —
 *   sq_timer_ (extracted, 18 calls, sole API in the bucket).
 * .nut first-evidence: turnwindmill.nut `obj.sq_timer_.setParameter(term, -1)` / `.resetInstant(0)`.
 *
 * Deterministic delay queue: schedule(id, delayTicks) → tick decrements → fires at 0.
 * Callbacks are NOT closures (un-hashable / un-replayable); a fired timer surfaces as an
 * id in `fired` plus a "TimerFired" bus event that consumers poll or listen for. Queue
 * state folds into the kernel stateHash via snapshot().
 */
import type { EngineContext } from "../EngineContext.js";
import type { CrossCuttingKind, EngineSystem } from "../EngineSystem.js";

export interface ITimer {
  /** Fire `id` after `delayTicks` ticks (min 1). Re-scheduling clears a prior fire. */
  schedule(id: string, delayTicks: number): void;
  isFired(id: string): boolean;
  remaining(id: string): number;
  cancel(id: string): void;
}

export class TimerSystem implements EngineSystem, ITimer {
  readonly name = "Timer";
  readonly phase = "LOGIC" as const;
  readonly provides: CrossCuttingKind = "timer";

  private pending = new Map<string, number>(); // id → remaining ticks
  private fired = new Set<string>();

  tick(ctx: EngineContext): void {
    for (const [id, rem] of this.pending) {
      const next = rem - 1;
      if (next <= 0) {
        this.pending.delete(id);
        this.fired.add(id);
        ctx.bus.emit("TimerFired", { id, tick: ctx.tickCount });
      } else {
        this.pending.set(id, next);
      }
    }
  }

  schedule(id: string, delayTicks: number): void {
    this.fired.delete(id);
    this.pending.set(id, Math.max(1, delayTicks | 0));
  }
  isFired(id: string): boolean {
    return this.fired.has(id);
  }
  remaining(id: string): number {
    return this.pending.get(id) ?? 0;
  }
  cancel(id: string): void {
    this.pending.delete(id);
    this.fired.delete(id);
  }

  snapshot(): string {
    const p = [...this.pending.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => `${k}:${v}`)
      .join(",");
    const f = [...this.fired].sort().join(",");
    return `tm{${p}|${f}}`;
  }

  reset(): void {
    this.pending.clear();
    this.fired.clear();
  }
}
