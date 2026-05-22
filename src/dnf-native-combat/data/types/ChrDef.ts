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

export interface ChrWeaponWavRow {
  attackSwingA: string;
  attackSwingB: string;
  hitA: string;
  hitB: string;
}

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
