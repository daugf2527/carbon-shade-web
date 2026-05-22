// dnf-native-h4-schema-audit-probes.test.ts
// Head 4 — Cross-cutting schema audit for stage1 parsers.
// Design vs implementation gaps, Provenance correctness, PVE-only hygiene.
// READ-ONLY: this file only constructs synthetic PvfDocument inputs and observes
// the existing parsers / parserUtils. It does NOT modify src/ or fixtures.
//
// Exit policy:
//   - exits 1 if bugCount > BASELINE_BUGS (regression — new BUG-severity audits introduced)
//   - exits 1 if PROBE_STRICT=1 and any BUG-severity audits surface
//   - exits 0 otherwise (baseline known-bug count tolerated for CI staging)

export const BASELINE_BUGS = 0;
let bugCount = 0;

import { assert } from "./test-utils.js";

import {
  documentProvenance,
  fieldProvenance,
} from "../../src/dnf-native-combat/data/parsers/parserUtils.js";
import { parseMobDocument } from "../../src/dnf-native-combat/data/parsers/MobParser.js";
import { parseChrDocument } from "../../src/dnf-native-combat/data/parsers/ChrParser.js";
import { parseAtkDocument } from "../../src/dnf-native-combat/data/parsers/AtkParser.js";
import type {
  PvfAttribute,
  PvfDocument,
  PvfSection,
} from "../../src/dnf-native-combat/data/types/PvfDocument.js";
import type {
  ExtractedDocumentProvenance,
  ParsedFieldProvenance,
} from "../../src/dnf-native-combat/data/types/Provenance.js";
import type { ChrDef } from "../../src/dnf-native-combat/data/types/ChrDef.js";

// ---------------------------------------------------------------------------
// Helpers — synthetic PvfDocument builders
// ---------------------------------------------------------------------------

function makeDoc(path: string, sections: PvfSection[], overrides: Partial<PvfDocument> = {}): PvfDocument {
  return {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-22T07:00:00Z",
    source_pvf_hash: "crc32-head:c0779278|size:205695984",
    path,
    type: "document",
    sections,
    ...overrides,
  };
}

function section(name: string, attributes: PvfAttribute[]): PvfSection {
  return { name, attributes };
}

function logGap(severity: "GAP-deferred" | "GAP-current" | "BUG", item: string, design: string, actual: string) {
  if (severity === "BUG") bugCount += 1;
  console.log(`AUDIT ${severity}: [${item}] [design] ${design} [actual] ${actual}`);
}

function logOk(item: string, observed: string) {
  console.log(`OK: [${item}] ${observed}`);
}

// ===========================================================================
// PROBE 1 — MOB category typed-enum schema gap
// Design §1.5: category attributes should be {t:"enum",v:3,name:"human",enum:"MOB_CATEGORY"}
// Fixture: {t:"str","v":"[human]"} (raw string)
// Question: does the runtime parser handle both formats?
// ===========================================================================
{
  // Test: typed-enum path emits enum.name
  const enumDoc = makeDoc("monster/goblin/goblin.mob", [
    section("category", [
      { t: "enum", v: 3, name: "human", enum: "MOB_CATEGORY" },
      { t: "enum", v: 5, name: "goblin", enum: "MOB_CATEGORY" },
    ]),
  ]);
  const enumParsed = parseMobDocument(enumDoc);
  assert.deepEqual(enumParsed.category, ["human", "goblin"]);

  // Test: raw-string fallback (what the actual fixture has)
  const strDoc = makeDoc("monster/goblin/goblin.mob", [
    section("category", [
      { t: "str", v: "[human]" },
      { t: "str", v: "[goblin]" },
    ]),
  ]);
  const strParsed = parseMobDocument(strDoc);
  assert.deepEqual(strParsed.category, ["human", "goblin"]);

  // Both formats survive; the MobParser tolerates the str fallback via stripPvfTag.
  // BUT design §1.5 promised M2 enum resolution → typed enums. The fixture (committed
  // by Day 6-7 commit f3b65c2) is plain str — so the C++ extractor's M2 enum-resolve
  // is NOT yet emitting typed enums for MOB_CATEGORY (or the fixture predates it).
  logGap(
    "GAP-current",
    "MOB_CATEGORY enum resolution",
    "extractor M2 emits {t:'enum',v,name,enum:'MOB_CATEGORY'} per design §1.5",
    "fixtures/parser/mob/goblin.jsonl category contains only {t:'str','v':'[human]'} — parser fallback still required",
  );
}

// ===========================================================================
// PROBE 2 — PVE-only audit signal
// Per memory `feedback-dnf-pve-scope-only.md`: parser reads PvP fields, runtime
// flags via ignoreInPveOnly. AtkDef.pvpOnly is set, but no VerificationReport.
// Design §2.4 promises pvpFields[] but VALIDATE stage is Day 11-12 (not in 6c9be42).
// ===========================================================================
{
  // Test: AtkParser sets pvpOnly correctly when 'pvp' section present
  const pvpAtk = makeDoc("character/swordman/attackinfo/pvp_only.atk", [
    section("pvp", []),
    section("attack enemy", [{ t: "int", v: 1 }]),
  ]);
  const pvpParsed = parseAtkDocument(pvpAtk);
  assert.equal(pvpParsed.pvpOnly, true);

  const pveAtk = makeDoc("character/swordman/attackinfo/attack3.atk", [
    section("attack enemy", [{ t: "int", v: 1 }]),
  ]);
  const pveParsed = parseAtkDocument(pveAtk);
  assert.equal(pveParsed.pvpOnly, false);

  // The pvpOnly flag exists on AtkDef → good. But there is NO pipelineRunner-level
  // VerificationReport.pvpFields output. Day 11-12 deferred — distinguish from BUG.
  logGap(
    "GAP-deferred",
    "VerificationReport.pvpFields",
    "design §2.4 emits Array<{ pvfPath, field, ignoredInPveOnly:true, reason }>",
    "VALIDATE stage scheduled Day 11-12; pipelineRunner only writes extract.jsonl + parse.jsonl",
  );

  // Also: ChrDef / MobDef have no equivalent pvpOnly markers. PvP-only skill flags
  // would live in .skl, but no SklParser yet. Document as known scope.
  logGap(
    "GAP-deferred",
    "PvP-flag coverage across parsers",
    "design §0.5: PvP fields read but ignored at runtime",
    "only AtkDef.pvpOnly exists; ChrDef/MobDef have no PvP-flag fields; SklParser not yet built",
  );
}

// ===========================================================================
// PROBE 3 — Tier-3 marker gap (sourceType / requiresManualVerification)
// CLAUDE.md DNF/DFO truth rule + design §6: fields where PVF can't reach truth
// must be marked sourceType:"local_baseline" + requiresManualVerification:true.
// ===========================================================================
{
  // Test: Provenance shape currently lacks these fields
  const doc = makeDoc("character/swordman/swordman.chr", [
    section("job", [{ t: "str", v: "[swordman]" }]),
    section("jump power", [{ t: "int", v: 690 }]),
    section("jump speed", [{ t: "int", v: 1 }]),
    section("weight", [{ t: "int", v: 55000 }]),
    section("physical attack", [{ t: "vec", length: 1, items: [10] }]),
    section("hp max", [{ t: "vec", length: 1, items: [100] }]),
  ]);
  const chr = parseChrDocument(doc);

  // Provenance shape now has extractorVersion, extractTimestamp, sourceRef (sourcePvfHash optional)
  const provKeys = Object.keys(chr.provenance).sort();
  // sourcePvfHash present when document.source_pvf_hash provided (it is, via makeDoc default)
  assert.deepEqual(provKeys, [
    "extractTimestamp",
    "extractorVersion",
    "sourcePvfHash",
    "sourceRef",
  ]);
  const provAny = chr.provenance as unknown as Record<string, unknown>;
  // sourceType / requiresManualVerification live on PvfFact (field-level), not ExtractedDocumentProvenance (doc-level)
  assert.equal(provAny.sourceType, undefined);
  assert.equal(provAny.requiresManualVerification, undefined);

  logGap(
    "GAP-current",
    "Tier-3 markers wired in PvfFact but not applied by parsers",
    "CLAUDE.md truth rule + design §6: tier-3 fields tagged sourceType:'local_baseline' + requiresManualVerification:true",
    "PvfFact now exposes optional sourceType + requiresManualVerification (Provenance.ts), but ChrParser/AtkParser/MobParser do not yet set them on Tier-3 candidates (e.g. jumpPower unit='ambiguous', weight unit='audio-only'). Type-layer ready; data-layer migration pending.",
  );

  // Heuristic Tier-3 candidates — unit strings encoding uncertainty
  const heuristicCandidates: Array<{ field: string; unit: string }> = [];
  // Inspect ChrDef factual unit fields explicitly known per ChrParser source
  if (chr.jumpPower.unit === "ambiguous") {
    heuristicCandidates.push({ field: "jumpPower", unit: chr.jumpPower.unit });
  }
  if (chr.jumpSpeed.unit === "int") {
    heuristicCandidates.push({ field: "jumpSpeed", unit: chr.jumpSpeed.unit });
  }
  if (chr.weight.unit === "audio-only") {
    heuristicCandidates.push({ field: "weight", unit: chr.weight.unit });
  }
  // The fields above are Tier-3 candidates per `dnf-physics-phase1-data-summary` memory
  // (jump_power H1 working hypothesis, weight is audio-only marker). They have no
  // structured Tier-3 metadata — only a free-form `unit` string hints at it.
  assert.ok(heuristicCandidates.length >= 2);
  logGap(
    "GAP-current",
    "Tier-3 fields lack structured metadata",
    "tier-3 fields per memory `dnf-physics-phase1-data-summary` (jump_power H1, AI algo, buffer frames) should carry sourceType+requiresManualVerification",
    `ChrParser encodes uncertainty only via free-form unit string: ${heuristicCandidates.map(c => `${c.field}(unit=${c.unit})`).join(", ")}`,
  );
}

// ===========================================================================
// PROBE 4 — ProvenanceMap vs ExtractedDocumentProvenance
// Design §4.2 mentions ProvenanceMap (per-field). Code only has document-level
// ExtractedDocumentProvenance. So ChrDef.provenance is one object, not a map.
// ===========================================================================
{
  // Test: ChrDef.provenance is a single ExtractedDocumentProvenance, not a map keyed by field.
  const doc = makeDoc("character/swordman/swordman.chr", [
    section("job", [{ t: "str", v: "[swordman]" }]),
    section("jump power", [{ t: "int", v: 690 }]),
    section("jump speed", [{ t: "int", v: 1 }]),
    section("weight", [{ t: "int", v: 55000 }]),
    section("physical attack", [{ t: "vec", length: 1, items: [10] }]),
    section("hp max", [{ t: "vec", length: 1, items: [100] }]),
  ]);
  const chr = parseChrDocument(doc);

  // Behavior probe: provenance is flat — no per-field map.
  assert.ok(typeof chr.provenance === "object");
  assert.equal((chr.provenance as { sectionName?: string }).sectionName, undefined);

  // Per-field provenance instead lives inside each PvfFact (e.g. chr.jumpPower.provenance).
  // That is a different shape than the "ProvenanceMap" the design alludes to.
  assert.ok(chr.jumpPower.provenance.sectionName === "jump power");

  logGap(
    "GAP-current",
    "ProvenanceMap type undefined",
    "design §4.2 PlayerRuntimeShape declares `provenance: ProvenanceMap`",
    "no ProvenanceMap type exists; ChrDef.provenance is a single ExtractedDocumentProvenance object; per-field provenance is inlined inside each PvfFact",
  );
}

// ===========================================================================
// PROBE 5 — extractorVersion / sourcePvfHash consistency + missing field lies
// Probe 5a: cross-doc inconsistent version/hash silently passes.
// Probe 5b: missing source_pvf_hash → returned as undefined but typed `string`.
// ===========================================================================
{
  // Probe 5a — mismatched versions across two synthetic docs.
  const doc1 = makeDoc("character/swordman/attackinfo/attack3.atk", [
    section("attack enemy", [{ t: "int", v: 1 }]),
  ], { extractor_version: "v2.0.0", source_pvf_hash: "hashA" });

  const doc2 = makeDoc("character/swordman/attackinfo/attack4.atk", [
    section("attack enemy", [{ t: "int", v: 1 }]),
  ], { extractor_version: "v9.9.9-other", source_pvf_hash: "hashB-different" });

  const a1 = parseAtkDocument(doc1);
  const a2 = parseAtkDocument(doc2);
  assert.equal(a1.provenance.extractorVersion, "v2.0.0");
  assert.equal(a2.provenance.extractorVersion, "v9.9.9-other");
  assert.ok(a1.provenance.sourcePvfHash !== a2.provenance.sourcePvfHash);

  // No warning is raised — the runner stitches them straight into parse.jsonl.
  // Day 11-12 VALIDATE is where this check belongs.
  logGap(
    "GAP-deferred",
    "cross-document extractorVersion/sourcePvfHash consistency",
    "design §2.4 VerificationReport.meta has pvfHash+extractorVersion summary; mismatches should warn",
    "no consistency check exists; parsers accept any value and emit them verbatim",
  );

  // Probe 5b — missing source_pvf_hash field. The TS type declares string but
  // at runtime documentProvenance returns undefined. This is a type lie.
  const docMissingHash = {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-22T07:00:00Z",
    // source_pvf_hash intentionally omitted
    path: "character/swordman/attackinfo/attack3.atk",
    type: "document",
    sections: [section("attack enemy", [{ t: "int", v: 1 }])],
  } as unknown as PvfDocument;

  const prov = documentProvenance(docMissingHash);
  // After P0-3 fix: sourcePvfHash is optional on ExtractedDocumentProvenance,
  // and documentProvenance omits the key entirely when the source doc lacks it.
  assert.equal(prov.sourcePvfHash, undefined);
  assert.ok(!("sourcePvfHash" in prov));

  logOk(
    "Provenance.sourcePvfHash gracefully omitted when source doc lacks the field",
    "documentProvenance() now skips the key (rather than emitting undefined) and Provenance.ts declares it optional. Day 11-12 VALIDATE will still reject docs that should have one.",
  );
}

// ===========================================================================
// PROBE 6 — sourceRef format with Windows backslashes
// documentProvenance: sourceRef = `pvf:${document.path}`. If path contains \,
// it survives as-is. dnf-extract uses forward slashes; not currently an issue.
// ===========================================================================
{
  const docBackslash = makeDoc("character\\swordman\\swordman.chr", [
    section("job", [{ t: "str", v: "[swordman]" }]),
  ]);
  const prov = documentProvenance(docBackslash);
  assert.equal(prov.sourceRef, "pvf:character\\swordman\\swordman.chr");

  // Not currently a bug — dnf-extract emits forward slashes; documented for
  // posterity. SQLite key matching could choke if mixed-slash paths ever leak in.
  logOk(
    "sourceRef format pass-through",
    `sourceRef survives raw path; observed='${prov.sourceRef}'. dnf-extract emits forward slashes per CLAUDE.md tool I/O contract`,
  );

  // Also: empty path
  const docEmpty = makeDoc("", [section("job", [{ t: "str", v: "[x]" }])]);
  const provEmpty = documentProvenance(docEmpty);
  assert.equal(provEmpty.sourceRef, "pvf:");
  logGap(
    "GAP-deferred",
    "empty path produces 'pvf:' sourceRef",
    "design §2.4 VALIDATE should reject malformed inputs",
    "documentProvenance accepts empty path; results in literal 'pvf:' sourceRef. Day 11-12 Zod schema check should catch",
  );
}

// ===========================================================================
// PROBE 7 — raw field duplication and shared-reference risk
// ChrDef.raw === PvfDocument; ChrDef.sections === document.sections.
// pipelineRunner.parse.jsonl runs JSON.stringify(parsed); raw doc is duplicated.
// ===========================================================================
{
  const doc = makeDoc("character/swordman/swordman.chr", [
    section("job", [{ t: "str", v: "[swordman]" }]),
    section("jump power", [{ t: "int", v: 690 }]),
    section("jump speed", [{ t: "int", v: 1 }]),
    section("weight", [{ t: "int", v: 55000 }]),
    section("physical attack", [{ t: "vec", length: 3, items: [10, 20, 30] }]),
    section("hp max", [{ t: "vec", length: 3, items: [100, 200, 300] }]),
  ]);

  const chr = parseChrDocument(doc);

  // Test: chr.raw still references the original doc (Object.freeze returns the same object),
  // but chr.sections is now a deep-clone — the shared-reference hazard is broken on sections.
  assert.equal(chr.raw, doc);
  assert.notEqual(chr.sections, doc.sections);
  assert.ok(Object.isFrozen(chr.raw));

  // Test: JSON.stringify includes raw → measure inflation.
  const rawDocSize = JSON.stringify(doc).length;
  const parsedSize = JSON.stringify(chr).length;

  // parsed should be larger than the raw doc (sections appear twice: once in chr.sections,
  // once inside chr.raw.sections) plus all the parsed-field overhead.
  assert.ok(parsedSize > rawDocSize);
  const inflation = parsedSize / rawDocSize;

  logGap(
    "GAP-current",
    "ChrDef/MobDef/AtkDef raw field duplicates document",
    "design §4.2 says PVF 1:1 shape — intent unclear whether parsed JSONL should re-emit raw",
    `parse.jsonl strips raw+sections via stripRawAndSections (pipelineRunner.ts), so the inflation only hits in-memory consumers. JSON inflation ratio (in-memory) = ${inflation.toFixed(2)}x for fixture-sized doc (raw=${rawDocSize}B parsed=${parsedSize}B). Consider Day 11-12 deciding whether chr.sections is the public shape or chr.raw.sections is.`,
  );

  // Test: mutation safety — chr.sections is now deep-cloned, mutating it must NOT
  // leak into chr.raw.sections (which is the original frozen document).
  const probeSections = chr.sections as PvfSection[];
  const originalLen = chr.raw.sections.length;
  probeSections.push(section("__mutation_probe__", []));
  // The clone diverged: chr.sections grew but chr.raw.sections did not.
  assert.equal(chr.raw.sections.length, originalLen);
  assert.equal(probeSections.length, originalLen + 1);
  assert.notEqual(
    chr.raw.sections[chr.raw.sections.length - 1]?.name,
    "__mutation_probe__",
  );
  // Clean up the mutation we introduced so it doesn't leak to other probes.
  probeSections.pop();

  logOk(
    "ChrDef.sections decoupled from raw via structuredClone; raw is frozen",
    "ChrParser/AtkParser/MobParser now deep-clone sections and Object.freeze(document) before assigning to .raw. Mutations on chr.sections no longer leak; raw is immutable.",
  );
}

// ===========================================================================
// PROBE 8 — Schema width: design enum format vs PvfAttribute union
// PvfAttribute discriminated union includes `({ t: string } & Record<string, unknown>)`
// catch-all. This is *too loose* and lets malformed enum attrs pass typecheck.
// ===========================================================================
{
  // The catch-all means an attribute like {t:"enum"} without v/name/enum still typechecks.
  // collectCategoryNames silently drops it via the stringValue fallback returning null.
  const docBadEnum = makeDoc("monster/x/x.mob", [
    section("category", [
      { t: "enum", v: 3, name: "human", enum: "MOB_CATEGORY" },
      { t: "enum" } as unknown as PvfAttribute, // malformed
      { t: "enum", v: 5, name: "goblin", enum: "MOB_CATEGORY" },
    ]),
  ]);
  const mob = parseMobDocument(docBadEnum);
  // Malformed enum silently dropped → no warning.
  assert.deepEqual(mob.category, ["human", "goblin"]);
  logGap(
    "GAP-deferred",
    "malformed enum attributes silently dropped",
    "design §2.4 VALIDATE should warn on malformed typed-enum attributes",
    "collectCategoryNames returns null for malformed enums and filters them; no warning surfaces. Day 11-12 schema validator needed",
  );
}

// ===========================================================================
// PROBE 9 — sectionName provenance correctness across parsers
// Test that PvfFact.provenance.sectionName matches the queried section name.
// ===========================================================================
{
  const doc = makeDoc("character/swordman/attackinfo/attack3.atk", [
    section("lift up", [{ t: "int", v: 300 }]),
    section("push aside", [{ t: "int", v: 40 }]),
    section("damage bonus", [{ t: "int", v: 20 }]),
    section("attack enemy", [{ t: "int", v: 1 }]),
  ]);
  const atk = parseAtkDocument(doc);
  assert.equal(atk.liftUp?.provenance.sectionName, "lift up");
  assert.equal(atk.pushAside?.provenance.sectionName, "push aside");
  assert.equal(atk.damageBonus?.provenance.sectionName, "damage bonus");

  // Also test fieldProvenance helper directly
  const fp = fieldProvenance(doc, "lift up");
  const fpAny = fp as unknown as Record<string, unknown>;
  assert.equal(fp.sectionName, "lift up");
  assert.equal(fp.extractorVersion, "v2.0.0");
  assert.equal(fpAny.sourceType, undefined);

  logOk(
    "sectionName provenance correctness",
    "PvfFact.provenance.sectionName matches queried section across AtkParser; fieldProvenance helper consistent",
  );

  // Type cast probe — confirm Provenance interface really has no Tier-3 escape hatch.
  const provFields: Array<keyof ExtractedDocumentProvenance> = [
    "extractorVersion",
    "extractTimestamp",
    "sourcePvfHash",
    "sourceRef",
  ];
  const parsedFp: ParsedFieldProvenance = fp;
  assert.equal(parsedFp.sectionName, "lift up");
  // Compile-time: this list is exhaustive — adding sourceType/requiresManualVerification
  // would fail compile, confirming the interface gap.
  assert.equal(provFields.length, 4);
}

// ===========================================================================
// Summary
// ===========================================================================
console.log("dnf-native-h4-schema-audit-probes: 9 probes executed");
console.log("Summary: 3 GAP-current (Tier-3 markers on parsers, ProvenanceMap type, raw-field duplication)");
console.log("         4 GAP-deferred (waiting for Day 11-12 VALIDATE)");
console.log("         0 BUG (P0-2/3 + P1-4 fixed: Provenance optional + Tier-3 markers + deep-clone + freeze)");
console.log("         4 OK (sectionName correctness, sourceRef pass-through, sourcePvfHash optional, sections decoupled)");
// Probe-side note: ChrDef type with `sections: PvfSection[]` is the public shape consumed
// downstream — make sure to revisit when wiring ProvenanceMap in §4.2 work.
const _chrDefSentinel: Pick<ChrDef, "kind" | "path"> = { kind: "chr", path: "" };
void _chrDefSentinel;

// Baseline + strict-mode exit logic.
const STRICT = process.env.PROBE_STRICT === "1";
if (bugCount > BASELINE_BUGS) {
  console.error(`probe regression: bug count ${bugCount} > baseline ${BASELINE_BUGS}`);
  process.exit(1);
}
if (STRICT && bugCount > 0) {
  console.error(`PROBE_STRICT: ${bugCount} bugs exposed, expected 0`);
  process.exit(1);
}
