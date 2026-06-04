/**
 * SystemPhase.ts — Canonical 7-phase tick ordering (ported from combat kernel).
 *
 * Systems declare their phase; EngineKernel sorts by phase index before every tick
 * so insertion order never affects determinism (combat declares ordering but doesn't
 * enforce it — engine does).
 */

export const SYSTEM_PHASE_ORDER = [
  "INPUT",
  "LOGIC",
  "DETECTION",
  "RESOLVE",
  "CLEANUP",
  "RECORD",
  "FLUSH",
] as const;

export type SystemPhase = (typeof SYSTEM_PHASE_ORDER)[number];

const PHASE_INDEX: Record<SystemPhase, number> = Object.freeze(
  Object.fromEntries(SYSTEM_PHASE_ORDER.map((p, i) => [p, i])) as Record<SystemPhase, number>,
);

/** Sort key: lower index = runs first. */
export function phaseIndex(p: SystemPhase): number {
  return PHASE_INDEX[p];
}
