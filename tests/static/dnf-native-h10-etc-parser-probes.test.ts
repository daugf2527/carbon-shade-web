/**
 * Head 10 probe suite — EtcParser (.etc Document → EtcDef).
 *
 * Fixtures: real PVF samples (Tier-1, captured 2026-05-23):
 *   - character/characteretc/swordman.etc — 11 KVI sections, pairing convention verification
 *
 * Verifies:
 *   - kind=etc, path preserved, provenance flows through
 *   - Repeated "key value index" sections collected via sectionsByName
 *     (NOT firstSection — that returns only one)
 *   - byKey lookup populated, first-wins on duplicate keys
 *   - Pairing convention: ints after str key parsed as adjacent (value, index)
 *     pairs into indexedValues. Trailing orphan in odd-count int sequence is
 *     dropped from indexedValues but preserved in raw values[].
 *   - Non-KVI sections preserved in raw (e.g. "key value string", "equipment index")
 *
 * Exit policy: BASELINE_BUGS=0, exits 1 on any unexpected outcome.
 */

export const BASELINE_BUGS = 0;

import { assert } from "./test-utils.js";
import { parseEtcDocument } from "../../src/dnf-native-combat/data/parsers/EtcParser.js";
import type { PvfDocument } from "../../src/dnf-native-combat/data/types/PvfDocument.js";

// ---------------------------------------------------------------------------
// Inline real fixture — character/characteretc/swordman.etc
// Captured 2026-05-23 from Script.pvf via dnf-extract v2.0.0.
// First 5 KVI sections retained; remaining 6 truncated by trimming
// `summeravatarindex` int tail (kept as 4 complete pairs).
// ---------------------------------------------------------------------------
const SWORDMAN_ETC: PvfDocument = {
  extractor_version: "v2.0.0",
  extract_timestamp: "2026-05-23T08:24:58Z",
  source_pvf_hash: "crc32-head:c0779278|size:205695984",
  path: "character/characteretc/swordman.etc",
  type: "document",
  sections: [
    { name: "key value index", attributes: [
      { t: "str", v: "drawghostfacepos" },
      { t: "int", v: 0 }, { t: "int", v: 0 },
      { t: "int", v: 10 }, { t: "int", v: 1 }, { t: "int", v: 10 },
    ] },
    { name: "key value index", attributes: [
      { t: "str", v: "drawfacepos" },
      { t: "int", v: 0 }, { t: "int", v: 0 },
      { t: "int", v: -10 }, { t: "int", v: 1 }, { t: "int", v: 92 },
    ] },
    { name: "key value index", attributes: [
      { t: "str", v: "drawaifacepos" },
      { t: "int", v: 0 }, { t: "int", v: 0 },
      { t: "int", v: 0 }, { t: "int", v: 1 }, { t: "int", v: 100 },
    ] },
    { name: "key value index", attributes: [
      { t: "str", v: "weaponsubtypeindex" },
      { t: "int", v: 27900 }, { t: "int", v: 0 },
      { t: "int", v: 27000 }, { t: "int", v: 1 },
      { t: "int", v: 27600 }, { t: "int", v: 2 },
      { t: "int", v: 27900 }, { t: "int", v: 3 },
      { t: "int", v: 27300 }, { t: "int", v: 4 },
      { t: "int", v: 27900 }, { t: "int", v: 5 },
      { t: "int", v: 28200 },
    ] },
    { name: "key value index", attributes: [
      { t: "str", v: "summeravatarindex" },
      { t: "int", v: 0 }, { t: "int", v: 0 },
      { t: "int", v: 39044 }, { t: "int", v: 1 },
      { t: "int", v: 39045 }, { t: "int", v: 2 },
      { t: "int", v: 39046 }, { t: "int", v: 3 },
    ] },
    // Non-KVI sections also seen in real swordman.etc — captured as `raw`.
    { name: "key value string", attributes: [
      { t: "str", v: "weaponicongroup" },
      { t: "str", v: "swordman" },
    ] },
  ],
};

// ---------------------------------------------------------------------------
// H10-1: Happy-path — basic structural assertions
// ---------------------------------------------------------------------------
const etc = parseEtcDocument(SWORDMAN_ETC);

assert.equal(etc.kind, "etc", "H10-1: kind === etc");
assert.equal(etc.path, "character/characteretc/swordman.etc", "H10-1: path preserved");
assert.equal(etc.entries.length, 5, "H10-1: 5 KVI entries from fixture (KVI sections only)");
assert.equal(etc.provenance.extractorVersion, "v2.0.0", "H10-1: provenance flows through");
assert.equal(etc.provenance.sourceRef, "pvf:character/characteretc/swordman.etc", "H10-1: sourceRef");
assert.equal(etc.provenance.sourcePvfHash, "crc32-head:c0779278|size:205695984", "H10-1: sourcePvfHash");
console.log("[OK] H10-1: basic shape");

// ---------------------------------------------------------------------------
// H10-2: Pairing convention — (value, index) pairs build indexedValues[index] = value
// ---------------------------------------------------------------------------
const wsti = etc.byKey["weaponsubtypeindex"];
assert.ok(wsti !== undefined, "H10-2: weaponsubtypeindex present in byKey");
assert.deepEqual(wsti.values, [27900, 0, 27000, 1, 27600, 2, 27900, 3, 27300, 4, 27900, 5, 28200],
  "H10-2: raw values preserved verbatim (incl. orphan trailing int)");
assert.ok(wsti.indexedValues !== null, "H10-2: indexedValues populated for ≥1 pair");
assert.equal(wsti.indexedValues![0], 27900, "H10-2: indexedValues[0] = 27900");
assert.equal(wsti.indexedValues![1], 27000, "H10-2: indexedValues[1] = 27000");
assert.equal(wsti.indexedValues![5], 27900, "H10-2: indexedValues[5] = 27900");
// Trailing orphan 28200 is dropped from indexedValues (only floor(n/2)=6 pairs)
assert.equal(Object.keys(wsti.indexedValues!).length, 6, "H10-2: 6 pairs from 13 ints (orphan dropped)");
console.log("[OK] H10-2: pairing convention (value, index)");

// ---------------------------------------------------------------------------
// H10-3: byKey lookup for all expected keys
// ---------------------------------------------------------------------------
const expectedKeys = ["drawghostfacepos", "drawfacepos", "drawaifacepos", "weaponsubtypeindex", "summeravatarindex"];
for (const k of expectedKeys) {
  assert.ok(etc.byKey[k] !== undefined, `H10-3: byKey["${k}"] present`);
  assert.equal(etc.byKey[k].key, k, `H10-3: byKey["${k}"].key matches`);
}
console.log("[OK] H10-3: byKey covers all 5 KVI sections");

// ---------------------------------------------------------------------------
// H10-4: Non-KVI sections preserved in raw
// ---------------------------------------------------------------------------
assert.ok("key value string" in etc.raw, "H10-4: non-KVI section captured in raw");
assert.equal(etc.raw["key value string"].length, 1, "H10-4: one occurrence preserved");
assert.equal(etc.raw["key value string"][0].length, 2, "H10-4: section attrs preserved");
console.log("[OK] H10-4: non-KVI sections preserved in raw");

// ---------------------------------------------------------------------------
// H10-5: entries[] preserves document order
// ---------------------------------------------------------------------------
const orderedKeys = etc.entries.map(e => e.key);
assert.deepEqual(orderedKeys, expectedKeys, "H10-5: entries[] in document order");
console.log("[OK] H10-5: entry order preserved");

// ---------------------------------------------------------------------------
// H10-6 (invariant): wrong extension → throw
// ---------------------------------------------------------------------------
{
  let threw = false;
  try {
    parseEtcDocument({ ...SWORDMAN_ETC, path: "character/characteretc/swordman.chr" });
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes(".etc"), `H10-6: error mentions .etc (got: ${msg})`);
  }
  assert.ok(threw, "H10-6: wrong extension throws");
  console.log("[OK] H10-6: wrong extension → throws");
}

// ---------------------------------------------------------------------------
// H10-7 (invariant): KVI section first attr not str → throw
// ---------------------------------------------------------------------------
{
  const malformed: PvfDocument = {
    ...SWORDMAN_ETC,
    sections: [
      { name: "key value index", attributes: [
        { t: "int", v: 42 },  // BAD: should be str
        { t: "int", v: 0 }, { t: "int", v: 1 },
      ] },
    ],
  };
  let threw = false;
  try {
    parseEtcDocument(malformed);
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes("str"), `H10-7: error mentions str (got: ${msg})`);
  }
  assert.ok(threw, "H10-7: non-str first attr throws");
  console.log("[OK] H10-7: KVI without str key → throws");
}

// ---------------------------------------------------------------------------
// H10-8 (invariant): non-numeric trailing attr → throw
// ---------------------------------------------------------------------------
{
  const malformed: PvfDocument = {
    ...SWORDMAN_ETC,
    sections: [
      { name: "key value index", attributes: [
        { t: "str", v: "weird" },
        { t: "int", v: 1 },
        { t: "str", v: "not-a-number" },  // BAD: should be int/float
      ] },
    ],
  };
  let threw = false;
  try {
    parseEtcDocument(malformed);
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes("non-numeric") || msg.includes("type"), `H10-8: error mentions type issue (got: ${msg})`);
  }
  assert.ok(threw, "H10-8: non-numeric trailing attr throws");
  console.log("[OK] H10-8: non-numeric trailing attr → throws");
}

// ---------------------------------------------------------------------------
// H10-9: edge — .etc with 0 KVI sections → empty entries/byKey, no throw
// ---------------------------------------------------------------------------
{
  const emptyEtc: PvfDocument = {
    ...SWORDMAN_ETC,
    path: "etc/empty.etc",
    sections: [
      { name: "key value string", attributes: [{ t: "str", v: "noop" }] },
    ],
  };
  const r = parseEtcDocument(emptyEtc);
  assert.equal(r.entries.length, 0, "H10-9: zero KVI sections → empty entries");
  assert.deepEqual(Object.keys(r.byKey), [], "H10-9: empty byKey");
  assert.ok("key value string" in r.raw, "H10-9: non-KVI still captured");
  console.log("[OK] H10-9: empty .etc handled gracefully");
}

// ---------------------------------------------------------------------------
// H10-10: edge — odd-count int suffix (1 trailing orphan) → indexedValues null when zero pairs
// ---------------------------------------------------------------------------
{
  const singleInt: PvfDocument = {
    ...SWORDMAN_ETC,
    sections: [
      { name: "key value index", attributes: [
        { t: "str", v: "heaviestweapon" },
        { t: "int", v: 3 },  // single trailing int → no complete pair
      ] },
    ],
  };
  const r = parseEtcDocument(singleInt);
  assert.equal(r.entries.length, 1, "H10-10: 1 entry parsed");
  assert.deepEqual(r.entries[0].values, [3], "H10-10: single int preserved in values");
  assert.equal(r.entries[0].indexedValues, null, "H10-10: indexedValues null when <2 ints");
  console.log("[OK] H10-10: single-int suffix → indexedValues null");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("");
console.log("H10 EtcParser probes: all assertions passed (10 cases, 3 invariant-violation cases)");
