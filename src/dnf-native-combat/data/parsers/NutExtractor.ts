import type { ExtractedDocumentProvenance } from "../types/Provenance.js";
import type { NutDef, NutTextDocument } from "../types/NutDef.js";

/**
 * Extracts a NutDef from a raw C++ dnf-extract text JSON record.
 *
 * This is a pure passthrough parser: Squirrel source is preserved verbatim.
 * .nut → JS transpilation is out of scope for Stage 2 (pipeline design doc §3).
 *
 * Invariants (throw on violation):
 *   - document.type must be "text"
 *   - document.path must be a non-empty string
 *   - document.content must be a string (empty string IS legal — yields lineCount=1)
 *
 * The C++ extractor (main.cpp printTextJson, verified 2026-05-23) emits exactly:
 *   { path, type, content }
 * No extractor_version / extract_timestamp / source_pvf_hash in current output.
 * Provenance fields fall back gracefully when absent.
 */
export function extractNutDocument(document: NutTextDocument): NutDef {
  // --- Invariant: type field ---
  if (document.type !== "text") {
    throw new Error(
      `[NutExtractor] Expected type="text", got type="${String(document.type)}" in document at path="${document.path}". ` +
      `Route non-text documents to the appropriate parser (ChrParser/MobParser/AtkParser for type="document").`,
    );
  }

  // --- Invariant: path ---
  if (typeof document.path !== "string" || document.path.trim() === "") {
    throw new Error(
      `[NutExtractor] Document path is missing or empty. ` +
      `All PVF text records must have a non-empty path field (e.g. "sqr/dnf_enum_header.nut").`,
    );
  }

  // --- Invariant: content is a string ---
  if (typeof document.content !== "string") {
    throw new Error(
      `[NutExtractor] document.content is not a string (got ${typeof document.content}) in ${document.path}. ` +
      `C++ extractor always emits content as a JSON string; non-string indicates malformed extractor output.`,
    );
  }

  const content = document.content;

  // lineCount: split on \n only (mixed \r\n and \n: \n is the only separator).
  // An empty string ("") produces [""] → length 1, i.e. lineCount=1.
  const lineCount = content.split("\n").length;

  // byteLength: UTF-8 encoded byte count. Korean chars (CP949 decoded to UTF-8
  // by extractor) are 3 bytes each in UTF-8; ASCII chars are 1 byte each.
  const byteLength = Buffer.byteLength(content, "utf8");

  const encoding = typeof document.encoding === "string" && document.encoding.length > 0
    ? document.encoding
    : "utf-8";

  const provenance: ExtractedDocumentProvenance = buildProvenance(document);

  return {
    kind: "nut",
    path: document.path,
    content,
    encoding,
    byteLength,
    lineCount,
    provenance,
  };
}

function buildProvenance(document: NutTextDocument): ExtractedDocumentProvenance {
  // C++ printTextJson now emits the full provenance preamble (extractor_version,
  // extract_timestamp, source_pvf_hash) — symmetric with printDocumentJson and
  // printAnimationJson. The previous "unknown" sentinel fallback is therefore
  // no longer needed; missing fields here would indicate either a stale .exe
  // binary (rebuild required) or a test fixture lacking the preamble.
  if (typeof document.extractor_version !== "string") {
    throw new Error(
      `[NutExtractor] document.extractor_version missing in ${document.path}. ` +
      `C++ printTextJson (rebuilt 2026-05-23) always emits this field; ` +
      `stale dnf-extract.exe binary likely — rebuild from tools/dnf-porting-src/.`,
    );
  }
  if (typeof document.extract_timestamp !== "string") {
    throw new Error(
      `[NutExtractor] document.extract_timestamp missing in ${document.path}. ` +
      `Same root cause as missing extractor_version (rebuild dnf-extract).`,
    );
  }
  const provenance: ExtractedDocumentProvenance = {
    extractorVersion: document.extractor_version,
    extractTimestamp: document.extract_timestamp,
    sourceRef: `pvf:${document.path}`,
  };
  if (typeof document.source_pvf_hash === "string" && document.source_pvf_hash.length > 0) {
    provenance.sourcePvfHash = document.source_pvf_hash;
  }
  return provenance;
}
