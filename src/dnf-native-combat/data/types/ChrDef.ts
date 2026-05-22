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
  raw: PvfDocument;
}
