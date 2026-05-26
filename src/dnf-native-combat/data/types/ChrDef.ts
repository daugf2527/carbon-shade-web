import type { PvfDocument, PvfRef, PvfSection } from "./PvfDocument.js";
import type { ExtractedDocumentProvenance, PvfFact, PvfStringFact, PvfVectorFact } from "./Provenance.js";

export interface ChrWeaponHitInfoRow {
  hitTag: string;
  bloodTag: string;
  damageScalePct: number;
  critOrSimilar: number;
  pushBack: number;
  launch: number;
}

/**
 * Per-section weapon wav payload. Real PVF emits 4 distinct shapes
 * (verified across all 11 player .chr files, 2026-05-22):
 *   - "stereo": 4 str attrs (swordman / fighter / atfighter / demonicswordman)
 *   - "mono":   2 str attrs (priest / mage / atmage / creatormage)
 *   - "matrix": 1 mat attr  (thief — 6 rows × 2 cols compressed form)
 *   - null:     0 attrs     (gunner / atgunner / placeholder slot 4 on swordman family)
 * Each entry in ChrDef.weaponWav corresponds to one PVF "weapon wav" section.
 */
export type ChrWeaponWavRow =
  | {
      format: "stereo";
      attackSwingA: string;
      attackSwingB: string;
      hitA: string;
      hitB: string;
    }
  | {
      format: "mono";
      swing: string;
      hit: string;
    }
  | {
      format: "matrix";
      entries: Array<{ swing: string; hit: string }>;
    };

export interface ChrGrowthDef {
  hpMax: PvfVectorFact;
  mpMax: PvfVectorFact | null;
  mpRegenSpeed: PvfVectorFact | null;
  hitRecovery: PvfVectorFact | null;
  physicalAttack: PvfVectorFact;
  magicalAttack: PvfVectorFact | null;
  physicalDefense: PvfVectorFact | null;
  magicalDefense: PvfVectorFact | null;
  inventoryLimit: PvfVectorFact | null;
}

export interface ChrAttackInfoDef {
  attackBase: PvfRef[];
  etc: PvfRef[];
  jumpAttack: PvfRef | null;
  dashAttack: PvfRef | null;
}

/**
 * Awakening (觉醒) sections — raw data preserved without semantic claims.
 *
 * Real-PVF observed shape (swordman.chr, verified 2026-05-26):
 *   - "awakening skill" appears 10× per .chr (5 sub-jobs × 2 slots?).
 *     Non-empty entries carry [skillId, level]: e.g. [91,1] [89,1] [90,1] [92,1].
 *   - "awakening 1" / "awakening 2" appear 5× each, all observed empty in
 *     swordman — likely sub-job placeholders for future tiers.
 *   - "awakening name" is a single 5×2 stringtable-link matrix (sub-job ×
 *     {japanese?, korean?}); observed all link("") in swordman 70-cap data.
 *
 * Semantics (sub-job dimension, slot meaning, level scaling) are unverified.
 * Treated as Tier-3 raw preservation; runtime should not derive behavior from
 * these fields until a Stage 1.5 awakening-specific cross-job audit confirms
 * the dimension mapping.
 */
export interface ChrAwakeningDef {
  /** All "awakening skill" sections, one int[] per section (may include []). */
  skillSlots: number[][];
  /** Single "awakening name" matrix flattened into rows of link keys. */
  names: string[][] | null;
  /** "awakening 1" sections, raw attribute count per section. */
  tier1SlotCounts: number[];
  /** "awakening 2" sections, raw attribute count per section. */
  tier2SlotCounts: number[];
}

export interface ChrDef {
  kind: "chr";
  path: string;
  provenance: ExtractedDocumentProvenance;
  sections: PvfSection[];
  job: PvfStringFact;
  bodyImagePath: PvfStringFact | null;
  jumpPower: PvfFact<number>;
  jumpSpeed: PvfFact<number>;
  moveSpeed: PvfFact<number> | null;
  attackSpeed: PvfFact<number> | null;
  castSpeed: PvfFact<number> | null;
  weight: PvfFact<number>;
  lightResistance: PvfFact<number> | null;
  darkResistance: PvfFact<number> | null;
  widthBox: number[];
  growth: ChrGrowthDef;
  moduleDamageRate: number[][] | null;
  weaponHitInfo: ChrWeaponHitInfoRow[];
  weaponWav: Array<ChrWeaponWavRow | null>;
  weaponSkillInfo: number[];
  weaponDurabilityDecreaseRate: number[];
  upgradeWeaponAttackPowerRate: number[];
  attackInfo: ChrAttackInfoDef;
  motionRefs: Record<string, PvfRef[]>;
  /** Awakening sections — Tier-3 raw preservation, semantics unverified. */
  awakening: ChrAwakeningDef;
  raw: PvfDocument;
}
