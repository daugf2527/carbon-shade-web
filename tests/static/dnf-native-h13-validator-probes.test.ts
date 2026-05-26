/**
 * Head 13 probe suite — VALIDATE L2 (validator.ts).
 *
 * Covers:
 *   - Happy-path: empty parsed → 0 errors; valid mini fixture → 0 errors;
 *     report meta + stats consistent
 *   - Schema rejection: corrupt def (wrong kind / missing required) → error issue
 *   - Ref integrity: resolved + missing cases reported with correct status
 *   - Tier-3 audit: PvfFact with sourceType="tier3" or
 *     requiresManualVerification=true → tier3Fields entry
 *   - PvP scope: AtkDef.pvpOnly / SkillDef.hasPvp / MapDef.pvpStartArea
 *     non-zero → pvpFields entry
 *   - 3-level error model: error vs warning vs info bucketing
 *   - buildProvenanceAudit summary correctness
 *   - Zod schema-driven deep probes (H13-14+): nested PvfFact/PvfVectorFact
 *     type errors, enum-field violations, multi-issue aggregation, tier-2
 *     vs tier-3 walker selectivity, and ref/tier subsystem coexistence.
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
    // Phase 3 (2026-05-26): new MobDef fields for the 8 sections all 5/5
    // verified goblin mobs carry. Default to null here since these probes
    // exercise the VALIDATOR's schema/provenance/ref walkers — the actual
    // section content is irrelevant for H13.
    weightDual: null,
    abilityCategory: null,
    level: null,
    attackDelay: null,
    moveSpeed: null,
    hitRecovery: null,
    widthBox: null,
    stuckbonusOnDamage: null,
    attackKind: null,
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
  // Audit F5 test-effectiveness (2026-05-24): add schema-independent oracles
  // so changes to ChrSchema fields don't silently invalidate this probe.
  assert.equal(r.stats.warnings, 0, "H13-2: 0 warnings (schema-independent oracle)");
  assert.equal(r.stats.filesFailed, 0, "H13-2: 0 upstream parse failures");
  assert.equal(r.refIntegrity.length, 0, "H13-2: standalone atk has no refs to walk");
  console.log("[OK] H13-2: valid AtkDef passes clean (with cross-validation oracles)");
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
      sourceType: "tier3",       // ← Tier-3 trigger
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
  assert.equal(t3.sourceType, "tier3", "H13-6: tier3 sourceType");
  assert.equal(t3.requiresManualVerification, true, "H13-6: requiresManualVerification flag");
  // Audit F10 test-effectiveness DRIFT (2026-05-24): the assertion above
  // checks `t3.field === "jump power"` but "jump power" was hand-set by the
  // fixture into provenance.sectionName — the walker just echoes it. Add
  // cross-validation that's NOT an echo: confirm jumpSpeed (sibling field
  // with tier1 default) does NOT appear in tier3Fields, proving the walker
  // discriminates and isn't merely listing every provenance.sectionName.
  const t3FieldNames = r.tier3Fields.map(t => t.field);
  assert.ok(
    !t3FieldNames.includes("jump speed"),
    `H13-6: sibling tier1 jumpSpeed must NOT appear in tier3Fields (got ${JSON.stringify(t3FieldNames)})`,
  );
  assert.ok(
    !t3FieldNames.includes("weight"),
    `H13-6: sibling tier1 weight must NOT appear in tier3Fields`,
  );
  console.log("[OK] H13-6: Tier-3 audit catches local_baseline + manual-verify (selectivity verified)");
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
    command: null, coolTime: null, consumeMp: null, castingTime: null,
    levelProperty: null, levelInfo: null, preRequiredSkill: null,
    featureSkillIndex: null, icon: null, consumeItem: null,
    maintainMp: null, skillCommandAdvantage: null,
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
      sourceType: "tier3",
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

// ═══════════════════════════════════════════════════════════════════════════
// Zod schema-driven deep probes (H13-14 onward)
//
// The hand-rolled validator only checked top-level field PRESENCE (isObject,
// isArray, isBoolean). Zod schemas validate the FULL PvfFact / PvfRef shape
// recursively, so these probes verify the new validator catches the deep
// violations the hand-rolled version was blind to.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimal-valid ChrDef builder. Mirrors the H13-6/13 chr fixtures but lets
 * callers override individual fields to inject schema violations.
 */
function buildValidChr(p: string, overrides: Record<string, unknown> = {}): ChrDef {
  const base = {
    kind: "chr",
    path: p,
    provenance: docProv(p),
    sections: [],
    job: { value: "swordman", unit: "raw-string", provenance: fieldProv(p, "job") },
    bodyImagePath: null,
    jumpPower: { value: 800, unit: "px/s", provenance: fieldProv(p, "jump power") },
    jumpSpeed: { value: 12, unit: "px/frame", provenance: fieldProv(p, "jump speed") },
    moveSpeed: null, attackSpeed: null, castSpeed: null,
    weight: { value: 50, unit: "kg", provenance: fieldProv(p, "weight") },
    lightResistance: null, darkResistance: null,
    widthBox: [10, 20, 30, 40],
    growth: {
      hpMax: { values: [100], unit: "hp", provenance: fieldProv(p, "hp max") },
      mpMax: null, mpRegenSpeed: null, hitRecovery: null,
      physicalAttack: { values: [10], unit: "atk", provenance: fieldProv(p, "physical attack") },
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
    raw: { extractor_version: "v2.0.0", extract_timestamp: "...", path: p, type: "document", sections: [] },
    ...overrides,
  };
  return base as unknown as ChrDef;
}

// ───────────────────────────────────────────────────────────────────────────
// H13-14: ChrDef.jumpPower.value is string (not number) → Zod catches the
// nested type error that the hand-rolled isObject() check was blind to.
// ───────────────────────────────────────────────────────────────────────────
{
  const p = "character/h13-14.chr";
  const chr = buildValidChr(p, {
    // value is "800" string instead of 800 number — schema must reject.
    jumpPower: { value: "800", unit: "px/s", provenance: fieldProv(p, "jump power") },
  });
  const r = validateParsedDocuments([chr], META);
  const err = r.errors.find(e => e.code === "missing_jump_power");
  assert.ok(err !== undefined, `H13-14: missing_jump_power emitted for nested string value (errors=${r.errors.map(e => e.code).join(",")})`);
  // The field path should surface the nested location for debugging.
  assert.ok(err!.field.startsWith("jumpPower"), `H13-14: field path points at jumpPower (got "${err!.field}")`);
  console.log("[OK] H13-14: nested PvfFact.value type error caught by Zod schema");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-15: ChrDef.jumpPower.provenance missing required `extractorVersion`
// field. Hand-rolled validator only verified provenance was an object — the
// Zod schema must walk into ParsedFieldProvenance and demand all required
// keys.
// ───────────────────────────────────────────────────────────────────────────
{
  const p = "character/h13-15.chr";
  const chr = buildValidChr(p, {
    jumpPower: {
      value: 800,
      unit: "px/s",
      provenance: {
        // extractorVersion intentionally omitted
        extractTimestamp: "2026-05-23T16:00:00Z",
        sourceRef: `pvf:${p}`,
        sourcePvfHash: "h13-fake",
        sectionName: "jump power",
      },
    },
  });
  const r = validateParsedDocuments([chr], META);
  const err = r.errors.find(e => e.code === "missing_jump_power");
  assert.ok(err !== undefined, `H13-15: provenance.extractorVersion missing caught (errors=${r.errors.map(e => e.code).join(",")})`);
  // Audit F2 (test-effectiveness, 2026-05-24): the original assertion only
  // checked that the top-level "missing_jump_power" code fired, which would
  // also fire if jumpPower itself were absent. To actually prove Zod
  // descended into the nested provenance object, assert the issue's field
  // path mentions the nested key.
  assert.ok(
    err!.field.includes("provenance") && err!.field.includes("extractorVersion"),
    `H13-15: error field path must reference nested provenance.extractorVersion ` +
    `(got "${err!.field}"). Zod schema must walk into ParsedFieldProvenance.`,
  );
  console.log("[OK] H13-15: nested provenance.extractorVersion missing caught by Zod (field path verified)");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-16: Tier-3 walker treats sourceType="tier3" (any non-tier1/2)
// as Tier-3. This is independent of Zod (walker is hand-rolled) but
// confirms the walker still works after the schema refactor.
// D2 fix (2026-05-24): previously tested with sourceType="experimental"
// (the schema's 4th-tier value), now collapsed away. tier3 is the only
// non-tier1/2 value the schema accepts; this test now confirms it triggers
// the walker exactly like the historical local_baseline value did.
// ───────────────────────────────────────────────────────────────────────────
{
  const p = "character/h13-16.chr";
  const chr = buildValidChr(p, {
    jumpPower: {
      value: 800,
      unit: "px/s",
      provenance: fieldProv(p, "jump power"),
      sourceType: "tier3",   // ← not tier1/2 → Tier-3 by walker rule
      requiresManualVerification: false,
    },
  });
  const r = validateParsedDocuments([chr], META);
  assert.equal(r.tier3Fields.length, 1, `H13-16: 1 Tier-3 entry (got ${r.tier3Fields.length})`);
  assert.equal(r.tier3Fields[0].sourceType, "tier3", "H13-16: sourceType preserved");
  assert.equal(r.tier3Fields[0].requiresManualVerification, false, "H13-16: requiresManualVerification=false honoured");
  console.log("[OK] H13-16: walker treats any non-tier1/2 as Tier-3");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-17: ChrDef.growth.hpMax.values is not number[] → schema invalidates
// the deep PvfVectorFact shape.
// ───────────────────────────────────────────────────────────────────────────
{
  const p = "character/h13-17.chr";
  const chr = buildValidChr(p, {
    growth: {
      // values is string array, not number array
      hpMax: { values: ["100"], unit: "hp", provenance: fieldProv(p, "hp max") },
      mpMax: null, mpRegenSpeed: null, hitRecovery: null,
      physicalAttack: { values: [10], unit: "atk", provenance: fieldProv(p, "physical attack") },
      magicalAttack: null, physicalDefense: null, magicalDefense: null, inventoryLimit: null,
    },
  });
  const r = validateParsedDocuments([chr], META);
  const err = r.errors.find(e => e.code === "missing_growth");
  assert.ok(err !== undefined, `H13-17: missing_growth (nested PvfVectorFact values type) caught (errors=${r.errors.map(e => e.code).join(",")})`);
  assert.ok(err!.field.includes("hpMax"), `H13-17: field path points into growth.hpMax (got "${err!.field}")`);
  console.log("[OK] H13-17: PvfVectorFact.values type validated deeply");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-18: AtkDef.attackKind="weird" — unknown enum value → invalid_attack_kind
// ───────────────────────────────────────────────────────────────────────────
{
  const broken = buildValidAtk("atk/h13-18.atk", { attackKind: "weird" as unknown as "physic" });
  const r = validateParsedDocuments([broken], META);
  const err = r.errors.find(e => e.code === "invalid_attack_kind");
  assert.ok(err !== undefined, `H13-18: invalid_attack_kind for unknown enum (errors=${r.errors.map(e => e.code).join(",")})`);
  assert.equal(err!.pvfPath, "atk/h13-18.atk", "H13-18: error tags correct path");
  console.log("[OK] H13-18: AtkDef.attackKind unknown enum → invalid_attack_kind");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-19: AtkDef.hitReaction unknown value → invalid_hit_reaction
// ───────────────────────────────────────────────────────────────────────────
{
  const broken = buildValidAtk("atk/h13-19.atk", { hitReaction: "weird" as unknown as "none" });
  const r = validateParsedDocuments([broken], META);
  const err = r.errors.find(e => e.code === "invalid_hit_reaction");
  assert.ok(err !== undefined, `H13-19: invalid_hit_reaction for unknown enum (errors=${r.errors.map(e => e.code).join(",")})`);
  console.log("[OK] H13-19: AtkDef.hitReaction unknown enum → invalid_hit_reaction");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-20: SkillDef.skillType unknown value → invalid_skill_type
// ───────────────────────────────────────────────────────────────────────────
{
  const skl: SkillDef = {
    kind: "skl",
    path: "skill/h13-20.skl",
    provenance: docProv("skill/h13-20.skl"),
    sections: [],
    name: null,
    skillType: "weird" as unknown as "active",   // ← invalid enum
    weaponEffectType: "physical",
    skillClass: null,
    purchaseCost: null,
    requiredLevel: null,
    requiredLevelRange: null,
    maximumLevel: null,
    durabilityDecreaseRate: null,
    growtypeMaximumLevel: null,
    skillFitnessGrowtype: null,
    hasPvp: false,
    hasDungeon: false,
    hasWarroom: false,
    hasDeathTower: false,
    autoCoolTimeApply: false,
    cancelWindow: null,
    command: null, coolTime: null, consumeMp: null, castingTime: null,
    levelProperty: null, levelInfo: null, preRequiredSkill: null,
    featureSkillIndex: null, icon: null, consumeItem: null,
    maintainMp: null, skillCommandAdvantage: null,
    raw: { extractor_version: "v2.0.0", extract_timestamp: "...", path: "skill/h13-20.skl", type: "document", sections: [] },
  };
  const r = validateParsedDocuments([skl], META);
  const err = r.errors.find(e => e.code === "invalid_skill_type");
  assert.ok(err !== undefined, `H13-20: invalid_skill_type emitted (errors=${r.errors.map(e => e.code).join(",")})`);
  console.log("[OK] H13-20: SkillDef.skillType unknown enum → invalid_skill_type");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-21: MapDef.pvpStartArea is not an array → missing_pvp_start_area
// ───────────────────────────────────────────────────────────────────────────
{
  // Override pvpStartArea with a non-array value.
  const broken = buildValidMap("map/h13-21.map", { pvpStartArea: 42 as unknown as number[] });
  const r = validateParsedDocuments([broken], META);
  const err = r.errors.find(e => e.code === "missing_pvp_start_area");
  assert.ok(err !== undefined, `H13-21: missing_pvp_start_area emitted (errors=${r.errors.map(e => e.code).join(",")})`);
  console.log("[OK] H13-21: MapDef.pvpStartArea non-array → missing_pvp_start_area");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-22: Aggregate failure — one doc with multiple schema violations.
// Zod returns ALL issues in one safeParse pass, so the validator must
// emit one ValidationIssue per Zod issue (not stop at the first error).
//
// Audit F4 test-effectiveness (2026-05-24): the error code strings asserted
// below ARE the validator's stable wire format. Each maps the schema's
// top-level field to a snake_case code via mapIssueToCode + FIELD_CODE_OVERRIDES
// in validator.ts. Renaming any code here is a contract break for downstream
// tooling (analyze.mjs aggregators, completion gates, alert rules). Update
// docs/changelog/ + audit the consumers before changing.
// ───────────────────────────────────────────────────────────────────────────
{
  const broken = buildValidAtk("atk/h13-22.atk", {
    attackKind: "weird" as unknown as "physic",
    hitReaction: "garbage" as unknown as "none",
    attackEnemy: "true" as unknown as boolean,   // wrong type
  });
  const r = validateParsedDocuments([broken], META);
  const codes = new Set(r.errors.map(e => e.code));
  assert.ok(codes.has("invalid_attack_kind"), `H13-22: invalid_attack_kind in codes (got ${[...codes].join(",")})`);
  assert.ok(codes.has("invalid_hit_reaction"), `H13-22: invalid_hit_reaction in codes (got ${[...codes].join(",")})`);
  assert.ok(codes.has("missing_attack_enemy"), `H13-22: missing_attack_enemy in codes (got ${[...codes].join(",")})`);
  assert.ok(r.stats.errors >= 3, `H13-22: ≥3 errors aggregated in single safeParse (got ${r.stats.errors})`);
  console.log("[OK] H13-22: Zod aggregates multiple schema violations per doc");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-23: Tier-3 walker MUST NOT flag sourceType="tier2" entries.
// Confirms the walker is selective (tier1/tier2 are first-class, only
// other tiers + requiresManualVerification trip the audit).
// ───────────────────────────────────────────────────────────────────────────
{
  const p = "character/h13-23.chr";
  const chr = buildValidChr(p, {
    jumpPower: {
      value: 800,
      unit: "px/s",
      provenance: fieldProv(p, "jump power"),
      sourceType: "tier2",                  // Neople API / wiki — not Tier-3
      requiresManualVerification: false,
    },
  });
  const r = validateParsedDocuments([chr], META);
  assert.equal(r.tier3Fields.length, 0, `H13-23: tier2 entries NOT flagged as Tier-3 (got ${r.tier3Fields.length})`);
  // Audit F8 test-effectiveness (2026-05-24): also assert by-content (not
  // just by-length) — even if tier3Fields had unrelated entries, the tier2
  // jumpPower specifically must NOT be in there. Catches a regression where
  // the walker length stays 0 but the wrong field is filtered.
  assert.ok(
    !r.tier3Fields.some(t => t.pvfPath === p && t.field === "jump power"),
    "H13-23: tier2 jumpPower must NOT appear by name in tier3Fields",
  );
  console.log("[OK] H13-23: sourceType=tier2 not surfaced in Tier-3 audit (content + length verified)");
}

// ───────────────────────────────────────────────────────────────────────────
// H13-24: Nested-evidence integration. A mob references an .ani that's not
// in the parsed set (→ refIntegrity.status="missing"); the same mob also
// has `warlike` as a tier1 PvfFact (not Tier-3). Confirms both subsystems
// work in concert without bleed-over.
// ───────────────────────────────────────────────────────────────────────────
{
  const p = "monster/h13-24.mob";
  const mob: MobDef = {
    kind: "mob",
    path: p,
    provenance: docProv(p),
    sections: [],
    name: null,
    warlike: {
      value: 100,
      unit: "raw",
      provenance: fieldProv(p, "warlike"),
      sourceType: "tier1",   // explicit tier1 → not Tier-3
      requiresManualVerification: false,
    },
    sight: null,
    weight: null,
    hpMax: null,
    // Phase 3 (2026-05-26): new MobDef fields, all null for this Tier-3
    // probe (which exercises warlike sourceType + missing-ref reporting).
    weightDual: null,
    abilityCategory: null,
    level: null,
    attackDelay: null,
    moveSpeed: null,
    hitRecovery: null,
    widthBox: null,
    stuckbonusOnDamage: null,
    attackKind: null,
    attackInfo: [],
    animationRefs: [
      { targetKind: "ani", targetPath: "anim/h13-24-missing.ani", raw: "anim/h13-24-missing.ani" },
    ],
    category: [],
    raw: { extractor_version: "v2.0.0", extract_timestamp: "...", path: p, type: "document", sections: [] },
  };
  const r = validateParsedDocuments([mob], META);
  // No schema errors expected.
  assert.equal(r.stats.errors, 0, `H13-24: clean schema (got errors=${r.errors.map(e => e.code).join(",")})`);
  // Ref must be reported as missing.
  assert.equal(r.refIntegrity.length, 1, "H13-24: 1 ref collected");
  assert.equal(r.refIntegrity[0].status, "missing", "H13-24: anim missing");
  // Tier-3 walker must NOT flag the explicit tier1 warlike.
  assert.equal(r.tier3Fields.length, 0, `H13-24: tier1 PvfFact not flagged as Tier-3 (got ${r.tier3Fields.length})`);
  console.log("[OK] H13-24: nested ref-missing + tier1-PvfFact coexist cleanly");
}

// ───────────────────────────────────────────────────────────────────────────
// Summary
// ───────────────────────────────────────────────────────────────────────────
console.log("");
console.log("H13 VALIDATE L2 probes: all assertions passed (24 cases)");
