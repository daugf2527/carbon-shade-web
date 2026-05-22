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
  return {
    values: attr.items,
    unit,
    provenance: fieldProvenance(document, sectionName),
  };
}

export function refAttributes(section: PvfSection | null): PvfRef[] {
  const refs = section?.attributes.filter((attr): attr is PvfRefAttribute => attr.t === "ref") ?? [];
  return refs.map(ref => ({
    targetKind: ref.target_kind,
    targetPath: ref.target_path,
    raw: ref.raw,
  }));
}

export function requireValue<T>(value: T | null, label: string, sourcePath: string): T {
  if (value === null) throw new Error(`Missing required PVF section "${label}" in ${sourcePath}`);
  return value;
}

export function sectionNumbers(document: PvfDocument, sectionName: string): number[] {
  return firstSection(document, sectionName)?.attributes
    .map(attr => numberValue(attr))
    .filter((value): value is number => value !== null) ?? [];
}
