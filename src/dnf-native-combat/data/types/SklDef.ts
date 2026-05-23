import type { PvfDocument, PvfSection } from "./PvfDocument.js";
import type { ExtractedDocumentProvenance, PvfFact, PvfStringFact } from "./Provenance.js";

/**
 * Skill type as extracted from the `[type]` section.
 * Real PVF values observed: "active", "passive" (from [active]/[passive] tag).
 */
export type SklSkillType = "active" | "passive" | "unknown";

/**
 * Weapon effect type from `[weapon effect type]` section.
 * Real PVF values observed: "physical", "magical" (from [physical]/[magical] tag).
 */
export type SklWeaponEffectType = "physical" | "magical" | "unknown";

/**
 * Cancel window data decoded from dual-semantics cancel* .skl files.
 *
 * Cancel skills (e.g. cancelupperslash.skl) encode cancel window parameters
 * using PVF section names that have semantic aliases:
 *   `purchase cost`         → alias: cancelWindowStart  (int, frames)
 *   `required level`        → alias: cancelWindowDuration (int, frames)
 *   `skill class`           → alias: cancelGroup         (int, group id)
 *   `growtype maximum level`→ alias: cancelWeaponMask    (int[], bit mask)
 *   `skill fitness growtype`→ alias: cancelTargetSlots   (int[], slot indices)
 *
 * Detected by the presence of `static data` section (0-attr sentinel) AND
 * the aliases property on the sections (emitted by dnf-extract v2+).
 * Tier-1 PVF truth: verified via cancelupperslash.skl sample 2026-05-23.
 */
export interface SklCancelWindowDef {
  /** Frame at which the cancel window opens (alias of `purchase cost`). */
  cancelWindowStart: number;
  /** Duration in frames the cancel window is open (alias of `required level`). */
  cancelWindowDuration: number;
  /** Cancel group identifier (alias of `skill class`). */
  cancelGroup: number;
  /** Weapon mask bit-field indicating which weapon types allow cancel (alias of `growtype maximum level`). */
  cancelWeaponMask: number[];
  /** Slot indices for valid cancel targets (alias of `skill fitness growtype`). */
  cancelTargetSlots: number[];
}

export interface SkillDef {
  kind: "skl";
  path: string;
  provenance: ExtractedDocumentProvenance;
  sections: PvfSection[];

  // --- identity ---
  /** Skill display name key. PVF emits as link ("") — present for reference. */
  name: PvfStringFact | null;
  /** Skill type tag: "active" | "passive" | "unknown". Sourced from `[type]` section. */
  skillType: SklSkillType;
  /** Weapon effect type: "physical" | "magical" | "unknown". From `[weapon effect type]` section. */
  weaponEffectType: SklWeaponEffectType;
  /** Skill class integer (e.g. 1=swordman base, 2=berserker, 3=soulmancer…). From `skill class`. */
  skillClass: PvfFact<number> | null;

  // --- cost / cooldown ---
  /** SP cost to purchase (or cancelWindowStart in cancel skills). From `purchase cost`. */
  purchaseCost: PvfFact<number> | null;
  /** Required character level to learn. From `required level`. */
  requiredLevel: PvfFact<number> | null;
  /** Level range restriction (slot/tier). From `required level range`. */
  requiredLevelRange: PvfFact<number> | null;
  /** Maximum skill level cap. From `maximum level`. */
  maximumLevel: PvfFact<number> | null;
  /** Durability decrease rate on use. From `durability decrease rate`. */
  durabilityDecreaseRate: PvfFact<number> | null;

  // --- level scaling ---
  /**
   * Per-growtype maximum levels (6 values — one per equip slot category).
   * From `growtype maximum level`. Positional: [lightsword, heavysword, lightwm,
   * shortsword, dagger, placeholder] — exact slot mapping unverified against PVF
   * enum; treat as ordered tuple only.
   */
  growtypeMaximumLevel: number[] | null;
  /**
   * Active growtype slot indices (which of the 6 growtype slots apply to this skill).
   * From `skill fitness growtype`.
   */
  skillFitnessGrowtype: number[] | null;

  // --- availability flags ---
  /** Whether skill is available in PvP mode (presence of `pvp` section). */
  hasPvp: boolean;
  /** Whether skill is available in dungeon mode (presence of `dungeon` section). */
  hasDungeon: boolean;
  /** Whether skill is available in war room (presence of `warroom` section). */
  hasWarroom: boolean;
  /** Whether skill is available in death tower (presence of `death tower` section). */
  hasDeathTower: boolean;
  /** Whether auto cooltime applies (presence + value of `auto cooltime apply` section). */
  autoCoolTimeApply: boolean;

  // --- cancel window (cancel* skills only) ---
  /**
   * Decoded cancel window definition. Non-null iff the .skl file uses
   * cancel dual-semantics (detected by `static data` section + section aliases).
   * Tier-1 PVF truth. See SklCancelWindowDef for field semantics.
   */
  cancelWindow: SklCancelWindowDef | null;

  // --- escape hatch ---
  /**
   * All sections from the raw document that were not decoded into structured fields.
   * Keyed by section name. Retains sections with: level property, command, icon,
   * feature skill index, pre required skill, skill command advantage,
   * level info, shake screen, consume item, and any other unrecognized sections.
   */
  raw: PvfDocument;
}
