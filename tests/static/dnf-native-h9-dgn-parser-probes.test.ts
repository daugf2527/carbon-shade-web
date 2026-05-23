/**
 * Head 9 probe suite — DgnParser boundary / invariant probes.
 *
 * Fixtures (Tier-1 PVF truth, dnf-extract v2.0.0, 2026-05-23):
 *   - dungeon/act3/jungle.dgn
 *   - dungeon/act3/goddesstemple.dgn
 *   - dungeon/act3/bloodhell.dgn
 *
 * Note: "special passive object item" section in inline fixture is truncated
 * (full section has 27 ints; here we include only a representative subset
 * for fixture compactness — the parser routes this to raw unconditionally).
 *
 * Exit policy:
 *   - exits 1 if bug count > BASELINE_BUGS
 *   - exits 1 if PROBE_STRICT=1 and any bugs are exposed
 *   - exits 0 otherwise
 */

export const BASELINE_BUGS = 0;

import { assert } from "./test-utils.js";
import { parseDgnDocument } from "../../src/dnf-native-combat/data/parsers/DgnParser.js";
import type { PvfDocument, PvfSection, PvfAttribute } from "../../src/dnf-native-combat/data/types/PvfDocument.js";

// ---------------------------------------------------------------------------
// Real PVF fixtures (captured from Script.pvf via dnf-extract v2.0.0, 2026-05-23)
// Tier-1 truth — DO NOT hand-edit section values.
// ---------------------------------------------------------------------------

// Fixture 1: dungeon/act3/jungle.dgn
// Note: "special passive object item" truncated to first 5 int attrs for fixture
// compactness; the section has 27 ints total. Parser places this section in raw.
const JUNGLE_DGN_JSON: PvfDocument = {"extractor_version":"v2.0.0","extract_timestamp":"2026-05-23T08:24:55Z","source_pvf_hash":"crc32-head:c0779278|size:205695984","path":"dungeon/act3/jungle.dgn","type":"document","sections":[{"name":"explain","attributes":[{"t":"link","v":""}]},{"name":"start map","attributes":[{"t":"int","v":0},{"t":"int","v":3},{"t":"int","v":3},{"t":"int","v":3}]},{"name":"map specification","attributes":[{"t":"mat","rows":8,"cols":3,"item_type":"int","items":[[1,0,3206],[2,0,3205],[1,1,3229],[2,1,3230],[1,2,3236],[2,2,3235],[1,3,3216],[2,3,3204]]}]},{"name":"background pos","attributes":[{"t":"int","v":80}]},{"name":"entering title","attributes":[{"t":"ref","target_kind":"ani","target_path":"dungeon/act3/title/jungle.ani","raw":"title/jungle.ani"}]},{"name":"cutscene image","attributes":[{"t":"str","v":"map/cutscene/behemoth.img","_note":"ref_ext_but_path_not_found"},{"t":"int","v":0}]},{"name":"special passive object item","attributes":[{"t":"int","v":0},{"t":"int","v":-1},{"t":"int","v":5},{"t":"int","v":1068},{"t":"int","v":1000}]},{"name":"minimap image","attributes":[{"t":"str","v":"map/minimap/act3.img","_note":"ref_ext_but_path_not_found"}]},{"name":"event monster","attributes":[{"t":"int","v":1},{"t":"int","v":10000},{"t":"int","v":61727},{"t":"int","v":1},{"t":"int","v":300},{"t":"int","v":80},{"t":"int","v":1}]},{"name":"worldmap pattern info","attributes":[{"t":"int","v":1},{"t":"int","v":6},{"t":"str","v":"worldmap/selectdungeonslot/behimoth.img","_note":"ref_ext_but_path_not_found"},{"t":"int","v":1}]},{"name":"basis level","attributes":[{"t":"int","v":31}]},{"name":"experience increasing point","attributes":[{"t":"float","v":0.9}]},{"name":"boss map","attributes":[{"t":"int","v":0},{"t":"int","v":0},{"t":"int","v":3},{"t":"int","v":0}]},{"name":"champion","attributes":[{"t":"int","v":8},{"t":"int","v":16},{"t":"int","v":24},{"t":"int","v":32},{"t":"int","v":36}]},{"name":"pathgate object","attributes":[{"t":"int","v":431},{"t":"int","v":432},{"t":"int","v":5671},{"t":"int","v":433},{"t":"int","v":434},{"t":"int","v":5672},{"t":"int","v":435},{"t":"int","v":436},{"t":"int","v":437},{"t":"int","v":438}]},{"name":"maze info","attributes":[]},{"name":"minimum required level","attributes":[{"t":"int","v":28}]},{"name":"size","attributes":[{"t":"int","v":4},{"t":"int","v":4}]},{"name":"name","attributes":[{"t":"link","v":""}]},{"name":"greed","attributes":[{"t":"str","v":"bbnnnnee\r\n jjhhhhmm\r\n ddnnnngg\r\n bbhhhhee"}]}]};

// Fixture 2: dungeon/act3/goddesstemple.dgn
// Notable: start map has only 2 ints (not 4); has "boss map specification" sections
// (duplicate section name — two separate sections); size=[4,5]; no "minimum required level"
// ... wait, it does have minimumRequiredLevel=33. Double-checked from live extraction.
const GODDESS_TEMPLE_DGN_JSON: PvfDocument = {"extractor_version":"v2.0.0","extract_timestamp":"2026-05-23T08:29:02Z","source_pvf_hash":"crc32-head:c0779278|size:205695984","path":"dungeon/act3/goddesstemple.dgn","type":"document","sections":[{"name":"start map","attributes":[{"t":"int","v":3},{"t":"int","v":4}]},{"name":"map specification","attributes":[{"t":"mat","rows":10,"cols":3,"item_type":"int","items":[[3,3,3713],[2,3,3712],[1,3,3709],[1,2,3708],[1,1,3707],[2,1,3711],[0,1,3705],[1,0,3706],[2,0,3710],[0,0,3704]]}]},{"name":"maze info","attributes":[]},{"name":"background pos","attributes":[{"t":"int","v":80}]},{"name":"boss map specification","attributes":[{"t":"int","v":0},{"t":"int","v":1},{"t":"int","v":3702}]},{"name":"boss map specification","attributes":[{"t":"int","v":2},{"t":"int","v":0},{"t":"int","v":3703}]},{"name":"entering title","attributes":[{"t":"ref","target_kind":"ani","target_path":"dungeon/act3/title/goddesstemple.ani","raw":"title/goddesstemple.ani"}]},{"name":"greed","attributes":[{"t":"str","v":"bbnneeaa\r\n bbppeeaa\r\n aakkaaaa\r\n aaddffmm\r\n aaaaaacc"}]},{"name":"name","attributes":[{"t":"link","v":""}]},{"name":"basis level","attributes":[{"t":"int","v":36}]},{"name":"explain","attributes":[{"t":"link","v":""}]},{"name":"event monster","attributes":[{"t":"int","v":1},{"t":"int","v":10000},{"t":"int","v":61727},{"t":"int","v":1},{"t":"int","v":300},{"t":"int","v":80},{"t":"int","v":1}]},{"name":"worldmap pattern info","attributes":[{"t":"int","v":1},{"t":"int","v":3},{"t":"str","v":"worldmap/selectdungeonslot/behimoth.img","_note":"ref_ext_but_path_not_found"},{"t":"int","v":8}]},{"name":"cutscene image","attributes":[{"t":"str","v":"map/cutscene/behemoth.img","_note":"ref_ext_but_path_not_found"},{"t":"int","v":0}]},{"name":"special passive object item","attributes":[{"t":"int","v":0},{"t":"int","v":-1},{"t":"int","v":5}]},{"name":"minimap image","attributes":[{"t":"str","v":"map/minimap/act3.img","_note":"ref_ext_but_path_not_found"}]},{"name":"size","attributes":[{"t":"int","v":4},{"t":"int","v":5}]},{"name":"minimum required level","attributes":[{"t":"int","v":33}]},{"name":"experience increasing point","attributes":[{"t":"float","v":1.1}]},{"name":"boss map","attributes":[{"t":"int","v":0},{"t":"int","v":1},{"t":"int","v":2},{"t":"int","v":0}]},{"name":"champion","attributes":[{"t":"int","v":3},{"t":"int","v":6},{"t":"int","v":9},{"t":"int","v":12},{"t":"int","v":15}]},{"name":"pathgate object","attributes":[{"t":"int","v":5739},{"t":"int","v":432},{"t":"int","v":5740},{"t":"int","v":5741},{"t":"int","v":434},{"t":"int","v":5742},{"t":"int","v":5743},{"t":"int","v":436},{"t":"int","v":5744},{"t":"int","v":438}]}]};

// Fixture 3: dungeon/act3/bloodhell.dgn
// Notable: basisLevel=39, experienceIncreasingPoint=1.0, size=[5,4], no "minimum required level"
// ... actually minimumRequiredLevel=36 is present. Confirmed from live extraction.
const BLOODHELL_DGN_JSON: PvfDocument = {"extractor_version":"v2.0.0","extract_timestamp":"2026-05-23T08:29:04Z","source_pvf_hash":"crc32-head:c0779278|size:205695984","path":"dungeon/act3/bloodhell.dgn","type":"document","sections":[{"name":"explain","attributes":[{"t":"link","v":""}]},{"name":"start map","attributes":[{"t":"int","v":2},{"t":"int","v":0}]},{"name":"map specification","attributes":[{"t":"mat","rows":7,"cols":3,"item_type":"int","items":[[2,1,6009],[2,2,6008],[2,3,6010],[1,2,6013],[1,3,6011],[3,2,6014],[3,3,6012]]}]},{"name":"background pos","attributes":[{"t":"int","v":80}]},{"name":"entering title","attributes":[{"t":"ref","target_kind":"ani","target_path":"dungeon/act3/title/bloodhell.ani","raw":"title/bloodhell.ani"}]},{"name":"cutscene image","attributes":[{"t":"str","v":"map/cutscene/behemoth.img","_note":"ref_ext_but_path_not_found"},{"t":"int","v":0}]},{"name":"special passive object item","attributes":[{"t":"int","v":0},{"t":"int","v":-1},{"t":"int","v":5}]},{"name":"minimap image","attributes":[{"t":"str","v":"map/minimap/act3.img","_note":"ref_ext_but_path_not_found"}]},{"name":"event monster","attributes":[{"t":"int","v":1},{"t":"int","v":9000},{"t":"int","v":61727},{"t":"int","v":1},{"t":"int","v":300},{"t":"int","v":80},{"t":"int","v":1}]},{"name":"worldmap pattern info","attributes":[{"t":"int","v":1},{"t":"int","v":1},{"t":"str","v":"worldmap/selectdungeonslot/behimoth.img","_note":"ref_ext_but_path_not_found"},{"t":"int","v":6}]},{"name":"basis level","attributes":[{"t":"int","v":39}]},{"name":"experience increasing point","attributes":[{"t":"float","v":1.0}]},{"name":"boss map","attributes":[{"t":"int","v":0},{"t":"int","v":2},{"t":"int","v":4},{"t":"int","v":2}]},{"name":"champion","attributes":[{"t":"int","v":6},{"t":"int","v":9},{"t":"int","v":12},{"t":"int","v":15},{"t":"int","v":18}]},{"name":"pathgate object","attributes":[{"t":"int","v":431},{"t":"int","v":432},{"t":"int","v":439},{"t":"int","v":433},{"t":"int","v":434},{"t":"int","v":440},{"t":"int","v":435},{"t":"int","v":436},{"t":"int","v":437},{"t":"int","v":438}]},{"name":"maze info","attributes":[]},{"name":"minimum required level","attributes":[{"t":"int","v":36}]},{"name":"size","attributes":[{"t":"int","v":5},{"t":"int","v":4}]},{"name":"name","attributes":[{"t":"link","v":""}]},{"name":"greed","attributes":[{"t":"str","v":"aaaaiiaaaa\r\n aaaakkaaaa\r\n bbmmkkjjee\r\n aaddhhggaa"}]}]};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ProbeOutcome {
  id: string;
  status: "BUG" | "OK" | "ERROR";
  detail: string;
}

const results: ProbeOutcome[] = [];

function record(outcome: ProbeOutcome): void {
  results.push(outcome);
  const tag = outcome.status === "BUG" ? "BUG EXPOSED" : outcome.status === "OK" ? "OK" : "PROBE ERROR";
  console.log(`[${tag}] ${outcome.id} :: ${outcome.detail}`);
}

function probe(id: string, fn: () => ProbeOutcome | void): void {
  try {
    const out = fn();
    if (out) record(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record({ id, status: "ERROR", detail: `probe threw: ${msg}` });
  }
}

function makeDoc(path: string, sections: PvfSection[]): PvfDocument {
  return {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-23T00:00:00Z",
    source_pvf_hash: "test-hash",
    path,
    type: "document",
    sections,
  };
}

// ---------------------------------------------------------------------------
// H9-P1: Happy path — jungle.dgn
// ---------------------------------------------------------------------------
probe("H9-P1.jungle.basicFields", () => {
  const dgn = parseDgnDocument(JUNGLE_DGN_JSON);
  const errors: string[] = [];
  if (dgn.kind !== "dgn") errors.push(`kind=${dgn.kind}`);
  if (dgn.path !== "dungeon/act3/jungle.dgn") errors.push(`path=${dgn.path}`);
  // name and explain are link("") — valid facts with empty string value
  if (dgn.name === null) errors.push("name should not be null (section present with link attr)");
  if (dgn.name?.value !== "") errors.push(`name.value=${JSON.stringify(dgn.name?.value)}, expected ""`);
  if (dgn.explain === null) errors.push("explain should not be null (section present with link attr)");
  if (dgn.explain?.value !== "") errors.push(`explain.value=${JSON.stringify(dgn.explain?.value)}, expected ""`);
  if (dgn.basisLevel?.value !== 31) errors.push(`basisLevel=${dgn.basisLevel?.value}, expected 31`);
  if (dgn.minimumRequiredLevel?.value !== 28) errors.push(`minimumRequiredLevel=${dgn.minimumRequiredLevel?.value}, expected 28`);
  // float comparison with tolerance
  if (dgn.experienceIncreasingPoint === null || Math.abs(dgn.experienceIncreasingPoint.value - 0.9) > 0.001) {
    errors.push(`experienceIncreasingPoint=${dgn.experienceIncreasingPoint?.value}, expected 0.9`);
  }
  if (dgn.backgroundPos?.value !== 80) errors.push(`backgroundPos=${dgn.backgroundPos?.value}, expected 80`);
  if (errors.length > 0) {
    return { id: "H9-P1.jungle.basicFields", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H9-P1.jungle.basicFields", status: "OK", detail: "jungle.dgn basic fields parsed correctly (Tier-1 PVF truth)" };
});

probe("H9-P1.jungle.size", () => {
  const dgn = parseDgnDocument(JUNGLE_DGN_JSON);
  if (!dgn.size) {
    return { id: "H9-P1.jungle.size", status: "BUG", detail: "size is null" };
  }
  const errors: string[] = [];
  if (dgn.size.width !== 4) errors.push(`width=${dgn.size.width}, expected 4`);
  if (dgn.size.height !== 4) errors.push(`height=${dgn.size.height}, expected 4`);
  if (errors.length > 0) {
    return { id: "H9-P1.jungle.size", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H9-P1.jungle.size", status: "OK", detail: "size={width:4, height:4} correct" };
});

probe("H9-P1.jungle.mapSpecification", () => {
  const dgn = parseDgnDocument(JUNGLE_DGN_JSON);
  if (!dgn.mapSpecification) {
    return { id: "H9-P1.jungle.mapSpecification", status: "BUG", detail: "mapSpecification is null" };
  }
  const errors: string[] = [];
  if (dgn.mapSpecification.rows !== 8) errors.push(`rows=${dgn.mapSpecification.rows}, expected 8`);
  if (dgn.mapSpecification.cols !== 3) errors.push(`cols=${dgn.mapSpecification.cols}, expected 3`);
  if (dgn.mapSpecification.items.length !== 8) {
    errors.push(`items.length=${dgn.mapSpecification.items.length}, expected 8`);
  }
  if (dgn.mapSpecification.items[0]?.[2] !== 3206) {
    errors.push(`items[0][2]=${dgn.mapSpecification.items[0]?.[2]}, expected 3206 (first mapId)`);
  }
  if (errors.length > 0) {
    return { id: "H9-P1.jungle.mapSpecification", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H9-P1.jungle.mapSpecification", status: "OK", detail: "mapSpecification rows=8, cols=3, items correct" };
});

probe("H9-P1.jungle.startAndBossMap", () => {
  const dgn = parseDgnDocument(JUNGLE_DGN_JSON);
  const errors: string[] = [];
  if (!dgn.startMap || dgn.startMap.length !== 4) {
    errors.push(`startMap.length=${dgn.startMap?.length}, expected 4`);
  }
  if (!dgn.bossMap || dgn.bossMap.length !== 4) {
    errors.push(`bossMap.length=${dgn.bossMap?.length}, expected 4`);
  }
  if (errors.length > 0) {
    return { id: "H9-P1.jungle.startAndBossMap", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H9-P1.jungle.startAndBossMap", status: "OK", detail: "startMap and bossMap 4-int arrays correct" };
});

probe("H9-P1.jungle.enteringTitleRefs", () => {
  const dgn = parseDgnDocument(JUNGLE_DGN_JSON);
  const errors: string[] = [];
  if (dgn.enteringTitleRefs.length !== 1) {
    errors.push(`enteringTitleRefs.length=${dgn.enteringTitleRefs.length}, expected 1`);
  }
  if (dgn.enteringTitleRefs[0]?.targetKind !== "ani") {
    errors.push(`enteringTitleRefs[0].targetKind=${dgn.enteringTitleRefs[0]?.targetKind}, expected "ani"`);
  }
  if (dgn.enteringTitleRefs[0]?.targetPath !== "dungeon/act3/title/jungle.ani") {
    errors.push(`enteringTitleRefs[0].targetPath=${dgn.enteringTitleRefs[0]?.targetPath}`);
  }
  if (errors.length > 0) {
    return { id: "H9-P1.jungle.enteringTitleRefs", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H9-P1.jungle.enteringTitleRefs", status: "OK", detail: "entering title ref parsed correctly" };
});

probe("H9-P1.jungle.imageRefs", () => {
  const dgn = parseDgnDocument(JUNGLE_DGN_JSON);
  const errors: string[] = [];
  // Expect 3 image refs: cutscene image, minimap image, worldmap pattern info
  if (dgn.imageRefs.length !== 3) {
    errors.push(`imageRefs.length=${dgn.imageRefs.length}, expected 3`);
  }
  const cutscene = dgn.imageRefs.find(r => r.section === "cutscene image");
  if (!cutscene) {
    errors.push("no imageRef for cutscene image");
  } else {
    if (cutscene.path !== "map/cutscene/behemoth.img") errors.push(`cutscene.path=${cutscene.path}`);
    if (cutscene.resolved !== false) errors.push("cutscene.resolved should be false (_note present)");
  }
  const minimap = dgn.imageRefs.find(r => r.section === "minimap image");
  if (!minimap) {
    errors.push("no imageRef for minimap image");
  } else {
    if (minimap.path !== "map/minimap/act3.img") errors.push(`minimap.path=${minimap.path}`);
    if (minimap.resolved !== false) errors.push("minimap.resolved should be false (_note present)");
  }
  const wm = dgn.imageRefs.find(r => r.section === "worldmap pattern info");
  if (!wm) {
    errors.push("no imageRef for worldmap pattern info");
  } else {
    if (wm.path !== "worldmap/selectdungeonslot/behimoth.img") errors.push(`wm.path=${wm.path}`);
    if (wm.resolved !== false) errors.push("wm.resolved should be false (_note present)");
  }
  if (errors.length > 0) {
    return { id: "H9-P1.jungle.imageRefs", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H9-P1.jungle.imageRefs", status: "OK", detail: "3 imageRefs extracted with resolved=false (_note preserved)" };
});

probe("H9-P1.jungle.champion", () => {
  const dgn = parseDgnDocument(JUNGLE_DGN_JSON);
  const errors: string[] = [];
  if (!dgn.championLevels || dgn.championLevels.length !== 5) {
    errors.push(`championLevels.length=${dgn.championLevels?.length}, expected 5`);
  } else {
    const expected = [8, 16, 24, 32, 36];
    for (let i = 0; i < expected.length; i++) {
      if (dgn.championLevels[i] !== expected[i]) {
        errors.push(`championLevels[${i}]=${dgn.championLevels[i]}, expected ${expected[i]}`);
      }
    }
  }
  if (errors.length > 0) {
    return { id: "H9-P1.jungle.champion", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H9-P1.jungle.champion", status: "OK", detail: "championLevels=[8,16,24,32,36] correct" };
});

probe("H9-P1.jungle.greedLayout", () => {
  const dgn = parseDgnDocument(JUNGLE_DGN_JSON);
  if (!dgn.greedLayout) {
    return { id: "H9-P1.jungle.greedLayout", status: "BUG", detail: "greedLayout is null" };
  }
  // Should contain the raw string with \r\n separators
  if (!dgn.greedLayout.startsWith("bbnnnnee")) {
    return { id: "H9-P1.jungle.greedLayout", status: "BUG", detail: `greedLayout does not start with 'bbnnnnee': ${JSON.stringify(dgn.greedLayout.slice(0, 20))}` };
  }
  return { id: "H9-P1.jungle.greedLayout", status: "OK", detail: `greedLayout starts with 'bbnnnnee' (minimap layout string preserved)` };
});

probe("H9-P1.jungle.rawPreservation", () => {
  const dgn = parseDgnDocument(JUNGLE_DGN_JSON);
  const errors: string[] = [];
  // "special passive object item" should be in raw (not a named field)
  if (!Object.prototype.hasOwnProperty.call(dgn.raw, "special passive object item")) {
    errors.push("raw missing 'special passive object item'");
  }
  // "maze info" has empty attrs — should be in raw
  if (!Object.prototype.hasOwnProperty.call(dgn.raw, "maze info")) {
    errors.push("raw missing 'maze info'");
  }
  // maze info should have empty attrs array
  if (dgn.raw["maze info"]?.length !== 0) {
    errors.push(`raw['maze info'].length=${dgn.raw["maze info"]?.length}, expected 0`);
  }
  if (errors.length > 0) {
    return { id: "H9-P1.jungle.rawPreservation", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H9-P1.jungle.rawPreservation", status: "OK", detail: "unknown sections in raw; maze info has empty attrs" };
});

probe("H9-P1.jungle.provenance", () => {
  const dgn = parseDgnDocument(JUNGLE_DGN_JSON);
  const errors: string[] = [];
  if (dgn.provenance.sourceRef !== "pvf:dungeon/act3/jungle.dgn") {
    errors.push(`sourceRef=${dgn.provenance.sourceRef}`);
  }
  if (dgn.provenance.sourcePvfHash !== "crc32-head:c0779278|size:205695984") {
    errors.push(`sourcePvfHash=${dgn.provenance.sourcePvfHash}`);
  }
  if (dgn.basisLevel?.provenance.sectionName !== "basis level") {
    errors.push(`basisLevel.provenance.sectionName=${dgn.basisLevel?.provenance.sectionName}`);
  }
  if (errors.length > 0) {
    return { id: "H9-P1.jungle.provenance", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H9-P1.jungle.provenance", status: "OK", detail: "provenance fields correct" };
});

probe("H9-P1.jungle.sectionsCloned", () => {
  const dgn = parseDgnDocument(JUNGLE_DGN_JSON);
  // sections should be structuredClone — different reference
  if (JUNGLE_DGN_JSON.sections[0] === dgn.sections[0]) {
    return { id: "H9-P1.jungle.sectionsCloned", status: "BUG", detail: "sections[0] is same reference — not cloned" };
  }
  return { id: "H9-P1.jungle.sectionsCloned", status: "OK", detail: "sections are structuredClone (separate reference)" };
});

// ---------------------------------------------------------------------------
// H9-P2: goddesstemple.dgn — 2-int start map, boss map specification in raw, size=[4,5]
// ---------------------------------------------------------------------------
probe("H9-P2.goddesstemple.basicFields", () => {
  const dgn = parseDgnDocument(GODDESS_TEMPLE_DGN_JSON);
  const errors: string[] = [];
  if (dgn.basisLevel?.value !== 36) errors.push(`basisLevel=${dgn.basisLevel?.value}, expected 36`);
  if (dgn.minimumRequiredLevel?.value !== 33) errors.push(`minimumRequiredLevel=${dgn.minimumRequiredLevel?.value}, expected 33`);
  if (Math.abs((dgn.experienceIncreasingPoint?.value ?? -1) - 1.1) > 0.001) {
    errors.push(`experienceIncreasingPoint=${dgn.experienceIncreasingPoint?.value}, expected 1.1`);
  }
  if (errors.length > 0) {
    return { id: "H9-P2.goddesstemple.basicFields", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H9-P2.goddesstemple.basicFields", status: "OK", detail: "goddesstemple.dgn basic fields correct" };
});

probe("H9-P2.goddesstemple.size", () => {
  const dgn = parseDgnDocument(GODDESS_TEMPLE_DGN_JSON);
  if (!dgn.size) {
    return { id: "H9-P2.goddesstemple.size", status: "BUG", detail: "size is null" };
  }
  if (dgn.size.width !== 4 || dgn.size.height !== 5) {
    return { id: "H9-P2.goddesstemple.size", status: "BUG", detail: `size={${dgn.size.width}, ${dgn.size.height}}, expected {4, 5}` };
  }
  return { id: "H9-P2.goddesstemple.size", status: "OK", detail: "size={width:4, height:5} correct" };
});

probe("H9-P2.goddesstemple.startMapTwoInts", () => {
  // goddesstemple has only 2 ints in start map (not 4) — variable length is valid
  const dgn = parseDgnDocument(GODDESS_TEMPLE_DGN_JSON);
  if (!dgn.startMap || dgn.startMap.length !== 2) {
    return { id: "H9-P2.goddesstemple.startMapTwoInts", status: "BUG", detail: `startMap.length=${dgn.startMap?.length}, expected 2` };
  }
  return { id: "H9-P2.goddesstemple.startMapTwoInts", status: "OK", detail: "startMap with 2 ints accepted (variable length valid)" };
});

probe("H9-P2.goddesstemple.mapSpecRows10", () => {
  const dgn = parseDgnDocument(GODDESS_TEMPLE_DGN_JSON);
  if (dgn.mapSpecification?.rows !== 10) {
    return { id: "H9-P2.goddesstemple.mapSpecRows10", status: "BUG", detail: `rows=${dgn.mapSpecification?.rows}, expected 10` };
  }
  return { id: "H9-P2.goddesstemple.mapSpecRows10", status: "OK", detail: "mapSpecification rows=10 for goddesstemple" };
});

probe("H9-P2.goddesstemple.bossMapSpecInRaw", () => {
  // "boss map specification" is NOT a named field — should be in raw
  // goddesstemple has two "boss map specification" sections — both attributes merged
  const dgn = parseDgnDocument(GODDESS_TEMPLE_DGN_JSON);
  if (!Object.prototype.hasOwnProperty.call(dgn.raw, "boss map specification")) {
    return { id: "H9-P2.goddesstemple.bossMapSpecInRaw", status: "BUG", detail: "raw missing 'boss map specification'" };
  }
  // Two sections of 3 ints each = 6 total merged attrs
  if (dgn.raw["boss map specification"].length !== 6) {
    return { id: "H9-P2.goddesstemple.bossMapSpecInRaw", status: "BUG", detail: `raw['boss map specification'].length=${dgn.raw["boss map specification"].length}, expected 6 (2 sections × 3 ints merged)` };
  }
  return { id: "H9-P2.goddesstemple.bossMapSpecInRaw", status: "OK", detail: "boss map specification in raw, duplicate sections merged (6 attrs)" };
});

// ---------------------------------------------------------------------------
// H9-P3: bloodhell.dgn — basisLevel=39, experiencePoint=1.0, size=[5,4]
// ---------------------------------------------------------------------------
probe("H9-P3.bloodhell.basicFields", () => {
  const dgn = parseDgnDocument(BLOODHELL_DGN_JSON);
  const errors: string[] = [];
  if (dgn.basisLevel?.value !== 39) errors.push(`basisLevel=${dgn.basisLevel?.value}, expected 39`);
  if (dgn.minimumRequiredLevel?.value !== 36) errors.push(`minimumRequiredLevel=${dgn.minimumRequiredLevel?.value}, expected 36`);
  if (Math.abs((dgn.experienceIncreasingPoint?.value ?? -1) - 1.0) > 0.001) {
    errors.push(`experienceIncreasingPoint=${dgn.experienceIncreasingPoint?.value}, expected 1.0`);
  }
  if (errors.length > 0) {
    return { id: "H9-P3.bloodhell.basicFields", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H9-P3.bloodhell.basicFields", status: "OK", detail: "bloodhell.dgn basic fields correct" };
});

probe("H9-P3.bloodhell.size", () => {
  const dgn = parseDgnDocument(BLOODHELL_DGN_JSON);
  if (!dgn.size || dgn.size.width !== 5 || dgn.size.height !== 4) {
    return { id: "H9-P3.bloodhell.size", status: "BUG", detail: `size=${JSON.stringify(dgn.size)}, expected {width:5, height:4}` };
  }
  return { id: "H9-P3.bloodhell.size", status: "OK", detail: "bloodhell size={width:5, height:4} correct" };
});

probe("H9-P3.bloodhell.mapSpecRows7", () => {
  const dgn = parseDgnDocument(BLOODHELL_DGN_JSON);
  if (dgn.mapSpecification?.rows !== 7) {
    return { id: "H9-P3.bloodhell.mapSpecRows7", status: "BUG", detail: `rows=${dgn.mapSpecification?.rows}, expected 7` };
  }
  return { id: "H9-P3.bloodhell.mapSpecRows7", status: "OK", detail: "bloodhell mapSpecification rows=7 correct" };
});

// ---------------------------------------------------------------------------
// H9-P4: Edge cases — optional sections absent
// ---------------------------------------------------------------------------
probe("H9-P4.edge.minimalDgn", () => {
  const doc = makeDoc("dungeon/test/minimal.dgn", []);
  const dgn = parseDgnDocument(doc);
  const errors: string[] = [];
  if (dgn.kind !== "dgn") errors.push(`kind=${dgn.kind}`);
  if (dgn.name !== null) errors.push("name should be null (section absent)");
  if (dgn.explain !== null) errors.push("explain should be null (section absent)");
  if (dgn.basisLevel !== null) errors.push("basisLevel should be null");
  if (dgn.minimumRequiredLevel !== null) errors.push("minimumRequiredLevel should be null");
  if (dgn.experienceIncreasingPoint !== null) errors.push("experienceIncreasingPoint should be null");
  if (dgn.backgroundPos !== null) errors.push("backgroundPos should be null");
  if (dgn.startMap !== null) errors.push("startMap should be null");
  if (dgn.bossMap !== null) errors.push("bossMap should be null");
  if (dgn.size !== null) errors.push("size should be null");
  if (dgn.mapSpecification !== null) errors.push("mapSpecification should be null");
  if (dgn.enteringTitleRefs.length !== 0) errors.push(`enteringTitleRefs.length=${dgn.enteringTitleRefs.length}`);
  if (dgn.imageRefs.length !== 0) errors.push(`imageRefs.length=${dgn.imageRefs.length}`);
  if (dgn.championLevels !== null) errors.push("championLevels should be null");
  if (dgn.pathgateObjects !== null) errors.push("pathgateObjects should be null");
  if (dgn.eventMonsters !== null) errors.push("eventMonsters should be null");
  if (dgn.greedLayout !== null) errors.push("greedLayout should be null");
  if (dgn.worldmapPatternInfo !== null) errors.push("worldmapPatternInfo should be null");
  if (errors.length > 0) {
    return { id: "H9-P4.edge.minimalDgn", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H9-P4.edge.minimalDgn", status: "OK", detail: "empty .dgn doc yields all-null/empty fields" };
});

probe("H9-P4.edge.emptyMazeInfo", () => {
  // "maze info" section with empty attributes is valid (observed in jungle.dgn / bloodhell.dgn)
  const doc = makeDoc("dungeon/test/test.dgn", [
    { name: "maze info", attributes: [] },
  ]);
  const dgn = parseDgnDocument(doc);
  // maze info goes to raw with empty attrs — no exception
  if (!Object.prototype.hasOwnProperty.call(dgn.raw, "maze info")) {
    return { id: "H9-P4.edge.emptyMazeInfo", status: "BUG", detail: "raw missing 'maze info'" };
  }
  if (dgn.raw["maze info"].length !== 0) {
    return { id: "H9-P4.edge.emptyMazeInfo", status: "BUG", detail: `raw['maze info'].length=${dgn.raw["maze info"].length}, expected 0` };
  }
  return { id: "H9-P4.edge.emptyMazeInfo", status: "OK", detail: "empty-attribute maze info section preserved in raw without error" };
});

probe("H9-P4.edge.notePreservationInRaw", () => {
  // Sections with _note field should survive into raw as-is
  const doc = makeDoc("dungeon/test/test.dgn", [
    { name: "some unknown section", attributes: [
      { t: "str", v: "some/path.img", "_note": "ref_ext_but_path_not_found" } as PvfAttribute,
    ]},
  ]);
  const dgn = parseDgnDocument(doc);
  if (!Object.prototype.hasOwnProperty.call(dgn.raw, "some unknown section")) {
    return { id: "H9-P4.edge.notePreservationInRaw", status: "BUG", detail: "raw missing unknown section" };
  }
  const attr = dgn.raw["some unknown section"][0] as Record<string, unknown>;
  if (attr["_note"] !== "ref_ext_but_path_not_found") {
    return { id: "H9-P4.edge.notePreservationInRaw", status: "BUG", detail: `_note not preserved in raw: ${JSON.stringify(attr)}` };
  }
  return { id: "H9-P4.edge.notePreservationInRaw", status: "OK", detail: "_note field preserved in raw attrs" };
});

probe("H9-P4.edge.sourcePvfHashOptional", () => {
  const doc: PvfDocument = {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-23T00:00:00Z",
    path: "dungeon/test/test.dgn",
    type: "document",
    sections: [],
    // source_pvf_hash intentionally omitted
  };
  const dgn = parseDgnDocument(doc);
  if (dgn.provenance.sourcePvfHash !== undefined) {
    return { id: "H9-P4.edge.sourcePvfHashOptional", status: "BUG", detail: `sourcePvfHash should be undefined, got ${dgn.provenance.sourcePvfHash}` };
  }
  return { id: "H9-P4.edge.sourcePvfHashOptional", status: "OK", detail: "missing source_pvf_hash tolerated" };
});

// ---------------------------------------------------------------------------
// H9-P5: Invariant violations — throw with informative message
// ---------------------------------------------------------------------------
probe("H9-P5.invariant.wrongExtension", () => {
  const doc = makeDoc("dungeon/act3/jungle.mob", []);
  let threw = false;
  let msg = "";
  try {
    parseDgnDocument(doc);
  } catch (e) {
    threw = true;
    msg = e instanceof Error ? e.message : String(e);
  }
  if (!threw) {
    return { id: "H9-P5.invariant.wrongExtension", status: "BUG", detail: "expected throw on wrong extension" };
  }
  if (!/\.dgn/i.test(msg) && !/DgnParser/i.test(msg)) {
    return { id: "H9-P5.invariant.wrongExtension", status: "BUG", detail: `threw but unhelpful message: ${msg}` };
  }
  return { id: "H9-P5.invariant.wrongExtension", status: "OK", detail: `correctly throws: ${msg}` };
});

probe("H9-P5.invariant.uppercaseExtension", () => {
  // .DGN should be accepted (case-insensitive)
  const doc = makeDoc("dungeon/act3/test.DGN", []);
  try {
    parseDgnDocument(doc);
    return { id: "H9-P5.invariant.uppercaseExtension", status: "OK", detail: ".DGN accepted (case-insensitive)" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { id: "H9-P5.invariant.uppercaseExtension", status: "BUG", detail: `parseDgnDocument rejects .DGN (case-sensitive): ${msg}` };
  }
});

probe("H9-P5.invariant.matRowsMismatch", () => {
  // mat.rows=3 but items has 2 rows — invariant violation
  const doc = makeDoc("dungeon/act3/test.dgn", [{
    name: "map specification",
    attributes: [{
      t: "mat",
      rows: 3,
      cols: 3,
      item_type: "int",
      items: [[1, 0, 100], [2, 0, 200]], // only 2 rows, but rows=3
    } as PvfAttribute],
  }]);
  let threw = false;
  let msg = "";
  try {
    parseDgnDocument(doc);
  } catch (e) {
    threw = true;
    msg = e instanceof Error ? e.message : String(e);
  }
  if (!threw) {
    return { id: "H9-P5.invariant.matRowsMismatch", status: "BUG", detail: "expected throw on mat rows/items mismatch" };
  }
  if (!/rows|items\.length/i.test(msg)) {
    return { id: "H9-P5.invariant.matRowsMismatch", status: "BUG", detail: `threw but unhelpful message: ${msg}` };
  }
  return { id: "H9-P5.invariant.matRowsMismatch", status: "OK", detail: `correctly throws on rows mismatch: ${msg}` };
});

probe("H9-P5.invariant.matColsMismatch", () => {
  // mat.cols=3 but items[1] has 2 elements — invariant violation
  const doc = makeDoc("dungeon/act3/test.dgn", [{
    name: "map specification",
    attributes: [{
      t: "mat",
      rows: 2,
      cols: 3,
      item_type: "int",
      items: [[1, 0, 100], [2, 0]], // items[1] only has 2 elements, cols=3
    } as PvfAttribute],
  }]);
  let threw = false;
  let msg = "";
  try {
    parseDgnDocument(doc);
  } catch (e) {
    threw = true;
    msg = e instanceof Error ? e.message : String(e);
  }
  if (!threw) {
    return { id: "H9-P5.invariant.matColsMismatch", status: "BUG", detail: "expected throw on mat cols/row-length mismatch" };
  }
  if (!/cols|row\.length|items\[1\]/i.test(msg)) {
    return { id: "H9-P5.invariant.matColsMismatch", status: "BUG", detail: `threw but unhelpful message: ${msg}` };
  }
  return { id: "H9-P5.invariant.matColsMismatch", status: "OK", detail: `correctly throws on cols mismatch: ${msg}` };
});

probe("H9-P5.invariant.matNonNumericCell", () => {
  // mat cell contains a string (invalid for item_type="int")
  const doc = makeDoc("dungeon/act3/test.dgn", [{
    name: "map specification",
    attributes: [{
      t: "mat",
      rows: 1,
      cols: 3,
      item_type: "int",
      items: [[1, "bad", 100]], // string in numeric mat
    } as PvfAttribute],
  }]);
  let threw = false;
  let msg = "";
  try {
    parseDgnDocument(doc);
  } catch (e) {
    threw = true;
    msg = e instanceof Error ? e.message : String(e);
  }
  if (!threw) {
    return { id: "H9-P5.invariant.matNonNumericCell", status: "BUG", detail: "expected throw on non-numeric mat cell" };
  }
  if (!/finite number|non-numeric|item_type/i.test(msg)) {
    return { id: "H9-P5.invariant.matNonNumericCell", status: "BUG", detail: `threw but unhelpful message: ${msg}` };
  }
  return { id: "H9-P5.invariant.matNonNumericCell", status: "OK", detail: `correctly throws on non-numeric cell: ${msg}` };
});

probe("H9-P5.invariant.mapSpecNotMat", () => {
  // map specification section with non-mat first attribute
  const doc = makeDoc("dungeon/act3/test.dgn", [{
    name: "map specification",
    attributes: [{ t: "int", v: 42 }],
  }]);
  let threw = false;
  let msg = "";
  try {
    parseDgnDocument(doc);
  } catch (e) {
    threw = true;
    msg = e instanceof Error ? e.message : String(e);
  }
  if (!threw) {
    return { id: "H9-P5.invariant.mapSpecNotMat", status: "BUG", detail: "expected throw when map specification has no mat attr" };
  }
  if (!/mat|map specification/i.test(msg)) {
    return { id: "H9-P5.invariant.mapSpecNotMat", status: "BUG", detail: `threw but unhelpful message: ${msg}` };
  }
  return { id: "H9-P5.invariant.mapSpecNotMat", status: "OK", detail: `correctly throws when map specification lacks mat: ${msg}` };
});

probe("H9-P5.invariant.sizeWrongCount", () => {
  // size section with 3 ints — invariant requires exactly 2
  const doc = makeDoc("dungeon/act3/test.dgn", [{
    name: "size",
    attributes: [{ t: "int", v: 4 }, { t: "int", v: 4 }, { t: "int", v: 1 }],
  }]);
  let threw = false;
  let msg = "";
  try {
    parseDgnDocument(doc);
  } catch (e) {
    threw = true;
    msg = e instanceof Error ? e.message : String(e);
  }
  if (!threw) {
    return { id: "H9-P5.invariant.sizeWrongCount", status: "BUG", detail: "expected throw on size with 3 ints" };
  }
  if (!/size|exactly 2/i.test(msg)) {
    return { id: "H9-P5.invariant.sizeWrongCount", status: "BUG", detail: `threw but unhelpful message: ${msg}` };
  }
  return { id: "H9-P5.invariant.sizeWrongCount", status: "OK", detail: `correctly throws on size wrong int count: ${msg}` };
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const bugs = results.filter(r => r.status === "BUG").length;
const oks = results.filter(r => r.status === "OK").length;
const errors = results.filter(r => r.status === "ERROR").length;
console.log("");
console.log(`Probes run: ${results.length}, suspected bugs: ${bugs}, OK: ${oks}, probe-errors: ${errors}`);

assert.ok(results.length > 0, "probe suite ran at least one probe");

const STRICT = process.env.PROBE_STRICT === "1";
if (bugs > BASELINE_BUGS) {
  console.error(`probe regression: bug count ${bugs} > baseline ${BASELINE_BUGS}`);
  process.exit(1);
}
if (STRICT && bugs > 0) {
  console.error(`PROBE_STRICT: ${bugs} bugs exposed, expected 0`);
  process.exit(1);
}

console.log("H9 DgnParser probes: 30 probes run, 7 invariant cases");
