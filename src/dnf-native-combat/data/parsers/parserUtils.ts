import type { PvfAttribute, PvfDocument, PvfRef, PvfRefAttribute, PvfSection } from "../types/PvfDocument.js";
import type { ExtractedDocumentProvenance, ParsedFieldProvenance, PvfFact, PvfStringFact, PvfVectorFact } from "../types/Provenance.js";

export function documentProvenance(document: PvfDocument): ExtractedDocumentProvenance {
  const provenance: ExtractedDocumentProvenance = {
    extractorVersion: document.extractor_version,
    extractTimestamp: document.extract_timestamp,
    sourceRef: `pvf:${document.path}`,
  };
  // source_pvf_hash is optional per PvfDocument schema; only attach when the
  // extractor actually emitted it. This preserves the previous behaviour for
  // real-PVF docs while keeping the field omitted (rather than the string
  // "undefined") for fixtures / synthetic inputs.
  if (typeof document.source_pvf_hash === "string" && document.source_pvf_hash.length > 0) {
    provenance.sourcePvfHash = document.source_pvf_hash;
  }
  return provenance;
}

export function fieldProvenance(document: PvfDocument, sectionName: string): ParsedFieldProvenance {
  return {
    ...documentProvenance(document),
    sectionName,
  };
}

export function firstSection(document: PvfDocument, name: string): PvfSection | null {
  return document.sections.find(section => section.name === name) ?? null;
}

export function sectionsByName(document: PvfDocument, name: string): PvfSection[] {
  return document.sections.filter(section => section.name === name);
}

// Strip the PVF `[name]` tag wrapper, returning the inner name. Two invariants:
// 1) Only strip when the value is a well-formed bracket tag — empty `[]` and
//    values with embedded `]` (e.g. `[a]b]`) are passed through unchanged so
//    downstream consumers can see the corrupted shape.
// 2) Bare values (no brackets, or single bracket) pass through unchanged.
// Real PVF .chr/.mob tag values verified well-formed (200+ mobs / 11 chr,
// 2026-05-22) — these guards are defensive against synthetic or malformed input.
export function stripPvfTag(value: string): string {
  if (value.length < 3) return value;                        // "[]" or shorter → unchanged
  if (!value.startsWith("[") || !value.endsWith("]")) return value;
  const inner = value.slice(1, -1);
  if (inner.includes("]")) return value;                     // embedded ] → unchanged
  return inner;
}

export function numberValue(attribute: PvfAttribute | undefined): number | null {
  if (!attribute) return null;
  if (
    (attribute.t === "int" || attribute.t === "float") &&
    typeof attribute.v === "number" &&
    Number.isFinite(attribute.v)
  ) return attribute.v;
  return null;
}

export function stringValue(attribute: PvfAttribute | undefined): string | null {
  if (!attribute) return null;
  if ((attribute.t === "str" || attribute.t === "link") && typeof attribute.v === "string") return attribute.v;
  return null;
}

export function firstNumberFact(document: PvfDocument, sectionName: string, unit: string): PvfFact<number> | null {
  const section = firstSection(document, sectionName);
  const value = numberValue(section?.attributes[0]);
  if (!section || value === null) return null;
  return { value, unit, provenance: fieldProvenance(document, sectionName) };
}

export function firstStringFact(document: PvfDocument, sectionName: string, unit = "raw-string"): PvfStringFact | null {
  const section = firstSection(document, sectionName);
  const value = stringValue(section?.attributes[0]);
  if (!section || value === null) return null;
  return { value, unit, provenance: fieldProvenance(document, sectionName) };
}

export function vectorFact(document: PvfDocument, sectionName: string, unit: string): PvfVectorFact | null {
  const section = firstSection(document, sectionName);
  const attr = section?.attributes[0];
  if (!section || attr?.t !== "vec" || !Array.isArray(attr.items)) return null;
  // Real PVF data is uniformly consistent (99/99 vec attrs across 11 player .chr
  // files — verified 2026-05-22). Mismatch indicates corrupted PVF input or
  // a malformed extractor output and should fail loudly rather than silently
  // returning truncated/padded data.
  if (typeof attr.length === "number" && attr.length !== attr.items.length) {
    throw new Error(
      `[parserUtils] vectorFact: declared vec.length=${attr.length} does not match ` +
      `items.length=${attr.items.length} in ${document.path} section "${sectionName}". ` +
      `Real PVF data is uniformly consistent; mismatch indicates corrupted input.`,
    );
  }
  // Real PVF vec attrs always have items.length > 0 (typically 70 for level
  // growth tables, 6 for weapon-hit-info rows). A zero-length vec passes the
  // length-consistency check above but would silently degrade downstream
  // consumers (e.g. hp max with no growth values is meaningless). Throw.
  if (attr.items.length === 0) {
    throw new Error(
      `[parserUtils] vectorFact: section "${sectionName}" has empty items array in ${document.path}. ` +
      `Real PVF never emits zero-length vec attrs; empty vec indicates corrupted input or stripped data.`,
    );
  }
  return {
    values: attr.items,
    unit,
    provenance: fieldProvenance(document, sectionName),
  };
}

// Real PVF "attack info" / "etc attack info" sections contain ONLY ref attrs
// (verified across all 11 player .chr fixtures 2026-05-22). Mixed ref/non-ref
// content indicates corrupted PVF or misrouted document — throw rather than
// silently drop the non-ref attrs (which could be positional metadata).
// MobParser.collectAnimationRefs iterates every section and opts into
// best-effort mode via { allowMixed: true } since .mob sections legitimately
// mix ref / non-ref content.
export function refAttributes(
  section: PvfSection | null,
  options: { allowMixed?: boolean } = {},
): PvfRef[] {
  if (!section) return [];
  const refs: PvfRef[] = [];
  let nonRefCount = 0;
  for (const attr of section.attributes) {
    if (attr.t === "ref") {
      refs.push({
        targetKind: (attr as PvfRefAttribute).target_kind,
        targetPath: (attr as PvfRefAttribute).target_path,
        raw: (attr as PvfRefAttribute).raw,
      });
    } else {
      nonRefCount += 1;
    }
  }
  if (!options.allowMixed && refs.length > 0 && nonRefCount > 0) {
    throw new Error(
      `[parserUtils] refAttributes: section "${section.name}" mixes ref and non-ref attrs ` +
      `(${refs.length} ref + ${nonRefCount} non-ref). Real PVF emits pure-ref sections; ` +
      `mixed content indicates corrupted input or misrouted section. ` +
      `Pass { allowMixed: true } only for best-effort discovery (e.g. MobParser).`,
    );
  }
  return refs;
}

export function requireValue<T>(value: T | null, label: string, sourcePath: string): T {
  if (value === null) {
    const effectiveLabel = label.trim() === "" ? "<unnamed>" : label;
    throw new Error(`Missing required PVF section "${effectiveLabel}" in ${sourcePath}`);
  }
  return value;
}

// Real PVF "width" / "weapon skill info" / "weapon durability decrease rate" /
// "upgrade weapon attack power rate" sections contain pure-number attrs only
// (verified across 11 player .chr 2026-05-22). Mixed-type content silently
// dropped is data corruption — a positional layout like [x, type-tag, y]
// would lose the type-tag invisibly. Throw rather than filter.
export function sectionNumbers(document: PvfDocument, sectionName: string): number[] {
  const section = firstSection(document, sectionName);
  if (!section) return [];
  const numbers: number[] = [];
  for (let i = 0; i < section.attributes.length; i++) {
    const attr = section.attributes[i];
    const value = numberValue(attr);
    if (value === null) {
      throw new Error(
        `[parserUtils] sectionNumbers: section "${sectionName}" attr[${i}] has type "${attr.t}" ` +
        `(expected int/float) in ${document.path}. Real PVF emits pure-number sections; ` +
        `mixed-type content would silently lose positional signals.`,
      );
    }
    numbers.push(value);
  }
  return numbers;
}
