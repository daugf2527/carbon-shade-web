/**
 * Head 15 probe suite — EXPORT (RuntimeExporter.ts).
 *
 * Covers:
 *   - Entity classification: chr → player shard; mob → monster shard;
 *     dgn → dungeon shard
 *   - Sub-doc inlining: skill/<job>/*.skl into players/<job>.json,
 *     character/<job>/attackinfo/*.atk inlined under attacks
 *   - PvP scope filter: AtkDef.pvpOnly=true → omitted; MapDef.pvpStartArea
 *     cleared in dungeon-included maps
 *   - Manifest correctness: sha256 + sizeBytes + kind per file; manifest.json
 *     itself written
 *   - shared/ shards: physics + enums written when supplied
 *
 * Uses tmp directory for output; cleans up.
 *
 * Exit policy: BASELINE_BUGS=0, exits 1 on any unexpected outcome.
 */

export const BASELINE_BUGS = 0;

import { mkdir, rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assert } from "./test-utils.js";
import { exportRuntimeShards, SHAPE_VERSION, TIMESTAMP_KEYS as SUT_TIMESTAMP_KEYS } from "../../src/dnf-native-combat/data/exporter/RuntimeExporter.js";
import type { AtkDef } from "../../src/dnf-native-combat/data/types/AtkDef.js";
import type { ChrDef } from "../../src/dnf-native-combat/data/types/ChrDef.js";
import type { MobDef } from "../../src/dnf-native-combat/data/types/MobDef.js";
import type { SkillDef } from "../../src/dnf-native-combat/data/types/SklDef.js";
import type { MapDef } from "../../src/dnf-native-combat/data/types/MapDef.js";
import type { DungeonDef } from "../../src/dnf-native-combat/data/types/DgnDef.js";
import type { ParsedPvfDocument } from "../../src/dnf-native-combat/data/pipeline/parseStage.js";
import type { ExtractedDocumentProvenance, ParsedFieldProvenance } from "../../src/dnf-native-combat/data/types/Provenance.js";

function docProv(p: string): ExtractedDocumentProvenance {
  return { extractorVersion: "v2.0.0", extractTimestamp: "2026-05-23T17:00:00Z", sourceRef: `pvf:${p}`, sourcePvfHash: "h15-fake" };
}
function fieldProv(p: string, sn: string): ParsedFieldProvenance {
  return { ...docProv(p), sectionName: sn };
}

const FAKE_DOC = (p: string) => ({ extractor_version: "v2.0.0", extract_timestamp: "...", path: p, type: "document" as const, sections: [] });

function chrFixture(path: string, job: string): ChrDef {
  return {
    kind: "chr", path,
    provenance: docProv(path),
    sections: [],
    job: { value: job, unit: "raw-string", provenance: fieldProv(path, "job") },
    bodyImagePath: null,
    jumpPower: { value: 430, unit: "ambiguous", provenance: fieldProv(path, "jump power") },
    jumpSpeed: { value: 12, unit: "int", provenance: fieldProv(path, "jump speed") },
    moveSpeed: null, attackSpeed: null, castSpeed: null,
    weight: { value: 68000, unit: "audio-only", provenance: fieldProv(path, "weight") },
    lightResistance: null, darkResistance: null,
    widthBox: [],
    growth: {
      hpMax: { values: [100], unit: "hp", provenance: fieldProv(path, "hp max") },
      mpMax: null, mpRegenSpeed: null, hitRecovery: null,
      physicalAttack: { values: [10], unit: "atk", provenance: fieldProv(path, "physical attack") },
      magicalAttack: null, physicalDefense: null, magicalDefense: null, inventoryLimit: null,
    },
    moduleDamageRate: null, weaponHitInfo: [], weaponWav: [], weaponSkillInfo: [],
    weaponDurabilityDecreaseRate: [], upgradeWeaponAttackPowerRate: [],
    attackInfo: { attackBase: [], etc: [], jumpAttack: null, dashAttack: null },
    motionRefs: {},
    awakening: { skillSlots: [], names: null, tier1SlotCounts: [], tier2SlotCounts: [] },
    raw: FAKE_DOC(path),
  };
}

function atkFixture(path: string, pvpOnly = false): AtkDef {
  return {
    kind: "atk", path,
    provenance: docProv(path), sections: [],
    liftUp: null, pushAside: null, damageBonus: null,
    attackEnemy: true, attackFriend: false, weaponDamageApply: true,
    attackKind: "physic", element: "none", hitReaction: "none",
    causesDown: false, causesStun: false, causesBounce: false, causesStuck: false,
    pvpOnly, ignoreWeight: false, hitWav: null, knuckBack: null,
    raw: FAKE_DOC(path),
  };
}

function sklFixture(path: string): SkillDef {
  return {
    kind: "skl", path,
    provenance: docProv(path), sections: [],
    name: null, skillType: "active", weaponEffectType: "physical",
    skillClass: null, purchaseCost: null, requiredLevel: null,
    requiredLevelRange: null, maximumLevel: null, durabilityDecreaseRate: null,
    growtypeMaximumLevel: null, skillFitnessGrowtype: null,
    hasPvp: false, hasDungeon: true, hasWarroom: false, hasDeathTower: false,
    autoCoolTimeApply: false, cancelWindow: null,
    command: null, coolTime: null, consumeMp: null, castingTime: null,
    levelProperty: null, levelInfo: null, preRequiredSkill: null,
    featureSkillIndex: null, icon: null, consumeItem: null,
    maintainMp: null, skillCommandAdvantage: null,
    raw: FAKE_DOC(path),
  };
}

function mobFixture(path: string): MobDef {
  return {
    kind: "mob", path,
    provenance: docProv(path), sections: [],
    name: null, warlike: null, sight: null, weight: null, hpMax: null,
    // Phase 3 (2026-05-26): new MobDef fields for the 8 sections all 5/5
    // verified goblin mobs carry. Defaults to null in the H15 fixture since
    // these probes exercise the EXPORT layer's entity classification —
    // mob-section content is irrelevant here.
    weightDual: null, abilityCategory: null, level: null, attackDelay: null,
    moveSpeed: null, hitRecovery: null, widthBox: null, stuckbonusOnDamage: null,
    attackKind: null,
    attackInfo: [], animationRefs: [], category: [],
    raw: FAKE_DOC(path),
  };
}

function mapFixture(path: string, pvpStartArea: number[] = []): MapDef {
  return {
    kind: "map", path,
    provenance: docProv(path), sections: [],
    name: null, mapType: null, dungeonId: null,
    nearSightScroll: null, middleSightScroll: null, farSightScroll: null,
    tiles: [], playerNumber: [], sounds: [], monsterAiHints: [],
    eventMonsterPositions: [], pathgatePos: [], pvpStartArea,
    monsterSpawns: [], passiveObjects: [], specialPassiveObjects: [],
    animationRefs: [], backgroundAnimation: [], greed: null,
    raw: FAKE_DOC(path),
  };
}

function dgnFixture(path: string): DungeonDef {
  return {
    kind: "dgn", path,
    provenance: docProv(path), sections: [],
    name: null, explain: null,
    basisLevel: null, minimumRequiredLevel: null, experienceIncreasingPoint: null,
    backgroundPos: null, startMap: null, bossMap: null, size: null,
    mapSpecification: null, enteringTitleRefs: [], imageRefs: [],
    championLevels: null, pathgateObjects: null, eventMonsters: null,
    greedLayout: null, worldmapPatternInfo: null, raw: {},
  };
}

// Recursively rewrites every timestamp-bearing field (`extractTimestamp` —
// camelCase from parsed defs; `extract_timestamp` — snake_case from raw
// PvfDocument) within the parsed doc to `newTs`. Used by H15-9/H15-10 to
// simulate a re-extraction where only the timestamps changed but the
// semantic content is identical. Mutates in place and returns the same
// reference for chaining (each call constructs a fresh fixture so cross-
// test bleed is impossible).
//
// Audit F3 (test-effectiveness, 2026-05-28): the key set is imported from
// the SUT (RuntimeExporter.TIMESTAMP_KEYS) so the two strippers are
// guaranteed in sync. Adding a new timestamp key to the SUT automatically
// widens this helper, eliminating the previous mirror-coded drift risk
// where a SUT-only addition would silently bypass the simulated
// re-extraction.
function stampExtractTimestamps<T>(doc: T, newTs: string): T {
  const walk = (v: unknown): void => {
    if (v === null || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const item of v) walk(item); return; }
    const obj = v as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (SUT_TIMESTAMP_KEYS.has(key) && typeof obj[key] === "string") {
        obj[key] = newTs;
      } else {
        walk(obj[key]);
      }
    }
  };
  walk(doc);
  return doc;
}

// ───────────────────────────────────────────────────────────────────────────
// Setup tmp output dir
// ───────────────────────────────────────────────────────────────────────────
const OUT_DIR = join(tmpdir(), `h15-export-${Date.now()}`);
await mkdir(OUT_DIR, { recursive: true });

// ───────────────────────────────────────────────────────────────────────────
// H15-1: Happy path — player shard composed from chr + skl + atk
// ───────────────────────────────────────────────────────────────────────────
{
  const parsed: ParsedPvfDocument[] = [
    chrFixture("character/swordman/swordman.chr", "swordman"),
    sklFixture("skill/swordman/upperslash.skl"),
    sklFixture("skill/swordman/triple.skl"),
    atkFixture("character/swordman/attackinfo/attack1.atk"),
    atkFixture("character/swordman/attackinfo/attack2.atk"),
  ];
  const subOut = join(OUT_DIR, "happy");
  const result = await exportRuntimeShards({
    outDir: subOut,
    parsed,
    meta: { pvfHash: "h15-fake", extractorVersion: "v2.0.0", exportedAt: "2026-05-23T17:00:00Z" },
  });

  // 1 player shard + manifest = 2 files written
  assert.equal(result.filesWritten, 2, `H15-1: filesWritten=2 (1 player + manifest); got ${result.filesWritten}`);

  const shardPath = join(subOut, "players", "swordman.json");
  const shard = JSON.parse(await readFile(shardPath, "utf-8")) as Record<string, unknown>;
  assert.equal(shard.shape_version, SHAPE_VERSION, "H15-1: shape_version on player");
  assert.equal(shard.job, "swordman", "H15-1: job entity id");
  assert.equal((shard.chr as { path: string }).path, "character/swordman/swordman.chr", "H15-1: chr inlined");
  const skills = shard.skills as Record<string, unknown>;
  assert.equal(Object.keys(skills).length, 2, `H15-1: 2 skills inlined (got ${Object.keys(skills).length})`);
  assert.ok("upperslash" in skills, "H15-1: skill keyed by basename");
  const attacks = shard.attacks as Record<string, unknown>;
  assert.equal(Object.keys(attacks).length, 2, `H15-1: 2 attacks inlined (got ${Object.keys(attacks).length})`);
  console.log("[OK] H15-1: player shard composed correctly");
}

// ───────────────────────────────────────────────────────────────────────────
// H15-2: PvP scope — AtkDef.pvpOnly=true is omitted from runtime shard
// ───────────────────────────────────────────────────────────────────────────
{
  const parsed: ParsedPvfDocument[] = [
    chrFixture("character/test/test.chr", "test"),
    atkFixture("character/test/attackinfo/normal.atk", false),
    atkFixture("character/test/attackinfo/pvp_only.atk", true),
  ];
  const subOut = join(OUT_DIR, "pvp");
  await exportRuntimeShards({
    outDir: subOut,
    parsed,
    meta: { pvfHash: "h15-fake", extractorVersion: "v2.0.0", exportedAt: "2026-05-23T17:00:00Z" },
  });
  const shard = JSON.parse(await readFile(join(subOut, "players", "test.json"), "utf-8")) as { attacks: Record<string, unknown> };
  assert.ok("normal" in shard.attacks, "H15-2: normal atk included");
  assert.ok(!("pvp_only" in shard.attacks), `H15-2: pvp_only atk OMITTED (keys: ${Object.keys(shard.attacks).join(",")})`);
  console.log("[OK] H15-2: PvP-only attacks omitted from runtime");
}

// ───────────────────────────────────────────────────────────────────────────
// H15-3: Monster shard — mob + monster-folder attacks composed
// ───────────────────────────────────────────────────────────────────────────
{
  const parsed: ParsedPvfDocument[] = [
    mobFixture("monster/goblin/goblin.mob"),
    atkFixture("monster/goblin/attackinfo/bite.atk"),
    // Wrong-folder atk shouldn't be picked up
    atkFixture("monster/orc/attackinfo/bite.atk"),
  ];
  const subOut = join(OUT_DIR, "monster");
  await exportRuntimeShards({
    outDir: subOut,
    parsed,
    meta: { pvfHash: "h15-fake", extractorVersion: "v2.0.0", exportedAt: "2026-05-23T17:00:00Z" },
  });
  const shard = JSON.parse(await readFile(join(subOut, "monsters", "goblin.json"), "utf-8")) as { mob: { path: string }; attacks: Record<string, unknown> };
  assert.equal(shard.mob.path, "monster/goblin/goblin.mob", "H15-3: mob path");
  assert.equal(Object.keys(shard.attacks).length, 1, "H15-3: only goblin/attackinfo/* picked up");
  assert.ok("bite" in shard.attacks, "H15-3: goblin bite included");
  console.log("[OK] H15-3: monster shard composed correctly");
}

// ───────────────────────────────────────────────────────────────────────────
// H15-4: Dungeon shard — dgn + maps under same id + pvpStartArea cleared
// ───────────────────────────────────────────────────────────────────────────
{
  const parsed: ParsedPvfDocument[] = [
    dgnFixture("dungeon/grimseeker/grimseeker.dgn"),
    mapFixture("map/grimseeker/start.map", [10, 20]),  // non-zero PvP — should clear
    mapFixture("map/grimseeker/boss.map", [0, 0]),
    mapFixture("map/otherdungeon/foo.map"),             // should NOT be in grimseeker
  ];
  const subOut = join(OUT_DIR, "dungeon");
  await exportRuntimeShards({
    outDir: subOut,
    parsed,
    meta: { pvfHash: "h15-fake", extractorVersion: "v2.0.0", exportedAt: "2026-05-23T17:00:00Z" },
  });
  const shard = JSON.parse(await readFile(join(subOut, "dungeons", "grimseeker.json"), "utf-8")) as { maps: Array<{ path: string; pvpStartArea: number[] }> };
  assert.equal(shard.maps.length, 2, `H15-4: 2 maps included (got ${shard.maps.length})`);
  assert.ok(shard.maps.every(m => m.path.startsWith("map/grimseeker/")), "H15-4: only matching dungeon maps");
  assert.ok(shard.maps.every(m => m.pvpStartArea.length === 0), `H15-4: pvpStartArea cleared (got ${shard.maps.map(m => m.pvpStartArea.length)})`);
  console.log("[OK] H15-4: dungeon shard + PvP map field cleared");
}

// ───────────────────────────────────────────────────────────────────────────
// H15-5: Manifest correctness — sha256 hex + sizeBytes + kind per entry
// ───────────────────────────────────────────────────────────────────────────
{
  const parsed: ParsedPvfDocument[] = [chrFixture("character/test/test.chr", "test")];
  const subOut = join(OUT_DIR, "manifest");
  const result = await exportRuntimeShards({
    outDir: subOut,
    parsed,
    meta: { pvfHash: "h15-fake", extractorVersion: "v2.0.0", exportedAt: "2026-05-23T17:00:00Z" },
  });

  const manifestPath = result.manifestPath;
  const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as {
    manifest_version: string;
    exported_at: string;
    pvf_hash: string;
    extractor_version: string;
    files: Array<{ path: string; sha256: string; sizeBytes: number; kind: string; shape_version: string }>;
  };

  assert.equal(manifest.manifest_version, "1.0.0", "H15-5: manifest_version");
  assert.equal(manifest.pvf_hash, "h15-fake", "H15-5: pvf_hash echoed");
  assert.equal(manifest.files.length, 1, "H15-5: 1 file in manifest (1 player only)");
  const entry = manifest.files[0];
  assert.equal(entry.path, "players/test.json", "H15-5: file path relative to outDir");
  assert.equal(entry.kind, "player", "H15-5: kind classified");
  assert.equal(entry.shape_version, SHAPE_VERSION, "H15-5: shape_version on entry");
  assert.ok(/^[0-9a-f]{64}$/.test(entry.sha256), `H15-5: sha256 is 64-char hex (got ${entry.sha256})`);
  assert.ok(entry.sizeBytes > 0, `H15-5: sizeBytes > 0 (got ${entry.sizeBytes})`);

  // Cross-check against actual file
  const actualStat = await stat(join(subOut, entry.path));
  assert.equal(entry.sizeBytes, actualStat.size, "H15-5: manifest sizeBytes matches stat");
  console.log("[OK] H15-5: manifest correctness");
}

// ───────────────────────────────────────────────────────────────────────────
// H15-6: shared/ shards — physics + enums written when supplied
// ───────────────────────────────────────────────────────────────────────────
{
  const parsed: ParsedPvfDocument[] = [chrFixture("character/x/x.chr", "x")];
  const subOut = join(OUT_DIR, "shared");
  const result = await exportRuntimeShards({
    outDir: subOut,
    parsed,
    meta: { pvfHash: null, extractorVersion: null, exportedAt: "2026-05-23T17:00:00Z" },
    sharedPhysics: { gravity: -1500, fooConst: 4000 },
    sharedEnums: {
      tables: { ATTACKTYPE: { "0": "physical", "1": "magical" } },
      field_to_enum: { "attack type": "ATTACKTYPE" },
    },
  });

  const physics = JSON.parse(await readFile(join(subOut, "shared", "physics.json"), "utf-8")) as { shape_version: string; constants: Record<string, unknown> };
  const enums = JSON.parse(await readFile(join(subOut, "shared", "enums.json"), "utf-8")) as { shape_version: string; tables: Record<string, Record<string, string>>; field_to_enum: Record<string, string> };
  assert.equal(physics.constants.gravity, -1500, "H15-6: physics constant value");
  assert.equal(enums.tables.ATTACKTYPE["0"], "physical", "H15-6: enum table value");
  assert.equal(enums.field_to_enum["attack type"], "ATTACKTYPE", "H15-6: field_to_enum mapping");
  // shared entries appear in manifest with kind="shared"
  const sharedEntries = result.manifest.files.filter(f => f.kind === "shared");
  assert.equal(sharedEntries.length, 2, `H15-6: 2 shared entries in manifest (got ${sharedEntries.length})`);
  console.log("[OK] H15-6: shared/ shards written");
}

// ───────────────────────────────────────────────────────────────────────────
// H15-7: Determinism — same input produces identical sha256
// ───────────────────────────────────────────────────────────────────────────
{
  const parsed: ParsedPvfDocument[] = [chrFixture("character/det/det.chr", "det")];
  const out1 = join(OUT_DIR, "det1");
  const out2 = join(OUT_DIR, "det2");
  const r1 = await exportRuntimeShards({
    outDir: out1,
    parsed,
    meta: { pvfHash: "stable", extractorVersion: "v2.0.0", exportedAt: "2026-05-23T17:00:00Z" },
  });
  const r2 = await exportRuntimeShards({
    outDir: out2,
    parsed,
    meta: { pvfHash: "stable", extractorVersion: "v2.0.0", exportedAt: "2026-05-23T17:00:00Z" },
  });
  assert.equal(r1.manifest.files[0].sha256, r2.manifest.files[0].sha256, "H15-7: identical sha256 across runs");
  console.log("[OK] H15-7: export is deterministic");
}

// ───────────────────────────────────────────────────────────────────────────
// H15-8: Incremental EXPORT — unchanged shards skipped on second run
// ───────────────────────────────────────────────────────────────────────────
{
  const parsed: ParsedPvfDocument[] = [chrFixture("character/inc/inc.chr", "inc")];
  const subOut = join(OUT_DIR, "incremental");

  // First run — baseline
  const r1 = await exportRuntimeShards({
    outDir: subOut,
    parsed,
    meta: { pvfHash: "h15-stable", extractorVersion: "v2.0.0", exportedAt: "2026-05-23T17:00:00Z" },
  });
  assert.equal(r1.filesSkipped, 0, "H15-8: first run has no skips");
  // filesWritten counts shards + manifest; we wrote 1 shard + manifest = 2
  assert.ok(r1.filesWritten >= 2, `H15-8: first run wrote shards (got ${r1.filesWritten})`);

  // Second run with same input + manifest as base — shard should be skipped
  const r2 = await exportRuntimeShards({
    outDir: subOut,
    parsed,
    meta: { pvfHash: "h15-stable", extractorVersion: "v2.0.0", exportedAt: "2026-05-23T17:00:00Z" },
    incrementalBaseManifest: r1.manifest,
  });
  assert.equal(r2.filesSkipped, 1, `H15-8: 1 shard skipped (got ${r2.filesSkipped})`);
  // Manifest still lists the entry — same sha256 as r1
  assert.equal(r2.manifest.files.length, r1.manifest.files.length, "H15-8: manifest entry count preserved");
  assert.equal(r2.manifest.files[0].sha256, r1.manifest.files[0].sha256, "H15-8: skipped entry sha256 preserved");

  // Third run with modified input — shard should be REWRITTEN (no skip)
  const modifiedParsed: ParsedPvfDocument[] = [chrFixture("character/inc/inc.chr", "inc_modified")];
  const r3 = await exportRuntimeShards({
    outDir: subOut,
    parsed: modifiedParsed,
    meta: { pvfHash: "h15-stable", extractorVersion: "v2.0.0", exportedAt: "2026-05-23T17:00:00Z" },
    incrementalBaseManifest: r1.manifest,
  });
  assert.equal(r3.filesSkipped, 0, `H15-8: modified content not skipped (got ${r3.filesSkipped})`);
  assert.notEqual(r3.manifest.files[0].sha256, r1.manifest.files[0].sha256, "H15-8: new sha256 differs");
  console.log("[OK] H15-8: incremental EXPORT skips unchanged shards");
}

// ───────────────────────────────────────────────────────────────────────────
// H15-9: Incremental EXPORT with contentFingerprint — different extract
// timestamps on otherwise-identical content → shard still skipped.
//
// Simulates the Day 15 caveat fix: when PVF is re-extracted, every
// PvfFact.provenance.extractTimestamp changes, so raw-sha256 incremental
// skip cannot fire. useContentFingerprint:true strips timestamps before
// hashing → fingerprint stays stable and skip fires.
// ───────────────────────────────────────────────────────────────────────────
{
  const path = "character/fp/fp.chr";
  const parsed1: ParsedPvfDocument[] = [chrFixture(path, "fp")];
  const subOut = join(OUT_DIR, "fingerprint-skip");

  // First export — baseline. Enable fingerprint mode so the manifest gains a
  // contentSha256 for downstream comparison.
  const r1 = await exportRuntimeShards({
    outDir: subOut,
    parsed: parsed1,
    meta: { pvfHash: "h15-fp", extractorVersion: "v2.0.0", exportedAt: "2026-05-23T17:00:00Z" },
    useContentFingerprint: true,
  });
  assert.equal(r1.filesSkipped, 0, "H15-9: first run has no skips");
  const r1Entry = r1.manifest.files[0];
  assert.ok(typeof r1Entry.contentSha256 === "string" && /^[0-9a-f]{64}$/.test(r1Entry.contentSha256),
    `H15-9: baseline contentSha256 is 64-char hex (got ${r1Entry.contentSha256})`);

  // Simulate a re-extraction: clone the parsed doc and stamp every
  // extractTimestamp with a fresh value. All other semantic fields stay equal.
  // Audit F3 (test-effectiveness, 2026-05-24): the helper above shares its
  // key set with SUT.stripExtractTimestamps (mirror-coded). To prove SUT is
  // actually performing a strip rather than a no-op coincidence, ALSO
  // hand-edit a specific provenance.extractTimestamp on parsed2 — an
  // independent oracle that doesn't depend on the helper.
  const NEW_TS = "2026-05-24T09:30:42Z";
  const parsed2: ParsedPvfDocument[] = [stampExtractTimestamps(chrFixture(path, "fp"), NEW_TS)];
  // Independent hand-edit oracle: directly mutate a known-deep timestamp
  // (jumpPower.provenance.extractTimestamp) to a third distinct value. If
  // the SUT stripper truly walks all extractTimestamp occurrences, the
  // fingerprint stays equal regardless of how the timestamps were stamped.
  (parsed2[0] as { jumpPower: { provenance: { extractTimestamp: string } } })
    .jumpPower.provenance.extractTimestamp = "2026-05-24T11:11:11Z";

  const r2 = await exportRuntimeShards({
    outDir: subOut,
    parsed: parsed2,
    meta: { pvfHash: "h15-fp", extractorVersion: "v2.0.0", exportedAt: "2026-05-24T09:30:42Z" },
    useContentFingerprint: true,
    incrementalBaseManifest: r1.manifest,
  });
  assert.ok(r2.filesSkipped >= 1, `H15-9: at least one shard skipped via fingerprint (got ${r2.filesSkipped})`);
  const r2Entry = r2.manifest.files[0];
  assert.ok(typeof r2Entry.contentSha256 === "string" && /^[0-9a-f]{64}$/.test(r2Entry.contentSha256),
    "H15-9: fingerprint entry retains contentSha256 after skip");
  assert.equal(r2Entry.contentSha256, r1Entry.contentSha256,
    "H15-9: contentSha256 stable across re-extraction with hand-edited deep timestamp (timestamps stripped)");
  console.log("[OK] H15-9: contentFingerprint skips re-extracted but unchanged shard (independent oracle)");
}

// ───────────────────────────────────────────────────────────────────────────
// H15-10: contentFingerprint — semantic change defeats skip; new fingerprint
// must differ. Guards against false positives where stripping timestamps
// accidentally also strips real diffs.
// ───────────────────────────────────────────────────────────────────────────
{
  const path = "character/fpdiff/fpdiff.chr";
  const subOut = join(OUT_DIR, "fingerprint-diff");

  const baseline = chrFixture(path, "test");
  const r1 = await exportRuntimeShards({
    outDir: subOut,
    parsed: [baseline],
    meta: { pvfHash: "h15-fpd", extractorVersion: "v2.0.0", exportedAt: "2026-05-23T17:00:00Z" },
    useContentFingerprint: true,
  });

  // Mutate a real field (chr.job.value) AND stamp a fresh extractTimestamp.
  // Even with timestamps stripped, the job change must surface as a new
  // fingerprint → no skip, distinct contentSha256.
  const renamed = stampExtractTimestamps(chrFixture(path, "test"), "2026-05-24T10:00:00Z");
  (renamed as { job: { value: string } }).job.value = "renamed";

  const r2 = await exportRuntimeShards({
    outDir: subOut,
    parsed: [renamed],
    meta: { pvfHash: "h15-fpd", extractorVersion: "v2.0.0", exportedAt: "2026-05-24T10:00:00Z" },
    useContentFingerprint: true,
    incrementalBaseManifest: r1.manifest,
  });
  assert.equal(r2.filesSkipped, 0, `H15-10: semantic change is NOT skipped (got ${r2.filesSkipped})`);
  const c1 = r1.manifest.files[0].contentSha256;
  const c2 = r2.manifest.files[0].contentSha256;
  assert.ok(c1 && c2 && c1 !== c2,
    `H15-10: contentSha256 differs when content actually changes (c1=${c1}, c2=${c2})`);
  console.log("[OK] H15-10: contentFingerprint guards against false-positive skips");
}

// ───────────────────────────────────────────────────────────────────────────
// H15-11: P0-1/P0-2 regression — multiple chr under the same parent job
// directory (e.g. swordman/swordman.chr + swordman/demonicswordman.chr)
// must write independent player shards keyed by chr basename stem, not by
// parent directory. Manifest.files must not contain duplicate paths.
// Sub-resources (skl/atk/ani) under the parent dir are shared by every
// sub-class because that is how DNF organises them in the PVF tree.
// ───────────────────────────────────────────────────────────────────────────
{
  const parsed: ParsedPvfDocument[] = [
    chrFixture("character/swordman/swordman.chr", "swordman"),
    chrFixture("character/swordman/demonicswordman.chr", "demonicswordman"),
    sklFixture("skill/swordman/upperslash.skl"),
    atkFixture("character/swordman/attackinfo/attack1.atk"),
  ];
  const subOut = join(OUT_DIR, "subclass");
  const result = await exportRuntimeShards({
    outDir: subOut,
    parsed,
    meta: { pvfHash: "h15-fake", extractorVersion: "v2.0.0", exportedAt: "2026-05-23T17:00:00Z" },
  });

  // Both chr shard files exist with independent content (no overwrite).
  const swordmanShard = JSON.parse(
    await readFile(join(subOut, "players", "swordman.json"), "utf-8"),
  ) as { chr: { path: string }; skills: Record<string, unknown>; parentJob?: string };
  assert.equal(swordmanShard.chr.path, "character/swordman/swordman.chr",
    "H15-11: players/swordman.json holds swordman chr");

  const demonicShard = JSON.parse(
    await readFile(join(subOut, "players", "demonicswordman.json"), "utf-8"),
  ) as { chr: { path: string }; skills: Record<string, unknown>; parentJob?: string };
  assert.equal(demonicShard.chr.path, "character/swordman/demonicswordman.chr",
    "H15-11: players/demonicswordman.json holds demonicswordman chr (NOT overwritten by swordman)");

  // Sub-class inherits sub-resources from parent job directory.
  assert.ok("upperslash" in swordmanShard.skills,
    "H15-11: swordman shard sees skill/swordman/upperslash");
  assert.ok("upperslash" in demonicShard.skills,
    `H15-11: demonicswordman shard shares parent swordman/ skills (got skills=${Object.keys(demonicShard.skills).join(",")})`);

  // Manifest has no duplicate path entries.
  const paths = result.manifest.files.map(f => f.path);
  const uniquePaths = new Set(paths);
  assert.equal(paths.length, uniquePaths.size,
    `H15-11: manifest.files has no duplicate paths (entries=${paths.length}, unique=${uniquePaths.size}; paths=${paths.join("|")})`);
  console.log("[OK] H15-11: sub-class chr writes independent shard + manifest has no dup paths");
}

// ───────────────────────────────────────────────────────────────────────────
// H15-12: TIMESTAMP_KEYS invariant — fingerprint strip set must cover every
// timestamp key actually produced by the parser/exporter pipeline.
//
// Audit F3 (test-effectiveness, 2026-05-28): H15-9 previously hand-coded the
// stamp helper's key set to mirror the SUT's strip set; if a new timestamp
// key was added to ParsedFieldProvenance or PvfDocument, the SUT would
// likely strip it (so fingerprint stays stable) AND the helper would silently
// skip it (so the simulated re-extraction wouldn't even modify it). The
// circular construction couldn't catch a SUT regression where the strip set
// fell out of date.
//
// Fix path 1: helper imports SUT.TIMESTAMP_KEYS directly (no more mirror).
// Fix path 2 (this case): independent scan — produce a real shard from a
// real fixture, walk the on-disk JSON, collect every key whose value matches
// an ISO-8601 timestamp shape, and assert each one is in SUT.TIMESTAMP_KEYS.
// If a future parser starts emitting `extractedAt: "2026-...Z"` without
// updating TIMESTAMP_KEYS, this test fails by detecting the unstripped
// timestamp leak — independent of the helper.
// ───────────────────────────────────────────────────────────────────────────
{
  const path = "character/ts-invariant/ts-invariant.chr";
  const subOut = join(OUT_DIR, "ts-invariant");
  const r = await exportRuntimeShards({
    outDir: subOut,
    parsed: [chrFixture(path, "ts-invariant")],
    meta: { pvfHash: "h15-ts", extractorVersion: "v2.0.0", exportedAt: "2026-05-28T00:00:00Z" },
  });
  assert.ok(r.filesWritten >= 1, "H15-12: at least one shard written");
  const shardJson = await readFile(join(subOut, "players", "ts-invariant.json"), "utf-8");
  const shard = JSON.parse(shardJson) as unknown;

  // ISO-8601 with required `T` separator and `Z` / offset — matches what the
  // C++ extractor and Provenance helpers emit. Narrow enough not to false-
  // positive on the SHA-256 hex, version strings, or shard ids.
  const ISO8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

  const leaks: Array<{ keyPath: string; key: string; value: string }> = [];
  const visit = (node: unknown, keyPath: string): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => visit(v, `${keyPath}[${i}]`));
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      const childPath = keyPath === "" ? key : `${keyPath}.${key}`;
      if (typeof value === "string" && ISO8601.test(value)) {
        if (!SUT_TIMESTAMP_KEYS.has(key)) {
          leaks.push({ keyPath: childPath, key, value });
        }
      }
      visit(value, childPath);
    }
  };
  // Top-level shard fields like `exported_at`, `extractor_version` belong to
  // RuntimeManifest meta and are intentionally NOT stripped — they identify
  // the export run, not per-fact provenance. Scope the scan to fact-bearing
  // sub-objects (chr/skills/attacks/animations) where strip-coverage matters.
  const factRoots = ["chr", "skills", "attacks", "animations"] as const;
  for (const root of factRoots) {
    const sub = (shard as Record<string, unknown>)[root];
    if (sub !== undefined) visit(sub, root);
  }

  assert.equal(leaks.length, 0,
    `H15-12: every ISO-8601 timestamp key in shard fact-content must be in SUT TIMESTAMP_KEYS — ` +
    `unstripped leaks: ${leaks.map(l => `${l.keyPath}=${l.key}:"${l.value}"`).join(", ")}. ` +
    `Either add the new key to RuntimeExporter.TIMESTAMP_KEYS, or remove the timestamp from the parser output.`);

  // Sanity: the canonical keys must actually be there (otherwise the test is
  // vacuously true). Confirm at least one fact-side extractTimestamp exists.
  let foundCanonical = false;
  const sniff = (node: unknown): void => {
    if (foundCanonical || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(sniff); return; }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (SUT_TIMESTAMP_KEYS.has(k) && typeof v === "string") { foundCanonical = true; return; }
      sniff(v);
    }
  };
  for (const root of factRoots) {
    const sub = (shard as Record<string, unknown>)[root];
    if (sub !== undefined) sniff(sub);
  }
  assert.ok(foundCanonical,
    "H15-12: fixture must contain at least one canonical timestamp under fact roots " +
    "(otherwise the leak-scan is vacuously true and provides no signal)");

  console.log("[OK] H15-12: TIMESTAMP_KEYS covers every ISO-8601 timestamp leaked into shard fact-content");
}

// ───────────────────────────────────────────────────────────────────────────
// Cleanup
// ───────────────────────────────────────────────────────────────────────────
await rm(OUT_DIR, { recursive: true, force: true });

console.log("");
console.log("H15 EXPORT probes: all assertions passed (12 cases)");
