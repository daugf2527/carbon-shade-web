/**
 * Equipment.ts — equipment stat-bonus framework (Stage 4C-C2, 2026-06-08).
 *
 * Adds a flat weapon-attack / armor-defense bonus on top of the level-driven base stats, folded into
 * the damage formula (attacker.equipment.weaponPhysAtk raises physAtk; defender.equipment.armorPhysDef
 * raises physDef). Default NO_EQUIPMENT = no bonus → zero regression for existing actors.
 *
 * ⚠️ requiresManualVerification — ALL values here are local_baseline, NOT PVF truth. DNF equipment
 * stat-line absolute values live in the item database (.equ / item tables), and the current pipeline
 * has NO equipment/item parser (10 parsers: Chr/Mob/Atk/Skl/Ani/Dgn/Etc/Map/Nut/Img — none for items;
 * monster .mob even references `.equ` files we cannot parse). This is the FRAMEWORK + plumbing; plug
 * extracted truth values once an item parser lands. The structure (flat add into the damage chain)
 * mirrors how DNF gear contributes to the physical-attack / -defense totals.
 */

export interface EquipmentStats {
  /** Flat physical attack added by the equipped weapon. local_baseline. */
  readonly weaponPhysAtk: number;
  /** Flat physical defense added by equipped armor. local_baseline. */
  readonly armorPhysDef: number;
}

/** No equipment — zero bonus. The Actor default (existing actors keep their level-driven stats). */
export const NO_EQUIPMENT: EquipmentStats = { weaponPhysAtk: 0, armorPhysDef: 0 };

/**
 * local_baseline sample loadouts (requiresManualVerification) — demonstrate the framework end-to-end
 * until item-truth extraction exists. NOT real DNF item values.
 */
export const SAMPLE_LOADOUTS: Record<string, EquipmentStats> = {
  starterWeapon: { weaponPhysAtk: 40, armorPhysDef: 0 },
  starterArmor: { weaponPhysAtk: 0, armorPhysDef: 30 },
  fullStarter: { weaponPhysAtk: 40, armorPhysDef: 30 },
};

/** Sum two equipment contributions (e.g. weapon + armor). Keeps the damage chain a single struct. */
export function sumEquipment(a: EquipmentStats, b: EquipmentStats): EquipmentStats {
  return { weaponPhysAtk: a.weaponPhysAtk + b.weaponPhysAtk, armorPhysDef: a.armorPhysDef + b.armorPhysDef };
}
