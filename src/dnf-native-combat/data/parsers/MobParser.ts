import type { MobDef } from "../types/MobDef.js";
import type { PvfDocument, PvfEnumAttribute } from "../types/PvfDocument.js";
import {
  documentProvenance,
  firstNumberFact,
  firstSection,
  firstStringFact,
  refAttributes,
  stringValue,
  vectorFact,
} from "./parserUtils.js";

export function parseMobDocument(document: PvfDocument): MobDef {
  if (!document.path.endsWith(".mob")) {
    throw new Error(`MobParser expected .mob document, got ${document.path}`);
  }

  return {
    kind: "mob",
    path: document.path,
    provenance: documentProvenance(document),
    sections: document.sections,
    name: firstStringFact(document, "name"),
    warlike: firstNumberFact(document, "warlike", "raw"),
    sight: firstNumberFact(document, "sight", "px"),
    weight: firstNumberFact(document, "weight", "raw"),
    hpMax: vectorFact(document, "hp max", "hp"),
    attackInfo: refAttributes(firstSection(document, "attack info")),
    animationRefs: collectAnimationRefs(document),
    category: collectCategoryNames(document),
    raw: document,
  };
}

function collectAnimationRefs(document: PvfDocument) {
  return document.sections
    .flatMap(section => refAttributes(section))
    .filter(ref => ref.targetKind === "ani");
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
    .filter((value): value is string => value !== null) ?? [];
}

function stripPvfTag(value: string): string {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}
