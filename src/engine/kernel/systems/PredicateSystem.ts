/**
 * PredicateSystem.ts — 21-Predicate cross-cutting service (P2b).
 *
 * Truth anchor: src/data/manifest/truth/system-api-map.ts "21-Predicate" —
 *   sq_IsMyControlObject (extracted, 41 calls — the core combat predicate),
 *   sq_IsSameAni / sq_IsIntersectRect / sq_IsinMapArea / sq_IsRidingObject (inferred).
 *   The bucket's UI / creator-mode predicates (sq_IsVisibleCursor, sq_IsESCClosableWindow,
 *   sq_IsDownKey, ...) are combatRelevant:false in the truth table → deliberately NOT
 *   modeled here. This is the "unsealing" value: combat predicates separated from OOS UI.
 * .nut first-evidence: ap_icecrash.nut `if(obj && sq_IsMyControlObject(obj))`.
 *
 * Stateless pure-function service — no per-tick work, no snapshot, no reset.
 */
import type { Actor } from "../../core/Actor.js";
import type { CrossCuttingKind, EngineSystem } from "../EngineSystem.js";

export interface Rect {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface IPredicate {
  /** sq_IsMyControlObject — is this actor the local player's control object? */
  isMyControlObject(actor: Actor, playerId: string): boolean;
  /** sq_IsSameAni — proxy: same current FSM state (engine has no ani-id field yet). */
  isSameAni(a: Actor, b: Actor): boolean;
  /** sq_IsIntersectRect — axis-aligned rect overlap. */
  isIntersectRect(a: Rect, b: Rect): boolean;
}

export class PredicateSystem implements EngineSystem, IPredicate {
  readonly name = "Predicate";
  readonly phase = "LOGIC" as const;
  readonly provides: CrossCuttingKind = "predicate";

  tick(): void {
    // Stateless pure-function service.
  }

  isMyControlObject(actor: Actor, playerId: string): boolean {
    return actor.id === playerId;
  }
  isSameAni(a: Actor, b: Actor): boolean {
    return String(a.fsm.state) === String(b.fsm.state);
  }
  isIntersectRect(a: Rect, b: Rect): boolean {
    return a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;
  }
}
