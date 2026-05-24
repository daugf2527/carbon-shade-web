import type { ChrDef, ChrWeaponHitInfoRow, ChrWeaponWavRow } from "../types/ChrDef.js";
import type { PvfAttribute, PvfDocument, PvfMatrixAttribute, PvfRef } from "../types/PvfDocument.js";
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
  stripPvfTag,
  vectorFact,
  asTier3,
  extractLeafNumber,
} from "./parserUtils.js";

const MOTION_SECTION_NAMES = [
  "move motion",
  "simple move motion",
  "throw motion 1-1",
  "throw motion 1-2",
  "throw motion 2-1",
  "throw motion 2-2",
  "throw motion 3-1",
  "throw motion 3-2",
  "throw motion 4-1",
  "throw motion 4-2",
  "etc motion",
  "attack motion",
  "rest motion",
  "waiting motion",
  "damage motion 1",
  "sit motion",
  "ghost motion",
  "damage motion 2",
  "dashattack motion",
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
    sections: structuredClone(document.sections),
    job: {
      ...jobRaw,
      value: jobValue,
      rawValue: jobRaw.value,
    },
    bodyImagePath: firstStringFact(document, "body image path"),
    // Tier-3 marks — these fields have known semantic/unit ambiguity that
    // PVF alone cannot resolve. Per CLAUDE.md DNF truth rule + memory
    // `dnf-physics-phase1-data-summary` H1: jump_power's unit (pixels vs
    // velocity) is a working hypothesis; jump_speed's int unit + weight's
    // audio-only marker are project-internal labels; hit recovery's
    // ms-or-multiplier label flags unresolved semantics. The validator
    // surfaces all four in the Tier-3 audit subreport.
    jumpPower: requireValue(asTier3(firstNumberFact(document, "jump power", "ambiguous")), "jump power", document.path),
    jumpSpeed: requireValue(asTier3(firstNumberFact(document, "jump speed", "int")), "jump speed", document.path),
    moveSpeed: firstNumberFact(document, "move speed", "%xSPEED_VALUE_DEFAULT"),
    attackSpeed: firstNumberFact(document, "attack speed", "%xSPEED_VALUE_DEFAULT"),
    castSpeed: firstNumberFact(document, "cast speed", "%xSPEED_VALUE_DEFAULT"),
    weight: requireValue(asTier3(firstNumberFact(document, "weight", "audio-only")), "weight", document.path),
    lightResistance: firstNumberFact(document, "light resistance", "%"),
    darkResistance: firstNumberFact(document, "dark resistance", "%"),
    widthBox: sectionNumbers(document, "width"),
    growth: {
      hpMax: requireValue(vectorFact(document, "hp max", "hp"), "hp max", document.path),
      mpMax: vectorFact(document, "mp max", "mp"),
      mpRegenSpeed: vectorFact(document, "mp regen speed", "mp/min"),
      // Tier-3 mark — hit recovery unit is ms-or-multiplier (semantic ambiguity).
      hitRecovery: asTier3(vectorFact(document, "hit recovery", "ms-or-multiplier")),
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
      // "etc attack info" and "etc motion" are mixed ref + non-ref across
      // gunner/priest/fighter/thief real PVF data (verified 2026-05-24 via
      // stage1-baseline). swordman alone has pure-ref but the broader set
      // doesn't — allow mixed to preserve refs while non-ref content stays
      // intact in document.sections (deep-cloned into chr.sections).
      etc: refAttributes(firstSection(document, "etc attack info"), { allowMixed: true }),
      jumpAttack: refAttributes(firstSection(document, "jumpattack info"))[0] ?? null,
      dashAttack: refAttributes(firstSection(document, "dashattack info"))[0] ?? null,
    },
    motionRefs: parseMotionRefs(document),
    raw: Object.freeze(document),
  };
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
  // Audit F3 (ts-parser-truth, 2026-05-24): row.filter previously silently
  // dropped non-numeric / non-finite cells, hiding corrupted PVF input behind
  // shortened rows or empty rows. Real PVF "module damage rate" is uniformly
  // a pure number matrix across all 11 player .chr files (verified 2026-05-22);
  // any non-numeric content is corrupted input that should surface loudly.
  return attr.items.map((row, rowIdx) => {
    if (!Array.isArray(row)) {
      throw new Error(
        `[ChrParser] parseNumberMatrix: section "${sectionName}" row ${rowIdx} is not an array ` +
        `in ${document.path}. Real PVF mat rows are uniformly arrays; non-array indicates corrupted input.`,
      );
    }
    return row.map((item, colIdx) => {
      // Audit B3 (contract-symmetry, 2026-05-24): C++ emits typed `{t,v}`
      // leaves in vec/mat post-fix; older PVF dumps + fixtures still use
      // bare numbers. extractLeafNumber unwraps both into number, throwing
      // here only when the cell is neither a bare finite number nor a
      // typed numeric object.
      const unwrapped = extractLeafNumber(item);
      if (unwrapped === null) {
        throw new Error(
          `[ChrParser] parseNumberMatrix: section "${sectionName}" row ${rowIdx} col ${colIdx} ` +
          `is ${JSON.stringify(item)} (expected finite number or {t:int|float, v:number}) in ${document.path}. ` +
          `Real PVF "module damage rate" is uniformly a pure number matrix; ` +
          `non-numeric/non-finite content indicates corrupted input.`,
        );
      }
      return unwrapped;
    });
  });
}

function parseWeaponHitInfo(document: PvfDocument): ChrWeaponHitInfoRow[] {
  const section = firstSection(document, "weapon hit info");
  if (!section) return [];

  // Real PVF emits exactly 36 attrs (6 rows × 6 cols) across all 11 player .chr
  // files — verified 2026-05-22. Any non-multiple-of-6 indicates corrupted input
  // or non-character document misrouted here. Throwing is preferable to silently
  // dropping the trailing fragment.
  if (section.attributes.length % 6 !== 0) {
    throw new Error(
      `[ChrParser] parseWeaponHitInfo: "weapon hit info" requires attribute count divisible by 6 ` +
      `(6 cols × N rows). Got ${section.attributes.length} in ${document.path}. ` +
      `Real PVF data is uniformly 36 attrs across all 11 player .chr files.`,
    );
  }

  const rows: ChrWeaponHitInfoRow[] = [];
  for (let i = 0; i + 5 < section.attributes.length; i += 6) {
    const hitTag = stringValue(section.attributes[i]) ?? "";
    const bloodTag = stringValue(section.attributes[i + 1]) ?? "";
    const ctx = `${document.path} weapon hit info row ${i / 6}`;
    const damageScalePct = numeric(section.attributes[i + 2], `${ctx} col 2 (damageScalePct)`);
    const critOrSimilar = numeric(section.attributes[i + 3], `${ctx} col 3 (critOrSimilar)`);
    const pushBack = numeric(section.attributes[i + 4], `${ctx} col 4 (pushBack)`);
    const launch = numeric(section.attributes[i + 5], `${ctx} col 5 (launch)`);
    rows.push({ hitTag, bloodTag, damageScalePct, critOrSimilar, pushBack, launch });
  }
  return rows;
}

function parseWeaponWav(document: PvfDocument): Array<ChrWeaponWavRow | null> {
  return sectionsByName(document, "weapon wav").map(section => {
    const attrs = section.attributes;
    if (attrs.length === 0) return null;

    // Matrix form (thief): 1 mat attr containing 6 rows × 2 cols (swing/hit per slot).
    if (attrs.length === 1 && attrs[0].t === "mat") {
      const matAttr = attrs[0] as PvfMatrixAttribute;
      // Audit F4 (ts-parser-truth, 2026-05-24): previously coerced non-string
      // matrix cells to "" silently. Real PVF "weapon wav" matrix (thief)
      // emits pure-str cells across all observed rows; any non-string indicates
      // corrupted input that should fail loudly.
      const entries = matAttr.items.map((row, rowIdx) => {
        if (!Array.isArray(row)) {
          throw new Error(
            `[ChrParser] parseWeaponWav: matrix row ${rowIdx} is not an array in ${document.path}. ` +
            `Real PVF weapon wav matrix rows are uniformly [swing, hit] arrays.`,
          );
        }
        if (typeof row[0] !== "string") {
          throw new Error(
            `[ChrParser] parseWeaponWav: matrix row ${rowIdx} col 0 (swing) is ${JSON.stringify(row[0])} ` +
            `(expected string) in ${document.path}. Real PVF emits pure-str matrix cells.`,
          );
        }
        if (typeof row[1] !== "string") {
          throw new Error(
            `[ChrParser] parseWeaponWav: matrix row ${rowIdx} col 1 (hit) is ${JSON.stringify(row[1])} ` +
            `(expected string) in ${document.path}. Real PVF emits pure-str matrix cells.`,
          );
        }
        return { swing: row[0], hit: row[1] };
      });
      return { format: "matrix", entries };
    }

    // Mono form (priest / mage family): 2 str attrs — single swing + single hit.
    if (attrs.length === 2) {
      // Audit F4 (ts-parser-truth, 2026-05-24): previously fell back to "" on
      // wrong-type attr, fabricating empty swing/hit. Real PVF priest/mage
      // mono "weapon wav" emits pure-str attrs across all observed sections;
      // any non-string indicates corrupted input.
      const swing = stringValue(attrs[0]);
      const hit = stringValue(attrs[1]);
      if (swing === null) {
        throw new Error(
          `[ChrParser] parseWeaponWav: mono format attr[0] (swing) has type "${attrs[0].t}" ` +
          `(expected str/link) in ${document.path}. Real PVF emits pure-str weapon wav attrs.`,
        );
      }
      if (hit === null) {
        throw new Error(
          `[ChrParser] parseWeaponWav: mono format attr[1] (hit) has type "${attrs[1].t}" ` +
          `(expected str/link) in ${document.path}. Real PVF emits pure-str weapon wav attrs.`,
        );
      }
      return { format: "mono", swing, hit };
    }

    // Stereo form (swordman / fighter family): 4 str attrs.
    if (attrs.length === 4) {
      // Audit F4 (ts-parser-truth, 2026-05-24): same `?? ""` fabrication pattern
      // as mono. Real PVF swordman/fighter stereo sections emit pure-str.
      const swingA = stringValue(attrs[0]);
      const swingB = stringValue(attrs[1]);
      const hitA = stringValue(attrs[2]);
      const hitB = stringValue(attrs[3]);
      if (swingA === null) {
        throw new Error(
          `[ChrParser] parseWeaponWav: stereo format attr[0] (attackSwingA) has type "${attrs[0].t}" ` +
          `(expected str/link) in ${document.path}. Real PVF emits pure-str weapon wav attrs.`,
        );
      }
      if (swingB === null) {
        throw new Error(
          `[ChrParser] parseWeaponWav: stereo format attr[1] (attackSwingB) has type "${attrs[1].t}" ` +
          `(expected str/link) in ${document.path}. Real PVF emits pure-str weapon wav attrs.`,
        );
      }
      if (hitA === null) {
        throw new Error(
          `[ChrParser] parseWeaponWav: stereo format attr[2] (hitA) has type "${attrs[2].t}" ` +
          `(expected str/link) in ${document.path}. Real PVF emits pure-str weapon wav attrs.`,
        );
      }
      if (hitB === null) {
        throw new Error(
          `[ChrParser] parseWeaponWav: stereo format attr[3] (hitB) has type "${attrs[3].t}" ` +
          `(expected str/link) in ${document.path}. Real PVF emits pure-str weapon wav attrs.`,
        );
      }
      return {
        format: "stereo",
        attackSwingA: swingA,
        attackSwingB: swingB,
        hitA,
        hitB,
      };
    }

    throw new Error(
      `[ChrParser] parseWeaponWav: unexpected weapon wav section shape in ${document.path}: ` +
      `attrs=${attrs.length} types=[${attrs.map(a => a.t).join(",")}]. ` +
      `Real PVF only emits 0 / 2 / 4 attrs, or 1 mat attr (verified across 11 jobs).`,
    );
  });
}

function parseMotionRefs(document: PvfDocument): Record<string, PvfRef[]> {
  const refs: Record<string, PvfRef[]> = {};
  for (const sectionName of MOTION_SECTION_NAMES) {
    // Similar to attackInfo.etc — "etc motion" carries mixed content in
    // priest/thief real PVF (114 ref + 8 non-ref / 119 ref + 1 non-ref).
    // Allow mixed; non-ref preserved in document.sections.
    const sectionRefs = refAttributes(firstSection(document, sectionName), { allowMixed: true });
    if (sectionRefs.length > 0) refs[sectionName] = sectionRefs;
  }
  return refs;
}

// Audit F2 (ts-parser-truth, 2026-05-24): numeric() previously returned 0
// on wrong-type / undefined / non-finite attributes, fabricating valid-looking
// damageScalePct / critOrSimilar / pushBack / launch values from corrupted PVF.
// Real PVF weapon-hit-info rows are uniformly (str, str, int, float, float, float)
// across all 11 player .chr files (verified 2026-05-22); any other shape is
// corrupted input that should surface loudly rather than be coerced to 0.
function numeric(attribute: PvfAttribute | undefined, context: string): number {
  if (attribute === undefined) {
    throw new Error(
      `[ChrParser] numeric: ${context} attribute is undefined. ` +
      `Real PVF weapon hit info emits 6 attrs per row uniformly; ` +
      `missing attribute indicates corrupted PVF or extractor bug.`,
    );
  }
  if (attribute.t !== "int" && attribute.t !== "float") {
    throw new Error(
      `[ChrParser] numeric: ${context} attribute has type "${attribute.t}" (expected int/float). ` +
      `Real PVF weapon hit info numeric slots are uniformly int/float; ` +
      `wrong-type indicates corrupted input.`,
    );
  }
  const value = (attribute as { t: string; v: unknown }).v;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `[ChrParser] numeric: ${context} attribute has non-finite value ${JSON.stringify(value)}. ` +
      `Real PVF emits finite numbers; NaN/Infinity indicates corrupted input.`,
    );
  }
  return value;
}
