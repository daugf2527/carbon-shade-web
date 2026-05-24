/**
 * Head 11 probe suite — ImgParser (PVF-embedded .img binary stub parser).
 *
 * Verifies: happy-path extraction, provenance sentinel fallback (printBinaryJson
 * does NOT emit provenance preamble — verified main.cpp:519-541), --with-data
 * contentBase64 handling, and invariant-violation throws.
 *
 * Real fixture: monster/newmonsters/gbl/webcannon/action/throwweb.img
 *   sizeBytes=576732, format="neople-image"
 *   headHex starts with "4e656f706c65" = "Neople" in ASCII
 *
 * Exit policy: exits 1 if any assertion fails.
 */

import { assert } from "./test-utils.js";
import { parseImgBinaryDocument } from "../../src/dnf-native-combat/data/parsers/ImgParser.js";
import type { ImgBinaryDocument } from "../../src/dnf-native-combat/data/types/ImgDef.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeImgDoc(overrides: Partial<ImgBinaryDocument>): ImgBinaryDocument {
  return {
    path: "monster/newmonsters/gbl/webcannon/action/throwweb.img",
    type: "binary",
    format: "neople-image",
    sizeBytes: 576732,
    headHex: "4e656f706c6520496d6167652046696c65001c0000000000010000000b000000",
    // Audit ts-parser-truth F1 (2026-05-24): D3 preamble (extractor_version
    // / extract_timestamp) is now required by ImgParser.buildProvenance —
    // mirrors the C++ contract-symmetry B1 fix where printBinaryJson always
    // emits these fields. Fixtures that need to test "missing preamble"
    // behaviour can override these to undefined explicitly.
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-23T10:00:00Z",
    ...overrides,
  } as ImgBinaryDocument;
}

// ---------------------------------------------------------------------------
// H11-1: Happy path — real throwweb.img fixture
//
// Real output from:
//   dnf-extract.exe --pvf Script.pvf
//     --file monster/newmonsters/gbl/webcannon/action/throwweb.img
//
// {"path":"monster/newmonsters/gbl/webcannon/action/throwweb.img",
//  "type":"binary","format":"neople-image","sizeBytes":576732,
//  "headHex":"4e656f706c6520496d6167652046696c65001c0000000000010000000b000000"}
//
// headHex "4e656f706c65" = "Neople" in ASCII — confirms Neople Image File magic.
// ---------------------------------------------------------------------------
const throwwebDoc: ImgBinaryDocument = {
  path: "monster/newmonsters/gbl/webcannon/action/throwweb.img",
  type: "binary",
  format: "neople-image",
  sizeBytes: 576732,
  headHex: "4e656f706c6520496d6167652046696c65001c0000000000010000000b000000",
  // D3 preamble required post-B1 (contract-symmetry, 2026-05-24).
  extractor_version: "v2.0.0",
  extract_timestamp: "2026-05-23T10:00:00Z",
};

const throwwebResult = parseImgBinaryDocument(throwwebDoc);

assert.equal(throwwebResult.kind, "img", "H11-1: kind === img");
assert.equal(throwwebResult.path, "monster/newmonsters/gbl/webcannon/action/throwweb.img", "H11-1: path preserved");
assert.equal(throwwebResult.format, "neople-image", "H11-1: format preserved");
assert.equal(throwwebResult.sizeBytes, 576732, "H11-1: sizeBytes = 576732 (real fixture)");
assert.equal(throwwebResult.headHex, "4e656f706c6520496d6167652046696c65001c0000000000010000000b000000", "H11-1: headHex preserved verbatim");
assert.equal(throwwebResult.contentBase64, null, "H11-1: contentBase64 is null when absent");
// headHex starts with "4e656f706c65" = "Neople" in ASCII
assert.ok(throwwebResult.headHex.startsWith("4e656f706c65"), "H11-1: headHex starts with Neople magic (4e656f706c65)");
assert.equal(throwwebResult.headHex.length, 64, "H11-1: headHex is exactly 64 chars (32 full bytes)");

console.log(`[OK] H11-1: throwweb.img fixture: sizeBytes=${throwwebResult.sizeBytes}, headHex[0..11]=${throwwebResult.headHex.slice(0, 12)}`);

// ---------------------------------------------------------------------------
// H11-2: Missing preamble → throw (was: sentinel fallback)
//
// Audit ts-parser-truth F1 (2026-05-24): post C++ contract-symmetry B1 fix,
// printBinaryJson DOES emit D3 preamble (extractor_version /
// extract_timestamp / source_pvf_hash). The previous silent sentinel
// fallback was unreachable for fresh PVF dumps and masked future contract
// regressions. ImgParser.buildProvenance now throws on missing preamble so
// a stale dnf-extract binary or contract regression surfaces loudly.
// ---------------------------------------------------------------------------
{
  const noPreambleDoc: ImgBinaryDocument = {
    path: "monster/newmonsters/gbl/webcannon/action/throwweb.img",
    type: "binary",
    format: "neople-image",
    sizeBytes: 576732,
    headHex: "4e656f706c6520496d6167652046696c65001c0000000000010000000b000000",
    // extractor_version / extract_timestamp deliberately omitted.
  };
  let threw = false;
  let msg = "";
  try {
    parseImgBinaryDocument(noPreambleDoc);
  } catch (e) {
    threw = true;
    msg = e instanceof Error ? e.message : String(e);
  }
  assert.ok(threw, "H11-2: missing preamble throws");
  assert.ok(msg.includes("extractor_version") || msg.includes("preamble"),
    `H11-2: throw message mentions preamble (got "${msg}")`);
  console.log("[OK] H11-2: missing D3 preamble → throw (contract-symmetry B1 enforced)");
}

// ---------------------------------------------------------------------------
// H11-3: Happy path — provenance from explicit fields when present
//
// A future printBinaryJson rebuild may add provenance preamble fields.
// Verify they flow through correctly when present.
// ---------------------------------------------------------------------------
const withProvenanceDoc: ImgBinaryDocument = {
  path: "monster/newmonsters/gbl/webcannon/action/throwweb.img",
  type: "binary",
  format: "neople-image",
  sizeBytes: 576732,
  headHex: "4e656f706c6520496d6167652046696c65001c0000000000010000000b000000",
  extractor_version: "v3.0.0",
  extract_timestamp: "2026-05-23T10:00:00Z",
  source_pvf_hash: "crc32-head:c0779278|size:205695984",
};

const withProvenanceResult = parseImgBinaryDocument(withProvenanceDoc);

assert.equal(withProvenanceResult.provenance.extractorVersion, "v3.0.0",
  "H11-3: extractorVersion from optional field when present");
assert.equal(withProvenanceResult.provenance.extractTimestamp, "2026-05-23T10:00:00Z",
  "H11-3: extractTimestamp from optional field when present");
assert.equal(withProvenanceResult.provenance.sourcePvfHash, "crc32-head:c0779278|size:205695984",
  "H11-3: sourcePvfHash from optional field when present");
assert.equal(withProvenanceResult.provenance.sourceRef,
  "pvf:monster/newmonsters/gbl/webcannon/action/throwweb.img",
  "H11-3: sourceRef still built from path");

console.log("[OK] H11-3: provenance fields flow through when optionally provided");

// ---------------------------------------------------------------------------
// H11-4: Happy path — contentBase64 populated (--with-data mode)
//
// When --with-data is passed, the C++ extractor adds contentBase64.
// Parser must preserve it as-is (no decoding, no validation of base64 content).
// ---------------------------------------------------------------------------
const withDataDoc: ImgBinaryDocument = {
  path: "monster/newmonsters/gbl/webcannon/action/throwweb.img",
  type: "binary",
  format: "neople-image",
  sizeBytes: 576732,
  headHex: "4e656f706c6520496d6167652046696c65001c0000000000010000000b000000",
  contentBase64: "TmVvcGxlIEltYWdlIEZpbGUA",  // Simulated: "Neople Image File\0"
  extractor_version: "v2.0.0",
  extract_timestamp: "2026-05-23T10:00:00Z",
};

const withDataResult = parseImgBinaryDocument(withDataDoc);

assert.equal(withDataResult.contentBase64, "TmVvcGxlIEltYWdlIEZpbGUA",
  "H11-4: contentBase64 preserved verbatim when present");

console.log("[OK] H11-4: contentBase64 preserved when present (--with-data mode)");

// ---------------------------------------------------------------------------
// H11-5: Edge case — contentBase64 empty string is legal
//
// Decision: empty string is LEGAL. A very small or empty binary blob may
// legitimately encode to "". The parser preserves it without throwing.
// Downstream consumers may reject an empty blob if needed.
// ---------------------------------------------------------------------------
const emptyBase64Doc: ImgBinaryDocument = {
  path: "monster/newmonsters/gbl/webcannon/action/throwweb.img",
  type: "binary",
  format: "neople-image",
  sizeBytes: 0,
  headHex: "00",  // 1 byte = 2 hex chars (short file edge case)
  contentBase64: "",
  extractor_version: "v2.0.0",
  extract_timestamp: "2026-05-23T10:00:00Z",
};

const emptyBase64Result = parseImgBinaryDocument(emptyBase64Doc);
assert.equal(emptyBase64Result.contentBase64, "",
  "H11-5: empty contentBase64 string is legal and preserved (not null)");
assert.equal(emptyBase64Result.sizeBytes, 0,
  "H11-5: sizeBytes=0 is legal (empty file)");

console.log("[OK] H11-5: empty contentBase64 '' is legal — preserved as empty string, not null");

// ---------------------------------------------------------------------------
// H11-6 (invariant): Wrong type field → throw
// ---------------------------------------------------------------------------
{
  let threw = false;
  try {
    parseImgBinaryDocument(makeImgDoc({ type: "document" as unknown as "binary" }));
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes("type="), `H11-6: error mentions type field (got: ${msg})`);
    assert.ok(msg.includes("binary"), `H11-6: error mentions expected value "binary" (got: ${msg})`);
  }
  assert.ok(threw, "H11-6: wrong type throws");
  console.log("[OK] H11-6: type!='binary' → throws with descriptive error");
}

// ---------------------------------------------------------------------------
// H11-7 (invariant): Wrong format for .img extension path → throw
//
// .img paths MUST have format="neople-image". Any other format on an .img
// path indicates a routing error in the pipeline dispatch.
// ---------------------------------------------------------------------------
{
  let threw = false;
  try {
    parseImgBinaryDocument(makeImgDoc({ format: "pe-executable" }));
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes("format=") || msg.includes("neople-image"),
      `H11-7: error mentions format or neople-image (got: ${msg})`);
  }
  assert.ok(threw, "H11-7: .img path with wrong format throws");
  console.log("[OK] H11-7: .img path + format!='neople-image' → throws");
}

// ---------------------------------------------------------------------------
// H11-8 (invariant): Negative sizeBytes → throw
// ---------------------------------------------------------------------------
{
  let threw = false;
  try {
    parseImgBinaryDocument(makeImgDoc({ sizeBytes: -1 }));
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes("sizeBytes") || msg.includes("negative"),
      `H11-8: error mentions sizeBytes or negative (got: ${msg})`);
  }
  assert.ok(threw, "H11-8: negative sizeBytes throws");
  console.log("[OK] H11-8: sizeBytes < 0 → throws");
}

// ---------------------------------------------------------------------------
// H11-9 (invariant): headHex wrong length → throw
//
// headHex must have an even length (whole bytes) and must not exceed 64 chars.
// ---------------------------------------------------------------------------
{
  // Odd length
  let threw = false;
  try {
    parseImgBinaryDocument(makeImgDoc({ headHex: "4e656f706c6" }));  // 11 chars = odd
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes("odd") || msg.includes("length"),
      `H11-9: error mentions odd or length (got: ${msg})`);
  }
  assert.ok(threw, "H11-9a: odd-length headHex throws");
  console.log("[OK] H11-9a: odd-length headHex → throws");
}

{
  // Too long (> 64 chars)
  let threw = false;
  try {
    parseImgBinaryDocument(makeImgDoc({ headHex: "aa".repeat(33) }));  // 66 chars > 64
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes("64") || msg.includes("length") || msg.includes("exceeds"),
      `H11-9b: error mentions 64 or length (got: ${msg})`);
  }
  assert.ok(threw, "H11-9b: headHex > 64 chars throws");
  console.log("[OK] H11-9b: headHex > 64 chars → throws");
}

{
  // Empty headHex
  let threw = false;
  try {
    parseImgBinaryDocument(makeImgDoc({ headHex: "" }));
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes("headHex") || msg.includes("empty"),
      `H11-9c: error mentions headHex or empty (got: ${msg})`);
  }
  assert.ok(threw, "H11-9c: empty headHex throws");
  console.log("[OK] H11-9c: empty headHex → throws");
}

// ---------------------------------------------------------------------------
// H11-10 (invariant): Missing path → throw
// ---------------------------------------------------------------------------
{
  let threw = false;
  try {
    parseImgBinaryDocument(makeImgDoc({ path: "" }));
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes("path"), `H11-10: error mentions path (got: ${msg})`);
  }
  assert.ok(threw, "H11-10: empty path throws");
  console.log("[OK] H11-10: empty path → throws");
}

// ---------------------------------------------------------------------------
// H11-11: Non-.img binary path with different format — allowed (not .img ext)
//
// A non-.img binary (e.g. .dat, .exe) routed here with format="pe-executable"
// is allowed. The .img-specific format constraint only applies to .img extension.
// ---------------------------------------------------------------------------
const nonImgBinaryDoc: ImgBinaryDocument = {
  path: "data/some_blob.dat",
  type: "binary",
  format: "pe-executable",
  sizeBytes: 1024,
  headHex: "4d5a9000",  // MZ header
  extractor_version: "v2.0.0",
  extract_timestamp: "2026-05-23T10:00:00Z",
};

const nonImgResult = parseImgBinaryDocument(nonImgBinaryDoc);
assert.equal(nonImgResult.kind, "img", "H11-11: kind still img for non-.img binary");
assert.equal(nonImgResult.format, "pe-executable", "H11-11: non-img format preserved");
assert.equal(nonImgResult.path, "data/some_blob.dat", "H11-11: non-img path preserved");

console.log("[OK] H11-11: non-.img binary with different format is allowed");

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("");
console.log("H11 ImgParser probes: 13 cases, 5 invariant cases");
