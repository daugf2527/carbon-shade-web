/**
 * Fnv1aPrng.ts — FNV-1a 32-bit deterministic PRNG, extracted from sim-worker.ts.
 *
 * Seed is mixed into the FNV offset basis (2166136261).
 * Every engine tick seeds the PRNG with tickCount for replay reproducibility.
 */

export class Fnv1aPrng {
  private state: number;

  constructor(seed: number) {
    // Mix seed into FNV offset basis (2166136261)
    this.state = (2166136261 ^ (seed & 0xffffffff)) >>> 0;
  }

  /** Deterministic [0, 1) float. */
  next(): number {
    this.state = Math.imul(this.state ^ (this.state >>> 16), 0x45d9f3b) >>> 0;
    this.state = Math.imul(this.state ^ (this.state >>> 16), 0x45d9f3b) >>> 0;
    this.state = (this.state ^ (this.state >>> 16)) >>> 0;
    return this.state / 0x100000000;
  }

  /** Deterministic 32-bit unsigned integer (for stateHash mixing). */
  nextU32(): number {
    this.next();
    return this.state;
  }
}
