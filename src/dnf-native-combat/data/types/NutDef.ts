import type { ExtractedDocumentProvenance } from "./Provenance.js";

/**
 * Input shape from C++ dnf-extract --file <path>.nut
 *
 * printTextJson (main.cpp:487-490) emits exactly three fields:
 *   path, type, content
 *
 * There is NO extractor_version, extract_timestamp, source_pvf_hash, or
 * encoding field in the current C++ output. This interface reflects the
 * minimal real shape; optional fields allow future extractor upgrades without
 * breaking existing callers.
 */
export interface NutTextDocument {
  readonly path: string;
  readonly type: "text";
  readonly content: string;
  // The C++ extractor does NOT currently emit these fields (verified 2026-05-23
  // against printTextJson in main.cpp). Declared optional so future extractor
  // upgrades that add them are handled gracefully.
  readonly encoding?: string;
  readonly extractor_version?: string;
  readonly extract_timestamp?: string;
  readonly source_pvf_hash?: string;
}

/**
 * Parsed representation of a .nut (Squirrel script) file extracted from PVF.
 *
 * Design decision (pipeline doc §3): .nut → JS transpilation happens AFTER
 * ingest, not during Stage 2. This type is a pure passthrough: content is
 * preserved verbatim, and metadata is computed from the content string itself.
 */
export interface NutDef {
  readonly kind: "nut";
  readonly path: string;
  /** UTF-8 decoded Squirrel source — preserved verbatim, no mutation */
  readonly content: string;
  /**
   * Encoding label. Defaults to "utf-8" because the C++ extractor decodes
   * CP949 → UTF-8 before emitting JSON. Preserved as-is if the extractor
   * ever begins emitting an explicit field.
   */
  readonly encoding: string;
  /**
   * UTF-8 byte length of content (Buffer.byteLength semantics).
   * Multi-byte Korean characters count for more than one byte.
   */
  readonly byteLength: number;
  /**
   * Number of lines: content.split("\n").length
   * A single empty file ("") yields lineCount=1 (one empty line).
   * Mixed \r\n and \n endings: only \n is counted as a line break, matching
   * the most common JS convention.
   */
  readonly lineCount: number;
  readonly provenance: ExtractedDocumentProvenance;
}
