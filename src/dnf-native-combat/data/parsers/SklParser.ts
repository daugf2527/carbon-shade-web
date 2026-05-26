import type { SklCancelWindowDef, SklSkillType, SklWeaponEffectType, SkillDef } from "../types/SklDef.js";
import type { PvfAttribute, PvfDocument, PvfSection } from "../types/PvfDocument.js";
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

    // Phase 4 (2026-05-26) Stage 2 启动门槛 — 12 raw section typed 化
    command: parseCommand(document),
    coolTime: parseCoolTime(document),
    consumeMp: parseConsumeMp(document),
    castingTime: parseCastingTime(document),
    levelProperty: parseAttrArray(document, "level property"),
    levelInfo: parseAttrArray(document, "level info"),
    preRequiredSkill: parseIntArray(document, "pre required skill"),
    featureSkillIndex: parseSingleInt(document, "feature skill index"),
    icon: parseIcon(document),
    consumeItem: parseIntArray(document, "consume item"),
    maintainMp: parseSingleInt(document, "maintain mp"),
    skillCommandAdvantage: parseSkillCommandAdvantage(document),

    raw: Object.freeze(document),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hasSection(document: PvfDocument, sectionName: string): boolean {
  return firstSection(document, sectionName) !== null;
}

// Detect cancel-skill by path convention. All 192 cancel skill files in
// the real PVF have basenames starting with "cancel" (verified against
// the full PVF list 2026-05-24). No non-cancel skill basename starts
// with "cancel". Section-based detection (`static data` presence) was
// the original heuristic but false-positives on passive skills like
// elementtoleranceallupex.skl which also carry the `static data`
// sentinel — PVE-full baseline exposed 275 such mis-detections.
//
// Test fixture compatibility: H6-P4 invariant probes use path
// "skill/<job>/cancel.skl" — basename "cancel.skl" passes the startsWith
// check, so the missing-required-field invariants still surface.
function detectCancelSkill(document: PvfDocument): boolean {
  const slash = document.path.lastIndexOf("/");
  const basename = slash < 0 ? document.path : document.path.slice(slash + 1);
  return basename.toLowerCase().startsWith("cancel");
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

// ---------------------------------------------------------------------------
// Phase 4 (2026-05-26) typed-field helpers for 12 raw sections
// ---------------------------------------------------------------------------

/** Extract a string[] of token values from a section like `[command]`.
 *  Returns null if section absent or no str/link attrs. */
function parseCommand(document: PvfDocument): string[] | null {
  const section = firstSection(document, "command");
  if (!section || section.attributes.length === 0) return null;
  const tokens: string[] = [];
  for (const attr of section.attributes) {
    if (attr.t === "str" || attr.t === "link") {
      tokens.push((attr as { t: string; v: string }).v);
    } else {
      // Real-PVF observation: command tokens are uniformly str/link. Non-str
      // attribute indicates corrupted input or a new game patch. Surface loudly.
      throw new Error(
        `[SklParser] parseCommand: "command" section in ${document.path} has non-str attribute ` +
        `of type "${attr.t}". Real PVF command sections emit pure-str token sequences; ` +
        `mixed-type indicates corrupted input.`,
      );
    }
  }
  return tokens;
}

/** Extract [dungeonMs, pvpMs] from `[cool time]`. Real PVF emits 2 ints. */
function parseCoolTime(document: PvfDocument): { dungeonMs: number; pvpMs: number } | null {
  const nums = sectionNumbers(document, "cool time");
  if (nums.length < 2) return null;
  return { dungeonMs: nums[0], pvpMs: nums[1] };
}

/** Extract [baseMp, lvlMaxMp] from `[consume mp]`. */
function parseConsumeMp(document: PvfDocument): { baseMp: number; lvlMaxMp: number } | null {
  const nums = sectionNumbers(document, "consume mp");
  if (nums.length < 2) return null;
  return { baseMp: nums[0], lvlMaxMp: nums[1] };
}

/** Extract [baseMs, lvl20Ms] from `[casting time]`. */
function parseCastingTime(document: PvfDocument): { baseMs: number; lvl20Ms: number } | null {
  const nums = sectionNumbers(document, "casting time");
  if (nums.length < 2) return null;
  return { baseMs: nums[0], lvl20Ms: nums[1] };
}

/** Generic "preserve raw PvfAttribute[] from a section". Used for sections
 *  whose semantic shape varies per skill (level property, level info). */
function parseAttrArray(document: PvfDocument, sectionName: string): PvfAttribute[] | null {
  const section = firstSection(document, sectionName);
  if (!section || section.attributes.length === 0) return null;
  return structuredClone(section.attributes);
}

/** Generic int[] extraction for sections like `[pre required skill]`,
 *  `[consume item]` whose semantics are positional and may vary in length.
 *  Returns null if section absent. */
function parseIntArray(document: PvfDocument, sectionName: string): number[] | null {
  const section = firstSection(document, sectionName);
  if (!section || section.attributes.length === 0) return null;
  const nums: number[] = [];
  for (const attr of section.attributes) {
    if (attr.t === "int" || attr.t === "float") {
      nums.push((attr as { t: string; v: number }).v);
    } else {
      // Tolerate mixed types in these forward-compat sections — skip non-numeric
      // attrs rather than throw. Downstream still gets the int subset.
      // (Different from cancel sections which are strict pure-int.)
    }
  }
  return nums.length > 0 ? nums : null;
}

/** Extract single int from a section's first attribute. Returns null if absent. */
function parseSingleInt(document: PvfDocument, sectionName: string): number | null {
  const section = firstSection(document, sectionName);
  if (!section || section.attributes.length === 0) return null;
  const attr = section.attributes[0];
  if (attr.t === "int" || attr.t === "float") {
    return (attr as { t: string; v: number }).v;
  }
  return null;
}

/** Parse `[icon]` 4-attr structure: [atlas:str, frame:int, lit_atlas:str, lit_frame:int].
 *  Atlas paths often have `_note: "ref_ext_but_path_not_found"` — preserved as
 *  the raw string. Returns null when section absent or shape doesn't match. */
function parseIcon(document: PvfDocument): {
  atlasPath: string; frame: number; litAtlasPath: string; litFrame: number;
} | null {
  const section = firstSection(document, "icon");
  if (!section || section.attributes.length < 4) return null;
  const attrs = section.attributes;
  const a0 = attrs[0], a1 = attrs[1], a2 = attrs[2], a3 = attrs[3];
  if ((a0.t !== "str" && a0.t !== "link") || a1.t !== "int" ||
      (a2.t !== "str" && a2.t !== "link") || a3.t !== "int") {
    return null;
  }
  return {
    atlasPath: (a0 as { t: string; v: string }).v,
    frame: (a1 as { t: "int"; v: number }).v,
    litAtlasPath: (a2 as { t: string; v: string }).v,
    litFrame: (a3 as { t: "int"; v: number }).v,
  };
}

/** Parse `[skill command advantage]` [normal_ms, advanced_ms]. */
function parseSkillCommandAdvantage(document: PvfDocument): { normal: number; advanced: number } | null {
  const nums = sectionNumbers(document, "skill command advantage");
  if (nums.length < 2) return null;
  return { normal: nums[0], advanced: nums[1] };
}
