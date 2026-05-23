import type { ExtractedDocumentProvenance } from "../types/Provenance.js";
import type { ImgBinaryDocument, ImgDef } from "../types/ImgDef.js";

/**
 * Parses a raw C++ dnf-extract binary JSON record for a PVF-embedded .img stub.
 *
 * PVF .img stubs are metadata-only records inside Script.pvf describing binary
 * image blobs. They are NOT NPK texture frames — actual pixel data lives in NPK
 * archives and is extracted via dnf-extract --npk mode.
 *
 * The C++ printBinaryJson (main.cpp:519-541) emits:
 *   { path, type:"binary", format, sizeBytes, headHex }
 * and optionally contentBase64 when --with-data is passed.
 * Provenance preamble (extractor_version/extract_timestamp/source_pvf_hash)
 * is NOT emitted by printBinaryJson (verified 2026-05-23). Fields are accepted
 * gracefully when present, fallen back to sentinel when absent.
 *
 * Invariants (throw on violation — PVF-truth alignment policy):
 *   - document.type must be "binary"
 *   - document.path must be a non-empty string
 *   - document.format must be "neople-image" for .img-extension paths; non-image
 *     binary paths (e.g. .exe, .dat) also accepted but must have type="binary"
 *   - document.sizeBytes must be a non-negative integer
 *   - document.headHex must be a string with an even number of chars > 0 and
 *     at most 64 chars (32 bytes × 2 hex digits)
 *   - document.contentBase64, when present, must be a string (not decoded)
 */
export function parseImgBinaryDocument(document: ImgBinaryDocument): ImgDef {
  // --- Invariant: type field ---
  if (document.type !== "binary") {
    throw new Error(
      `[ImgParser] Expected type="binary", got type="${String(document.type)}" in document at path="${document.path}". ` +
      `PVF .img stubs are extracted as binary records. Route type="document" to ChrParser/MobParser/AtkParser.`,
    );
  }

  // --- Invariant: path ---
  if (typeof document.path !== "string" || document.path.trim() === "") {
    throw new Error(
      `[ImgParser] Document path is missing or empty. ` +
      `All PVF binary records must have a non-empty path field ` +
      `(e.g. "monster/newmonsters/gbl/webcannon/action/throwweb.img").`,
    );
  }

  // --- Invariant: format must be "neople-image" for .img extension ---
  const isImgPath = document.path.endsWith(".img");
  if (isImgPath && document.format !== "neople-image") {
    throw new Error(
      `[ImgParser] .img path "${document.path}" has unexpected format="${document.format}". ` +
      `PVF-embedded .img files must have format="neople-image" (Neople Image File magic header). ` +
      `If this is a different binary type routed here in error, check the pipeline dispatch.`,
    );
  }

  // --- Invariant: sizeBytes non-negative integer ---
  if (typeof document.sizeBytes !== "number" || !Number.isInteger(document.sizeBytes)) {
    throw new Error(
      `[ImgParser] sizeBytes must be an integer, got ${typeof document.sizeBytes} ` +
      `in "${document.path}". C++ extractor always emits sizeBytes as a JSON integer.`,
    );
  }
  if (document.sizeBytes < 0) {
    throw new Error(
      `[ImgParser] sizeBytes must be non-negative, got ${document.sizeBytes} in "${document.path}". ` +
      `Negative size indicates malformed or truncated extractor output.`,
    );
  }

  // --- Invariant: headHex ---
  if (typeof document.headHex !== "string" || document.headHex.length === 0) {
    throw new Error(
      `[ImgParser] headHex is missing or empty in "${document.path}". ` +
      `C++ extractor always emits headHex as the first 32 bytes of the file in lowercase hex.`,
    );
  }
  if (document.headHex.length % 2 !== 0) {
    throw new Error(
      `[ImgParser] headHex has odd length ${document.headHex.length} in "${document.path}". ` +
      `headHex must encode whole bytes (even number of hex chars).`,
    );
  }
  // Max 64 chars = 32 bytes × 2 hex digits (files shorter than 32 bytes produce fewer chars)
  if (document.headHex.length > 64) {
    throw new Error(
      `[ImgParser] headHex length ${document.headHex.length} exceeds 64 chars in "${document.path}". ` +
      `C++ extractor takes min(32, fileLen) bytes — headHex cannot exceed 64 hex chars.`,
    );
  }

  // --- Optional: contentBase64 — preserve as-is, validate type when present ---
  let contentBase64: string | null = null;
  if (document.contentBase64 !== undefined) {
    if (typeof document.contentBase64 !== "string") {
      throw new Error(
        `[ImgParser] contentBase64 must be a string when present, got ${typeof document.contentBase64} ` +
        `in "${document.path}". Pass --with-data to dnf-extract to populate this field.`,
      );
    }
    // Empty string is legal: some very short blobs may encode to ""
    contentBase64 = document.contentBase64;
  }

  const provenance: ExtractedDocumentProvenance = buildProvenance(document);

  return {
    kind: "img",
    path: document.path,
    format: document.format,
    sizeBytes: document.sizeBytes,
    headHex: document.headHex,
    contentBase64,
    provenance,
  };
}

/**
 * Builds provenance from a binary document.
 *
 * C++ printBinaryJson (main.cpp:519-541) does NOT emit the provenance preamble
 * fields (extractor_version / extract_timestamp / source_pvf_hash) — unlike
 * printDocumentJson and printTextJson (which received the symmetry fix 2026-05-23).
 *
 * Current contract: accept absence without throwing (contrast with NutExtractor
 * which DOES throw on missing extractor_version because printTextJson was fixed).
 * Fall back to sentinel values so the pipeline can proceed.
 *
 * If a future printBinaryJson rebuild adds provenance preamble, the optional
 * fields in ImgBinaryDocument will receive it transparently.
 *
 * Throw hint: if provenance fields appear in the input but are NOT strings, that
 * indicates a malformed extractor output (not just absent), so we throw.
 */
function buildProvenance(document: ImgBinaryDocument): ExtractedDocumentProvenance {
  // Validate types when fields are present (absent = ok; wrong type = throw)
  if (document.extractor_version !== undefined && typeof document.extractor_version !== "string") {
    throw new Error(
      `[ImgParser] extractor_version is present but not a string (got ${typeof document.extractor_version}) ` +
      `in "${document.path}". Malformed extractor output.`,
    );
  }
  if (document.extract_timestamp !== undefined && typeof document.extract_timestamp !== "string") {
    throw new Error(
      `[ImgParser] extract_timestamp is present but not a string (got ${typeof document.extract_timestamp}) ` +
      `in "${document.path}". Malformed extractor output.`,
    );
  }

  const provenance: ExtractedDocumentProvenance = {
    // C++ printBinaryJson doesn't emit these fields — fall back to sentinel values.
    // When a future rebuild adds them, they'll be used directly.
    extractorVersion: typeof document.extractor_version === "string" && document.extractor_version.length > 0
      ? document.extractor_version
      : "unknown-binary-no-preamble",
    extractTimestamp: typeof document.extract_timestamp === "string" && document.extract_timestamp.length > 0
      ? document.extract_timestamp
      : "unknown",
    sourceRef: `pvf:${document.path}`,
  };

  if (typeof document.source_pvf_hash === "string" && document.source_pvf_hash.length > 0) {
    provenance.sourcePvfHash = document.source_pvf_hash;
  }

  return provenance;
}
