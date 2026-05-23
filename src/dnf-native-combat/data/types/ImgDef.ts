import type { ExtractedDocumentProvenance } from "./Provenance.js";

/**
 * Input shape from C++ dnf-extract --file <path>.img (PVF-embedded binary stub).
 *
 * printBinaryJson (main.cpp:519-541) emits exactly:
 *   path, type, format, sizeBytes, headHex
 * and optionally contentBase64 when --with-data is passed.
 *
 * IMPORTANT: printBinaryJson does NOT emit the provenance preamble
 * (extractor_version / extract_timestamp / source_pvf_hash).
 * Verified 2026-05-23 against main.cpp:519-541 — those fields are only in
 * printDocumentJson and printTextJson (after the 2026-05-23 symmetry fix).
 * These remain optional in case a future rebuild adds them.
 *
 * PVF-embedded .img stubs are binary metadata records inside Script.pvf —
 * NOT the NPK texture atlas frames extracted via --npk mode. The only known
 * example is monster/newmonsters/gbl/webcannon/action/throwweb.img
 * (sizeBytes=576732, format="neople-image").
 */
export interface ImgBinaryDocument {
  readonly path: string;
  readonly type: "binary";
  /** "neople-image" | "pe-executable" | "gzip" | "zip" | "unknown" | "empty" */
  readonly format: string;
  readonly sizeBytes: number;
  /** First 32 bytes of the file as lowercase hex (64 chars when full; fewer if file < 32 bytes). */
  readonly headHex: string;
  /** Present only when dnf-extract is invoked with --with-data. */
  readonly contentBase64?: string;
  // C++ printBinaryJson currently does NOT emit these fields (main.cpp:519-541,
  // verified 2026-05-23). Declared optional so future extractor upgrades that add
  // them are handled gracefully.
  readonly extractor_version?: string;
  readonly extract_timestamp?: string;
  readonly source_pvf_hash?: string;
}

/**
 * Parsed representation of a PVF-embedded .img binary stub.
 *
 * ImgBinaryDocument is the raw C++ output (direct JSON mapping).
 * ImgDef is the normalized pipeline-internal type after invariant validation
 * and provenance construction.
 *
 * Note: This describes a PVF binary stub, not an NPK texture frame.
 * NPK frame data is extracted separately via dnf-extract --npk mode.
 */
export interface ImgDef {
  readonly kind: "img";
  readonly path: string;
  /** Format hint from the C++ extractor (e.g. "neople-image"). */
  readonly format: string;
  readonly sizeBytes: number;
  /** First 32 bytes as lowercase hex. Always exactly 64 chars for full-sized files. */
  readonly headHex: string;
  /** Raw base64 content when --with-data was used; null otherwise. */
  readonly contentBase64: string | null;
  readonly provenance: ExtractedDocumentProvenance;
}
