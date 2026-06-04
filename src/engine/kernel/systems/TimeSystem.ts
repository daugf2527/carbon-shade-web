/**
 * TimeSystem.ts — 20-Time cross-cutting service (P2b).
 *
 * Truth anchor: src/data/manifest/truth/system-api-map.ts "20-Time" —
 *   sq_GetCurrentTime (extracted, 47 calls), sq_SetValidTime / sq_GetFrameStartTime /
 *   sq_GetStateTimer (inferred).
 * .nut first-evidence: elementalstrikeex.nut `local currentT = sq_GetCurrentTime(pAni)`.
 *
 * Derives the frame clock from the kernel tick counter (currentMs = tick * tickMs).
 * Runs in INPUT phase so every later system sees a settled clock. Also tracks each
 * actor's FSM state-entry tick so consumers can query stateTimer (ticks since the actor
 * last changed state) — the engine analogue of sq_GetStateTimer.
 */
import type { EngineContext } from "../EngineContext.js";
import type { CrossCuttingKind, EngineSystem } from "../EngineSystem.js";

export interface ITime {
  readonly currentMs: number;
  readonly currentTick: number;
  /** Ticks since the given actor last changed FSM state (−1 if unknown). */
  stateTimerTicks(actorId: string): number;
}

export class TimeSystem implements EngineSystem, ITime {
  readonly name = "Time";
  readonly phase = "INPUT" as const;
  readonly provides: CrossCuttingKind = "time";

  private _currentTick = 0;
  private _currentMs = 0;
  private stateEntryTick = new Map<string, number>();
  private lastState = new Map<string, string>();

  tick(ctx: EngineContext): void {
    this._currentTick = ctx.tickCount;
    this._currentMs = ctx.tickCount * ctx.tickMs;
    // Track FSM state-entry ticks for stateTimer queries.
    for (const a of ctx.actors) {
      const st = String(a.fsm.state);
      if (this.lastState.get(a.id) !== st) {
        this.lastState.set(a.id, st);
        this.stateEntryTick.set(a.id, ctx.tickCount);
      }
    }
  }

  get currentMs(): number {
    return this._currentMs;
  }
  get currentTick(): number {
    return this._currentTick;
  }
  stateTimerTicks(actorId: string): number {
    const entry = this.stateEntryTick.get(actorId);
    return entry === undefined ? -1 : this._currentTick - entry;
  }

  snapshot(): string {
    return `t{${this._currentTick}@${this._currentMs.toFixed(2)}}`;
  }

  reset(): void {
    this._currentTick = 0;
    this._currentMs = 0;
    this.stateEntryTick.clear();
    this.lastState.clear();
  }
}
