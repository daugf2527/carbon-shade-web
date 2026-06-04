/**
 * MathSystem.ts — 17-Math cross-cutting service (P2b).
 *
 * Truth anchor: src/data/manifest/truth/system-api-map.ts "17-Math" —
 *   sq_getRandom (extracted, 33 calls), sq_Abs / sq_ToRadian / sq_Sin / sq_Cos (inferred).
 * .nut first-evidence: po_atbrokenarrow.nut `sq_GetXPos(damager) + sq_getRandom(0, 2)`.
 *
 * Determinism core: ALL random draws route through the kernel-owned Fnv1aPrng
 * (injected at construction from kernel.prng) — never Math.random. This is the formal
 * home of the PRNG that P1 wired into EngineContext. Stateless beyond the shared PRNG
 * (whose state is already in the kernel hash), so it contributes no snapshot.
 */
import type { Fnv1aPrng } from "../Fnv1aPrng.js";
import type { CrossCuttingKind, EngineSystem } from "../EngineSystem.js";

export interface IMath {
  /** Deterministic integer in [min, max] inclusive (mirrors sq_getRandom). */
  randomInt(min: number, max: number): number;
  /** Deterministic float in [0, 1). */
  randomFloat(): number;
  abs(x: number): number;
  toRadian(deg: number): number;
  sin(rad: number): number;
  cos(rad: number): number;
}

export class MathSystem implements EngineSystem, IMath {
  readonly name = "Math";
  readonly phase = "LOGIC" as const;
  readonly provides: CrossCuttingKind = "math";

  constructor(private readonly prng: Fnv1aPrng) {}

  tick(): void {
    // Pure service — no per-tick work. Consumers call IMath methods on demand.
  }

  randomInt(min: number, max: number): number {
    return min + Math.floor(this.prng.next() * (max - min + 1));
  }
  randomFloat(): number {
    return this.prng.next();
  }
  abs(x: number): number {
    return Math.abs(x);
  }
  toRadian(deg: number): number {
    return (deg * Math.PI) / 180;
  }
  sin(rad: number): number {
    return Math.sin(rad);
  }
  cos(rad: number): number {
    return Math.cos(rad);
  }
}
