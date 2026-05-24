import type { SklCancelWindowDef, SklSkillType, SklWeaponEffectType, SkillDef } from "../types/SklDef.js";
import type { PvfDocument, PvfSection } from "../types/PvfDocument.js";
import type { PvfFact, PvfStringFact } from "../types/Provenance.js";
import {
  documentProvenance,
  firstSection,
  firstNumberFact,
  firstStringFact,
  sectionNumbers,
  stripPvfTag,
} from "./parserUtils.js";

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

export function parseSklDocument(document: PvfDocument): SkillDef {
  if (!document.path.toLowerCase().endsWith(".skl")) {
    throw new Error(`[SklParser] expected .skl document, got ${document.path}`);
  }

  const isCancelSkill = detectCancelSkill(document);

  return {
    kind: "skl",
    path: document.path,
    provenance: documentProvenance(document),
    sections: structuredClone(document.sections),

    name: parseNameFact(document),
    skillType: parseSkillType(document),
    weaponEffectType: parseWeaponEffectType(document),
    skillClass: isCancelSkill
      ? parseCancelAliasFact(document, "skill class", "cancelGroup")
      : firstNumberFact(document, "skill class", "raw"),

    purchaseCost: isCancelSkill
      ? parseCancelAliasFact(document, "purchase cost", "cancelWindowStart")
      : firstNumberFact(document, "purchase cost", "sp"),
    requiredLevel: isCancelSkill
      ? parseCancelAliasFact(document, "required level", "cancelWindowDuration")
      : firstNumberFact(document, "required level", "level"),
    requiredLevelRange: isCancelSkill ? null : firstNumberFact(document, "required level range", "raw"),
    maximumLevel: firstNumberFact(document, "maximum level", "level"),
    durabilityDecreaseRate: firstNumberFact(document, "durability decrease rate", "%"),

    growtypeMaximumLevel: parseGrowtypeMaximumLevel(document, isCancelSkill),
    skillFitnessGrowtype: parseSkillFitnessGrowtype(document, isCancelSkill),

    hasPvp: hasSection(document, "pvp"),
    hasDungeon: hasSection(document, "dungeon"),
    hasWarroom: hasSection(document, "warroom"),
    hasDeathTower: hasSection(document, "death tower"),
    autoCoolTimeApply: parseAutoCoolTime(document),

    cancelWindow: isCancelSkill ? parseCancelWindow(document) : null,

    raw: Object.freeze(document),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hasSection(document: PvfDocument, sectionName: string): boolean {
  return firstSection(document, sectionName) !== null;
}

// Detect cancel-skill by presence of `static data` section (zero-attribute
// sentinel emitted by dnf-extract for cancel* .skl files).
// Tier-1 PVF truth: verified on cancelupperslash.skl sample 2026-05-23.
function detectCancelSkill(document: PvfDocument): boolean {
  return hasSection(document, "static data");
}

function parseSkillType(document: PvfDocument): SklSkillType {
  // Audit F5 (ts-parser-truth, 2026-05-24): previously conflated three distinct
  // cases by returning "unknown" for all of them:
  //   A) section absent → legitimately "unknown" (schema accepts it)
  //   B) section present but first attr wrong type → corrupted PVF
  //   C) section present, attr is str/link, but tag value not in {active, passive}
  //      → unexpected enum literal (corrupted PVF or new game patch)
  // Real PVF .skl files emit "type" section with str "[active]" or "[passive]"
  // uniformly when present; B/C indicate corruption that should surface loudly
  // rather than silently masquerading as case A.
  const section = firstSection(document, "type");
  if (!section) return "unknown"; // case A: legitimate absence
  const attr = section.attributes[0];
  if (!attr || (attr.t !== "str" && attr.t !== "link")) {
    // case B: wrong type
    throw new Error(
      `[SklParser] parseSkillType: "type" section in ${document.path} has first attribute of type ` +
      `"${attr?.t ?? "undefined"}" (expected str/link). Real PVF emits str/link for skill type; ` +
      `wrong-type attribute indicates corrupted input.`,
    );
  }
  const tag = stripPvfTag((attr as { t: string; v: string }).v ?? "");
  if (tag === "active") return "active";
  if (tag === "passive") return "passive";
  // case C: unrecognised enum value
  throw new Error(
    `[SklParser] parseSkillType: "type" section in ${document.path} has unrecognised tag ` +
    `"${tag}" (expected "active" or "passive"). Real PVF skill types are uniformly active/passive; ` +
    `unexpected tag indicates corrupted input or new game patch requiring parser update.`,
  );
}

function parseWeaponEffectType(document: PvfDocument): SklWeaponEffectType {
  const section = firstSection(document, "weapon effect type");
  if (!section) return "unknown";
  const attr = section.attributes[0];
  if (!attr || (attr.t !== "str" && attr.t !== "link")) return "unknown";
  const tag = stripPvfTag((attr as { t: string; v: string }).v ?? "");
  if (tag === "physical") return "physical";
  if (tag === "magical") return "magical";
  return "unknown";
}

// `name` section uses link type with empty v ("") — still a valid fact.
// We return null only when the section is absent entirely.
function parseNameFact(document: PvfDocument): PvfStringFact | null {
  return firstStringFact(document, "name", "link-key");
}

// The `growtype maximum level` section encodes per-slot max levels as a flat
// int array (6 values in all observed swordman samples). In cancel skills it
// carries `cancelWeaponMask` alias semantics — caller passes isCancelSkill.
// We return the raw numbers array without per-level wrapping (no PvfVectorFact
// needed here — the vec invariant checks are for growth tables, not this array).
function parseGrowtypeMaximumLevel(document: PvfDocument, isCancelSkill: boolean): number[] | null {
  if (isCancelSkill) return null; // cancel skills use this section for cancelWeaponMask
  const nums = sectionNumbers(document, "growtype maximum level");
  return nums.length > 0 ? nums : null;
}

function parseSkillFitnessGrowtype(document: PvfDocument, isCancelSkill: boolean): number[] | null {
  if (isCancelSkill) return null; // cancel skills use this section for cancelTargetSlots
  const nums = sectionNumbers(document, "skill fitness growtype");
  return nums.length > 0 ? nums : null;
}

function parseAutoCoolTime(document: PvfDocument): boolean {
  const section = firstSection(document, "auto cooltime apply");
  if (!section) return false;
  const attr = section.attributes[0];
  if (!attr) return false;
  if (attr.t === "int" || attr.t === "float") {
    return (attr as { t: string; v: number }).v === 1;
  }
  // Audit F6 (ts-parser-truth, 2026-05-24): wrong-type attribute on a present
  // section is a corrupted PVF, not "no auto-cooltime". Surface loudly so the
  // VALIDATE stage sees it rather than silently returning false (which would
  // be indistinguishable from "section absent").
  throw new Error(
    `[SklParser] parseAutoCoolTime: "auto cooltime apply" section in ${document.path} ` +
    `has first attribute of type "${attr.t}" (expected int/float). Real PVF emits int v=0/1; ` +
    `mixed-type attribute indicates corrupted input.`,
  );
}

// ---------------------------------------------------------------------------
// Cancel-skill dual-semantics helpers
// ---------------------------------------------------------------------------

// Read a number fact from a section that carries cancel dual-semantics.
// The section name is the PVF section name; aliasName is the semantic alias
// for provenance annotation only (does not affect lookup).
// TODO: lift parseCancelAliasFact into parserUtils once cancel dual-semantics
// is fully understood and shared across more parsers.
function parseCancelAliasFact(
  document: PvfDocument,
  sectionName: string,
  _aliasName: string,
): PvfFact<number> | null {
  return firstNumberFact(document, sectionName, "raw");
}

// Parse the full cancel window definition from a cancel-type .skl.
// Throws if any required cancel field is missing or wrong-typed.
// Verified against cancelupperslash.skl (Tier-1 PVF, 2026-05-23).
function parseCancelWindow(document: PvfDocument): SklCancelWindowDef {
  const windowStartFact = firstNumberFact(document, "purchase cost", "frames");
  if (windowStartFact === null) {
    throw new Error(
      `[SklParser] parseCancelWindow: cancel skill "${document.path}" is missing required ` +
      `"purchase cost" section (alias: cancelWindowStart). Cancel dual-semantics requires ` +
      `this section to carry the cancel window start frame.`,
    );
  }

  const windowDurationFact = firstNumberFact(document, "required level", "frames");
  if (windowDurationFact === null) {
    throw new Error(
      `[SklParser] parseCancelWindow: cancel skill "${document.path}" is missing required ` +
      `"required level" section (alias: cancelWindowDuration). Cancel dual-semantics requires ` +
      `this section to carry the cancel window duration in frames.`,
    );
  }

  const cancelGroupFact = firstNumberFact(document, "skill class", "raw");
  if (cancelGroupFact === null) {
    throw new Error(
      `[SklParser] parseCancelWindow: cancel skill "${document.path}" is missing required ` +
      `"skill class" section (alias: cancelGroup). Cancel dual-semantics requires ` +
      `this section to carry the cancel group identifier.`,
    );
  }

  // cancelWeaponMask — positional int array (one value per weapon equip slot).
  const weaponMaskNums = parseCancelNumberArray(document, "growtype maximum level", "cancelWeaponMask");
  // cancelTargetSlots — positional int array of valid target slot indices.
  const targetSlots = parseCancelNumberArray(document, "skill fitness growtype", "cancelTargetSlots");

  return {
    cancelWindowStart: windowStartFact.value,
    cancelWindowDuration: windowDurationFact.value,
    cancelGroup: cancelGroupFact.value,
    cancelWeaponMask: weaponMaskNums,
    cancelTargetSlots: targetSlots,
  };
}

// Extract int[] from a cancel-skill section (alias of growtype maximum level or
// skill fitness growtype). Returns [] if section absent — both fields are present
// in the observed sample but may be absent in synthetic/partial cancel skills.
// Does NOT call sectionNumbers() because that function throws on mixed-type
// content; cancel sections in real PVF are pure-int, but aliased names differ
// from the normal skill context, so we handle directly for clarity.
// TODO: lift into parserUtils if other parsers encounter the same pattern.
function parseCancelNumberArray(document: PvfDocument, sectionName: string, alias: string): number[] {
  const section = firstSection(document, sectionName);
  if (!section) return [];
  const nums: number[] = [];
  for (let i = 0; i < section.attributes.length; i++) {
    const attr = section.attributes[i];
    if (attr.t !== "int" && attr.t !== "float") {
      throw new Error(
        `[SklParser] parseCancelNumberArray: cancel section "${sectionName}" (alias: ${alias}) ` +
        `attr[${i}] has type "${attr.t}" (expected int/float) in ${document.path}. ` +
        `Real PVF cancel sections emit pure-int arrays; mixed-type indicates corrupted input.`,
      );
    }
    nums.push((attr as { t: string; v: number }).v);
  }
  return nums;
}
