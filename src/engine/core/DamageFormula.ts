/**
 * DamageFormula.ts — Physical damage calculation (Phase 3 T3.7, truth-driven 2026-06-05)
 *
 * Formula: damage = (physAtk * atkBonus * weaponScale) * (1 - physDef / (physDef + K))
 *   where weaponScale = damageScalePct / 100.
 *
 * Truth provenance (highest confidence, PVF-extracted):
 *   - atkBonus      ← AtkDef.damageBonus.value / 100 (per-action, swordman-attacks.json).
 *                     e.g. attack1 = -15% → 0.85; weaponcomboheavy2 = 110% → 2.10; null → 1.0.
 *   - damageScalePct ← chr.weaponHitInfo[slot].damageScalePct (per-weapon-class, baseline shard).
 *                     6 slots for swordman: 90/70/100/120/100/60. Combat routes action→slot via a
 *                     hardcoded map defaulting to slot 0; engine integrator mirrors that (see
 *                     CombatResolutionSystem wiring spec).
 *
 * local_baseline (NOT PVF-derived, requiresManualVerification):
 *   - MITIGATION_K = 200: DNF damage-mitigation denominator constant. Hardcoded in DNF.exe;
 *     PVF cannot supply it. Same value combat's HitResolver uses.
 *   - crit / element: held constant (1.0) — Stage 2 scope, not yet truth-wired.
 */

export interface DamageInput {
  readonly attackerPhysAtk: number;
  /** Per-action damage bonus as a multiplier. 1.0 = 100% (PVF damageBonus null). */
  readonly atkBonus: number;
  readonly defenderPhysDef: number;
  /**
   * Per-weapon-class damage scale, percent (PVF chr.weaponHitInfo[slot].damageScalePct).
   * 100 = no scaling. Optional; defaults to 100 so existing call sites stay correct.
   */
  readonly damageScalePct?: number;
}

// local_baseline: DNF mitigation K. Hardcoded in DNF.exe binary, not in PVF.
// requiresManualVerification — do not treat as PVF truth.
const MITIGATION_K = 200;

// local_baseline: crit / element multipliers held constant until truth-wired (Stage 2 scope).
// requiresManualVerification.
const CRIT_MULT = 1.0;
const ELEMENT_MULT = 1.0;

export function calcPhysicalDamage(input: DamageInput): number {
  const weaponScale = (input.damageScalePct ?? 100) / 100;
  const raw = input.attackerPhysAtk * input.atkBonus * weaponScale * CRIT_MULT * ELEMENT_MULT;
  const mitigation = input.defenderPhysDef / (input.defenderPhysDef + MITIGATION_K);
  return Math.max(1, Math.round(raw * (1 - mitigation)));
}
