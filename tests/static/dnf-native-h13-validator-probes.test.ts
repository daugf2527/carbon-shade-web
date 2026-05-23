/**
 * Head 13 probe suite — VALIDATE L2 (validator.ts).
 *
 * Covers:
 *   - Happy-path: empty parsed → 0 errors; valid mini fixture → 0 errors;
 *     report meta + stats consistent
 *   - Schema rejection: corrupt def (wrong kind / missing required) → error issue
 *   - Ref integrity: resolved + missing cases reported with correct status
 *   - Tier-3 audit: PvfFact with sourceType="local_baseline" or
 *     requiresManualVerification=true → tier3Fields entry
 *   - PvP scope: AtkDef.pvpOnly / SkillDef.hasPvp / MapDef.pvpStartArea
 *     non-zero → pvpFields entry
 *   - 3-level error model: error vs warning vs info bucketing
 *   - buildProvenanceAudit summary correctness
 *
 * Exit policy: BASELINE_BUGS=0, exits 1 on any unexpected outcome.
 */

export const BASELINE_BUGS = 0;

import { assert } from "./test-utils.js";
import {
  buildProvenanceAudit,
  validateParsedDocuments,
} from "../../src/dnf-native-combat/data/validator.js";
import type { AtkDef } from "../../src/dnf-native-combat/data/types/AtkDef.js";
import type { ChrDef } from "../../src/dnf-native-combat/data/types/ChrDef.js";
import type { MapDef } from "../../src/dnf-native-combat/data/types/MapDef.js";
import type { MobDef } from "../../src/dnf-native-combat/data/types/MobDef.js";
import type { SkillDef } from "../../src/dnf-native-combat/data/types/SklDef.js";
import type { ParsedPvfDocument } from "../../src/dnf-native-combat/data/pipeline/parseStage.js";
import type { ExtractedDocumentProvenance, ParsedFieldProvenance } from "../../src/dnf-native-combat/data/types/Provenance.js";

const META = {
  runId: "h13-test",
  startedAt: "2026-05-23T16:00:00Z",
  finishedAt: "2026-05-23T16:00:01Z",
  pvfHash: "h13-fake",
  extractorVersion: "v2.0.0",
};

function docProv(pvfPath: string): ExtractedDocumentProvenance {
  return {
    extractorVersion: "v2.0.0",
    extractTimestamp: "2026-05-23T16:00:00Z",
    sourceRef: `pvf:${pvfPath}`,
    sourcePvfHash: "h13-fake",
  };
}

function fieldProv(pvfPath: string, sectionName: string): ParsedFieldProvenance {
  return { ...docProv(pvfPath), sectionName };
}

// ───────────────────────────────────────────────────────────────────────────
// Fixture: minimal-valid AtkDef (PvE)
// ───────────────────────────────────────────────────────────────────────────
function buildValidAtk(p: string, overrides: Partial<AtkDef> = {}): AtkDef {
  return {
    kind: "atk",
    path: p,
    provenance: docProv(p),
    sections: [],
    liftUp: null,
    pushAside: null,
    damageBonus: null,
    attackEnemy: true,
    attackFriend: false,
    weaponDamageApply: true,
    attackKind: "physic",
    element: "none",
    hitReaction: "none",
    causesDown: false,
    causesStun: false,
    causesBounce: false,
    causesStuck: false,
    pvpOnly: false,
    ignoreWeight: false,
    hitWav: null,
    knuckBack: null,
    raw: { extractor_version: "v2.0.0", extract_timestamp: "...", path: p, type: "document", sections: [] },
    ...overrides,
  };
}

function buildValidMap(p: string, overrides: Partial<MapDef> = {}): MapDef {
  return {
    kind: "map",
    path: p,
    provenance: docProv(p),
    sections: [],
    name: null,
    mapType: null,
    dungeonId: null,
    nearSightScroll: null,
    middleSightScroll: null,
    farSightScroll: null,
    tiles: [],
    playerNumber: [],
    sounds: [],
    monsterAiHints: [],
    eventMonsterPositions: [],
    pathgatePos: [],
    pvpStartArea: [],
    monsterSpawns: [],
    passiveObjects: [],
    specialPassiveObjects: [],
    animationRefs: [],
    backgroundAnimation: [],
    greed: null,
    raw: { extractor_version: "v2.0.0", extract_timestamp: "...", path: p, type: "document", sections: [] },
    ...overrides,
  };
}

function buildValidMob(p: string, animRefs: Array<{ targetKind: string; targetPath: string; raw: string }> = []): MobDef {
  return {
    kind: "mob",
    path: p,
    provenance: docProv(p),
    sections: [],
    name: null,
    warlike: null,
    sight: null,
    weight: null,
    hpMax: null,
    attackInfo: [],
    animationRefs: animRefs,
    category: [],
    raw: { extractor_version: "v2.0.0", extract_timestamp: "...", path: p, type: "document", sections: [] },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// H13-1: Happy path — empty parsed[] → 0 errors, stats zeros
// ───────────────────────────────────────────────────────────────────────────
{
  const r = validateParsedDocuments([], META);
  assert.equal(r.stats.filesTotal, 0, "H13-1: filesTotal=0");
  assert.equal(r.stats.filesParsed, 0, "H13-1: filesParsed=0");
  assert.equal(r.stats.errors, 0, "H13-1: 0 errors");
  assert.equal(r.errors.length, 0, "H13-1: errors[] empty");
  assert.equal(r.refIntegrity.length, 0, "H13-1: refIntegrity[] empty");
  assert.equal(r.meta.runId, "h13-test", "H13-1: runId echoed");
  assert.equal(r.meta.pvfHash, "h13-fake", "H13-1: pvfHash echoed");
  console.log("[OK] H13-1: empty input → empty report");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-2: Happy path — valid mini fixture → 0 errors, 1 file counted
// ───────────────────────────────────────────────────────────────────────────
{
  const r = validateParsedDocuments([buildValidAtk("atk/test1.atk")], META);
  assert.equal(r.stats.filesParsed, 1, "H13-2: filesParsed=1");
  assert.equal(r.stats.errors, 0, "H13-2: 0 errors on valid input");
  assert.equal(r.errors.length, 0, "H13-2: no error issues");
  assert.equal(r.pvpFields.length, 0, "H13-2: no PvP fields (pvpOnly=false)");
  assert.equal(r.tier3Fields.length, 0, "H13-2: no tier3 (all defaults are tier1)");
  console.log("[OK] H13-2: valid AtkDef passes clean");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-3: Schema rejection — wrong kind in def
// ───────────────────────────────────────────────────────────────────────────
{
  const broken = { ...buildValidAtk("atk/broken.atk"), kind: "wrong" as unknown as "atk" };
  const r = validateParsedDocuments([broken as unknown as ParsedPvfDocument], META);
  // wrong kind triggers schema path = "unknown_kind" error
  assert.ok(r.stats.errors >= 1, `H13-3: ≥1 error from wrong kind (got ${r.stats.errors})`);
  const unknownKindErr = r.errors.find(e => e.code === "unknown_kind");
  assert.ok(unknownKindErr !== undefined, "H13-3: unknown_kind error reported");
  assert.equal(unknownKindErr!.level, "error", "H13-3: level=error");
  console.log("[OK] H13-3: wrong kind → unknown_kind error");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-4: Schema rejection — missing required field
// ───────────────────────────────────────────────────────────────────────────
{
  const noProv = { ...buildValidAtk("atk/noprov.atk"), provenance: null as unknown as ExtractedDocumentProvenance };
  const r = validateParsedDocuments([noProv], META);
  const missingProv = r.errors.find(e => e.code === "missing_provenance");
  assert.ok(missingProv !== undefined, `H13-4: missing_provenance reported (errors=${JSON.stringify(r.errors.map(e => e.code))})`);
  assert.equal(missingProv!.pvfPath, "atk/noprov.atk", "H13-4: error tags correct path");
  console.log("[OK] H13-4: missing provenance → missing_provenance error");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-5: Ref integrity — resolved + missing cases
// ───────────────────────────────────────────────────────────────────────────
{
  const refOk = { targetKind: "ani", targetPath: "anim/ok.ani", raw: "anim/ok.ani" };
  const refMissing = { targetKind: "ani", targetPath: "anim/missing.ani", raw: "anim/missing.ani" };
  const mob = buildValidMob("monster/test.mob", [refOk, refMissing]);
  // Add the target of refOk to parsed set so it resolves
  const target = buildValidMob("anim/ok.ani", []);
  target.kind = "mob"; // intentionally mob kind even though .ani extension — we're just
  // testing ref resolution by path, not by kind. (real PVF: target would be an AniDef
  // but those don't go through validator anyway — standalone parser path.)
  // To better test, use a mob target with the .ani path though that's not realistic;
  // ref resolution checks path presence in the parsed-by-path map, not kind agreement.

  const r = validateParsedDocuments([mob, target], META);
  assert.equal(r.refIntegrity.length, 2, `H13-5: 2 refs collected (got ${r.refIntegrity.length})`);
  const resolved = r.refIntegrity.find(x => x.toPath === "anim/ok.ani");
  const missing = r.refIntegrity.find(x => x.toPath === "anim/missing.ani");
  assert.equal(resolved?.status, "resolved", `H13-5: ok.ani resolved (status=${resolved?.status})`);
  assert.equal(missing?.status, "missing", `H13-5: missing.ani missing (status=${missing?.status})`);
  assert.equal(resolved?.fromPath, "monster/test.mob", "H13-5: ref fromPath");
  assert.equal(resolved?.targetKind, "ani", "H13-5: targetKind preserved");
  console.log("[OK] H13-5: ref integrity resolved/missing detected");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-6: Tier-3 audit — local_baseline sourceType + requiresManualVerification
// ───────────────────────────────────────────────────────────────────────────
{
  const chr = {
    kind: "chr",
    path: "character/test/test.chr",
    provenance: docProv("character/test/test.chr"),
    sections: [],
    job: { value: "swordman", unit: "raw-string", provenance: fieldProv("character/test/test.chr", "job") },
    bodyImagePath: null,
    jumpPower: {
      value: 800,
      unit: "px/s",
      provenance: fieldProv("character/test/test.chr", "jump power"),
      sourceType: "local_baseline",       // ← Tier-3 trigger
      requiresManualVerification: true,
    },
    jumpSpeed: { value: 12, unit: "px/frame", provenance: fieldProv("character/test/test.chr", "jump speed") },
    moveSpeed: null,
    attackSpeed: null,
    castSpeed: null,
    weight: { value: 50, unit: "kg", provenance: fieldProv("character/test/test.chr", "weight") },
    lightResistance: null,
    darkResistance: null,
    widthBox: [10, 20, 30, 40],
    growth: {
      hpMax: { values: [100], unit: "hp", provenance: fieldProv("character/test/test.chr", "hp max") },
      mpMax: null, mpRegenSpeed: null, hitRecovery: null,
      physicalAttack: { values: [10], unit: "atk", provenance: fieldProv("character/test/test.chr", "physical attack") },
      magicalAttack: null, physicalDefense: null, magicalDefense: null, inventoryLimit: null,
    },
    moduleDamageRate: null,
    weaponHitInfo: [],
    weaponWav: [],
    weaponSkillInfo: [],
    weaponDurabilityDecreaseRate: [],
    upgradeWeaponAttackPowerRate: [],
    attackInfo: { attackBase: [], etc: [], jumpAttack: null, dashAttack: null },
    motionRefs: {},
    raw: { extractor_version: "v2.0.0", extract_timestamp: "...", path: "character/test/test.chr", type: "document", sections: [] },
  } as unknown as ChrDef;

  const r = validateParsedDocuments([chr], META);
  assert.equal(r.tier3Fields.length, 1, `H13-6: 1 tier3 field (got ${r.tier3Fields.length})`);
  const t3 = r.tier3Fields[0];
  assert.equal(t3.pvfPath, "character/test/test.chr", "H13-6: tier3 pvfPath");
  assert.equal(t3.field, "jump power", "H13-6: tier3 field = section name from provenance");
  assert.equal(t3.sourceType, "local_baseline", "H13-6: tier3 sourceType");
  assert.equal(t3.requiresManualVerification, true, "H13-6: requiresManualVerification flag");
  console.log("[OK] H13-6: Tier-3 audit catches local_baseline + manual-verify");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-7: PvP scope — AtkDef.pvpOnly true → pvpFields entry
// ───────────────────────────────────────────────────────────────────────────
{
  const pvpAtk = buildValidAtk("atk/pvp.atk", { pvpOnly: true });
  const peveAtk = buildValidAtk("atk/pve.atk", { pvpOnly: false });
  const r = validateParsedDocuments([pvpAtk, peveAtk], META);
  assert.equal(r.pvpFields.length, 1, `H13-7: 1 PvP field (got ${r.pvpFields.length})`);
  assert.equal(r.pvpFields[0].pvfPath, "atk/pvp.atk", "H13-7: PvP entry path");
  assert.equal(r.pvpFields[0].field, "pvpOnly", "H13-7: PvP entry field");
  console.log("[OK] H13-7: AtkDef.pvpOnly → PvP audit entry");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-8: PvP scope — MapDef.pvpStartArea non-zero → entry; all-zero placeholder
// is skipped (matches real-PVF convention)
// ───────────────────────────────────────────────────────────────────────────
{
  const mapWithPvp = buildValidMap("map/pvp.map", { pvpStartArea: [100, 200, 0, 0] });
  const mapPlaceholder = buildValidMap("map/placeholder.map", { pvpStartArea: [0, 0, 0, 0] });
  const r = validateParsedDocuments([mapWithPvp, mapPlaceholder], META);
  assert.equal(r.pvpFields.length, 1, `H13-8: 1 PvP map (got ${r.pvpFields.length})`);
  assert.equal(r.pvpFields[0].pvfPath, "map/pvp.map", "H13-8: real PvP map flagged");
  console.log("[OK] H13-8: placeholder all-zero pvpStartArea skipped");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-9: PvP scope — SkillDef.hasPvp=true → entry
// ───────────────────────────────────────────────────────────────────────────
{
  const skl: SkillDef = {
    kind: "skl",
    path: "skill/test/active.skl",
    provenance: docProv("skill/test/active.skl"),
    sections: [],
    name: null,
    skillType: "active",
    weaponEffectType: "physical",
    skillClass: null,
    purchaseCost: null,
    requiredLevel: null,
    requiredLevelRange: null,
    maximumLevel: null,
    durabilityDecreaseRate: null,
    growtypeMaximumLevel: null,
    skillFitnessGrowtype: null,
    hasPvp: true,
    hasDungeon: true,
    hasWarroom: false,
    hasDeathTower: false,
    autoCoolTimeApply: false,
    cancelWindow: null,
    raw: { extractor_version: "v2.0.0", extract_timestamp: "...", path: "skill/test/active.skl", type: "document", sections: [] },
  };
  const r = validateParsedDocuments([skl], META);
  assert.equal(r.pvpFields.length, 1, "H13-9: SkillDef.hasPvp captured");
  assert.equal(r.pvpFields[0].field, "hasPvp", "H13-9: field name");
  console.log("[OK] H13-9: SkillDef.hasPvp → PvP audit entry");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-10: 3-level error model — error/warning/info bucketed correctly
// EtcDef byKey/entries mismatch yields warning (not error) per code design.
// ───────────────────────────────────────────────────────────────────────────
{
  const etcWithMismatch = {
    kind: "etc",
    path: "etc/mismatch.etc",
    provenance: docProv("etc/mismatch.etc"),
    sections: [],
    entries: [{ key: "alpha", values: [1, 2], indexedValues: { 2: 1 } }],
    byKey: {},   // missing entry "alpha" → warning
    raw: {},
  };
  const r = validateParsedDocuments([etcWithMismatch as unknown as ParsedPvfDocument], META);
  assert.ok(r.stats.warnings >= 1, `H13-10: warning emitted (got ${r.stats.warnings})`);
  const w = r.warnings.find(x => x.code === "etc_bykey_missing");
  assert.ok(w !== undefined, "H13-10: etc_bykey_missing warning present");
  assert.equal(w!.level, "warning", "H13-10: level=warning (not error)");
  console.log("[OK] H13-10: 3-level error model — warning bucketing");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-11: Duplicate path detection
// ───────────────────────────────────────────────────────────────────────────
{
  const dup1 = buildValidAtk("atk/dup.atk");
  const dup2 = buildValidAtk("atk/dup.atk");
  const r = validateParsedDocuments([dup1, dup2], META);
  const dupErr = r.errors.find(e => e.code === "duplicate_path");
  assert.ok(dupErr !== undefined, "H13-11: duplicate_path detected");
  console.log("[OK] H13-11: duplicate path → error");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-12: Parse errors surfaced into report
// ───────────────────────────────────────────────────────────────────────────
{
  const r = validateParsedDocuments(
    [buildValidAtk("atk/ok.atk")],
    { ...META, parseErrors: [{ path: "broken.atk", message: "missing required section" }] },
  );
  assert.equal(r.stats.filesParsed, 1, "H13-12: filesParsed counts successful only");
  assert.equal(r.stats.filesFailed, 1, "H13-12: filesFailed counts parse errors");
  assert.equal(r.stats.filesTotal, 2, "H13-12: filesTotal = parsed + failed");
  const parseErr = r.errors.find(e => e.code === "parse_failure");
  assert.ok(parseErr !== undefined, "H13-12: parse failure surfaced as error issue");
  assert.equal(parseErr!.message, "missing required section", "H13-12: error message preserved");
  console.log("[OK] H13-12: parse errors flow into report");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-13: buildProvenanceAudit summary correctness
// ───────────────────────────────────────────────────────────────────────────
{
  // Construct a fixture with 2 Tier-3 entries across 2 files, 1 with manual-verify
  const chrLB = {
    kind: "chr",
    path: "character/lb.chr",
    provenance: docProv("character/lb.chr"),
    sections: [],
    job: { value: "j", unit: "raw-string", provenance: fieldProv("character/lb.chr", "job") },
    bodyImagePath: null,
    jumpPower: {
      value: 800,
      unit: "px/s",
      provenance: fieldProv("character/lb.chr", "jump power"),
      sourceType: "local_baseline",
      requiresManualVerification: true,
    },
    jumpSpeed: { value: 12, unit: "px/frame", provenance: fieldProv("character/lb.chr", "jump speed") },
    moveSpeed: null, attackSpeed: null, castSpeed: null,
    weight: { value: 50, unit: "kg", provenance: fieldProv("character/lb.chr", "weight") },
    lightResistance: null, darkResistance: null,
    widthBox: [],
    growth: {
      hpMax: { values: [100], unit: "hp", provenance: fieldProv("character/lb.chr", "hp max") },
      mpMax: null, mpRegenSpeed: null, hitRecovery: null,
      physicalAttack: { values: [10], unit: "atk", provenance: fieldProv("character/lb.chr", "physical attack") },
      magicalAttack: null, physicalDefense: null, magicalDefense: null, inventoryLimit: null,
    },
    moduleDamageRate: null, weaponHitInfo: [], weaponWav: [], weaponSkillInfo: [],
    weaponDurabilityDecreaseRate: [], upgradeWeaponAttackPowerRate: [],
    attackInfo: { attackBase: [], etc: [], jumpAttack: null, dashAttack: null },
    motionRefs: {},
    raw: { extractor_version: "v2.0.0", extract_timestamp: "...", path: "character/lb.chr", type: "document", sections: [] },
  };
  const r = validateParsedDocuments([chrLB as unknown as ParsedPvfDocument], META);
  const audit = buildProvenanceAudit(r);
  assert.equal(audit.summary.tier3Count, 1, "H13-13: tier3Count");
  assert.equal(audit.summary.filesWithTier3, 1, "H13-13: filesWithTier3");
  assert.equal(audit.summary.requiresManualVerificationCount, 1, "H13-13: requiresManualVerificationCount");
  assert.equal(audit.meta.runId, META.runId, "H13-13: meta echoed");
  assert.equal(audit.tier3Fields.length, 1, "H13-13: tier3Fields array");
  console.log("[OK] H13-13: buildProvenanceAudit summary correct");
}

// ───────────────────────────────────────────────────────────────────────────
// Summary
// ───────────────────────────────────────────────────────────────────────────
console.log("");
console.log("H13 VALIDATE L2 probes: all assertions passed (13 cases)");
