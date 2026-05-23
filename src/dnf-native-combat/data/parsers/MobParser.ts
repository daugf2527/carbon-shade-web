import type { MobDef } from "../types/MobDef.js";
import type { PvfDocument, PvfEnumAttribute, PvfRef } from "../types/PvfDocument.js";
import {
  documentProvenance,
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
    warlike: firstNumberFact(document, "warlike", "raw"),
    sight: firstNumberFact(document, "sight", "px"),
    weight: firstNumberFact(document, "weight", "raw"),
    hpMax: vectorFact(document, "hp max", "hp"),
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
