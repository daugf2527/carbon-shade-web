/**
 * Head 12 probe suite — MapParser (.map Document → MapDef).
 *
 * Fixture: trimmed real-PVF sample (Tier-1, captured 2026-05-23 from
 * map/test_lorien/4.map via dnf-extract v2.0.0). Shape mirrors what the
 * extractor emits; some packed sections truncated to keep fixture readable.
 *
 * Verifies:
 *   - kind=map, path preserved, provenance flows through
 *   - Identification: map name (stringtable link) / type / dungeon id
 *   - Camera scroll thresholds (near / middle / far)
 *   - Simple typed lists: tile / sound / player number / monster specific ai
 *     / event monster position / pathgate pos / pvp start area
 *   - Packed sections (monster / passive object / special passive object)
 *     preserved as raw deep-cloned PvfAttribute[]
 *   - Animation refs from interleaved section (allowMixed=true convention)
 *   - PvE-only scope: pvp start area read but caller can ignore.
 *     See [[feedback-dnf-pve-scope-only]].
 *
 * Invariants (pure str/link section with non-str attr → throws;
 *             wrong extension → throws).
 *
 * Exit policy: BASELINE_BUGS=0, exits 1 on any unexpected outcome.
 */

export const BASELINE_BUGS = 0;

import { assert } from "./test-utils.js";
import { parseMapDocument } from "../../src/dnf-native-combat/data/parsers/MapParser.js";
import type { PvfDocument } from "../../src/dnf-native-combat/data/types/PvfDocument.js";

// ---------------------------------------------------------------------------
// Inline real-PVF fixture — map/test_lorien/4.map (trimmed).
// ---------------------------------------------------------------------------
const TEST_MAP: PvfDocument = {
  extractor_version: "v2.0.0",
  extract_timestamp: "2026-05-23T15:30:50Z",
  source_pvf_hash: "crc32-head:c0779278|size:205695984",
  path: "map/test_lorien/4.map",
  type: "document",
  sections: [
    { name: "map name", attributes: [{ t: "link", v: "PVP 킠쫁" }] },
    { name: "type", attributes: [{ t: "str", v: "[normal]" }] },
    { name: "dungeon", attributes: [{ t: "int", v: 10001 }] },
    { name: "near sight scroll", attributes: [{ t: "int", v: 110 }] },
    { name: "middle sight scroll", attributes: [{ t: "int", v: 90 }] },
    { name: "far sight scroll", attributes: [{ t: "int", v: 56 }] },
    { name: "player number", attributes: [{ t: "int", v: 2 }, { t: "int", v: 8 }] },
    { name: "tile", attributes: [
      { t: "str", v: "tile/forestover.til" },
      { t: "str", v: "tile/forestover.til" },
      { t: "str", v: "tile/forestoverunder.til" },
      { t: "str", v: "tile/forestunder.til" },
      { t: "str", v: "tile/forestunderover.til" },
      { t: "str", v: "tile/forestover.til" },
    ] },
    { name: "sound", attributes: [
      { t: "str", v: "g_lorien" },
      { t: "str", v: "rm_forest" },
    ] },
    { name: "monster specific ai", attributes: [
      { t: "str", v: "[normal]" }, { t: "str", v: "[normal]" },
      { t: "str", v: "[normal]" }, { t: "str", v: "[normal]" },
      { t: "str", v: "[normal]" },
    ] },
    { name: "event monster position", attributes: [
      { t: "int", v: 384 }, { t: "int", v: 323 }, { t: "int", v: 0 },
      { t: "int", v: 479 }, { t: "int", v: 323 }, { t: "int", v: 0 },
      { t: "int", v: 398 }, { t: "int", v: 204 }, { t: "int", v: 0 },
      { t: "int", v: 505 }, { t: "int", v: 211 }, { t: "int", v: 0 },
    ] },
    { name: "pathgate pos", attributes: [
      { t: "int", v: 17 }, { t: "int", v: 229 },
      { t: "int", v: 1334 }, { t: "int", v: 220 },
      { t: "int", v: 672 }, { t: "int", v: 144 },
      { t: "int", v: 948 }, { t: "int", v: 350 },
    ] },
    { name: "pvp start area", attributes: [
      { t: "int", v: 0 }, { t: "int", v: 0 }, { t: "int", v: 0 },
      { t: "int", v: 0 }, { t: "int", v: 0 }, { t: "int", v: 0 },
      { t: "int", v: 0 }, { t: "int", v: 0 }, { t: "int", v: 0 },
      { t: "int", v: 0 }, { t: "int", v: 0 }, { t: "int", v: 0 },
    ] },
    { name: "monster", attributes: [
      { t: "int", v: 1 }, { t: "int", v: 1 }, { t: "int", v: 0 },
      { t: "int", v: 1025 }, { t: "int", v: 248 }, { t: "int", v: 0 },
      { t: "int", v: 1 }, { t: "int", v: 1 },
      { t: "str", v: "[fixed]" }, { t: "str", v: "[normal]" },
    ] },
    { name: "passive object", attributes: [
      { t: "int", v: 5 }, { t: "int", v: 150 }, { t: "int", v: 150 }, { t: "int", v: 0 },
    ] },
    { name: "special passive object", attributes: [
      { t: "int", v: 221 }, { t: "int", v: 951 },
      { t: "str", v: "[item]" }, { t: "int", v: 1 },
    ] },
    { name: "animation", attributes: [
      { t: "ref", target_kind: "ani", target_path: "map/test_lorien/animation/flower0.ani", raw: "animation/flower0.ani" },
      { t: "str", v: "[normal]" },
      { t: "int", v: 366 }, { t: "int", v: 221 }, { t: "int", v: 0 },
      { t: "ref", target_kind: "ani", target_path: "map/test_lorien/animation/flower1.ani", raw: "animation/flower1.ani" },
      { t: "str", v: "[normal]" },
      { t: "int", v: 395 }, { t: "int", v: 172 }, { t: "int", v: 0 },
    ] },
    { name: "background animation", attributes: [] },
    { name: "greed", attributes: [{ t: "str", v: "nn ee" }] },
  ],
};

// ---------------------------------------------------------------------------
// H12-1: Happy-path — basic shape
// ---------------------------------------------------------------------------
const map = parseMapDocument(TEST_MAP);

assert.equal(map.kind, "map", "H12-1: kind === map");
assert.equal(map.path, "map/test_lorien/4.map", "H12-1: path preserved");
assert.equal(map.provenance.extractorVersion, "v2.0.0", "H12-1: provenance.extractorVersion");
assert.equal(map.provenance.sourceRef, "pvf:map/test_lorien/4.map", "H12-1: provenance.sourceRef");
assert.equal(map.provenance.sourcePvfHash, "crc32-head:c0779278|size:205695984", "H12-1: provenance.sourcePvfHash");
assert.equal(map.sections.length, TEST_MAP.sections.length, "H12-1: sections deep-cloned with same count");
console.log("[OK] H12-1: basic shape");

// ---------------------------------------------------------------------------
// H12-2: Identification — map name (link) / type (str) / dungeon (int)
// ---------------------------------------------------------------------------
assert.ok(map.name !== null, "H12-2: map name extracted");
assert.equal(map.name!.value, "PVP 킠쫁", "H12-2: map name link value preserved (stringtable target)");
assert.equal(map.name!.provenance.sectionName, "map name", "H12-2: field provenance section");
assert.ok(map.mapType !== null, "H12-2: type extracted");
assert.equal(map.mapType!.value, "[normal]", "H12-2: type bracket preserved (no auto-strip)");
assert.ok(map.dungeonId !== null, "H12-2: dungeon id extracted");
assert.equal(map.dungeonId!.value, 10001, "H12-2: dungeon id int");
assert.equal(map.dungeonId!.unit, "id", "H12-2: dungeon id unit");
console.log("[OK] H12-2: identification fields");

// ---------------------------------------------------------------------------
// H12-3: Camera scroll thresholds
// ---------------------------------------------------------------------------
assert.equal(map.nearSightScroll?.value, 110, "H12-3: near sight scroll");
assert.equal(map.middleSightScroll?.value, 90, "H12-3: middle sight scroll");
assert.equal(map.farSightScroll?.value, 56, "H12-3: far sight scroll");
assert.equal(map.nearSightScroll?.unit, "px", "H12-3: scroll unit px");
console.log("[OK] H12-3: camera scroll thresholds");

// ---------------------------------------------------------------------------
// H12-4: Simple typed lists — tile / sound / player number / ai / event pos / pathgate
// ---------------------------------------------------------------------------
assert.deepEqual(map.playerNumber, [2, 8], "H12-4: playerNumber int list");
assert.equal(map.tiles.length, 6, "H12-4: 6 tile paths");
assert.equal(map.tiles[0], "tile/forestover.til", "H12-4: first tile path");
assert.equal(map.tiles[3], "tile/forestunder.til", "H12-4: ordered tile preserved");
assert.deepEqual(map.sounds, ["g_lorien", "rm_forest"], "H12-4: sound IDs preserved");
assert.equal(map.monsterAiHints.length, 5, "H12-4: 5 monsterAiHints (one per spawn slot)");
assert.ok(map.monsterAiHints.every(h => h === "[normal]"), "H12-4: all hints [normal] in fixture");
assert.equal(map.eventMonsterPositions.length, 12, "H12-4: 4 event-monster triples = 12 ints");
assert.equal(map.pathgatePos.length, 8, "H12-4: 2 pathgate quads = 8 ints");
console.log("[OK] H12-4: simple typed lists");

// ---------------------------------------------------------------------------
// H12-5: Refs interleaved with positional metadata (allowMixed=true)
// ---------------------------------------------------------------------------
assert.equal(map.animationRefs.length, 2, "H12-5: 2 ani refs from interleaved section");
assert.equal(map.animationRefs[0].targetKind, "ani", "H12-5: targetKind ani");
assert.equal(map.animationRefs[0].targetPath, "map/test_lorien/animation/flower0.ani", "H12-5: targetPath resolved");
assert.equal(map.animationRefs[1].targetPath, "map/test_lorien/animation/flower1.ani", "H12-5: second ref");
assert.equal(map.backgroundAnimation.length, 0, "H12-5: background animation empty (real-PVF shape)");
console.log("[OK] H12-5: refs interleaved with positional metadata");

// ---------------------------------------------------------------------------
// H12-6: Packed sections preserved as deep-cloned raw attributes
// ---------------------------------------------------------------------------
assert.equal(map.monsterSpawns.length, 10, "H12-6: monsterSpawns attrs preserved");
assert.equal(map.passiveObjects.length, 4, "H12-6: passiveObjects attrs preserved");
assert.equal(map.specialPassiveObjects.length, 4, "H12-6: specialPassiveObjects attrs preserved");
// Deep-clone check: mutation on MapDef must not bleed into raw input
const rawMonsterSection = TEST_MAP.sections.find(s => s.name === "monster")!;
assert.ok(map.monsterSpawns !== rawMonsterSection.attributes,
  "H12-6: monsterSpawns is structurally separate (deep-cloned)");
console.log("[OK] H12-6: packed sections preserved verbatim");

// ---------------------------------------------------------------------------
// H12-7: PvE-only scope — pvp start area read but caller can ignore
// (per [[feedback-dnf-pve-scope-only]] — read all PVF fields, runtime filters)
// ---------------------------------------------------------------------------
assert.equal(map.pvpStartArea.length, 12, "H12-7: pvpStartArea preserved (12 ints)");
assert.ok(map.pvpStartArea.every(v => v === 0), "H12-7: pvpStartArea placeholder values intact");
console.log("[OK] H12-7: PvP fields read (scope rule: read all, runtime ignores)");

// ---------------------------------------------------------------------------
// H12-8 (invariant): wrong extension → throws
// ---------------------------------------------------------------------------
{
  let threw = false;
  try {
    parseMapDocument({ ...TEST_MAP, path: "map/test_lorien/4.mob" });
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes(".map"), `H12-8: error mentions .map (got: ${msg})`);
  }
  assert.ok(threw, "H12-8: wrong extension throws");
  console.log("[OK] H12-8: wrong extension → throws");
}

// ---------------------------------------------------------------------------
// H12-9 (invariant): pure-string section with non-str attr → throws
// ---------------------------------------------------------------------------
{
  const malformed: PvfDocument = {
    ...TEST_MAP,
    sections: [
      { name: "tile", attributes: [{ t: "int", v: 42 }] }, // BAD: should be str
    ],
  };
  let threw = false;
  try {
    parseMapDocument(malformed);
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes("str") || msg.includes("string"),
      `H12-9: error mentions string type (got: ${msg})`);
  }
  assert.ok(threw, "H12-9: collectStrings rejects non-str attrs");
  console.log("[OK] H12-9: collectStrings invariant → throws");
}

// ---------------------------------------------------------------------------
// H12-10: edge — absent optional sections → null / [] without throwing
// ---------------------------------------------------------------------------
{
  const minimal: PvfDocument = {
    ...TEST_MAP,
    sections: [
      { name: "type", attributes: [{ t: "str", v: "[boss]" }] },
    ],
  };
  const r = parseMapDocument(minimal);
  assert.equal(r.name, null, "H12-10: name null when absent");
  assert.equal(r.dungeonId, null, "H12-10: dungeonId null when absent");
  assert.deepEqual(r.tiles, [], "H12-10: tiles [] when absent");
  assert.deepEqual(r.monsterSpawns, [], "H12-10: monsterSpawns [] when absent");
  assert.deepEqual(r.animationRefs, [], "H12-10: animationRefs [] when absent");
  assert.deepEqual(r.pvpStartArea, [], "H12-10: pvpStartArea [] when absent");
  assert.equal(r.mapType?.value, "[boss]", "H12-10: only-mapType still parsed");
  console.log("[OK] H12-10: optional sections handled gracefully");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("");
console.log("H12 MapParser probes: all assertions passed (7 happy-path + 3 invariant cases)");
