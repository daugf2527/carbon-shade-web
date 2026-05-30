/**
 * DamageFormula.ts — Physical damage calculation (Phase 3 T3.7)
 *
 * Formula: damage = (physAtk * atkBonus) * (1 - physDef / (physDef + K))
 * K=200 is a standard DNF mitigation constant.
 * Element/crit/buffs are constants for now (Stage 2 scope).
 */

export interface DamageInput {
  readonly attackerPhysAtk: number;
  readonly atkBonus: number;       // from AtkDef.damageBonus (1.0 = 100%)
  readonly defenderPhysDef: number;
}

const MITIGATION_K = 200;

export function calcPhysicalDamage(input: DamageInput): number {
  const raw = input.attackerPhysAtk * input.atkBonus;
  const mitigation = input.defenderPhysDef / (input.defenderPhysDef + MITIGATION_K);
  return Math.max(1, Math.round(raw * (1 - mitigation)));
}
