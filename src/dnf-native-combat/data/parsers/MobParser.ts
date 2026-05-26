import type { MobDef } from "../types/MobDef.js";
import type {
  PvfAttribute,
  PvfDocument,
  PvfEnumAttribute,
  PvfRef,
  PvfSection,
} from "../types/PvfDocument.js";
import type { PvfFact, PvfVectorFact } from "../types/Provenance.js";
import {
  asTier3,
  documentProvenance,
  fieldProvenance,
  firstNumberFact,
  firstSection,
  firstStringFact,
  refAttributes,
  stringValue,
  stripPvfTag,
  vectorFact,
} from "./parserUtils.js";

export function parseMobDocument(document: PvfDocument): MobDef {
  if (!document.path.toLowerCase().endsWith(".mob")) {
    throw new Error(`MobParser expected .mob document, got ${document.path}`);
  }

  return {
    kind: "mob",
    path: document.path,
    provenance: documentProvenance(document),
    sections: structuredClone(document.sections),
    name: firstStringFact(document, "name"),
    // D1 expansion (2026-05-24): warlike is the AI aggressiveness param —
    // PVF emits an integer but the engine's threshold curves (when does the
    // mob change FSM state? what range does it sample?) live inside DNF.exe.
    // weight is the audio-only param shared with chr.weight (unit "raw").
    // Both are Tier-3 pending runtime verification.
    warlike: asTier3(firstNumberFact(document, "warlike", "raw")),
    sight: firstNumberFact(document, "sight", "px"),
    // weight: keep legacy single-value contract for SqliteImporter; weightDual
    // exposes the full [w1, w2] pair (Phase 3, 2026-05-26).
    weight: asTier3(firstNumberFact(document, "weight", "raw")),
    weightDual: asTier3(intVectorFact(document, "weight", "raw")),
    hpMax: vectorFact(document, "hp max", "hp"),
    // Phase 3 (2026-05-26, completeness-verifier-4): parser previously dropped
    // 8 sections that all 5/5 verified goblin mobs carry. Stage 2 13-system
    // engine layer depends on these (HP scaling, AI movement, hit-recovery,
    // archetype switch).
    abilityCategory: asTier3(parseAbilityCategory(document)),
    level: asTier3(intVectorFact(document, "level", "raw")),
    attackDelay: asTier3(firstNumberFact(document, "attack delay", "ms")),
    moveSpeed: asTier3(intVectorFact(document, "move speed", "raw")),
    hitRecovery: asTier3(intVectorFact(document, "hit recovery", "ms")),
    widthBox: asTier3(intVectorFact(document, "width", "raw")),
    stuckbonusOnDamage: asTier3(intVectorFact(document, "stuckbonus on damage", "raw")),
    attackKind: parseAttackKind(document),
    attackInfo: refAttributes(firstSection(document, "attack info"), { allowMixed: true }),
    animationRefs: collectAnimationRefs(document),
    category: collectCategoryNames(document),
    raw: Object.freeze(document),
  };
}

function collectAnimationRefs(document: PvfDocument): PvfRef[] {
  const seen = new Set<string>();
  const result: PvfRef[] = [];
  for (const section of document.sections) {
    // .mob sections legitimately mix ref / non-ref content (e.g. "attack info"
    // can carry positional metadata alongside the ref); use best-effort mode.
    for (const ref of refAttributes(section, { allowMixed: true })) {
      if (ref.targetKind !== "ani") continue;
      if (seen.has(ref.targetPath)) continue;
      seen.add(ref.targetPath);
      result.push(ref);
    }
  }
  return result;
}

function collectCategoryNames(document: PvfDocument): string[] {
  return firstSection(document, "category")?.attributes
    .map(attribute => {
      if (attribute.t === "enum" && typeof (attribute as PvfEnumAttribute).name === "string") {
        return (attribute as PvfEnumAttribute).name;
      }
      const value = stringValue(attribute);
      return value ? stripPvfTag(value) : null;
    })
    // Real PVF never emits empty `[]` tags (0/200 mobs verified 2026-05-22), but
    // strip empty strings defensively so a malformed/synthetic input doesn't leak
    // a meaningless "" into the category array. After stripPvfTag was hardened
    // to preserve "[]" verbatim, the empty-string filter is now mostly dormant
    // but kept as belt-and-suspenders for non-bracket empty values.
    .filter((value): value is string => value !== null && value !== "" && value !== "[]") ?? [];
}

/**
 * Parse "ability category" section into a `Record<string, number>` of
 * `stat -> percent`.
 *
 * Real PVF emits triples per stat: `[str("[hp max]"), str("*"), int(80), ...]`
 * (verified across 5/5 goblin samples, 2026-05-26). The operator slot is
 * uniformly multiplicative ("*") in observed data; non-multiplicative
 * operators would change semantics (additive vs multiplicative), so we
 * hard-fail on any other operator to surface unknown shapes rather than
 * silently coerce.
 *
 * Tolerance:
 *   - Section absent           -> return null (legitimate "no scaling")
 *   - Section present + empty  -> throw (real PVF emits >=1 triple)
 *   - Attr count not divisible by 3 -> throw (extractor invariant violation)
 *   - Slot type mismatch       -> throw (str/str/int expected per slot)
 *   - Operator slot not "*"    -> throw (unknown semantics)
 */
function parseAbilityCategory(document: PvfDocument): PvfFact<Record<string, number>> | null {
  const section = firstSection(document, "ability category");
  if (section === null) return null;
  const attrs = section.attributes;
  if (attrs.length === 0) {
    throw new Error(
      `[MobParser] parseAbilityCategory: section "ability category" present but empty ` +
      `in ${document.path}. Real PVF always emits >=1 triple when the section is declared.`,
    );
  }
  if (attrs.length % 3 !== 0) {
    throw new Error(
      `[MobParser] parseAbilityCategory: section "ability category" attribute count ${attrs.length} ` +
      `not divisible by 3 in ${document.path}. Expected triples (key, op, value).`,
    );
  }
  const map: Record<string, number> = {};
  for (let i = 0; i < attrs.length; i += 3) {
    const keyAttr = attrs[i];
    const opAttr = attrs[i + 1];
    const valAttr = attrs[i + 2];
    // Slot 0: str / link "[stat name]"
    let rawKey: string | null = null;
    if ((keyAttr.t === "str" || keyAttr.t === "link") && typeof (keyAttr as { v?: unknown }).v === "string") {
      rawKey = (keyAttr as { v: string }).v;
    }
    if (rawKey === null) {
      throw new Error(
        `[MobParser] parseAbilityCategory: triple[${i / 3}] key slot has type "${keyAttr.t}" ` +
        `(expected str/link) in ${document.path}. Real PVF emits str/link for stat keys.`,
      );
    }
    const key = stripPvfTag(rawKey);
    if (key === "") {
      throw new Error(
        `[MobParser] parseAbilityCategory: triple[${i / 3}] empty key after stripPvfTag ` +
        `(raw=${JSON.stringify(rawKey)}) in ${document.path}.`,
      );
    }
    // Slot 1: str "*" (multiplicative is the only operator observed in goblin samples)
    let op: string | null = null;
    if (opAttr.t === "str" && typeof (opAttr as { v?: unknown }).v === "string") {
      op = (opAttr as { v: string }).v;
    }
    if (op !== "*") {
      throw new Error(
        `[MobParser] parseAbilityCategory: triple[${i / 3}] operator slot is ` +
        `${JSON.stringify(op ?? `(type ${opAttr.t})`)} (expected "*") in ${document.path}. ` +
        `Unknown operators have unverified semantics; refusing to silently coerce.`,
      );
    }
    // Slot 2: int (percent)
    let value: number | null = null;
    if (valAttr.t === "int" && typeof (valAttr as { v?: unknown }).v === "number" && Number.isFinite((valAttr as { v: number }).v)) {
      value = (valAttr as { v: number }).v;
    }
    if (value === null) {
      throw new Error(
        `[MobParser] parseAbilityCategory: triple[${i / 3}] value slot has type "${valAttr.t}" ` +
        `(expected finite int) in ${document.path}.`,
      );
    }
    if (key in map) {
      throw new Error(
        `[MobParser] parseAbilityCategory: duplicate key "${key}" in ${document.path}. ` +
        `Each stat should appear at most once.`,
      );
    }
    map[key] = value;
  }
  return {
    value: map,
    unit: "percent",
    provenance: fieldProvenance(document, "ability category"),
  };
}

/**
 * Parse "attack kind" section as raw PvfAttribute[]. Shape varies per mob
 * archetype (goblin: 24 mixed float/int; cowardgoblin: 12 entries), so
 * Stage 1 preserves the list verbatim. Stage 2 consumers unpack against the
 * archetype-specific schema. Returns null when the section is absent.
 */
function parseAttackKind(document: PvfDocument): PvfAttribute[] | null {
  const section = firstSection(document, "attack kind");
  if (section === null) return null;
  // Deep clone so downstream mutations don't leak back into document.sections.
  return structuredClone(section.attributes);
}

/**
 * Read a section as a vector of int attributes (uniform `[int, int, ...]`
 * shape used by level / move speed / hit recovery / width / stuckbonus /
 * weight). Returns null when the section is absent; throws when the section
 * is present but malformed (empty, non-int attrs).
 *
 * Floats are intentionally rejected here. The listed mob sections only emit
 * ints in observed PVF data; mixing float would change semantics (e.g. a
 * fractional "move speed" would need a different unit interpretation).
 */
function intVectorFact(document: PvfDocument, sectionName: string, unit: string): PvfVectorFact | null {
  const section = firstSection(document, sectionName);
  if (section === null) return null;
  return readIntVectorFromSection(document, section, sectionName, unit);
}

function readIntVectorFromSection(
  document: PvfDocument,
  section: PvfSection,
  sectionName: string,
  unit: string,
): PvfVectorFact {
  const attrs = section.attributes;
  if (attrs.length === 0) {
    throw new Error(
      `[MobParser] intVectorFact: section "${sectionName}" present but empty in ${document.path}. ` +
      `Real PVF emits >=1 int when the section is declared.`,
    );
  }
  const values: number[] = [];
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    if (
      attr.t !== "int" ||
      typeof (attr as { v?: unknown }).v !== "number" ||
      !Number.isFinite((attr as { v: number }).v)
    ) {
      throw new Error(
        `[MobParser] intVectorFact: section "${sectionName}" attr[${i}] has type "${attr.t}" ` +
        `(expected int) in ${document.path}. Real PVF emits pure-int sections for this field.`,
      );
    }
    values.push((attr as { v: number }).v);
  }
  return {
    values,
    unit,
    provenance: fieldProvenance(document, sectionName),
  };
}
