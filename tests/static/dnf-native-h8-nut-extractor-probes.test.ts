/**
 * Head 8 probe suite — NutExtractor (.nut text passthrough parser).
 *
 * Verifies: happy-path extraction, lineCount/byteLength computation,
 * provenance population, empty-content handling, mixed line endings,
 * and invariant-violation throws (wrong type, missing path, non-string content).
 *
 * Exit policy: exits 1 if any assertion fails (no baseline-bug tolerance —
 * this is a new parser with no known bugs).
 */

import { assert } from "./test-utils.js";
import { extractNutDocument } from "../../src/dnf-native-combat/data/parsers/NutExtractor.js";
import type { NutTextDocument } from "../../src/dnf-native-combat/data/types/NutDef.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeNutDoc(overrides: Partial<NutTextDocument> & { content: string; path?: string }): NutTextDocument {
  return {
    path: overrides.path ?? "sqr/test.nut",
    type: "text",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// H8-1: Happy path — realistic enum header fixture
//
// Based on real dnf_enum_header.nut output (verified 2026-05-23 post-rebuild):
//   fields: [extractor_version, extract_timestamp, source_pvf_hash, path, type, content]
//   content_len: 65706 chars
//   first 80 chars: '// 던파소스내 enum값을 squirrel script에서도...\r\n'
//
// dnf-extract.exe was rebuilt to emit provenance preamble for text+animation
// output (symmetric with document mode), eliminating the "unknown" fallback
// that NutExtractor previously needed.
// ---------------------------------------------------------------------------
const ENUM_HEADER_PREFIX =
  "// 던파소스내 enum값을 squirrel script에서도 사용하기 위해 변환해놓은 값들입니다. \r\n" +
  "// 순수 스크립트로 작업하면서 추가해야할 값들이 있다면.. 각 직업_header.nut파일에 삽입해주세요.. 이곳에 추가금지\r\n" +
  "\r\nLANDTYPE_GRASS <- 0";

const enumHeaderDoc: NutTextDocument = {
  path: "sqr/dnf_enum_header.nut",
  type: "text",
  content: ENUM_HEADER_PREFIX,
  extractor_version: "v2.0.0",
  extract_timestamp: "2026-05-23T08:11:13Z",
  source_pvf_hash: "crc32-head:c0779278|size:205695984",
};

assert.ok(true, "fixture constructed");

const enumResult = extractNutDocument(enumHeaderDoc);

assert.equal(enumResult.kind, "nut", "H8-1: kind === nut");
assert.equal(enumResult.path, "sqr/dnf_enum_header.nut", "H8-1: path preserved");
assert.equal(enumResult.content, ENUM_HEADER_PREFIX, "H8-1: content preserved verbatim");
assert.equal(enumResult.encoding, "utf-8", "H8-1: encoding defaults to utf-8 when absent");
assert.ok(enumResult.byteLength > ENUM_HEADER_PREFIX.length,
  "H8-1: byteLength > charLength because Korean chars are 3 bytes each in UTF-8");
assert.ok(enumResult.lineCount >= 4, "H8-1: lineCount ≥ 4 (fixture has \\r\\n line breaks)");
// provenance flows directly from input (C++ now emits full preamble)
assert.equal(enumResult.provenance.extractorVersion, "v2.0.0", "H8-1: extractorVersion from input");
assert.equal(enumResult.provenance.extractTimestamp, "2026-05-23T08:11:13Z", "H8-1: extractTimestamp from input");
assert.equal(enumResult.provenance.sourceRef, "pvf:sqr/dnf_enum_header.nut", "H8-1: sourceRef");
assert.equal(enumResult.provenance.sourcePvfHash, "crc32-head:c0779278|size:205695984", "H8-1: sourcePvfHash from input");

console.log(`[OK] H8-1: enum_header fixture: byteLength=${enumResult.byteLength}, lineCount=${enumResult.lineCount}`);

// ---------------------------------------------------------------------------
// H8-2: Happy path — skill .nut fixture
//
// Based on real sqr/character/atmage/iceorbex/iceorbex.nut output (verified 2026-05-23):
//   fields: [path, type, content]
//   content_len: 3177 chars
//   first 80: '\r\nfunction checkExecutableSkill_IceOrbEx(obj)\r\n{\r\n\tif (!obj) return false;\r\n\r\n\tl'
// ---------------------------------------------------------------------------
const ICEORBEX_PREFIX =
  "\r\nfunction checkExecutableSkill_IceOrbEx(obj)\r\n{\r\n\tif (!obj) return false;\r\n\r\n\tlocal skill = obj.GetActiveSkill();";

const iceorbexDoc: NutTextDocument = {
  path: "sqr/character/atmage/iceorbex/iceorbex.nut",
  type: "text",
  content: ICEORBEX_PREFIX,
  extractor_version: "v2.0.0",
  extract_timestamp: "2026-05-23T08:11:13Z",
};

const iceResult = extractNutDocument(iceorbexDoc);

assert.equal(iceResult.kind, "nut", "H8-2: kind === nut");
assert.equal(iceResult.path, "sqr/character/atmage/iceorbex/iceorbex.nut", "H8-2: path preserved");
assert.equal(iceResult.content, ICEORBEX_PREFIX, "H8-2: content verbatim");
assert.equal(iceResult.encoding, "utf-8", "H8-2: default encoding");
// Only ASCII in this snippet → byteLength === charLength
assert.equal(iceResult.byteLength, Buffer.byteLength(ICEORBEX_PREFIX, "utf8"), "H8-2: byteLength matches Buffer.byteLength");
assert.ok(iceResult.lineCount >= 5, "H8-2: lineCount ≥ 5");
assert.equal(iceResult.provenance.sourceRef, "pvf:sqr/character/atmage/iceorbex/iceorbex.nut", "H8-2: sourceRef");

console.log(`[OK] H8-2: iceorbex fixture: byteLength=${iceResult.byteLength}, lineCount=${iceResult.lineCount}`);

// ---------------------------------------------------------------------------
// H8-3: Optional fields populated when extractor emits them
//
// Future extractor upgrades may add extractor_version/extract_timestamp/
// source_pvf_hash. Verify they flow through to provenance correctly.
// ---------------------------------------------------------------------------
const richDoc: NutTextDocument = {
  path: "sqr/rich.nut",
  type: "text",
  content: "// rich\r\nlocal x = 1;",
  encoding: "utf-8",
  extractor_version: "v3.1.0",
  extract_timestamp: "2026-05-23T12:00:00Z",
  source_pvf_hash: "crc32:aabbccdd",
};

const richResult = extractNutDocument(richDoc);

assert.equal(richResult.provenance.extractorVersion, "v3.1.0", "H8-3: extractorVersion from input");
assert.equal(richResult.provenance.extractTimestamp, "2026-05-23T12:00:00Z", "H8-3: extractTimestamp from input");
assert.equal(richResult.provenance.sourcePvfHash, "crc32:aabbccdd", "H8-3: sourcePvfHash from input");
assert.equal(richResult.encoding, "utf-8", "H8-3: encoding from input");

console.log("[OK] H8-3: optional fields flow through to provenance");

// ---------------------------------------------------------------------------
// H8-4: Empty content — legal, yields lineCount=1
//
// Decision: empty .nut is legal (some stub files may be empty). lineCount=1
// because "".split("\n") === [""] which has length 1 (one empty line).
// byteLength=0 for empty content.
// ---------------------------------------------------------------------------
const emptyDoc: NutTextDocument = {
  path: "sqr/stub.nut",
  type: "text",
  content: "",
  extractor_version: "v2.0.0",
  extract_timestamp: "2026-05-23T08:11:13Z",
};

const emptyResult = extractNutDocument(emptyDoc);

assert.equal(emptyResult.lineCount, 1, "H8-4: empty content → lineCount=1 (one empty line)");
assert.equal(emptyResult.byteLength, 0, "H8-4: empty content → byteLength=0");
assert.equal(emptyResult.content, "", "H8-4: empty content preserved verbatim");

console.log("[OK] H8-4: empty .nut → lineCount=1, byteLength=0");

// ---------------------------------------------------------------------------
// H8-5: Mixed line endings (\r\n and \n)
//
// lineCount is split on \n only. \r\n lines each contribute one \n, so
// a file with k distinct \n chars yields lineCount=k+1.
// ---------------------------------------------------------------------------
const mixedDoc: NutTextDocument = {
  path: "sqr/mixed_endings.nut",
  type: "text",
  content: "line1\r\nline2\nline3\r\nline4",
  extractor_version: "v2.0.0",
  extract_timestamp: "2026-05-23T08:11:13Z",
};

const mixedResult = extractNutDocument(mixedDoc);
// "line1\r\nline2\nline3\r\nline4".split("\n") → ["line1\r", "line2", "line3\r", "line4"] → length 4
assert.equal(mixedResult.lineCount, 4, "H8-5: mixed \\r\\n + \\n → lineCount counts only \\n separators");

console.log(`[OK] H8-5: mixed line endings → lineCount=${mixedResult.lineCount}`);

// ---------------------------------------------------------------------------
// H8-6 (invariant): Wrong type field → throw
// ---------------------------------------------------------------------------
{
  let threw = false;
  try {
    extractNutDocument({ path: "sqr/x.nut", type: "document" as unknown as "text", content: "x" });
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes("type="), `H8-6: error mentions type field (got: ${msg})`);
    assert.ok(msg.includes("text"), `H8-6: error mentions expected value "text" (got: ${msg})`);
  }
  assert.ok(threw, "H8-6: wrong type throws");
  console.log("[OK] H8-6: wrong type field → throws with descriptive error");
}

// ---------------------------------------------------------------------------
// H8-7 (invariant): Missing / empty path → throw
// ---------------------------------------------------------------------------
{
  let threw = false;
  try {
    extractNutDocument({ path: "", type: "text", content: "x" });
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes("path"), `H8-7: error mentions path (got: ${msg})`);
  }
  assert.ok(threw, "H8-7: empty path throws");
  console.log("[OK] H8-7: empty path → throws");
}

{
  let threw = false;
  try {
    // whitespace-only path
    extractNutDocument({ path: "   ", type: "text", content: "x" });
  } catch (e) {
    threw = true;
  }
  assert.ok(threw, "H8-7b: whitespace-only path throws");
  console.log("[OK] H8-7b: whitespace-only path → throws");
}

// ---------------------------------------------------------------------------
// H8-8 (invariant): Non-string content → throw
// ---------------------------------------------------------------------------
{
  let threw = false;
  try {
    extractNutDocument({ path: "sqr/x.nut", type: "text", content: null as unknown as string });
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes("content"), `H8-8: error mentions content (got: ${msg})`);
  }
  assert.ok(threw, "H8-8: non-string content throws");
  console.log("[OK] H8-8: null content → throws");
}

// ---------------------------------------------------------------------------
// H8-9 (invariant): Missing extractor_version → throw
// Documents the new contract: C++ ALWAYS emits the provenance preamble for
// text mode (rebuilt 2026-05-23). Absence indicates a stale .exe binary and
// must be surfaced loudly rather than silently filled with sentinel values.
// ---------------------------------------------------------------------------
{
  let threw = false;
  try {
    extractNutDocument({
      path: "sqr/no_version.nut",
      type: "text",
      content: "x",
      // extractor_version intentionally absent
    });
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes("extractor_version"), `H8-9: error mentions extractor_version (got: ${msg})`);
    assert.ok(msg.includes("rebuild"), `H8-9: error suggests rebuild (got: ${msg})`);
  }
  assert.ok(threw, "H8-9: missing extractor_version throws");
  console.log("[OK] H8-9: missing extractor_version → throws with rebuild hint");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("");
console.log("H8 NutExtractor probes: all assertions passed (10 cases, 4 invariant-violation cases)");
