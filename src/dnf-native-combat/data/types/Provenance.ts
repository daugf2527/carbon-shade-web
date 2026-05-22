/**
 * Confidence tier per CLAUDE.md "DNF/DFO reference truth rule":
 *   tier1          — direct dnf-extract output from real PVF (Tier-1 truth)
 *   tier2          — Neople API / DFO-specific wiki cross-reference
 *   local_baseline — values in docs/ or src/ not yet verified against Tier-1/2;
 *                    requiresManualVerification SHOULD be true for these
 */
export type SourceConfidenceTier = "tier1" | "tier2" | "local_baseline";

export interface ExtractedDocumentProvenance {
  extractorVersion: string;
  extractTimestamp: string;
  /**
   * SHA-256 (or CRC32) of the source PVF, emitted by dnf-extract.
   * Optional because pre-D3 fixtures and synthetic test docs may omit it.
   * Callers MUST handle the missing case (defer to sourceRef as the identity).
   */
  sourcePvfHash?: string;
  sourceRef: string;
}

export interface ParsedFieldProvenance extends ExtractedDocumentProvenance {
  sectionName: string;
}

interface PvfFactBase {
  unit: string;
  provenance: ParsedFieldProvenance;
  /**
   * Confidence tier. Omitted ⇒ "tier1" (default for any field extracted from
   * real PVF). Explicitly set "local_baseline" when the value is a project-
   * internal hypothesis (e.g. jump_power unit ambiguity, hitstun frame tables)
   * pending Tier-1/2 verification.
   */
  sourceType?: SourceConfidenceTier;
  /**
   * True when the field's value is project-internal and not yet verified
   * against the source PVF or an authoritative external reference. Pairs with
   * sourceType="local_baseline".
   */
  requiresManualVerification?: boolean;
}

export interface PvfFact<T> extends PvfFactBase {
  value: T;
}

export interface PvfStringFact extends PvfFact<string> {
  rawValue?: string;
}

export interface PvfVectorFact extends PvfFactBase {
  values: number[];
}
