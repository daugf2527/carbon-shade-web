/**
 * Head 6 probe suite — SklParser boundary / invariant probes.
 *
 * Fixtures:
 *   - hardattack.skl  (active, magical, no cancel window) — real PVF sample
 *   - cancelupperslash.skl (passive, cancel-window dual-semantics) — real PVF sample
 *
 * Exit policy:
 *   - exits 1 if bug count > BASELINE_BUGS
 *   - exits 1 if PROBE_STRICT=1 and any bugs are exposed
 *   - exits 0 otherwise
 */

export const BASELINE_BUGS = 0;

import { assert } from "./test-utils.js";
import { parseSklDocument } from "../../src/dnf-native-combat/data/parsers/SklParser.js";
import type { PvfDocument, PvfSection, PvfAttribute } from "../../src/dnf-native-combat/data/types/PvfDocument.js";

// ---------------------------------------------------------------------------
// Real PVF fixtures (captured from Script.pvf via dnf-extract v2.0.0, 2026-05-23)
// Tier-1 truth — DO NOT hand-edit section values.
// ---------------------------------------------------------------------------

// Fixture 1: skill/swordman/hardattack.skl
// key field: purchase cost = 15, skill class = 3, type = [active], weapon effect = [magical]
const HARDATTACK_SKL_JSON: PvfDocument = {"extractor_version":"v2.0.0","extract_timestamp":"2026-05-23T06:39:08Z","source_pvf_hash":"crc32-head:c0779278|size:205695984","path":"skill/swordman/hardattack.skl","type":"document","sections":[{"name":"level property","attributes":[{"t":"int","v":1},{"t":"int","v":99},{"t":"link","v":""},{"t":"int","v":-1},{"t":"int","v":0},{"t":"float","v":1.0},{"t":"int","v":-2},{"t":"int","v":1},{"t":"float","v":1.0}]},{"name":"warroom","attributes":[]},{"name":"death tower","attributes":[]},{"name":"pvp","attributes":[]},{"name":"command customizing","attributes":[{"t":"int","v":0}]},{"name":"command key explain","attributes":[{"t":"link","v":""}]},{"name":"icon","attributes":[{"t":"str","v":"character/swordman/effect/skillicon.img"},{"t":"int","v":10},{"t":"str","v":"character/swordman/effect/skillicon.img"},{"t":"int","v":11}]},{"name":"weapon effect type","attributes":[{"t":"str","v":"[magical]"}]},{"name":"type","attributes":[{"t":"str","v":"[active]"}]},{"name":"feature skill index","attributes":[{"t":"int","v":142}]},{"name":"basic explain","attributes":[{"t":"link","v":""}]},{"name":"name2","attributes":[{"t":"link","v":""}]},{"name":"purchase cost","attributes":[{"t":"int","v":15}]},{"name":"skill class","attributes":[{"t":"int","v":3}]},{"name":"explain","attributes":[{"t":"link","v":""}]},{"name":"growtype maximum level","attributes":[{"t":"int","v":50},{"t":"int","v":50},{"t":"int","v":50},{"t":"int","v":50},{"t":"int","v":50},{"t":"int","v":50}]},{"name":"maximum level","attributes":[{"t":"int","v":700}]},{"name":"skill fitness growtype","attributes":[{"t":"int","v":0},{"t":"int","v":1},{"t":"int","v":2},{"t":"int","v":3},{"t":"int","v":4}]},{"name":"command","attributes":[{"t":"str","v":"(up)"},{"t":"str","v":"&"},{"t":"str","v":"(skill)"}]},{"name":"name","attributes":[{"t":"link","v":""}]},{"name":"required level","attributes":[{"t":"int","v":1}]},{"name":"dungeon","attributes":[]},{"name":"required level range","attributes":[{"t":"int","v":2}]},{"name":"durability decrease rate","attributes":[{"t":"int","v":20}]}]};

// Fixture 2: skill/swordman/cancelupperslash.skl
// key field: cancel dual-semantics — purchase cost alias=cancelWindowStart=50,
// skill class alias=cancelGroup=1, required level alias=cancelWindowDuration=1
const CANCEL_UPPER_SLASH_SKL_JSON: PvfDocument = {"extractor_version":"v2.0.0","extract_timestamp":"2026-05-23T06:41:40Z","source_pvf_hash":"crc32-head:c0779278|size:205695984","path":"skill/swordman/cancelupperslash.skl","type":"document","sections":[{"name":"explain","attributes":[{"t":"link","v":""}]},{"name":"static data","attributes":[]},{"name":"skill fitness growtype","attributes":[{"t":"int","v":0},{"t":"int","v":1},{"t":"int","v":2},{"t":"int","v":3},{"t":"int","v":4}]},{"name":"growtype maximum level","attributes":[{"t":"int","v":1},{"t":"int","v":1},{"t":"int","v":1},{"t":"int","v":1},{"t":"int","v":1},{"t":"int","v":1}]},{"name":"maximum level","attributes":[{"t":"int","v":1}]},{"name":"skill class","attributes":[{"t":"int","v":1}]},{"name":"name","attributes":[{"t":"link","v":""}]},{"name":"icon","attributes":[{"t":"str","v":"character/swordman/effect/skillicon.img"},{"t":"int","v":104},{"t":"str","v":"character/swordman/effect/skillicon.img"},{"t":"int","v":105}]},{"name":"type","attributes":[{"t":"str","v":"[passive]"}]},{"name":"required level","attributes":[{"t":"int","v":1}]},{"name":"basic explain","attributes":[{"t":"link","v":""}]},{"name":"purchase cost","attributes":[{"t":"int","v":50}]},{"name":"name2","attributes":[{"t":"link","v":""}]}]};

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

function makeMinimalSkl(overrides: Partial<{ path: string; extra: PvfSection[] }> = {}): PvfDocument {
  return makeDoc(overrides.path ?? "skill/swordman/test.skl", overrides.extra ?? []);
}

// ---------------------------------------------------------------------------
// H6-P1: Happy path — hardattack.skl (active, magical, no cancel window)
// ---------------------------------------------------------------------------
probe("H6-P1.hardattack.basicFields", () => {
  const skl = parseSklDocument(HARDATTACK_SKL_JSON);
  const errors: string[] = [];
  if (skl.kind !== "skl") errors.push(`kind=${skl.kind}`);
  if (skl.path !== "skill/swordman/hardattack.skl") errors.push(`path=${skl.path}`);
  if (skl.skillType !== "active") errors.push(`skillType=${skl.skillType}`);
  if (skl.weaponEffectType !== "magical") errors.push(`weaponEffectType=${skl.weaponEffectType}`);
  if (skl.skillClass?.value !== 3) errors.push(`skillClass=${skl.skillClass?.value}`);
  if (skl.purchaseCost?.value !== 15) errors.push(`purchaseCost=${skl.purchaseCost?.value}`);
  if (skl.requiredLevel?.value !== 1) errors.push(`requiredLevel=${skl.requiredLevel?.value}`);
  if (skl.maximumLevel?.value !== 700) errors.push(`maximumLevel=${skl.maximumLevel?.value}`);
  if (skl.durabilityDecreaseRate?.value !== 20) errors.push(`durabilityDecreaseRate=${skl.durabilityDecreaseRate?.value}`);
  if (skl.cancelWindow !== null) errors.push(`cancelWindow should be null`);
  if (errors.length > 0) {
    return { id: "H6-P1.hardattack.basicFields", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H6-P1.hardattack.basicFields", status: "OK", detail: "hardattack.skl parsed correctly" };
});

probe("H6-P1.hardattack.availabilityFlags", () => {
  const skl = parseSklDocument(HARDATTACK_SKL_JSON);
  const errors: string[] = [];
  if (!skl.hasPvp) errors.push("hasPvp should be true (pvp section present)");
  if (!skl.hasDungeon) errors.push("hasDungeon should be true (dungeon section present)");
  if (!skl.hasWarroom) errors.push("hasWarroom should be true (warroom section present)");
  if (!skl.hasDeathTower) errors.push("hasDeathTower should be true (death tower section present)");
  if (skl.autoCoolTimeApply) errors.push("autoCoolTimeApply should be false (no auto cooltime apply section)");
  if (errors.length > 0) {
    return { id: "H6-P1.hardattack.availabilityFlags", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H6-P1.hardattack.availabilityFlags", status: "OK", detail: "availability flags correct" };
});

probe("H6-P1.hardattack.growtypeArrays", () => {
  const skl = parseSklDocument(HARDATTACK_SKL_JSON);
  const errors: string[] = [];
  if (!skl.growtypeMaximumLevel || skl.growtypeMaximumLevel.length !== 6) {
    errors.push(`growtypeMaximumLevel length=${skl.growtypeMaximumLevel?.length}, expected 6`);
  } else if (skl.growtypeMaximumLevel.some(v => v !== 50)) {
    errors.push(`growtypeMaximumLevel values not all 50: ${JSON.stringify(skl.growtypeMaximumLevel)}`);
  }
  if (!skl.skillFitnessGrowtype || skl.skillFitnessGrowtype.length !== 5) {
    errors.push(`skillFitnessGrowtype length=${skl.skillFitnessGrowtype?.length}, expected 5`);
  } else {
    const expected = [0, 1, 2, 3, 4];
    for (let i = 0; i < expected.length; i++) {
      if (skl.skillFitnessGrowtype[i] !== expected[i]) {
        errors.push(`skillFitnessGrowtype[${i}]=${skl.skillFitnessGrowtype[i]}, expected ${expected[i]}`);
      }
    }
  }
  if (errors.length > 0) {
    return { id: "H6-P1.hardattack.growtypeArrays", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H6-P1.hardattack.growtypeArrays", status: "OK", detail: "growtype arrays parsed correctly" };
});

probe("H6-P1.hardattack.provenance", () => {
  const skl = parseSklDocument(HARDATTACK_SKL_JSON);
  const errors: string[] = [];
  if (skl.provenance.sourceRef !== "pvf:skill/swordman/hardattack.skl") {
    errors.push(`sourceRef=${skl.provenance.sourceRef}`);
  }
  if (skl.provenance.sourcePvfHash !== "crc32-head:c0779278|size:205695984") {
    errors.push(`sourcePvfHash=${skl.provenance.sourcePvfHash}`);
  }
  if (skl.purchaseCost?.provenance.sectionName !== "purchase cost") {
    errors.push(`purchaseCost.provenance.sectionName=${skl.purchaseCost?.provenance.sectionName}`);
  }
  if (errors.length > 0) {
    return { id: "H6-P1.hardattack.provenance", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H6-P1.hardattack.provenance", status: "OK", detail: "provenance correct" };
});

// ---------------------------------------------------------------------------
// H6-P2: Happy path — cancelupperslash.skl (cancel dual-semantics)
// ---------------------------------------------------------------------------
probe("H6-P2.cancel.detection", () => {
  const skl = parseSklDocument(CANCEL_UPPER_SLASH_SKL_JSON);
  if (skl.cancelWindow === null) {
    return { id: "H6-P2.cancel.detection", status: "BUG", detail: "cancelWindow is null, expected non-null for cancel skill" };
  }
  return { id: "H6-P2.cancel.detection", status: "OK", detail: "cancel skill detected via static data section" };
});

probe("H6-P2.cancel.dualSemantics", () => {
  const skl = parseSklDocument(CANCEL_UPPER_SLASH_SKL_JSON);
  if (!skl.cancelWindow) return { id: "H6-P2.cancel.dualSemantics", status: "BUG", detail: "cancelWindow null" };
  const cw = skl.cancelWindow;
  const errors: string[] = [];
  // purchase cost alias = cancelWindowStart = 50 (from real PVF)
  if (cw.cancelWindowStart !== 50) errors.push(`cancelWindowStart=${cw.cancelWindowStart}, expected 50`);
  // required level alias = cancelWindowDuration = 1 (from real PVF)
  if (cw.cancelWindowDuration !== 1) errors.push(`cancelWindowDuration=${cw.cancelWindowDuration}, expected 1`);
  // skill class alias = cancelGroup = 1 (from real PVF)
  if (cw.cancelGroup !== 1) errors.push(`cancelGroup=${cw.cancelGroup}, expected 1`);
  // growtype maximum level alias = cancelWeaponMask = [1,1,1,1,1,1] (from real PVF)
  if (cw.cancelWeaponMask.length !== 6) errors.push(`cancelWeaponMask.length=${cw.cancelWeaponMask.length}, expected 6`);
  // skill fitness growtype alias = cancelTargetSlots = [0,1,2,3,4] (from real PVF)
  if (cw.cancelTargetSlots.length !== 5) errors.push(`cancelTargetSlots.length=${cw.cancelTargetSlots.length}, expected 5`);
  if (errors.length > 0) {
    return { id: "H6-P2.cancel.dualSemantics", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H6-P2.cancel.dualSemantics", status: "OK", detail: "cancel dual-semantics decoded correctly (Tier-1 PVF truth)" };
});

probe("H6-P2.cancel.skillType", () => {
  const skl = parseSklDocument(CANCEL_UPPER_SLASH_SKL_JSON);
  // cancel skills are passive type (verified from real PVF)
  if (skl.skillType !== "passive") {
    return { id: "H6-P2.cancel.skillType", status: "BUG", detail: `skillType=${skl.skillType}, expected passive` };
  }
  return { id: "H6-P2.cancel.skillType", status: "OK", detail: "cancel skill is passive type" };
});

probe("H6-P2.cancel.growtypeNullForCancel", () => {
  const skl = parseSklDocument(CANCEL_UPPER_SLASH_SKL_JSON);
  const errors: string[] = [];
  // For cancel skills, growtypeMaximumLevel and skillFitnessGrowtype are
  // suppressed (sections carry cancel alias semantics, not growtype semantics).
  if (skl.growtypeMaximumLevel !== null) {
    errors.push(`growtypeMaximumLevel should be null for cancel skill (carries cancelWeaponMask semantics)`);
  }
  if (skl.skillFitnessGrowtype !== null) {
    errors.push(`skillFitnessGrowtype should be null for cancel skill (carries cancelTargetSlots semantics)`);
  }
  if (errors.length > 0) {
    return { id: "H6-P2.cancel.growtypeNullForCancel", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H6-P2.cancel.growtypeNullForCancel", status: "OK", detail: "growtype fields correctly null for cancel skill" };
});

// ---------------------------------------------------------------------------
// H6-P3: Edge cases — optional sections absent
// ---------------------------------------------------------------------------
probe("H6-P3.optional.allAbsent", () => {
  const doc = makeMinimalSkl();
  const skl = parseSklDocument(doc);
  const errors: string[] = [];
  if (skl.skillType !== "unknown") errors.push(`skillType=${skl.skillType}`);
  if (skl.weaponEffectType !== "unknown") errors.push(`weaponEffectType=${skl.weaponEffectType}`);
  if (skl.skillClass !== null) errors.push(`skillClass should be null`);
  if (skl.purchaseCost !== null) errors.push(`purchaseCost should be null`);
  if (skl.requiredLevel !== null) errors.push(`requiredLevel should be null`);
  if (skl.maximumLevel !== null) errors.push(`maximumLevel should be null`);
  if (skl.cancelWindow !== null) errors.push(`cancelWindow should be null`);
  if (skl.hasPvp) errors.push("hasPvp should be false");
  if (skl.hasDungeon) errors.push("hasDungeon should be false");
  if (skl.growtypeMaximumLevel !== null) errors.push("growtypeMaximumLevel should be null");
  if (skl.skillFitnessGrowtype !== null) errors.push("skillFitnessGrowtype should be null");
  if (errors.length > 0) {
    return { id: "H6-P3.optional.allAbsent", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H6-P3.optional.allAbsent", status: "OK", detail: "empty .skl doc yields all-null/unknown/false" };
});

probe("H6-P3.optional.passiveSkill", () => {
  const doc = makeDoc("skill/swordman/test.skl", [
    { name: "type", attributes: [{ t: "str", v: "[passive]" }] },
  ]);
  const skl = parseSklDocument(doc);
  if (skl.skillType !== "passive") {
    return { id: "H6-P3.optional.passiveSkill", status: "BUG", detail: `skillType=${skl.skillType}` };
  }
  return { id: "H6-P3.optional.passiveSkill", status: "OK", detail: "passive type parsed" };
});

probe("H6-P3.optional.autoCoolTimePresent", () => {
  const doc = makeDoc("skill/swordman/test.skl", [
    { name: "auto cooltime apply", attributes: [{ t: "int", v: 1 }] },
  ]);
  const skl = parseSklDocument(doc);
  if (!skl.autoCoolTimeApply) {
    return { id: "H6-P3.optional.autoCoolTimePresent", status: "BUG", detail: "autoCoolTimeApply should be true" };
  }
  return { id: "H6-P3.optional.autoCoolTimePresent", status: "OK", detail: "autoCoolTimeApply=true when section has v=1" };
});

probe("H6-P3.optional.noPvpSection", () => {
  const doc = makeMinimalSkl({ extra: [{ name: "dungeon", attributes: [] }] });
  const skl = parseSklDocument(doc);
  if (skl.hasPvp) {
    return { id: "H6-P3.optional.noPvpSection", status: "BUG", detail: "hasPvp should be false when pvp section absent" };
  }
  if (!skl.hasDungeon) {
    return { id: "H6-P3.optional.noPvpSection", status: "BUG", detail: "hasDungeon should be true" };
  }
  return { id: "H6-P3.optional.noPvpSection", status: "OK", detail: "availability flags correct when only dungeon present" };
});

probe("H6-P3.optional.weaponEffectPhysical", () => {
  const doc = makeDoc("skill/swordman/test.skl", [
    { name: "weapon effect type", attributes: [{ t: "str", v: "[physical]" }] },
  ]);
  const skl = parseSklDocument(doc);
  if (skl.weaponEffectType !== "physical") {
    return { id: "H6-P3.optional.weaponEffectPhysical", status: "BUG", detail: `weaponEffectType=${skl.weaponEffectType}` };
  }
  return { id: "H6-P3.optional.weaponEffectPhysical", status: "OK", detail: "physical weapon effect parsed" };
});

probe("H6-P3.optional.unknownWeaponEffect", () => {
  const doc = makeDoc("skill/swordman/test.skl", [
    { name: "weapon effect type", attributes: [{ t: "str", v: "[arcane]" }] },
  ]);
  const skl = parseSklDocument(doc);
  if (skl.weaponEffectType !== "unknown") {
    return { id: "H6-P3.optional.unknownWeaponEffect", status: "BUG", detail: `weaponEffectType=${skl.weaponEffectType}` };
  }
  return { id: "H6-P3.optional.unknownWeaponEffect", status: "OK", detail: "unknown weapon effect tag falls back to unknown" };
});

probe("H6-P3.optional.sourcePvfHashOptional", () => {
  const doc: PvfDocument = {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-23T00:00:00Z",
    path: "skill/swordman/test.skl",
    type: "document",
    sections: [],
    // source_pvf_hash intentionally omitted
  };
  const skl = parseSklDocument(doc);
  if (skl.provenance.sourcePvfHash !== undefined) {
    return { id: "H6-P3.optional.sourcePvfHashOptional", status: "BUG", detail: `sourcePvfHash should be undefined, got ${skl.provenance.sourcePvfHash}` };
  }
  return { id: "H6-P3.optional.sourcePvfHashOptional", status: "OK", detail: "missing source_pvf_hash tolerated (undefined in provenance)" };
});

// ---------------------------------------------------------------------------
// H6-P4: Invariant violations — throw with informative message
// ---------------------------------------------------------------------------
probe("H6-P4.invariant.wrongExtension", () => {
  const doc = makeDoc("skill/swordman/test.chr", []);
  let threw = false;
  let msg = "";
  try {
    parseSklDocument(doc);
  } catch (e) {
    threw = true;
    msg = e instanceof Error ? e.message : String(e);
  }
  if (!threw) {
    return { id: "H6-P4.invariant.wrongExtension", status: "BUG", detail: "expected throw on wrong extension" };
  }
  if (!/\.skl/.test(msg) && !/SklParser/.test(msg)) {
    return { id: "H6-P4.invariant.wrongExtension", status: "BUG", detail: `threw but unhelpful message: ${msg}` };
  }
  return { id: "H6-P4.invariant.wrongExtension", status: "OK", detail: `correctly throws: ${msg}` };
});

probe("H6-P4.invariant.cancelMissingWindowStart", () => {
  // cancel skill (has static data) but missing purchase cost (cancelWindowStart)
  const doc = makeDoc("skill/swordman/cancel.skl", [
    { name: "static data", attributes: [] },
    { name: "skill class", attributes: [{ t: "int", v: 1 }] },
    { name: "required level", attributes: [{ t: "int", v: 1 }] },
    // no "purchase cost" section
  ]);
  let threw = false;
  let msg = "";
  try {
    parseSklDocument(doc);
  } catch (e) {
    threw = true;
    msg = e instanceof Error ? e.message : String(e);
  }
  if (!threw) {
    return { id: "H6-P4.invariant.cancelMissingWindowStart", status: "BUG", detail: "expected throw when cancelWindowStart missing" };
  }
  if (!/cancelWindowStart|purchase cost/i.test(msg)) {
    return { id: "H6-P4.invariant.cancelMissingWindowStart", status: "BUG", detail: `threw but unhelpful message: ${msg}` };
  }
  return { id: "H6-P4.invariant.cancelMissingWindowStart", status: "OK", detail: `throws informatively: ${msg}` };
});

probe("H6-P4.invariant.cancelMissingWindowDuration", () => {
  const doc = makeDoc("skill/swordman/cancel.skl", [
    { name: "static data", attributes: [] },
    { name: "skill class", attributes: [{ t: "int", v: 1 }] },
    { name: "purchase cost", attributes: [{ t: "int", v: 50 }] },
    // no "required level" section
  ]);
  let threw = false;
  let msg = "";
  try {
    parseSklDocument(doc);
  } catch (e) {
    threw = true;
    msg = e instanceof Error ? e.message : String(e);
  }
  if (!threw) {
    return { id: "H6-P4.invariant.cancelMissingWindowDuration", status: "BUG", detail: "expected throw when cancelWindowDuration missing" };
  }
  if (!/cancelWindowDuration|required level/i.test(msg)) {
    return { id: "H6-P4.invariant.cancelMissingWindowDuration", status: "BUG", detail: `threw but unhelpful message: ${msg}` };
  }
  return { id: "H6-P4.invariant.cancelMissingWindowDuration", status: "OK", detail: `throws informatively: ${msg}` };
});

probe("H6-P4.invariant.cancelMissingGroup", () => {
  const doc = makeDoc("skill/swordman/cancel.skl", [
    { name: "static data", attributes: [] },
    { name: "purchase cost", attributes: [{ t: "int", v: 50 }] },
    { name: "required level", attributes: [{ t: "int", v: 1 }] },
    // no "skill class" section
  ]);
  let threw = false;
  let msg = "";
  try {
    parseSklDocument(doc);
  } catch (e) {
    threw = true;
    msg = e instanceof Error ? e.message : String(e);
  }
  if (!threw) {
    return { id: "H6-P4.invariant.cancelMissingGroup", status: "BUG", detail: "expected throw when cancelGroup missing" };
  }
  if (!/cancelGroup|skill class/i.test(msg)) {
    return { id: "H6-P4.invariant.cancelMissingGroup", status: "BUG", detail: `threw but unhelpful message: ${msg}` };
  }
  return { id: "H6-P4.invariant.cancelMissingGroup", status: "OK", detail: `throws informatively: ${msg}` };
});

probe("H6-P4.invariant.cancelWeaponMaskWrongType", () => {
  // cancel skill where growtype maximum level has a str attr (mixed-type — invariant violation)
  const doc = makeDoc("skill/swordman/cancel.skl", [
    { name: "static data", attributes: [] },
    { name: "purchase cost", attributes: [{ t: "int", v: 50 }] },
    { name: "required level", attributes: [{ t: "int", v: 1 }] },
    { name: "skill class", attributes: [{ t: "int", v: 1 }] },
    { name: "growtype maximum level", attributes: [
      { t: "int", v: 1 } as PvfAttribute,
      { t: "str", v: "bad" } as PvfAttribute, // mixed-type
    ] },
  ]);
  let threw = false;
  let msg = "";
  try {
    parseSklDocument(doc);
  } catch (e) {
    threw = true;
    msg = e instanceof Error ? e.message : String(e);
  }
  if (!threw) {
    return { id: "H6-P4.invariant.cancelWeaponMaskWrongType", status: "BUG", detail: "expected throw on mixed-type cancelWeaponMask" };
  }
  if (!/cancelWeaponMask|growtype maximum level/i.test(msg)) {
    return { id: "H6-P4.invariant.cancelWeaponMaskWrongType", status: "BUG", detail: `threw but unhelpful message: ${msg}` };
  }
  return { id: "H6-P4.invariant.cancelWeaponMaskWrongType", status: "OK", detail: `throws informatively: ${msg}` };
});

probe("H6-P4.invariant.uppercaseExtension", () => {
  // .SKL should be accepted (case-insensitive, consistent with other parsers)
  const doc = makeDoc("skill/swordman/test.SKL", []);
  try {
    parseSklDocument(doc);
    return { id: "H6-P4.invariant.uppercaseExtension", status: "OK", detail: ".SKL accepted (case-insensitive)" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { id: "H6-P4.invariant.uppercaseExtension", status: "BUG", detail: `parseSklDocument rejects .SKL (case-sensitive): ${msg}` };
  }
});

// ---------------------------------------------------------------------------
// H6-P5: Provenance correctness
// ---------------------------------------------------------------------------
probe("H6-P5.provenance.fieldProvenance", () => {
  const skl = parseSklDocument(HARDATTACK_SKL_JSON);
  const errors: string[] = [];
  if (skl.skillClass?.provenance.sectionName !== "skill class") {
    errors.push(`skillClass.provenance.sectionName=${skl.skillClass?.provenance.sectionName}`);
  }
  if (skl.requiredLevel?.provenance.sectionName !== "required level") {
    errors.push(`requiredLevel.provenance.sectionName=${skl.requiredLevel?.provenance.sectionName}`);
  }
  if (skl.maximumLevel?.provenance.sectionName !== "maximum level") {
    errors.push(`maximumLevel.provenance.sectionName=${skl.maximumLevel?.provenance.sectionName}`);
  }
  if (skl.durabilityDecreaseRate?.provenance.sectionName !== "durability decrease rate") {
    errors.push(`durabilityDecreaseRate.provenance.sectionName=${skl.durabilityDecreaseRate?.provenance.sectionName}`);
  }
  if (errors.length > 0) {
    return { id: "H6-P5.provenance.fieldProvenance", status: "BUG", detail: errors.join("; ") };
  }
  return { id: "H6-P5.provenance.fieldProvenance", status: "OK", detail: "all field provenance sectionNames correct" };
});

probe("H6-P5.provenance.sourceRefFormat", () => {
  const skl = parseSklDocument(HARDATTACK_SKL_JSON);
  const expected = "pvf:skill/swordman/hardattack.skl";
  if (skl.provenance.sourceRef !== expected) {
    return { id: "H6-P5.provenance.sourceRefFormat", status: "BUG", detail: `sourceRef=${skl.provenance.sourceRef}, expected ${expected}` };
  }
  return { id: "H6-P5.provenance.sourceRefFormat", status: "OK", detail: `sourceRef=${skl.provenance.sourceRef}` };
});

probe("H6-P5.provenance.extractorVersion", () => {
  const skl = parseSklDocument(HARDATTACK_SKL_JSON);
  if (skl.provenance.extractorVersion !== "v2.0.0") {
    return { id: "H6-P5.provenance.extractorVersion", status: "BUG", detail: `extractorVersion=${skl.provenance.extractorVersion}` };
  }
  return { id: "H6-P5.provenance.extractorVersion", status: "OK", detail: `extractorVersion=${skl.provenance.extractorVersion}` };
});

// ---------------------------------------------------------------------------
// H6-P6: raw document preservation
// ---------------------------------------------------------------------------
probe("H6-P6.raw.documentPreserved", () => {
  const skl = parseSklDocument(HARDATTACK_SKL_JSON);
  if (skl.raw.path !== HARDATTACK_SKL_JSON.path) {
    return { id: "H6-P6.raw.documentPreserved", status: "BUG", detail: `raw.path=${skl.raw.path}` };
  }
  if (skl.raw.sections.length !== HARDATTACK_SKL_JSON.sections.length) {
    return { id: "H6-P6.raw.documentPreserved", status: "BUG", detail: `raw.sections.length=${skl.raw.sections.length}, original=${HARDATTACK_SKL_JSON.sections.length}` };
  }
  return { id: "H6-P6.raw.documentPreserved", status: "OK", detail: "raw document preserved with all sections" };
});

probe("H6-P6.raw.sectionsCloned", () => {
  // sections in SkillDef should be a clone (structuredClone), not the original reference
  const skl = parseSklDocument(HARDATTACK_SKL_JSON);
  const originalSection = HARDATTACK_SKL_JSON.sections[0];
  const clonedSection = skl.sections[0];
  if (originalSection === clonedSection) {
    return { id: "H6-P6.raw.sectionsCloned", status: "BUG", detail: "sections[0] is same reference as original — not cloned" };
  }
  return { id: "H6-P6.raw.sectionsCloned", status: "OK", detail: "sections are structuredClone (separate reference)" };
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
