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
import { exportRuntimeShards, SHAPE_VERSION } from "../../src/dnf-native-combat/data/exporter/RuntimeExporter.js";
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
    motionRefs: {}, raw: FAKE_DOC(path),
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
    raw: FAKE_DOC(path),
  };
}

function mobFixture(path: string): MobDef {
  return {
    kind: "mob", path,
    provenance: docProv(path), sections: [],
    name: null, warlike: null, sight: null, weight: null, hpMax: null,
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
// Cleanup
// ───────────────────────────────────────────────────────────────────────────
await rm(OUT_DIR, { recursive: true, force: true });

console.log("");
console.log("H15 EXPORT probes: all assertions passed (8 cases)");
