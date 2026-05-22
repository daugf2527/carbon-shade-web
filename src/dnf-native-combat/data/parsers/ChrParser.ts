import type { ChrDef, ChrWeaponHitInfoRow, ChrWeaponWavRow } from "../types/ChrDef.js";
import type { PvfAttribute, PvfDocument, PvfRef } from "../types/PvfDocument.js";
import {
  documentProvenance,
  firstNumberFact,
  firstSection,
  firstStringFact,
  refAttributes,
  requireValue,
  sectionNumbers,
  sectionsByName,
  stringValue,
  vectorFact,
} from "./parserUtils.js";

const MOTION_SECTION_NAMES = [
  "move motion",
  "simple move motion",
  "throw motion 1-2",
  "etc motion",
  "attack motion",
  "throw motion 2-1",
  "throw motion 2-2",
  "rest motion",
  "waiting motion",
  "damage motion 1",
  "sit motion",
  "ghost motion",
  "damage motion 2",
  "dashattack motion",
  "throw motion 1-1",
  "down motion",
  "overturn motion",
  "jump motion",
  "simple rest motion",
  "dash motion",
  "getitem motion",
  "buff motion",
  "jumpattack motion",
  "back motion",
] as const;

export function parseChrDocument(document: PvfDocument): ChrDef {
  if (!document.path.toLowerCase().endsWith(".chr")) {
    throw new Error(`ChrParser expected .chr document, got ${document.path}`);
  }

  const jobRaw = requireValue(firstStringFact(document, "job"), "job", document.path);
  const jobValue = stripPvfTag(jobRaw.value);

  return {
    kind: "chr",
    path: document.path,
    provenance: documentProvenance(document),
    sections: document.sections,
    job: {
      ...jobRaw,
      value: jobValue,
      rawValue: jobRaw.value,
    },
    bodyImagePath: firstStringFact(document, "body image path"),
    jumpPower: requireValue(firstNumberFact(document, "jump power", "ambiguous"), "jump power", document.path),
    jumpSpeed: requireValue(firstNumberFact(document, "jump speed", "int"), "jump speed", document.path),
    moveSpeed: firstNumberFact(document, "move speed", "%xSPEED_VALUE_DEFAULT"),
    attackSpeed: firstNumberFact(document, "attack speed", "%xSPEED_VALUE_DEFAULT"),
    castSpeed: firstNumberFact(document, "cast speed", "%xSPEED_VALUE_DEFAULT"),
    weight: requireValue(firstNumberFact(document, "weight", "audio-only"), "weight", document.path),
    lightResistance: firstNumberFact(document, "light resistance", "%"),
    darkResistance: firstNumberFact(document, "dark resistance", "%"),
    widthBox: sectionNumbers(document, "width"),
    growth: {
      hpMax: requireValue(vectorFact(document, "hp max", "hp"), "hp max", document.path),
      mpMax: vectorFact(document, "mp max", "mp"),
      mpRegenSpeed: vectorFact(document, "mp regen speed", "mp/min"),
      hitRecovery: vectorFact(document, "hit recovery", "ms-or-multiplier"),
      physicalAttack: requireValue(vectorFact(document, "physical attack", "physAtk"), "physical attack", document.path),
      magicalAttack: vectorFact(document, "magical attack", "magAtk"),
      physicalDefense: vectorFact(document, "physical defense", "physDef"),
      magicalDefense: vectorFact(document, "magical defense", "magDef"),
      inventoryLimit: vectorFact(document, "inventory limit", "weight"),
    },
    moduleDamageRate: parseNumberMatrix(document, "module damage rate"),
    weaponHitInfo: parseWeaponHitInfo(document),
    weaponWav: parseWeaponWav(document),
    weaponSkillInfo: sectionNumbers(document, "weapon skill info"),
    weaponDurabilityDecreaseRate: sectionNumbers(document, "weapon durability decrease rate"),
    upgradeWeaponAttackPowerRate: sectionNumbers(document, "upgrade weapon attack power rate"),
    attackInfo: {
      attackBase: refAttributes(firstSection(document, "attack info")),
      etc: refAttributes(firstSection(document, "etc attack info")),
      jumpAttack: refAttributes(firstSection(document, "jumpattack info"))[0] ?? null,
      dashAttack: refAttributes(firstSection(document, "dashattack info"))[0] ?? null,
    },
    motionRefs: parseMotionRefs(document),
    raw: document,
  };
}

function stripPvfTag(value: string): string {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}

function parseNumberMatrix(document: PvfDocument, sectionName: string): number[][] | null {
  const attr = firstSection(document, sectionName)?.attributes[0];
  if (attr?.t !== "mat" || !Array.isArray(attr.items)) return null;
  if (typeof attr.item_type === "string" && attr.item_type !== "int" && attr.item_type !== "float") {
    console.warn(
      `[ChrParser] parseNumberMatrix: section "${sectionName}" has item_type="${attr.item_type}" (expected numeric) in ${document.path}; returning null`,
    );
    return null;
  }
  return attr.items.map(row =>
    row.filter((item): item is number => typeof item === "number" && Number.isFinite(item)),
  );
}

function parseWeaponHitInfo(document: PvfDocument): ChrWeaponHitInfoRow[] {
  const section = firstSection(document, "weapon hit info");
  if (!section) return [];

  if (section.attributes.length % 6 !== 0) {
    const trailing = section.attributes.length % 6;
    console.warn(
      `[ChrParser] parseWeaponHitInfo: "weapon hit info" has ${section.attributes.length} attributes (not a multiple of 6); ${trailing} trailing attribute(s) dropped in ${document.path}`,
    );
  }

  const rows: ChrWeaponHitInfoRow[] = [];
  for (let i = 0; i + 5 < section.attributes.length; i += 6) {
    const hitTag = stringValue(section.attributes[i]) ?? "";
    const bloodTag = stringValue(section.attributes[i + 1]) ?? "";
    const damageScalePct = numeric(section.attributes[i + 2]);
    const critOrSimilar = numeric(section.attributes[i + 3]);
    const pushBack = numeric(section.attributes[i + 4]);
    const launch = numeric(section.attributes[i + 5]);
    rows.push({ hitTag, bloodTag, damageScalePct, critOrSimilar, pushBack, launch });
  }
  return rows;
}

function parseWeaponWav(document: PvfDocument): Array<ChrWeaponWavRow | null> {
  return sectionsByName(document, "weapon wav").map(section => {
    if (section.attributes.length === 0) return null;
    return {
      attackSwingA: stringValue(section.attributes[0]) ?? "",
      attackSwingB: stringValue(section.attributes[1]) ?? "",
      hitA: stringValue(section.attributes[2]) ?? "",
      hitB: stringValue(section.attributes[3]) ?? "",
    };
  });
}

function parseMotionRefs(document: PvfDocument): Record<string, PvfRef[]> {
  const refs: Record<string, PvfRef[]> = {};
  for (const sectionName of MOTION_SECTION_NAMES) {
    const sectionRefs = refAttributes(firstSection(document, sectionName));
    if (sectionRefs.length > 0) refs[sectionName] = sectionRefs;
  }
  return refs;
}

function numeric(attribute: PvfAttribute | undefined): number {
  if ((attribute?.t === "int" || attribute?.t === "float") && typeof attribute.v === "number") return attribute.v;
  return 0;
}
