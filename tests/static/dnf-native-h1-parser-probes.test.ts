/**
 * Head 1 probe suite — boundary/edge-case bug hunt for stage1 parsers.
 *
 * Scope: ChrParser, MobParser, AtkParser, parserUtils.
 *
 * Each probe is wrapped in try/catch and emits a "BUG EXPOSED" or "OK" log line.
 * The process intentionally exits 0 to keep CI green; findings are reported via stdout.
 */

import { readFileSync } from "node:fs";
import { assert } from "./test-utils.js";
import { parseAtkDocument } from "../../src/dnf-native-combat/data/parsers/AtkParser.js";
import { parseChrDocument } from "../../src/dnf-native-combat/data/parsers/ChrParser.js";
import { parseMobDocument } from "../../src/dnf-native-combat/data/parsers/MobParser.js";
import {
  firstNumberFact,
  firstStringFact,
  numberValue,
  refAttributes,
  requireValue,
  sectionNumbers,
  stringValue,
  vectorFact,
} from "../../src/dnf-native-combat/data/parsers/parserUtils.js";
import type { PvfAttribute, PvfDocument, PvfSection } from "../../src/dnf-native-combat/data/types/PvfDocument.js";

interface ProbeOutcome {
  id: string;
  status: "BUG" | "OK" | "ERROR";
  detail: string;
}

const results: ProbeOutcome[] = [];

function record(outcome: ProbeOutcome): void {
  results.push(outcome);
  const tag = outcome.status === "BUG"
    ? "BUG EXPOSED"
    : outcome.status === "OK"
      ? "OK"
      : "PROBE ERROR";
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
    extract_timestamp: "2026-05-22T00:00:00Z",
    source_pvf_hash: "test-hash",
    path,
    type: "document",
    sections,
  };
}

// Minimal viable chr scaffold — required: job, jump power, jump speed, weight, hp max, physical attack
function makeMinimalChr(overrides: Partial<{ jumpPower: PvfAttribute; jobValue: PvfAttribute; extra: PvfSection[] }> = {}): PvfDocument {
  const sections: PvfSection[] = [
    { name: "job", attributes: [overrides.jobValue ?? { t: "str", v: "[swordman]" }] },
    { name: "jump power", attributes: [overrides.jumpPower ?? { t: "int", v: 700 }] },
    { name: "jump speed", attributes: [{ t: "int", v: 100 }] },
    { name: "weight", attributes: [{ t: "int", v: 100 }] },
    { name: "hp max", attributes: [{ t: "vec", length: 2, items: [100, 200] }] },
    { name: "physical attack", attributes: [{ t: "vec", length: 2, items: [10, 20] }] },
  ];
  if (overrides.extra) sections.push(...overrides.extra);
  return makeDoc("character/test/test.chr", sections);
}

// ---------------------------------------------------------------------------
// Probe 1 — stripPvfTag with unbalanced or empty bracket payloads.
// ---------------------------------------------------------------------------
probe("P1.stripPvfTag.empty", () => {
  const doc = makeMinimalChr({ jobValue: { t: "str", v: "[]" } });
  const chr = parseChrDocument(doc);
  if (chr.job.value === "") {
    return {
      id: "P1.stripPvfTag.empty",
      status: "BUG",
      detail: `job rawValue=[] strips to empty string '${chr.job.value}'. Consumers expect a non-empty job; this silently produces "".`,
    };
  }
  return { id: "P1.stripPvfTag.empty", status: "OK", detail: `value=${chr.job.value}` };
});

probe("P1.stripPvfTag.embeddedBracket", () => {
  const doc = makeMinimalChr({ jobValue: { t: "str", v: "[a]b]" } });
  const chr = parseChrDocument(doc);
  // expected: "a]b" if it strips the outer wrapper.
  if (chr.job.value === "a]b") {
    return {
      id: "P1.stripPvfTag.embeddedBracket",
      status: "BUG",
      detail: `[a]b] → '${chr.job.value}' — semantically wrong (data has embedded ], outer bracket strip is lossy).`,
    };
  }
  return { id: "P1.stripPvfTag.embeddedBracket", status: "OK", detail: `value=${chr.job.value}` };
});

probe("P1.stripPvfTag.unmatchedLeft", () => {
  const doc = makeMinimalChr({ jobValue: { t: "str", v: "[" } });
  const chr = parseChrDocument(doc);
  // "[" startsWith("[") and endsWith("]") is false → no strip → "[" passed through (still ugly tag-leak).
  // But what if value is "]"? endsWith yes but startsWith no.
  return {
    id: "P1.stripPvfTag.unmatchedLeft",
    status: chr.job.value === "[" ? "OK" : "BUG",
    detail: `'[' → '${chr.job.value}' (no strip when only one bracket is present, but unstripped value retains [ leaking PVF tag noise into downstream)`,
  };
});

// ---------------------------------------------------------------------------
// Probe 2 — parseWeaponHitInfo silently drops partial trailing rows.
// ---------------------------------------------------------------------------
probe("P2.weaponHitInfo.trailingPartial", () => {
  // 7 attributes = 1 full row + 1 trailing attr that's silently dropped.
  const attrs: PvfAttribute[] = [
    { t: "str", v: "[cut]" }, { t: "str", v: "[blood]" }, { t: "int", v: 90 },
    { t: "float", v: 1.0 }, { t: "float", v: 0.0 }, { t: "float", v: 0.0 },
    { t: "str", v: "[orphan-cut]" },   // partial row 2 starts here, will be dropped silently
  ];
  const doc = makeMinimalChr({
    extra: [{ name: "weapon hit info", attributes: attrs }],
  });
  const chr = parseChrDocument(doc);
  if (chr.weaponHitInfo.length === 1) {
    return {
      id: "P2.weaponHitInfo.trailingPartial",
      status: "BUG",
      detail: `7 attrs (1 full + 1 trailing) → ${chr.weaponHitInfo.length} rows; trailing data silently dropped with no warning. If real PVF emits a malformed section, the parser produces wrong data with no log.`,
    };
  }
  return { id: "P2.weaponHitInfo.trailingPartial", status: "OK", detail: `rows=${chr.weaponHitInfo.length}` };
});

// ---------------------------------------------------------------------------
// Probe 3 — parseNumberMatrix silently emits empty rows when items are strings.
// ---------------------------------------------------------------------------
probe("P3.numberMatrix.strItemType", () => {
  const doc = makeMinimalChr({
    extra: [{
      name: "module damage rate",
      attributes: [{
        t: "mat",
        rows: 2,
        cols: 2,
        item_type: "str",
        items: [["a", "b"], ["c", "d"]],
      } as PvfAttribute],
    }],
  });
  const chr = parseChrDocument(doc);
  // matrix items are all strings -> every row becomes []
  const allRowsEmpty = chr.moduleDamageRate.length === 2 && chr.moduleDamageRate.every(r => r.length === 0);
  if (allRowsEmpty) {
    return {
      id: "P3.numberMatrix.strItemType",
      status: "BUG",
      detail: `String matrix (e.g. 'awakening name') → [[], []] silent data loss. Parser should either route by item_type or emit a warning when filtering drops everything.`,
    };
  }
  return { id: "P3.numberMatrix.strItemType", status: "OK", detail: `matrix=${JSON.stringify(chr.moduleDamageRate)}` };
});

// ---------------------------------------------------------------------------
// Probe 4 — Case sensitivity in path suffix check (parseChrDocument vs parseStage).
// ---------------------------------------------------------------------------
probe("P4.chrParser.uppercaseSuffix", () => {
  const sections: PvfSection[] = [
    { name: "job", attributes: [{ t: "str", v: "[swordman]" }] },
    { name: "jump power", attributes: [{ t: "int", v: 700 }] },
    { name: "jump speed", attributes: [{ t: "int", v: 100 }] },
    { name: "weight", attributes: [{ t: "int", v: 100 }] },
    { name: "hp max", attributes: [{ t: "vec", length: 2, items: [100, 200] }] },
    { name: "physical attack", attributes: [{ t: "vec", length: 2, items: [10, 20] }] },
  ];
  const doc = makeDoc("character/test/test.CHR", sections);
  try {
    parseChrDocument(doc);
    return {
      id: "P4.chrParser.uppercaseSuffix",
      status: "OK",
      detail: `.CHR accepted (case-insensitive match)`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      id: "P4.chrParser.uppercaseSuffix",
      status: "BUG",
      detail: `parseChrDocument rejects .CHR (case-sensitive: '${msg}'), but pipeline parseStage normalizes via extname().toLowerCase(). Inconsistent contract between caller (case-insensitive routing) and callee (case-sensitive guard); a Windows-style path could be routed to the parser but then crash.`,
    };
  }
});

probe("P4.mobParser.uppercaseSuffix", () => {
  const doc = makeDoc("monster/test/test.MOB", [{ name: "name", attributes: [{ t: "str", v: "x" }] }]);
  try {
    parseMobDocument(doc);
    return { id: "P4.mobParser.uppercaseSuffix", status: "OK", detail: ".MOB accepted" };
  } catch (e) {
    return {
      id: "P4.mobParser.uppercaseSuffix",
      status: "BUG",
      detail: `parseMobDocument rejects .MOB (case-sensitive); same inconsistency as ChrParser. Pipeline routes by lowercased extname but parser guards with raw endsWith.`,
    };
  }
});

probe("P4.atkParser.uppercaseSuffix", () => {
  const doc = makeDoc("character/x/attackinfo/test.ATK", []);
  try {
    parseAtkDocument(doc);
    return { id: "P4.atkParser.uppercaseSuffix", status: "OK", detail: ".ATK accepted" };
  } catch (e) {
    return {
      id: "P4.atkParser.uppercaseSuffix",
      status: "BUG",
      detail: `parseAtkDocument rejects .ATK; same case-sensitivity gap.`,
    };
  }
});

// ---------------------------------------------------------------------------
// Probe 5 — requireValue error message lacks document context.
// ---------------------------------------------------------------------------
probe("P5.requireValue.errorContext", () => {
  const doc = makeDoc("character/swordman/swordman.chr", [
    { name: "job", attributes: [{ t: "str", v: "[swordman]" }] },
    // no jump power, no jump speed, no weight, no hp max, no physical attack
  ]);
  try {
    parseChrDocument(doc);
    return { id: "P5.requireValue.errorContext", status: "OK", detail: "no error thrown (unexpected)" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("character/swordman/swordman.chr")) {
      return {
        id: "P5.requireValue.errorContext",
        status: "BUG",
        detail: `Missing-section error '${msg}' contains no document path. When batch-extracting 370k files, this makes triage impossible — caller can't tell which file failed.`,
      };
    }
    return { id: "P5.requireValue.errorContext", status: "OK", detail: msg };
  }
});

// ---------------------------------------------------------------------------
// Probe 6 — MobParser.collectAnimationRefs does NOT deduplicate refs that appear
// in multiple sections (e.g. attack motion + waiting motion both pointing to stay.ani).
// ---------------------------------------------------------------------------
probe("P6.mob.dedupeAnimationRefs", () => {
  const aniRef = { t: "ref", target_kind: "ani", target_path: "monster/test/animation/stay.ani", raw: "animation/stay.ani" } as PvfAttribute;
  const doc = makeDoc("monster/test/test.mob", [
    { name: "name", attributes: [{ t: "str", v: "[test]" }] },
    { name: "waiting motion", attributes: [aniRef] },
    { name: "attack motion", attributes: [aniRef] },
  ]);
  const mob = parseMobDocument(doc);
  const stayRefs = mob.animationRefs.filter(r => r.targetPath === "monster/test/animation/stay.ani");
  if (stayRefs.length > 1) {
    return {
      id: "P6.mob.dedupeAnimationRefs",
      status: "BUG",
      detail: `animationRefs contains ${stayRefs.length} duplicates of stay.ani; collectAnimationRefs flatMaps all sections without dedup. Downstream consumers (asset preloader, hash) may load the same .ani twice or produce non-deterministic order.`,
    };
  }
  return { id: "P6.mob.dedupeAnimationRefs", status: "OK", detail: `dedup OK (${stayRefs.length})` };
});

// ---------------------------------------------------------------------------
// Probe 7 — numberValue admits NaN / Infinity / -Infinity (no isFinite guard).
// ---------------------------------------------------------------------------
probe("P7.numberValue.NaN", () => {
  const v = numberValue({ t: "int", v: NaN });
  if (v !== null && Number.isNaN(v)) {
    return {
      id: "P7.numberValue.NaN",
      status: "BUG",
      detail: `numberValue({t:int,v:NaN}) → NaN (not null). If extractor mis-emits NaN, requireValue won't throw, and downstream physics math (gravity*t, jumpPower) silently propagates NaN through the entire combat tick.`,
    };
  }
  return { id: "P7.numberValue.NaN", status: "OK", detail: `value=${v}` };
});

probe("P7.numberValue.Infinity", () => {
  const v = numberValue({ t: "float", v: Infinity });
  if (v === Infinity) {
    return {
      id: "P7.numberValue.Infinity",
      status: "BUG",
      detail: `numberValue admits Infinity. firstNumberFact("jump power") with Infinity passes requireValue; physics integrator overflows on first frame.`,
    };
  }
  return { id: "P7.numberValue.Infinity", status: "OK", detail: `value=${v}` };
});

// ---------------------------------------------------------------------------
// Probe 8 — parseHitReaction / parseElement / parseAttackKind silent priority
// when multiple competing sections coexist (extractor bug or malformed PVF).
// ---------------------------------------------------------------------------
probe("P8.atk.hitReactionPriority", () => {
  const doc = makeDoc("character/x/attackinfo/test.atk", [
    { name: "hit down", attributes: [] },
    { name: "hit lift up", attributes: [] },
    { name: "hit horizon", attributes: [] },
  ]);
  const atk = parseAtkDocument(doc);
  // parser returns "hit_down" silently — no warning that 3 mutex sections coexist.
  if (atk.hitReaction === "hit_down") {
    return {
      id: "P8.atk.hitReactionPriority",
      status: "BUG",
      detail: `3 mutually-exclusive hit-reaction sections coexist (hit down + hit lift up + hit horizon); parser silently picks "hit_down" by ordering with no validation/warning. If PVF is malformed, the reaction picked is invisible.`,
    };
  }
  return { id: "P8.atk.hitReactionPriority", status: "OK", detail: `reaction=${atk.hitReaction}` };
});

probe("P8.atk.elementPriority", () => {
  const doc = makeDoc("character/x/attackinfo/test.atk", [
    { name: "fire element", attributes: [] },
    { name: "ice element", attributes: [] },
  ]);
  const atk = parseAtkDocument(doc);
  if (atk.element === "fire" || atk.element === "ice") {
    return {
      id: "P8.atk.elementPriority",
      status: "BUG",
      detail: `Multiple element sections coexist; parser picks one ('${atk.element}') silently. Note: dark > fire > ice > light per source order — this priority is undocumented and not validated.`,
    };
  }
  return { id: "P8.atk.elementPriority", status: "OK", detail: `element=${atk.element}` };
});

// ---------------------------------------------------------------------------
// Probe 9 — AtkParser.pvpOnly = hasSection("pvp"). Real PVF likely uses "pvp only".
// ---------------------------------------------------------------------------
probe("P9.atk.pvpSectionName", () => {
  // Test what "pvp only" produces.
  const docPvpOnly = makeDoc("character/x/attackinfo/test.atk", [
    { name: "pvp only", attributes: [] },
  ]);
  const a1 = parseAtkDocument(docPvpOnly);
  const docPvp = makeDoc("character/x/attackinfo/test.atk", [
    { name: "pvp", attributes: [] },
  ]);
  const a2 = parseAtkDocument(docPvp);

  // a1 should be true (real-world section is likely "pvp only"); a2 is what current parser reads.
  if (!a1.pvpOnly && a2.pvpOnly) {
    return {
      id: "P9.atk.pvpSectionName",
      status: "BUG",
      detail: `pvpOnly = hasSection("pvp") matches a section literally named "pvp"; does NOT match "pvp only" (the conventional DNF PVF section name). Need to verify section name against real PVF — current parser likely under-counts pvp-only skills as not-pvp-only.`,
    };
  }
  return { id: "P9.atk.pvpSectionName", status: "OK", detail: `pvp=${a2.pvpOnly}, pvp only=${a1.pvpOnly}` };
});

// ---------------------------------------------------------------------------
// Probe 10 — firstNumberFact returns null on wrong-type attribute; requireValue
// error is identical to "section completely missing" — diagnostic ambiguity.
// ---------------------------------------------------------------------------
probe("P10.firstNumberFact.wrongTypeHint", () => {
  const doc = makeDoc("character/test/test.chr", [
    { name: "job", attributes: [{ t: "str", v: "[swordman]" }] },
    { name: "jump power", attributes: [{ t: "str", v: "abc" }] }, // wrong type
    { name: "jump speed", attributes: [{ t: "int", v: 100 }] },
    { name: "weight", attributes: [{ t: "int", v: 100 }] },
    { name: "hp max", attributes: [{ t: "vec", length: 2, items: [100, 200] }] },
    { name: "physical attack", attributes: [{ t: "vec", length: 2, items: [10, 20] }] },
  ]);
  try {
    parseChrDocument(doc);
    return { id: "P10.firstNumberFact.wrongTypeHint", status: "OK", detail: "no error" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Same message as "section completely missing", no hint about type mismatch.
    if (msg === "Missing required PVF section: jump power") {
      return {
        id: "P10.firstNumberFact.wrongTypeHint",
        status: "BUG",
        detail: `Section "jump power" EXISTS but first attribute is str (not int/float). Error says 'Missing required PVF section: jump power' — misleads operator into thinking the section is absent. Should distinguish missing vs. wrong type.`,
      };
    }
    return { id: "P10.firstNumberFact.wrongTypeHint", status: "OK", detail: msg };
  }
});

// ---------------------------------------------------------------------------
// Probe 11 — vectorFact with empty items array passes through silently.
// ---------------------------------------------------------------------------
probe("P11.vectorFact.emptyItems", () => {
  const doc = makeDoc("character/test/test.chr", [
    { name: "job", attributes: [{ t: "str", v: "[swordman]" }] },
    { name: "jump power", attributes: [{ t: "int", v: 700 }] },
    { name: "jump speed", attributes: [{ t: "int", v: 100 }] },
    { name: "weight", attributes: [{ t: "int", v: 100 }] },
    { name: "hp max", attributes: [{ t: "vec", length: 0, items: [] }] },
    { name: "physical attack", attributes: [{ t: "vec", length: 0, items: [] }] },
  ]);
  try {
    const chr = parseChrDocument(doc);
    if (chr.growth.hpMax.values.length === 0) {
      return {
        id: "P11.vectorFact.emptyItems",
        status: "BUG",
        detail: `vectorFact({t:vec,items:[]}) → {values:[],...}. requireValue does NOT throw (non-null), but hpMax with zero levels is meaningless for level-up growth. No length>0 guard.`,
      };
    }
    return { id: "P11.vectorFact.emptyItems", status: "OK", detail: "non-empty" };
  } catch (e) {
    return { id: "P11.vectorFact.emptyItems", status: "OK", detail: `threw: ${e instanceof Error ? e.message : e}` };
  }
});

probe("P11.vectorFact.itemsMissing", () => {
  // Items field is undefined — Array.isArray(undefined) is false → return null. OK.
  const doc = makeDoc("character/test/test.chr", [
    { name: "job", attributes: [{ t: "str", v: "[swordman]" }] },
    { name: "jump power", attributes: [{ t: "int", v: 700 }] },
    { name: "jump speed", attributes: [{ t: "int", v: 100 }] },
    { name: "weight", attributes: [{ t: "int", v: 100 }] },
    { name: "hp max", attributes: [{ t: "vec", length: 5 } as PvfAttribute] }, // items missing
    { name: "physical attack", attributes: [{ t: "vec", length: 2, items: [10, 20] }] },
  ]);
  try {
    parseChrDocument(doc);
    return {
      id: "P11.vectorFact.itemsMissing",
      status: "BUG",
      detail: "vec attribute with missing items did NOT throw via requireValue — vectorFact returned null OR garbage. Investigate.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("hp max")) {
      return { id: "P11.vectorFact.itemsMissing", status: "OK", detail: `correctly rejected (msg: ${msg})` };
    }
    return { id: "P11.vectorFact.itemsMissing", status: "ERROR", detail: msg };
  }
});

probe("P11.vectorFact.lengthMismatch", () => {
  // length declared as 10 but items.length is 2 — no validation
  const doc = makeDoc("character/test/test.chr", [
    { name: "job", attributes: [{ t: "str", v: "[swordman]" }] },
    { name: "jump power", attributes: [{ t: "int", v: 700 }] },
    { name: "jump speed", attributes: [{ t: "int", v: 100 }] },
    { name: "weight", attributes: [{ t: "int", v: 100 }] },
    { name: "hp max", attributes: [{ t: "vec", length: 10, items: [100, 200] }] },
    { name: "physical attack", attributes: [{ t: "vec", length: 2, items: [10, 20] }] },
  ]);
  const chr = parseChrDocument(doc);
  if (chr.growth.hpMax.values.length !== 10) {
    return {
      id: "P11.vectorFact.lengthMismatch",
      status: "BUG",
      detail: `vec.length=10 but items=[100,200] (length 2); parser accepts mismatch silently. values.length=${chr.growth.hpMax.values.length} ≠ declared length=10. Schema invariant not enforced.`,
    };
  }
  return { id: "P11.vectorFact.lengthMismatch", status: "OK", detail: "length validated" };
});

// ---------------------------------------------------------------------------
// Probe 12 — Verify etc attack info refs in fixture; verify refAttributes carries all 87.
// ---------------------------------------------------------------------------
probe("P12.etcAttackInfo.refsCount", () => {
  const raw = readFileSync("tests/fixtures/parser/chr/swordman.jsonl", "utf8")
    .split("\n")
    .find(l => l.trim().startsWith("{"));
  if (!raw) return { id: "P12.etcAttackInfo.refsCount", status: "ERROR", detail: "fixture missing" };
  const doc = JSON.parse(raw) as PvfDocument;
  const etcSection = doc.sections.find(s => s.name === "etc attack info");
  const expected = etcSection?.attributes.length ?? 0;
  const chr = parseChrDocument(doc);
  const got = chr.attackInfo.etc.length;
  if (got !== expected) {
    return {
      id: "P12.etcAttackInfo.refsCount",
      status: "BUG",
      detail: `etc attack info has ${expected} attrs in fixture but only ${got} survived refAttributes. Means some attrs in section are not ref-typed and got filtered — verify whether mixed-type attributes can legitimately appear here.`,
    };
  }
  return { id: "P12.etcAttackInfo.refsCount", status: "OK", detail: `refs=${got}` };
});

// ---------------------------------------------------------------------------
// Probe 13 — parseWeaponHitInfo with completely empty section (length 0)
// ---------------------------------------------------------------------------
probe("P13.weaponHitInfo.emptySection", () => {
  const doc = makeMinimalChr({
    extra: [{ name: "weapon hit info", attributes: [] }],
  });
  const chr = parseChrDocument(doc);
  // returns empty rows[] — fine, but distinct from "section missing".
  return {
    id: "P13.weaponHitInfo.emptySection",
    status: chr.weaponHitInfo.length === 0 ? "OK" : "BUG",
    detail: `rows=${chr.weaponHitInfo.length}`,
  };
});

// ---------------------------------------------------------------------------
// Probe 14 — parseWeaponWav with section of <4 attributes (out-of-bounds reads)
// ---------------------------------------------------------------------------
probe("P14.weaponWav.shortSection", () => {
  // Provides one weapon wav section with only 2 attrs. stringValue(undefined) returns null → "" fallback.
  const doc = makeMinimalChr({
    extra: [{
      name: "weapon wav",
      attributes: [
        { t: "str", v: "swing_a" },
        { t: "str", v: "swing_b" },
        // hitA and hitB missing
      ],
    }],
  });
  const chr = parseChrDocument(doc);
  const row = chr.weaponWav[0];
  if (row && row.hitA === "" && row.hitB === "") {
    return {
      id: "P14.weaponWav.shortSection",
      status: "BUG",
      detail: `weapon wav with only 2/4 attrs → hitA=hitB="" silently. Parser fills missing slots with empty strings; downstream sound code may attempt to load "" as an audio asset.`,
    };
  }
  return { id: "P14.weaponWav.shortSection", status: "OK", detail: JSON.stringify(row) };
});

// ---------------------------------------------------------------------------
// Probe 15 — stripPvfTag behavior on mob category attribute names
// ---------------------------------------------------------------------------
probe("P15.mob.categoryEmptyBrackets", () => {
  const doc = makeDoc("monster/test/test.mob", [
    { name: "category", attributes: [{ t: "str", v: "[]" }, { t: "str", v: "[goblin]" }] },
  ]);
  const mob = parseMobDocument(doc);
  if (mob.category[0] === "" && mob.category[1] === "goblin") {
    return {
      id: "P15.mob.categoryEmptyBrackets",
      status: "BUG",
      detail: `category [] strips to "" and is kept in array (filter only drops null). Result: ['', 'goblin']. Empty category string is meaningless but survives. Should filter empties or treat [] as null.`,
    };
  }
  return { id: "P15.mob.categoryEmptyBrackets", status: "OK", detail: JSON.stringify(mob.category) };
});

// ---------------------------------------------------------------------------
// Probe 16 — parseAtkDocument with NO sections (empty document)
// ---------------------------------------------------------------------------
probe("P16.atk.emptyDoc", () => {
  const doc = makeDoc("character/x/test.atk", []);
  const atk = parseAtkDocument(doc);
  // All fields null/false — survives because nothing is required. Is this intentional?
  if (atk.attackKind === null && atk.element === "none" && atk.hitReaction === "none") {
    return {
      id: "P16.atk.emptyDoc",
      status: "OK",
      detail: "empty atk parses to all-null/none — no contract violation since AtkDef does not require anything.",
    };
  }
  return { id: "P16.atk.emptyDoc", status: "OK", detail: "empty parsed" };
});

// ---------------------------------------------------------------------------
// Probe 17 — sectionNumbers ignores non-number attributes silently (e.g. ref/str)
// ---------------------------------------------------------------------------
probe("P17.sectionNumbers.mixedTypes", () => {
  const doc = makeDoc("p17.chr", [
    { name: "width", attributes: [
      { t: "int", v: 10 },
      { t: "str", v: "garbage" } as PvfAttribute,
      { t: "int", v: 20 },
    ] },
  ]);
  const widths = sectionNumbers(doc, "width");
  if (widths.length === 2 && widths[0] === 10 && widths[1] === 20) {
    return {
      id: "P17.sectionNumbers.mixedTypes",
      status: "BUG",
      detail: `sectionNumbers silently skips non-number attrs. Mixed-type section emits [10, 20], dropping the str in between. Order is preserved but the str signal is invisible — possible data corruption if PVF expects positional layout (e.g. [x, type-tag, y]).`,
    };
  }
  return { id: "P17.sectionNumbers.mixedTypes", status: "OK", detail: JSON.stringify(widths) };
});

// ---------------------------------------------------------------------------
// Probe 18 — refAttributes silently drops non-ref attributes
// ---------------------------------------------------------------------------
probe("P18.refAttributes.mixed", () => {
  const section: PvfSection = {
    name: "attack info",
    attributes: [
      { t: "ref", target_kind: "atk", target_path: "p18.atk", raw: "p18.atk" },
      { t: "int", v: 99 }, // not a ref — silently dropped
      { t: "ref", target_kind: "atk", target_path: "p18b.atk", raw: "p18b.atk" },
    ],
  };
  const refs = refAttributes(section);
  if (refs.length === 2) {
    return {
      id: "P18.refAttributes.mixed",
      status: "BUG",
      detail: `mixed ref/non-ref section: 3 attrs → 2 refs. Non-ref attr dropped silently. If atk attack-info uses positional metadata (count, weights, ...), it's invisible to downstream.`,
    };
  }
  return { id: "P18.refAttributes.mixed", status: "OK", detail: `refs=${refs.length}` };
});

// ---------------------------------------------------------------------------
// Probe 19 — sectionNumbers / firstSection return correct values for absent section
// ---------------------------------------------------------------------------
probe("P19.firstSection.absent", () => {
  const doc = makeDoc("p19.chr", []);
  const fact = firstNumberFact(doc, "absent", "x");
  return {
    id: "P19.firstSection.absent",
    status: fact === null ? "OK" : "BUG",
    detail: `absent section → ${fact === null ? "null (correct)" : JSON.stringify(fact)}`,
  };
});

// ---------------------------------------------------------------------------
// Probe 20 — vectorFact when attributes[0] is a non-vec type (str or int)
// ---------------------------------------------------------------------------
probe("P20.vectorFact.scalarFirstAttr", () => {
  // hp max section exists but its first attribute is int, not vec.
  const doc = makeDoc("character/test/test.chr", [
    { name: "job", attributes: [{ t: "str", v: "[swordman]" }] },
    { name: "jump power", attributes: [{ t: "int", v: 700 }] },
    { name: "jump speed", attributes: [{ t: "int", v: 100 }] },
    { name: "weight", attributes: [{ t: "int", v: 100 }] },
    { name: "hp max", attributes: [{ t: "int", v: 99 }] },
    { name: "physical attack", attributes: [{ t: "vec", length: 2, items: [10, 20] }] },
  ]);
  try {
    parseChrDocument(doc);
    return { id: "P20.vectorFact.scalarFirstAttr", status: "OK", detail: "no error" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Throws "Missing required PVF section: hp max" — but section is PRESENT with wrong type.
    if (msg === "Missing required PVF section: hp max") {
      return {
        id: "P20.vectorFact.scalarFirstAttr",
        status: "BUG",
        detail: `hp max section exists with wrong attr type (int instead of vec); error message says "Missing required PVF section: hp max", misleading the operator. Same diagnostic ambiguity as P10.`,
      };
    }
    return { id: "P20.vectorFact.scalarFirstAttr", status: "ERROR", detail: msg };
  }
});

// ---------------------------------------------------------------------------
// Probe 21 — stringValue accepts link type. Verify ref kind not silently coerced.
// ---------------------------------------------------------------------------
probe("P21.stringValue.refType", () => {
  // ref type passed to stringValue → returns null (no v field). OK.
  const refAttr = { t: "ref", target_kind: "atk", target_path: "x.atk", raw: "x.atk" } as PvfAttribute;
  const v = stringValue(refAttr);
  return {
    id: "P21.stringValue.refType",
    status: v === null ? "OK" : "BUG",
    detail: `ref type → ${v === null ? "null (correct)" : v}`,
  };
});

// ---------------------------------------------------------------------------
// Probe 22 — Job missing — top-level requireValue. Verify error mentions "job".
// ---------------------------------------------------------------------------
probe("P22.chr.jobMissing", () => {
  const doc = makeDoc("character/test/test.chr", []);
  try {
    parseChrDocument(doc);
    return { id: "P22.chr.jobMissing", status: "BUG", detail: "no error for missing job" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("job")) {
      return { id: "P22.chr.jobMissing", status: "OK", detail: msg };
    }
    return { id: "P22.chr.jobMissing", status: "BUG", detail: `error doesn't mention job: ${msg}` };
  }
});

// ---------------------------------------------------------------------------
// Probe 23 — Mob with no sections (totally empty PVF doc). MobParser.name is nullable so it should succeed.
// ---------------------------------------------------------------------------
probe("P23.mob.empty", () => {
  const doc = makeDoc("monster/test/test.mob", []);
  try {
    const mob = parseMobDocument(doc);
    if (mob.name === null && mob.animationRefs.length === 0 && mob.category.length === 0) {
      return { id: "P23.mob.empty", status: "OK", detail: "empty mob accepted (no required fields)" };
    }
    return { id: "P23.mob.empty", status: "OK", detail: "parsed" };
  } catch (e) {
    return { id: "P23.mob.empty", status: "BUG", detail: `Empty mob threw: ${e instanceof Error ? e.message : e}` };
  }
});

// ---------------------------------------------------------------------------
// Probe 24 — Provenance carries through correctly (sanity).
// ---------------------------------------------------------------------------
probe("P24.provenance.sourceRef", () => {
  const doc = makeMinimalChr();
  const chr = parseChrDocument(doc);
  const expected = `pvf:${doc.path}`;
  if (chr.provenance.sourceRef !== expected) {
    return {
      id: "P24.provenance.sourceRef",
      status: "BUG",
      detail: `sourceRef = ${chr.provenance.sourceRef}, expected ${expected}`,
    };
  }
  return { id: "P24.provenance.sourceRef", status: "OK", detail: chr.provenance.sourceRef };
});

// ---------------------------------------------------------------------------
// Probe 25 — requireValue label collision with section name. Empty/whitespace section name.
// ---------------------------------------------------------------------------
probe("P25.requireValue.emptyLabel", () => {
  try {
    requireValue(null, "", "synthetic/path/empty-label.chr");
    return { id: "P25.requireValue.emptyLabel", status: "BUG", detail: "did not throw on null" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // After B6 fix, expected format is: Missing required PVF section "<label>" in <path>
    if (msg === 'Missing required PVF section "" in synthetic/path/empty-label.chr') {
      return {
        id: "P25.requireValue.emptyLabel",
        status: "BUG",
        detail: `Empty label produces trailing-colon error "${msg}" — no diagnostic value. Should fall back to "<unnamed>" or include document path.`,
      };
    }
    return { id: "P25.requireValue.emptyLabel", status: "OK", detail: msg };
  }
});

// ---------------------------------------------------------------------------
// Probe 26 — firstStringFact with empty string passes (rawValue=""). Verify.
// ---------------------------------------------------------------------------
probe("P26.firstStringFact.emptyValue", () => {
  const doc = makeDoc("p26.chr", [{ name: "body image path", attributes: [{ t: "str", v: "" }] }]);
  const fact = firstStringFact(doc, "body image path");
  if (fact && fact.value === "") {
    return {
      id: "P26.firstStringFact.emptyValue",
      status: "OK",
      detail: `empty string preserved`,
    };
  }
  return { id: "P26.firstStringFact.emptyValue", status: "OK", detail: JSON.stringify(fact) };
});

// ---------------------------------------------------------------------------
// Probe 27 — parseMotionRefs only collects refs from MOTION_SECTION_NAMES. What if a
// motion-like section exists with a slightly different spelling (e.g. "down_motion")? Silently dropped.
// ---------------------------------------------------------------------------
probe("P27.motionRefs.spellingDrift", () => {
  const doc = makeMinimalChr({
    extra: [
      { name: "down_motion", attributes: [
        { t: "ref", target_kind: "ani", target_path: "down.ani", raw: "down.ani" },
      ] },
    ],
  });
  const chr = parseChrDocument(doc);
  if (!("down_motion" in chr.motionRefs) && !("down motion" in chr.motionRefs)) {
    return {
      id: "P27.motionRefs.spellingDrift",
      status: "BUG",
      detail: `Section "down_motion" with underscore (not the canonical "down motion" with space) silently dropped by allowlist. If extractor emits inconsistent spelling, motion ref disappears from chr.motionRefs without warning.`,
    };
  }
  return { id: "P27.motionRefs.spellingDrift", status: "OK", detail: "collected" };
});

// ---------------------------------------------------------------------------
// Probe 28 — Mob.collectAnimationRefs respects targetKind filter (drops non-ani).
// ---------------------------------------------------------------------------
probe("P28.mob.nonAniRefFiltered", () => {
  const doc = makeDoc("monster/test/test.mob", [
    { name: "attack info", attributes: [
      { t: "ref", target_kind: "atk", target_path: "atk1.atk", raw: "atk1.atk" },
      { t: "ref", target_kind: "ani", target_path: "stay.ani", raw: "stay.ani" },
    ] },
  ]);
  const mob = parseMobDocument(doc);
  const atks = mob.animationRefs.filter(r => r.targetKind === "atk");
  if (atks.length > 0) {
    return {
      id: "P28.mob.nonAniRefFiltered",
      status: "BUG",
      detail: `Non-ani refs leaked into animationRefs: ${JSON.stringify(atks)}`,
    };
  }
  return { id: "P28.mob.nonAniRefFiltered", status: "OK", detail: "filter works" };
});

// ---------------------------------------------------------------------------
// Probe 29 — MobParser does not validate that name section is string-typed when present.
// firstStringFact returns null for non-string, fine. But the parser does not warn.
// ---------------------------------------------------------------------------
probe("P29.mob.nameWrongType", () => {
  const doc = makeDoc("monster/test/test.mob", [
    { name: "name", attributes: [{ t: "int", v: 42 }] },
  ]);
  const mob = parseMobDocument(doc);
  if (mob.name === null) {
    return {
      id: "P29.mob.nameWrongType",
      status: "BUG",
      detail: `'name' section present with int attr; mob.name = null. Silent type-mismatch downgrade — caller cannot distinguish missing-name from wrong-type-name.`,
    };
  }
  return { id: "P29.mob.nameWrongType", status: "OK", detail: JSON.stringify(mob.name) };
});

// ---------------------------------------------------------------------------
// Probe 30 — vectorFact with negative length field (corrupted PVF).
// ---------------------------------------------------------------------------
probe("P30.vectorFact.negativeLength", () => {
  // length is just a number — no validation
  const fact = vectorFact(
    makeDoc("p30.chr", [{ name: "vec", attributes: [{ t: "vec", length: -3, items: [1, 2] }] }]),
    "vec",
    "u"
  );
  if (fact && fact.values.length === 2) {
    return {
      id: "P30.vectorFact.negativeLength",
      status: "BUG",
      detail: `length=-3 silently ignored; values=[1,2] returned anyway. No declared-length vs actual-length consistency check.`,
    };
  }
  return { id: "P30.vectorFact.negativeLength", status: "OK", detail: JSON.stringify(fact) };
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const bugs = results.filter(r => r.status === "BUG").length;
const oks = results.filter(r => r.status === "OK").length;
const errors = results.filter(r => r.status === "ERROR").length;
console.log("");
console.log(`Probes run: ${results.length}, suspected bugs: ${bugs}, OK: ${oks}, probe-errors: ${errors}`);

// Sanity: at least one assertion to keep test infrastructure happy.
assert.ok(results.length > 0, "probe suite ran at least one probe");
// Do NOT throw on bug-count; we want CI green.
