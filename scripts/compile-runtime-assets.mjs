#!/usr/bin/env node
/**
 * compile-runtime-assets.mjs — Phase 2 T2.1 entry.
 *
 * 把 verification/baseline-shards/*.json 编译成 dist/data/<kind>/*.bin
 * (FlatBuffers wire format).
 *
 * 设计决策 (P2-9):
 *   - inline 模式: .bin 含 provenance 全字段 (~2.3 MB / shard, 71% metadata)
 *   - sidecar 模式 (默认): .bin 干净 (~700 KB / shard), provenance 走
 *     dist/data/_provenance/<kind>/<id>.json. audit/debug 时按需拉.
 *
 * v0 范围 (本提交): 4 个简单 shard 端到端跑通
 *   - SharedEnums         (shared/enums.json)
 *   - PhysicsConstants    (shared/physics.json) — 已存在 schema, 接进来
 *   - 占位 NutScriptShard / SpriteAtlasShard / StringTableShard 跳过 (Phase 1.5 D1 数据未提)
 *
 * v1 (后续提交): PlayerShard / MonsterShard / DungeonShard 全字段映射
 *
 * 用法:
 *   node scripts/compile-runtime-assets.mjs              # 全编
 *   node scripts/compile-runtime-assets.mjs --kind shared
 *   node scripts/compile-runtime-assets.mjs --inline     # inline 模式 (含 provenance)
 *
 * 2026-05-29 created.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import * as flatbuffers from "flatbuffers";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const SHARDS_DIR = path.join(ROOT, "verification", "baseline-shards");
// 输出到 public/data/ 以避免 vite build emptyOutDir 清掉 .bin。
// 浏览器 ShardLoader baseUrl="/data/" 在 dev/prod 都对（vite 自动把 public/ 摊到根）。
const DIST_DIR = path.join(ROOT, "public", "data");
const PROV_DIR = path.join(DIST_DIR, "_provenance");
const GEN_DIR = path.join(ROOT, "src", "engine", "schema", "carbon-shade", "engine", "schema");

// ── CLI ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const inlineMode = args.includes("--inline");
const kindFilter = (() => {
  const i = args.indexOf("--kind");
  return i >= 0 ? args[i + 1] : null;
})();

console.log(`[compile-assets] mode=${inlineMode ? "inline" : "sidecar"}`);
console.log(`[compile-assets] schema gen at ${path.relative(ROOT, GEN_DIR)}`);

// ── ensure dist dirs ────────────────────────────────────────────────
for (const sub of ["players", "monsters", "dungeons", "shared"]) {
  mkdirSync(path.join(DIST_DIR, sub), { recursive: true });
  if (!inlineMode) mkdirSync(path.join(PROV_DIR, sub), { recursive: true });
}

// ── stats ───────────────────────────────────────────────────────────
let totalIn = 0;
let totalOut = 0;
let totalProv = 0;
const compiled = [];

// ── manifest entries (T2.3) ─────────────────────────────────────────
// Collected during compilation, emitted as manifest.bin + manifest.json at end.
// Mirrors manifest.fbs ManifestEntry { path, kind, size_bytes, sha256, shape_version }.
// `path` carries the .json suffix to keep ShardLoader logic identical with the
// upstream baseline manifest (loader maps .json → .bin at fetch time).
const manifestEntries = [];
function recordManifestEntry({ relPath, kind, binBuf, shapeVersion }) {
  const sha = createHash("sha256").update(binBuf).digest("hex");
  // Normalize to .json-suffixed path for ShardLoader compatibility
  const jsonPath = relPath.replace(/\.bin$/, '.json');
  manifestEntries.push({
    path: jsonPath,
    kind,
    sizeBytes: binBuf.byteLength,
    sha256: sha,
    shape_version: shapeVersion || "1.0.0",
  });
}

// ── compile SharedEnums ────────────────────────────────────────────
async function compileSharedEnums() {
  const inPath = path.join(SHARDS_DIR, "shared", "enums.json");
  const outPath = path.join(DIST_DIR, "shared", "enums.bin");
  if (!existsSync(inPath)) {
    console.warn(`[compile-assets] skip enums: missing ${inPath}`);
    return;
  }

  const json = JSON.parse(readFileSync(inPath, "utf8"));
  const inSize = readFileSync(inPath).byteLength;

  const { SharedEnums } = await import(toFileUrl(path.join(GEN_DIR, "shared-enums.js")));
  const { EnumTablePair } = await import(toFileUrl(path.join(GEN_DIR, "enum-table-pair.js")));
  const { FieldEnumMapPair } = await import(toFileUrl(path.join(GEN_DIR, "field-enum-map-pair.js")));

  const builder = new flatbuffers.Builder(1024);

  // tables: Record<string, Record<string, string>>
  // → [{key: tableName, values: [name0, name1, ...]}]
  // 注意: PVF 里有负数 key (KNOCK_BACK_TYPE.-1 = "not_back"). 我们按数字大小排, 负数排在前.
  const tableEntries = Object.entries(json.tables).map(([tableName, indexMap]) => {
    const keys = Object.keys(indexMap).map(Number).sort((a, b) => a - b);
    const minKey = keys[0];
    const maxKey = keys[keys.length - 1];
    // 用 dense array; 缺失 index 填空字符串. (KNOCK_BACK_TYPE 有 -1, dense 编不了)
    // 妥协: 负 key 单独标记, runtime 判断. v0 简单点: 把所有 key as-is 存成 [string] 不强求 dense.
    const values = keys.map(k => indexMap[String(k)] || "");
    return { key: tableName, values, minKey, maxKey };
  });

  // build EnumTablePair[]
  const tablePairOffsets = tableEntries
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(t => {
      const keyOff = builder.createString(t.key);
      const valOffs = t.values.map(v => builder.createString(v));
      const valVec = EnumTablePair.createValuesVector(builder, valOffs);
      EnumTablePair.startEnumTablePair(builder);
      EnumTablePair.addKey(builder, keyOff);
      EnumTablePair.addValues(builder, valVec);
      return EnumTablePair.endEnumTablePair(builder);
    });
  const tablesVec = SharedEnums.createTablesVector(builder, tablePairOffsets);

  // field_to_enum: Record<string, string> → [{key, enum_name}]
  const ftePairOffsets = Object.entries(json.field_to_enum)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fieldName, enumName]) => {
      const kOff = builder.createString(fieldName);
      const eOff = builder.createString(enumName);
      FieldEnumMapPair.startFieldEnumMapPair(builder);
      FieldEnumMapPair.addKey(builder, kOff);
      FieldEnumMapPair.addEnumName(builder, eOff);
      return FieldEnumMapPair.endFieldEnumMapPair(builder);
    });
  const fteVec = SharedEnums.createFieldToEnumVector(builder, ftePairOffsets);

  // shape_version
  const svOff = builder.createString(json.shape_version || "1.0.0");

  SharedEnums.startSharedEnums(builder);
  SharedEnums.addSchemaVersion(builder, 1);
  SharedEnums.addShapeVersion(builder, svOff);
  SharedEnums.addTables(builder, tablesVec);
  SharedEnums.addFieldToEnum(builder, fteVec);
  const root = SharedEnums.endSharedEnums(builder);
  builder.finish(root, "ENUM");

  const buf = builder.asUint8Array();
  writeFileSync(outPath, buf);

  totalIn += inSize;
  totalOut += buf.byteLength;
  compiled.push({
    kind: "shared/enums",
    inBytes: inSize,
    outBytes: buf.byteLength,
    shrink: ((1 - buf.byteLength / inSize) * 100).toFixed(0) + "%",
  });
  recordManifestEntry({
    relPath: "shared/enums.bin",
    kind: "shared",
    binBuf: buf,
    shapeVersion: json.shape_version,
  });
  console.log(`  ✅ shared/enums.bin  ${formatSize(inSize)} → ${formatSize(buf.byteLength)} (-${((1 - buf.byteLength / inSize) * 100).toFixed(0)}%)`);
}

// ── compile PhysicsConstants ────────────────────────────────────────
async function compilePhysics() {
  const inPath = path.join(SHARDS_DIR, "shared", "physics.json");
  const outPath = path.join(DIST_DIR, "shared", "physics.bin");
  if (!existsSync(inPath)) {
    console.warn(`[compile-assets] skip physics: missing ${inPath}`);
    return;
  }
  const json = JSON.parse(readFileSync(inPath, "utf8"));
  const inSize = readFileSync(inPath).byteLength;

  const { PhysicsConstants } = await import(toFileUrl(path.join(GEN_DIR, "physics-constants.js")));

  const builder = new flatbuffers.Builder(256);

  // 数值 scalars — 值取 PvfFact.value 或直接读
  const constants = json.constants || json;
  const v = (key) => {
    const f = constants[key];
    if (f == null) return 0;
    if (typeof f === "number") return f;
    if (typeof f === "object" && "value" in f) return f.value;
    return 0;
  };

  // 这里 PhysicsConstants schema 字段顺序按 physics.fbs 实际定义
  PhysicsConstants.startPhysicsConstants(builder);
  PhysicsConstants.addSchemaVersion(builder, 1);
  PhysicsConstants.addDefaultGravityAccel(builder, v("defaultGravityAccel"));
  PhysicsConstants.addForceToVelocityConst(builder, v("forceToVelocityConst"));
  PhysicsConstants.addXNormalMoveVelocity(builder, v("xNormalMoveVelocity"));
  PhysicsConstants.addYNormalMoveVelocity(builder, v("yNormalMoveVelocity"));
  PhysicsConstants.addSpeedValueDefault(builder, v("speedValueDefault"));
  PhysicsConstants.addLightObjectMaxWeight(builder, v("lightObjectMaxWeight"));
  PhysicsConstants.addMiddleObjectMaxWeight(builder, v("middleObjectMaxWeight"));
  PhysicsConstants.addHitRecoveryStatusType(builder, v("hitRecoveryStatusType"));
  PhysicsConstants.addMeleeHitDelayStatusType(builder, v("meleeHitDelayStatusType"));

  const root = PhysicsConstants.endPhysicsConstants(builder);
  builder.finish(root, "PHYS");

  const buf = builder.asUint8Array();
  writeFileSync(outPath, buf);

  totalIn += inSize;
  totalOut += buf.byteLength;
  compiled.push({
    kind: "shared/physics",
    inBytes: inSize,
    outBytes: buf.byteLength,
    shrink: ((1 - buf.byteLength / inSize) * 100).toFixed(0) + "%",
  });
  recordManifestEntry({
    relPath: "shared/physics.bin",
    kind: "shared",
    binBuf: buf,
    shapeVersion: json.shape_version,
  });
  console.log(`  ✅ shared/physics.bin  ${formatSize(inSize)} → ${formatSize(buf.byteLength)} (-${((1 - buf.byteLength / inSize) * 100).toFixed(0)}%)`);
}

// ── compile MonsterShard ───────────────────────────────────────────
async function compileMonsterShard(basename) {
  const inPath = path.join(SHARDS_DIR, "monsters", `${basename}.json`);
  const outPath = path.join(DIST_DIR, "monsters", `${basename}.bin`);
  const provPath = path.join(PROV_DIR, "monsters", `${basename}.json`);

  if (!existsSync(inPath)) {
    console.warn(`[compile-assets] skip monster/${basename}: missing ${inPath}`);
    return;
  }

  const json = JSON.parse(readFileSync(inPath, "utf8"));
  const inSize = readFileSync(inPath).byteLength;

  // Extract provenance (sidecar mode)
  if (!inlineMode) {
    const prov = extractProvenance(json);
    writeFileSync(provPath, JSON.stringify(prov, null, 2));
    totalProv += JSON.stringify(prov).length;
  }

  // Import generated types (use .js, not .ts)
  const { MonsterShard } = await import(toFileUrl(path.join(GEN_DIR, "monster-shard.js")));
  const { MobDef } = await import(toFileUrl(path.join(GEN_DIR, "mob-def.js")));
  const { AtkPair } = await import(toFileUrl(path.join(GEN_DIR, "atk-pair.js")));
  const { AniPair } = await import(toFileUrl(path.join(GEN_DIR, "ani-pair.js")));
  const { AtkDef } = await import(toFileUrl(path.join(GEN_DIR, "atk-def.js")));
  const { AniDef } = await import(toFileUrl(path.join(GEN_DIR, "ani-def.js")));
  const { PvfFactInt } = await import(toFileUrl(path.join(GEN_DIR, "pvf-fact-int.js")));
  const { PvfFactIntArray } = await import(toFileUrl(path.join(GEN_DIR, "pvf-fact-int-array.js")));
  const { PvfFactString } = await import(toFileUrl(path.join(GEN_DIR, "pvf-fact-string.js")));
  const { PvfRef } = await import(toFileUrl(path.join(GEN_DIR, "pvf-ref.js")));
  const { WidthBox } = await import(toFileUrl(path.join(GEN_DIR, "width-box.js")));
  const { AbilityCategory } = await import(toFileUrl(path.join(GEN_DIR, "ability-category.js")));
  const { AttackKindEntry } = await import(toFileUrl(path.join(GEN_DIR, "attack-kind-entry.js")));

  const builder = new flatbuffers.Builder(65536);

  // Helper: build PvfFactInt (skip provenance in sidecar mode)
  const buildPvfFactInt = (fact) => {
    if (!fact) return 0;
    const valueOff = fact.value != null ? fact.value : 0;
    const unitOff = fact.unit ? builder.createString(fact.unit) : 0;
    PvfFactInt.startPvfFactInt(builder);
    PvfFactInt.addValue(builder, valueOff);
    if (unitOff) PvfFactInt.addUnit(builder, unitOff);
    // Skip provenance in sidecar mode
    return PvfFactInt.endPvfFactInt(builder);
  };

  // Helper: build PvfFactIntArray
  const buildPvfFactIntArray = (fact) => {
    if (!fact || !fact.values) return 0;
    const valuesVec = PvfFactIntArray.createValuesVector(builder, fact.values);
    const unitOff = fact.unit ? builder.createString(fact.unit) : 0;
    PvfFactIntArray.startPvfFactIntArray(builder);
    PvfFactIntArray.addValues(builder, valuesVec);
    if (unitOff) PvfFactIntArray.addUnit(builder, unitOff);
    return PvfFactIntArray.endPvfFactIntArray(builder);
  };

  // Helper: build PvfFactString
  const buildPvfFactString = (fact) => {
    if (!fact) return 0;
    const valueOff = fact.value ? builder.createString(fact.value) : 0;
    const unitOff = fact.unit ? builder.createString(fact.unit) : 0;
    PvfFactString.startPvfFactString(builder);
    if (valueOff) PvfFactString.addValue(builder, valueOff);
    if (unitOff) PvfFactString.addUnit(builder, unitOff);
    return PvfFactString.endPvfFactString(builder);
  };

  // Helper: build WidthBox (struct, not table)
  const buildWidthBox = (fact) => {
    if (!fact || !fact.values || fact.values.length < 2) return 0;
    return WidthBox.createWidthBox(builder, fact.values[0], fact.values[1]);
  };

  // Helper: build AbilityCategory
  const buildAbilityCategory = (fact) => {
    if (!fact || !fact.value) return 0;
    const v = fact.value;
    AbilityCategory.startAbilityCategory(builder);
    AbilityCategory.addHpMax(builder, v["hp max"] || v.hp_max || 0);
    AbilityCategory.addEquipmentPhysAtk(builder, v.equipment_physical_attack || 0);
    AbilityCategory.addEquipmentPhysDef(builder, v.equipment_physical_defense || 0);
    AbilityCategory.addEquipmentMagicAtk(builder, v.equipment_magical_attack || 0);
    AbilityCategory.addEquipmentMagicDef(builder, v.equipment_magical_defense || 0);
    return AbilityCategory.endAbilityCategory(builder);
  };

  // Build MobDef
  const mob = json.mob;
  const kindOff = builder.createString(mob.kind || "mob");
  const pathOff = builder.createString(mob.path || "");

  // Build all strings and tables first (bottom-up)

  // move_speed, hit_recovery, level, weight, weight_dual
  const moveSpeedOff = buildPvfFactIntArray(mob.moveSpeed);
  const hitRecoveryOff = buildPvfFactIntArray(mob.hitRecovery);
  const levelOff = buildPvfFactIntArray(mob.level);
  const weightOff = buildPvfFactInt(mob.weight);
  const weightDualOff = buildPvfFactIntArray(mob.weightDual);

  // sight, warlike, attack_delay
  const sightOff = buildPvfFactInt(mob.sight);
  const warlikeOff = buildPvfFactInt(mob.warlike);
  const attackDelayOff = buildPvfFactInt(mob.attackDelay);

  // hp_max (often null)
  const hpMaxOff = mob.hpMax ? buildPvfFactInt(mob.hpMax) : 0;

  // ability_category
  const abilityCategoryOff = buildAbilityCategory(mob.abilityCategory);

  // stuck_bonus_on_damage
  const stuckBonusVec = mob.stuckbonusOnDamage?.values
    ? MobDef.createStuckBonusOnDamageVector(builder, mob.stuckbonusOnDamage.values)
    : 0;

  // attack_kind (24-element array)
  const attackKindOffsets = (mob.attackKind || []).map(entry => {
    const typeOff = builder.createString(entry.t || "int");
    AttackKindEntry.startAttackKindEntry(builder);
    AttackKindEntry.addTypeTag(builder, typeOff);
    AttackKindEntry.addValue(builder, entry.v || 0);
    return AttackKindEntry.endAttackKindEntry(builder);
  });
  const attackKindVec = attackKindOffsets.length > 0
    ? MobDef.createAttackKindVector(builder, attackKindOffsets)
    : 0;

  // attack_info (PvfRef[])
  const attackInfoOffsets = (mob.attackInfo || []).map(ref => {
    const tkOff = builder.createString(ref.targetKind || "");
    const tpOff = builder.createString(ref.targetPath || "");
    const rawOff = builder.createString(ref.raw || "");
    PvfRef.startPvfRef(builder);
    PvfRef.addTargetKind(builder, tkOff);
    PvfRef.addTargetPath(builder, tpOff);
    PvfRef.addRaw(builder, rawOff);
    return PvfRef.endPvfRef(builder);
  });
  const attackInfoVec = attackInfoOffsets.length > 0
    ? MobDef.createAttackInfoVector(builder, attackInfoOffsets)
    : 0;

  // animation_refs (PvfRef[])
  const animationRefsOffsets = (mob.animationRefs || []).map(ref => {
    const tkOff = builder.createString(ref.targetKind || "");
    const tpOff = builder.createString(ref.targetPath || "");
    const rawOff = builder.createString(ref.raw || "");
    PvfRef.startPvfRef(builder);
    PvfRef.addTargetKind(builder, tkOff);
    PvfRef.addTargetPath(builder, tpOff);
    PvfRef.addRaw(builder, rawOff);
    return PvfRef.endPvfRef(builder);
  });
  const animationRefsVec = animationRefsOffsets.length > 0
    ? MobDef.createAnimationRefsVector(builder, animationRefsOffsets)
    : 0;

  // name, category
  const nameOff = buildPvfFactString(mob.name);
  const categoryOffsets = (mob.category || []).map(c => builder.createString(c));
  const categoryVec = categoryOffsets.length > 0
    ? MobDef.createCategoryVector(builder, categoryOffsets)
    : 0;

  // attack_speed_base/max, cast_speed_base/max (stub for now)
  const attackSpeedBaseOff = 0;
  const attackSpeedMaxOff = 0;
  const castSpeedBaseOff = 0;
  const castSpeedMaxOff = 0;

  // Now start MobDef and add fields
  MobDef.startMobDef(builder);
  MobDef.addSchemaVersion(builder, 1);

  // width_box is a struct, must be added inline
  if (mob.widthBox?.values && mob.widthBox.values.length >= 2) {
    MobDef.addWidthBox(builder, WidthBox.createWidthBox(builder, mob.widthBox.values[0], mob.widthBox.values[1]));
  }

  if (moveSpeedOff) MobDef.addMoveSpeed(builder, moveSpeedOff);
  if (hitRecoveryOff) MobDef.addHitRecovery(builder, hitRecoveryOff);
  if (sightOff) MobDef.addSight(builder, sightOff);
  if (warlikeOff) MobDef.addWarlike(builder, warlikeOff);
  if (levelOff) MobDef.addLevel(builder, levelOff);
  if (weightOff) MobDef.addWeight(builder, weightOff);
  if (weightDualOff) MobDef.addWeightDual(builder, weightDualOff);
  if (hpMaxOff) MobDef.addHpMax(builder, hpMaxOff);
  if (attackDelayOff) MobDef.addAttackDelay(builder, attackDelayOff);
  if (attackSpeedBaseOff) MobDef.addAttackSpeedBase(builder, attackSpeedBaseOff);
  if (attackSpeedMaxOff) MobDef.addAttackSpeedMax(builder, attackSpeedMaxOff);
  if (abilityCategoryOff) MobDef.addAbilityCategory(builder, abilityCategoryOff);
  if (stuckBonusVec) MobDef.addStuckBonusOnDamage(builder, stuckBonusVec);
  if (attackKindVec) MobDef.addAttackKind(builder, attackKindVec);
  if (attackInfoVec) MobDef.addAttackInfo(builder, attackInfoVec);
  if (castSpeedBaseOff) MobDef.addCastSpeedBase(builder, castSpeedBaseOff);
  if (castSpeedMaxOff) MobDef.addCastSpeedMax(builder, castSpeedMaxOff);
  if (nameOff) MobDef.addName(builder, nameOff);
  if (categoryVec) MobDef.addCategory(builder, categoryVec);
  if (animationRefsVec) MobDef.addAnimationRefs(builder, animationRefsVec);
  MobDef.addKind(builder, kindOff);
  MobDef.addPath(builder, pathOff);
  const mobDefOff = MobDef.endMobDef(builder);

  // Build attacks (AtkPair[]) - stub for now
  const attackPairOffsets = [];
  const attacksVec = attackPairOffsets.length > 0
    ? MonsterShard.createAttacksVector(builder, attackPairOffsets)
    : 0;

  // Build animations (AniPair[]) - stub for now
  const animationPairOffsets = [];
  const animationsVec = animationPairOffsets.length > 0
    ? MonsterShard.createAnimationsVector(builder, animationPairOffsets)
    : 0;

  // Build MonsterShard
  const shapeVersionOff = builder.createString(json.shape_version || "1.0.0");
  const idOff = builder.createString(json.id || basename);

  MonsterShard.startMonsterShard(builder);
  MonsterShard.addSchemaVersion(builder, 1);
  MonsterShard.addShapeVersion(builder, shapeVersionOff);
  MonsterShard.addId(builder, idOff);
  MonsterShard.addMob(builder, mobDefOff);
  if (attacksVec) MonsterShard.addAttacks(builder, attacksVec);
  if (animationsVec) MonsterShard.addAnimations(builder, animationsVec);
  const root = MonsterShard.endMonsterShard(builder);
  builder.finish(root, "MSHA");

  const buf = builder.asUint8Array();
  writeFileSync(outPath, buf);

  totalIn += inSize;
  totalOut += buf.byteLength;
  compiled.push({
    kind: `monsters/${basename}`,
    inBytes: inSize,
    outBytes: buf.byteLength,
    shrink: ((1 - buf.byteLength / inSize) * 100).toFixed(0) + "%",
  });
  recordManifestEntry({
    relPath: `monsters/${basename}.bin`,
    kind: "monster",
    binBuf: buf,
    shapeVersion: json.shape_version,
  });
  console.log(`  ✅ monsters/${basename}.bin  ${formatSize(inSize)} → ${formatSize(buf.byteLength)} (-${((1 - buf.byteLength / inSize) * 100).toFixed(0)}%)`);
}

// ── compile PlayerShard ────────────────────────────────────────────
async function compilePlayerShard(basename) {
  const inPath = path.join(SHARDS_DIR, "players", `${basename}.json`);
  const outPath = path.join(DIST_DIR, "players", `${basename}.bin`);
  const provPath = path.join(PROV_DIR, "players", `${basename}.json`);

  if (!existsSync(inPath)) {
    console.warn(`[compile-assets] skip player/${basename}: missing ${inPath}`);
    return;
  }

  const json = JSON.parse(readFileSync(inPath, "utf8"));
  const inSize = readFileSync(inPath).byteLength;

  // Extract provenance (sidecar)
  if (!inlineMode) {
    const prov = extractProvenance(json);
    writeFileSync(provPath, JSON.stringify(prov, null, 2));
    totalProv += JSON.stringify(prov).length;
  }

  // Import generated types
  const { PlayerShard } = await import(toFileUrl(path.join(GEN_DIR, "player-shard.js")));
  const { ChrDef } = await import(toFileUrl(path.join(GEN_DIR, "chr-def.js")));
  const { PvfFactFloat } = await import(toFileUrl(path.join(GEN_DIR, "pvf-fact-float.js")));
  const { PvfFactInt } = await import(toFileUrl(path.join(GEN_DIR, "pvf-fact-int.js")));
  const { PvfFactString } = await import(toFileUrl(path.join(GEN_DIR, "pvf-fact-string.js")));
  const { WidthBox } = await import(toFileUrl(path.join(GEN_DIR, "width-box.js")));
  const { GrowthRow } = await import(toFileUrl(path.join(GEN_DIR, "growth-row.js")));
  const { SklPair } = await import(toFileUrl(path.join(GEN_DIR, "skl-pair.js")));
  const { AniPair } = await import(toFileUrl(path.join(GEN_DIR, "ani-pair.js")));
  const { AtkPair } = await import(toFileUrl(path.join(GEN_DIR, "atk-pair.js")));
  const { SklDef } = await import(toFileUrl(path.join(GEN_DIR, "skl-def.js")));
  const { AniDef } = await import(toFileUrl(path.join(GEN_DIR, "ani-def.js")));
  const { AtkDef } = await import(toFileUrl(path.join(GEN_DIR, "atk-def.js")));
  const { AniFrame } = await import(toFileUrl(path.join(GEN_DIR, "ani-frame.js")));
  const { Anchor } = await import(toFileUrl(path.join(GEN_DIR, "anchor.js")));
  const { Hitbox6 } = await import(toFileUrl(path.join(GEN_DIR, "hitbox6.js")));
  const { CoolTime } = await import(toFileUrl(path.join(GEN_DIR, "cool-time.js")));
  const { ConsumeMp } = await import(toFileUrl(path.join(GEN_DIR, "consume-mp.js")));
  const { CastingTime } = await import(toFileUrl(path.join(GEN_DIR, "casting-time.js")));

  const builder = new flatbuffers.Builder(2 * 1024 * 1024); // 2MB initial for large shards

  // Helper: build PvfFactFloat
  const buildPvfFactFloat = (fact) => {
    if (!fact) return 0;
    const value = typeof fact.value === "number" ? fact.value : 0;
    const unitOff = fact.unit ? builder.createString(fact.unit) : 0;
    PvfFactFloat.startPvfFactFloat(builder);
    PvfFactFloat.addValue(builder, value);
    if (unitOff) PvfFactFloat.addUnit(builder, unitOff);
    return PvfFactFloat.endPvfFactFloat(builder);
  };

  // Helper: build PvfFactString
  const buildPvfFactString = (fact) => {
    if (!fact) return 0;
    const valueOff = fact.value ? builder.createString(fact.value) : 0;
    const unitOff = fact.unit ? builder.createString(fact.unit) : 0;
    PvfFactString.startPvfFactString(builder);
    if (valueOff) PvfFactString.addValue(builder, valueOff);
    if (unitOff) PvfFactString.addUnit(builder, unitOff);
    return PvfFactString.endPvfFactString(builder);
  };

  // Helper: build PvfFactInt
  const buildPvfFactInt = (fact) => {
    if (!fact) return 0;
    const value = typeof fact.value === "number" ? fact.value : 0;
    const unitOff = fact.unit ? builder.createString(fact.unit) : 0;
    PvfFactInt.startPvfFactInt(builder);
    PvfFactInt.addValue(builder, value);
    if (unitOff) PvfFactInt.addUnit(builder, unitOff);
    return PvfFactInt.endPvfFactInt(builder);
  };

  // Helper: build GrowthRow from {values, unit, provenance}
  const buildGrowthRow = (fieldName, growthData) => {
    if (!growthData || !growthData.values) return 0;
    const fnOff = builder.createString(fieldName);
    const unitOff = growthData.unit ? builder.createString(growthData.unit) : 0;
    const valuesVec = GrowthRow.createValuesVector(builder, growthData.values);
    GrowthRow.startGrowthRow(builder);
    GrowthRow.addFieldName(builder, fnOff);
    if (unitOff) GrowthRow.addUnit(builder, unitOff);
    GrowthRow.addValues(builder, valuesVec);
    return GrowthRow.endGrowthRow(builder);
  };

  // ── build ChrDef ─────────────────────────────────────────────────
  const chr = json.chr || {};

  // build all leaf offsets first (bottom-up rule)
  const jobOff = buildPvfFactString(chr.job);
  const bodyImgOff = buildPvfFactString(chr.bodyImagePath);
  const jumpPowerOff = buildPvfFactFloat(chr.jumpPower);
  const jumpSpeedOff = buildPvfFactFloat(chr.jumpSpeed);
  const moveSpeedOff = buildPvfFactFloat(chr.moveSpeed);
  const attackSpeedOff = buildPvfFactFloat(chr.attackSpeed);
  const castSpeedOff = buildPvfFactFloat(chr.castSpeed);
  const weightOff = buildPvfFactFloat(chr.weight);
  const lightResOff = buildPvfFactFloat(chr.lightResistance);
  const darkResOff = buildPvfFactFloat(chr.darkResistance);

  // growth: dict → [GrowthRow]
  const growthOffsets = Object.entries(chr.growth || {})
    .map(([fieldName, data]) => buildGrowthRow(fieldName, data))
    .filter(o => o !== 0);
  const growthVec = growthOffsets.length > 0
    ? ChrDef.createGrowthVector(builder, growthOffsets)
    : 0;

  // kind / path
  const kindOff = builder.createString(chr.kind || "chr");
  const pathOff = builder.createString(chr.path || "");

  // ── start ChrDef ──
  ChrDef.startChrDef(builder);
  ChrDef.addSchemaVersion(builder, 1);

  if (jumpPowerOff) ChrDef.addJumpPower(builder, jumpPowerOff);
  if (jumpSpeedOff) ChrDef.addJumpSpeed(builder, jumpSpeedOff);
  if (moveSpeedOff) ChrDef.addMoveSpeed(builder, moveSpeedOff);
  if (attackSpeedOff) ChrDef.addAttackSpeed(builder, attackSpeedOff);
  if (castSpeedOff) ChrDef.addCastSpeed(builder, castSpeedOff);

  // widthBox is a struct: bare array [40, 10] from JSON
  if (Array.isArray(chr.widthBox) && chr.widthBox.length >= 2) {
    ChrDef.addWidthBox(builder, WidthBox.createWidthBox(builder, chr.widthBox[0], chr.widthBox[1]));
  }

  if (darkResOff) ChrDef.addDarkResistance(builder, darkResOff);
  if (lightResOff) ChrDef.addLightResistance(builder, lightResOff);
  if (weightOff) ChrDef.addWeight(builder, weightOff);
  if (growthVec) ChrDef.addGrowth(builder, growthVec);

  if (bodyImgOff) ChrDef.addBodyImagePath(builder, bodyImgOff);
  if (jobOff) ChrDef.addJob(builder, jobOff);

  ChrDef.addKind(builder, kindOff);
  ChrDef.addPath(builder, pathOff);

  const chrDefOff = ChrDef.endChrDef(builder);

  // ── Build skills / animations / attacks (v1) ──────────────────
  // FlatBuffers rule: build all child tables first, then parent vectors.

  // Helper: build SklDef from JSON skill entry
  const buildSklDef = (skl) => {
    // Pre-build all child strings/tables
    const skillTypeOff = skl.skillType ? builder.createString(skl.skillType) : 0;
    const weaponEffectOff = skl.weaponEffectType ? builder.createString(skl.weaponEffectType) : 0;
    const commandOffs = Array.isArray(skl.command)
      ? skl.command.map(s => builder.createString(String(s)))
      : [];
    const commandVec = commandOffs.length > 0
      ? SklDef.createCommandVector(builder, commandOffs)
      : 0;

    // CoolTime / ConsumeMp / CastingTime are tables
    let coolTimeOff = 0;
    if (skl.coolTime) {
      coolTimeOff = CoolTime.createCoolTime(builder, skl.coolTime.dungeonMs || 0, skl.coolTime.pvpMs || 0);
    }
    let consumeMpOff = 0;
    if (skl.consumeMp) {
      consumeMpOff = ConsumeMp.createConsumeMp(builder, skl.consumeMp.baseMp || 0, skl.consumeMp.lvlMaxMp || 0);
    }
    let castingTimeOff = 0;
    if (skl.castingTime) {
      castingTimeOff = CastingTime.createCastingTime(builder, skl.castingTime.baseMs || 0, skl.castingTime.lvl20Ms || 0);
    }

    const requiredLevelOff = buildPvfFactInt(skl.requiredLevel);
    const maximumLevelOff = buildPvfFactInt(skl.maximumLevel);

    const kindOff = builder.createString(skl.kind || "skl");
    const pathOff = builder.createString(skl.path || "");
    const nameOff = skl.name?.value ? builder.createString(skl.name.value) : 0;

    SklDef.startSklDef(builder);
    SklDef.addSchemaVersion(builder, 1);
    if (skillTypeOff) SklDef.addSkillType(builder, skillTypeOff);
    if (weaponEffectOff) SklDef.addWeaponEffectType(builder, weaponEffectOff);
    if (commandVec) SklDef.addCommand(builder, commandVec);
    if (coolTimeOff) SklDef.addCoolTime(builder, coolTimeOff);
    if (consumeMpOff) SklDef.addConsumeMp(builder, consumeMpOff);
    if (castingTimeOff) SklDef.addCastingTime(builder, castingTimeOff);
    if (typeof skl.autoCoolTimeApply === "boolean") SklDef.addAutoCoolTimeApply(builder, skl.autoCoolTimeApply);
    if (typeof skl.skillClass === "number") SklDef.addSkillClass(builder, skl.skillClass);
    if (requiredLevelOff) SklDef.addRequiredLevel(builder, requiredLevelOff);
    if (maximumLevelOff) SklDef.addMaximumLevel(builder, maximumLevelOff);
    if (typeof skl.hasDungeon === "boolean") SklDef.addHasDungeon(builder, skl.hasDungeon);
    if (typeof skl.hasPvp === "boolean") SklDef.addHasPvp(builder, skl.hasPvp);
    if (typeof skl.hasWarroom === "boolean") SklDef.addHasWarroom(builder, skl.hasWarroom);
    if (typeof skl.hasDeathTower === "boolean") SklDef.addHasDeathTower(builder, skl.hasDeathTower);
    SklDef.addKind(builder, kindOff);
    SklDef.addPath(builder, pathOff);
    if (nameOff) SklDef.addName(builder, nameOff);
    return SklDef.endSklDef(builder);
  };

  // Helper: build AniDef from JSON ani entry
  const buildAniDef = (ani) => {
    // Pre-build all child frames (each frame is a table)
    const frameOffsets = (ani.frames || []).map(f => {
      const spriteOff = f.sprite ? builder.createString(f.sprite) : 0;
      // attackBoxes / damageBoxes are Hitbox6 structs serialized inline as a vector of structs
      // Hitbox6 has 6 fields (4 bytes each = 24 bytes). v0/v1: skip empty arrays, leave as 0
      // (boxes are typically empty for most animations; full impl deferred)
      AniFrame.startAniFrame(builder);
      AniFrame.addIndex(builder, f.index || 0);
      if (f.anchor && typeof f.anchor.x === "number") {
        AniFrame.addAnchor(builder, Anchor.createAnchor(builder, f.anchor.x, f.anchor.y || 0));
      }
      if (typeof f.delay === "number") AniFrame.addDelayMs(builder, f.delay);
      if (spriteOff) AniFrame.addSprite(builder, spriteOff);
      if (typeof f.imgId === "number") AniFrame.addImgId(builder, f.imgId);
      if (typeof f.imgParam === "number") AniFrame.addImgParam(builder, f.imgParam);
      return AniFrame.endAniFrame(builder);
    });
    const framesVec = frameOffsets.length > 0
      ? AniDef.createFramesVector(builder, frameOffsets)
      : 0;

    const kindOff = builder.createString("ani");
    const pathOff = builder.createString(ani.path || "");

    AniDef.startAniDef(builder);
    AniDef.addSchemaVersion(builder, 1);
    if (typeof ani.framesCount === "number") AniDef.addFramesCount(builder, ani.framesCount);
    if (typeof ani.loop === "boolean") AniDef.addLoop(builder, ani.loop);
    if (framesVec) AniDef.addFrames(builder, framesVec);
    AniDef.addKind(builder, kindOff);
    AniDef.addPath(builder, pathOff);
    return AniDef.endAniDef(builder);
  };

  // Helper: build AtkDef from JSON atk entry
  const buildAtkDef = (atk) => {
    const elementOff = atk.element ? builder.createString(atk.element) : 0;
    const hitReactionOff = atk.hitReaction ? builder.createString(atk.hitReaction) : 0;
    const attackKindOff = atk.attackKind ? builder.createString(atk.attackKind) : 0;
    const hitWavOff = atk.hitWav ? builder.createString(atk.hitWav) : 0;
    // schema declares PvfFactFloat for liftUp/pushAside/damageBonus/knuckBack/weaponDamageApply.
    // JSON liftUp etc are PvfFact-shape with .value:number. weaponDamageApply is bare bool,
    // not represented in the json as PvfFact — wrap as PvfFactFloat{value: bool?1:0}.
    const liftUpOff = buildPvfFactFloat(atk.liftUp);
    const pushAsideOff = buildPvfFactFloat(atk.pushAside);
    const damageBonusOff = buildPvfFactFloat(atk.damageBonus);
    const knuckBackOff = buildPvfFactFloat(atk.knuckBack);
    const weaponDamageApplyOff = typeof atk.weaponDamageApply === "boolean"
      ? buildPvfFactFloat({ value: atk.weaponDamageApply ? 1 : 0, unit: "bool" })
      : 0;

    const kindOff = builder.createString(atk.kind || "atk");
    const pathOff = builder.createString(atk.path || "");

    AtkDef.startAtkDef(builder);
    AtkDef.addSchemaVersion(builder, 1);
    if (typeof atk.attackEnemy === "boolean") AtkDef.addAttackEnemy(builder, atk.attackEnemy);
    if (typeof atk.attackFriend === "boolean") AtkDef.addAttackFriend(builder, atk.attackFriend);
    if (typeof atk.pvpOnly === "boolean") AtkDef.addPvpOnly(builder, atk.pvpOnly);
    if (elementOff) AtkDef.addElement(builder, elementOff);
    if (hitReactionOff) AtkDef.addHitReaction(builder, hitReactionOff);
    if (attackKindOff) AtkDef.addAttackKind(builder, attackKindOff);
    if (damageBonusOff) AtkDef.addDamageBonus(builder, damageBonusOff);
    if (liftUpOff) AtkDef.addLiftUp(builder, liftUpOff);
    if (pushAsideOff) AtkDef.addPushAside(builder, pushAsideOff);
    if (knuckBackOff) AtkDef.addKnuckBack(builder, knuckBackOff);
    if (weaponDamageApplyOff) AtkDef.addWeaponDamageApply(builder, weaponDamageApplyOff);
    if (typeof atk.causesBounce === "boolean") AtkDef.addCausesBounce(builder, atk.causesBounce);
    if (typeof atk.causesDown === "boolean") AtkDef.addCausesDown(builder, atk.causesDown);
    if (typeof atk.causesStuck === "boolean") AtkDef.addCausesStuck(builder, atk.causesStuck);
    if (typeof atk.causesStun === "boolean") AtkDef.addCausesStun(builder, atk.causesStun);
    if (typeof atk.ignoreWeight === "boolean") AtkDef.addIgnoreWeight(builder, atk.ignoreWeight);
    if (hitWavOff) AtkDef.addHitWav(builder, hitWavOff);
    AtkDef.addKind(builder, kindOff);
    AtkDef.addPath(builder, pathOff);
    return AtkDef.endAtkDef(builder);
  };

  // Build SklPair[] sorted by key
  const sklPairOffsets = Object.entries(json.skills || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => {
      const valOff = buildSklDef(val);
      const keyOff = builder.createString(key);
      SklPair.startSklPair(builder);
      SklPair.addKey(builder, keyOff);
      SklPair.addValue(builder, valOff);
      return SklPair.endSklPair(builder);
    });
  const skillsVec = sklPairOffsets.length > 0
    ? PlayerShard.createSkillsVector(builder, sklPairOffsets)
    : 0;

  // Build AniPair[] sorted by key
  const aniPairOffsets = Object.entries(json.animations || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => {
      const valOff = buildAniDef(val);
      const keyOff = builder.createString(key);
      AniPair.startAniPair(builder);
      AniPair.addKey(builder, keyOff);
      AniPair.addValue(builder, valOff);
      return AniPair.endAniPair(builder);
    });
  const animationsVec = aniPairOffsets.length > 0
    ? PlayerShard.createAnimationsVector(builder, aniPairOffsets)
    : 0;

  // Build AtkPair[] sorted by key
  const atkPairOffsets = Object.entries(json.attacks || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => {
      const valOff = buildAtkDef(val);
      const keyOff = builder.createString(key);
      AtkPair.startAtkPair(builder);
      AtkPair.addKey(builder, keyOff);
      AtkPair.addValue(builder, valOff);
      return AtkPair.endAtkPair(builder);
    });
  const attacksVec = atkPairOffsets.length > 0
    ? PlayerShard.createAttacksVector(builder, atkPairOffsets)
    : 0;

  // ── PlayerShard ──
  const shapeVersionOff = builder.createString(json.shape_version || "1.0.0");
  const jobNameOff = builder.createString(json.job || basename);
  const parentJobOff = builder.createString(json.parentJob || json.job || "");

  PlayerShard.startPlayerShard(builder);
  PlayerShard.addSchemaVersion(builder, 1);
  PlayerShard.addShapeVersion(builder, shapeVersionOff);
  PlayerShard.addJob(builder, jobNameOff);
  PlayerShard.addParentJob(builder, parentJobOff);
  PlayerShard.addChr(builder, chrDefOff);
  if (skillsVec) PlayerShard.addSkills(builder, skillsVec);
  if (animationsVec) PlayerShard.addAnimations(builder, animationsVec);
  if (attacksVec) PlayerShard.addAttacks(builder, attacksVec);
  const root = PlayerShard.endPlayerShard(builder);
  builder.finish(root, "PSHA");

  const buf = builder.asUint8Array();
  writeFileSync(outPath, buf);

  totalIn += inSize;
  totalOut += buf.byteLength;
  compiled.push({
    kind: `players/${basename}`,
    inBytes: inSize,
    outBytes: buf.byteLength,
    shrink: ((1 - buf.byteLength / inSize) * 100).toFixed(0) + "%",
  });
  recordManifestEntry({
    relPath: `players/${basename}.bin`,
    kind: "player",
    binBuf: buf,
    shapeVersion: json.shape_version,
  });
  console.log(`  ✅ players/${basename}.bin  ${formatSize(inSize)} → ${formatSize(buf.byteLength)} (-${((1 - buf.byteLength / inSize) * 100).toFixed(0)}%)`);
}

// ── compile DungeonShard ───────────────────────────────────────────
async function compileDungeonShard(basename) {
  const inPath = path.join(SHARDS_DIR, "dungeons", `${basename}.json`);
  const outPath = path.join(DIST_DIR, "dungeons", `${basename}.bin`);
  const provPath = path.join(PROV_DIR, "dungeons", `${basename}.json`);

  if (!existsSync(inPath)) {
    console.warn(`[compile-assets] skip dungeon/${basename}: missing ${inPath}`);
    return;
  }
  const json = JSON.parse(readFileSync(inPath, "utf8"));
  const inSize = readFileSync(inPath).byteLength;

  if (!inlineMode) {
    const prov = extractProvenance(json);
    writeFileSync(provPath, JSON.stringify(prov, null, 2));
    totalProv += JSON.stringify(prov).length;
  }

  const { DungeonShard } = await import(toFileUrl(path.join(GEN_DIR, "dungeon-shard.js")));
  const { DgnDef } = await import(toFileUrl(path.join(GEN_DIR, "dgn-def.js")));
  const { MapDef } = await import(toFileUrl(path.join(GEN_DIR, "map-def.js")));
  const { DgnSize } = await import(toFileUrl(path.join(GEN_DIR, "dgn-size.js")));
  const { IntToken } = await import(toFileUrl(path.join(GEN_DIR, "int-token.js")));
  const { PvfFactInt } = await import(toFileUrl(path.join(GEN_DIR, "pvf-fact-int.js")));
  const { PvfFactFloat } = await import(toFileUrl(path.join(GEN_DIR, "pvf-fact-float.js")));
  const { PvfFactString } = await import(toFileUrl(path.join(GEN_DIR, "pvf-fact-string.js")));

  const builder = new flatbuffers.Builder(65536);

  const buildPvfFactInt = (f) => {
    if (!f) return 0;
    const v = typeof f.value === "number" ? f.value : 0;
    const unitOff = f.unit ? builder.createString(f.unit) : 0;
    PvfFactInt.startPvfFactInt(builder);
    PvfFactInt.addValue(builder, v);
    if (unitOff) PvfFactInt.addUnit(builder, unitOff);
    return PvfFactInt.endPvfFactInt(builder);
  };
  const buildPvfFactFloat = (f) => {
    if (!f) return 0;
    const v = typeof f.value === "number" ? f.value : 0;
    const unitOff = f.unit ? builder.createString(f.unit) : 0;
    PvfFactFloat.startPvfFactFloat(builder);
    PvfFactFloat.addValue(builder, v);
    if (unitOff) PvfFactFloat.addUnit(builder, unitOff);
    return PvfFactFloat.endPvfFactFloat(builder);
  };
  const buildPvfFactString = (f) => {
    if (!f) return 0;
    const vOff = f.value ? builder.createString(f.value) : 0;
    const uOff = f.unit ? builder.createString(f.unit) : 0;
    PvfFactString.startPvfFactString(builder);
    if (vOff) PvfFactString.addValue(builder, vOff);
    if (uOff) PvfFactString.addUnit(builder, uOff);
    return PvfFactString.endPvfFactString(builder);
  };

  // Helper: build [IntToken] vector (struct vector — must use startVector + createIntToken inline)
  const buildIntTokenVector = (tokens, addFn) => {
    if (!Array.isArray(tokens) || tokens.length === 0) return 0;
    // IntToken struct order in fbs: t_is_str (bool), v_int (int32) — 8 bytes aligned
    // FlatBuffers struct array: startVector(structSize, count, alignment)
    MapDef.startMonsterSpawnsVector(builder, tokens.length);
    // Build in reverse order (FlatBuffers convention for vectors)
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      const isStr = t.t === "str";
      const vInt = typeof t.v === "number" ? t.v : 0;
      IntToken.createIntToken(builder, isStr, vInt);
    }
    return builder.endVector();
  };

  // Build MapDef (per map entry)
  const buildMapDef = (m) => {
    const dungeonIdOff = buildPvfFactInt(m.dungeonId);
    const mapTypeOff = buildPvfFactString(m.mapType);
    const nameOff = buildPvfFactString(m.name);
    const nearOff = buildPvfFactInt(m.nearSightScroll);
    const middleOff = buildPvfFactInt(m.middleSightScroll);
    const farOff = buildPvfFactInt(m.farSightScroll);
    const greedOff = buildPvfFactString(m.greed);

    const playerNumberVec = Array.isArray(m.playerNumber) && m.playerNumber.length > 0
      ? MapDef.createPlayerNumberVector(builder, m.playerNumber)
      : 0;
    const pathgatePosVec = Array.isArray(m.pathgatePos) && m.pathgatePos.length > 0
      ? MapDef.createPathgatePosVector(builder, m.pathgatePos)
      : 0;
    const eventMonsterPosVec = Array.isArray(m.eventMonsterPositions) && m.eventMonsterPositions.length > 0
      ? MapDef.createEventMonsterPositionsVector(builder, m.eventMonsterPositions)
      : 0;
    const pvpStartAreaVec = Array.isArray(m.pvpStartArea) && m.pvpStartArea.length > 0
      ? MapDef.createPvpStartAreaVector(builder, m.pvpStartArea)
      : 0;

    const tileOffsets = (m.tiles || []).map(s => builder.createString(s));
    const tilesVec = tileOffsets.length > 0 ? MapDef.createTilesVector(builder, tileOffsets) : 0;

    const soundOffsets = (m.sounds || []).map(s => builder.createString(s));
    const soundsVec = soundOffsets.length > 0 ? MapDef.createSoundsVector(builder, soundOffsets) : 0;

    const hintOffsets = (m.monsterAiHints || []).map(s => builder.createString(s));
    const hintsVec = hintOffsets.length > 0 ? MapDef.createMonsterAiHintsVector(builder, hintOffsets) : 0;

    // monsterSpawns is [IntToken] struct vector
    const monsterSpawnsVec = buildIntTokenVector(m.monsterSpawns);

    const kindOff = builder.createString(m.kind || "map");
    const pathOff = builder.createString(m.path || "");

    MapDef.startMapDef(builder);
    MapDef.addKind(builder, kindOff);
    MapDef.addPath(builder, pathOff);
    if (dungeonIdOff) MapDef.addDungeonId(builder, dungeonIdOff);
    if (mapTypeOff) MapDef.addMapType(builder, mapTypeOff);
    if (nameOff) MapDef.addName(builder, nameOff);
    if (playerNumberVec) MapDef.addPlayerNumber(builder, playerNumberVec);
    if (monsterSpawnsVec) MapDef.addMonsterSpawns(builder, monsterSpawnsVec);
    if (nearOff) MapDef.addNearSightScroll(builder, nearOff);
    if (middleOff) MapDef.addMiddleSightScroll(builder, middleOff);
    if (farOff) MapDef.addFarSightScroll(builder, farOff);
    if (pathgatePosVec) MapDef.addPathgatePos(builder, pathgatePosVec);
    if (tilesVec) MapDef.addTiles(builder, tilesVec);
    if (soundsVec) MapDef.addSounds(builder, soundsVec);
    if (hintsVec) MapDef.addMonsterAiHints(builder, hintsVec);
    if (eventMonsterPosVec) MapDef.addEventMonsterPositions(builder, eventMonsterPosVec);
    if (pvpStartAreaVec) MapDef.addPvpStartArea(builder, pvpStartAreaVec);
    if (greedOff) MapDef.addGreed(builder, greedOff);
    return MapDef.endMapDef(builder);
  };

  // ── Build DgnDef ────────────────────────────────────────────────
  const dgn = json.dgn || {};

  const basisLevelOff = buildPvfFactInt(dgn.basisLevel);
  const minReqLevelOff = buildPvfFactInt(dgn.minimumRequiredLevel);
  const expIncreaseOff = buildPvfFactFloat(dgn.experienceIncreasingPoint);
  const bgPosOff = buildPvfFactInt(dgn.backgroundPos);
  const nameOff = buildPvfFactString(dgn.name);
  const explainOff = buildPvfFactString(dgn.explain);

  const startMapVec = Array.isArray(dgn.startMap) && dgn.startMap.length > 0
    ? DgnDef.createStartMapVector(builder, dgn.startMap)
    : 0;
  const bossMapVec = Array.isArray(dgn.bossMap) && dgn.bossMap.length > 0
    ? DgnDef.createBossMapVector(builder, dgn.bossMap)
    : 0;
  const championLevelsVec = Array.isArray(dgn.championLevels) && dgn.championLevels.length > 0
    ? DgnDef.createChampionLevelsVector(builder, dgn.championLevels)
    : 0;
  const pathgateObjectsVec = Array.isArray(dgn.pathgateObjects) && dgn.pathgateObjects.length > 0
    ? DgnDef.createPathgateObjectsVector(builder, dgn.pathgateObjects)
    : 0;

  const monsterRefsOffsets = (json.monsterRefs || []).map(s => builder.createString(s));
  const monsterRefsVec = monsterRefsOffsets.length > 0
    ? DgnDef.createMonsterRefsVector(builder, monsterRefsOffsets)
    : 0;

  // Maps: pre-build all MapDef offsets
  const mapOffsets = (json.maps || []).map(m => buildMapDef(m));
  const mapsVec = mapOffsets.length > 0 ? DgnDef.createMapsVector(builder, mapOffsets) : 0;

  // greedLayout is plain string in dgn
  const greedLayoutOff = dgn.greedLayout ? builder.createString(dgn.greedLayout) : 0;

  const idOff = builder.createString(json.id || basename);
  const kindOff = builder.createString(dgn.kind || "dgn");
  const pathOff = builder.createString(dgn.path || "");

  DgnDef.startDgnDef(builder);
  DgnDef.addSchemaVersion(builder, 1);
  DgnDef.addId(builder, idOff);
  DgnDef.addKind(builder, kindOff);
  DgnDef.addPath(builder, pathOff);
  if (basisLevelOff) DgnDef.addBasisLevel(builder, basisLevelOff);
  if (minReqLevelOff) DgnDef.addMinimumRequiredLevel(builder, minReqLevelOff);

  // size is struct, must add inline
  if (dgn.size && typeof dgn.size.width === "number") {
    DgnDef.addSize(builder, DgnSize.createDgnSize(builder, dgn.size.width, dgn.size.height || 0));
  }
  if (startMapVec) DgnDef.addStartMap(builder, startMapVec);
  if (bossMapVec) DgnDef.addBossMap(builder, bossMapVec);
  if (monsterRefsVec) DgnDef.addMonsterRefs(builder, monsterRefsVec);
  if (mapsVec) DgnDef.addMaps(builder, mapsVec);
  if (expIncreaseOff) DgnDef.addExperienceIncreasingPoint(builder, expIncreaseOff);
  if (championLevelsVec) DgnDef.addChampionLevels(builder, championLevelsVec);
  if (nameOff) DgnDef.addName(builder, nameOff);
  if (explainOff) DgnDef.addExplain(builder, explainOff);
  if (bgPosOff) DgnDef.addBackgroundPos(builder, bgPosOff);
  if (pathgateObjectsVec) DgnDef.addPathgateObjects(builder, pathgateObjectsVec);
  if (greedLayoutOff) DgnDef.addGreedLayout(builder, greedLayoutOff);
  const dgnDefOff = DgnDef.endDgnDef(builder);

  // ── Build DungeonShard ────────────────────────────────────────
  const shapeVerOff = builder.createString(json.shape_version || "1.0.0");
  const shardIdOff = builder.createString(json.id || basename);

  // monster_refs in DungeonShard also (duplicated from DgnDef per fbs schema for runtime convenience)
  const shardMonsterRefsOffsets = (json.monsterRefs || []).map(s => builder.createString(s));
  const shardMonsterRefsVec = shardMonsterRefsOffsets.length > 0
    ? DungeonShard.createMonsterRefsVector(builder, shardMonsterRefsOffsets)
    : 0;

  DungeonShard.startDungeonShard(builder);
  DungeonShard.addSchemaVersion(builder, 1);
  DungeonShard.addShapeVersion(builder, shapeVerOff);
  DungeonShard.addId(builder, shardIdOff);
  DungeonShard.addDgn(builder, dgnDefOff);
  if (shardMonsterRefsVec) DungeonShard.addMonsterRefs(builder, shardMonsterRefsVec);
  const root = DungeonShard.endDungeonShard(builder);
  builder.finish(root, "DSHA");

  const buf = builder.asUint8Array();
  writeFileSync(outPath, buf);

  totalIn += inSize;
  totalOut += buf.byteLength;
  compiled.push({
    kind: `dungeons/${basename}`,
    inBytes: inSize,
    outBytes: buf.byteLength,
    shrink: ((1 - buf.byteLength / inSize) * 100).toFixed(0) + "%",
  });
  recordManifestEntry({
    relPath: `dungeons/${basename}.bin`,
    kind: "dungeon",
    binBuf: buf,
    shapeVersion: json.shape_version,
  });
  console.log(`  ✅ dungeons/${basename}.bin  ${formatSize(inSize)} → ${formatSize(buf.byteLength)} (-${((1 - buf.byteLength / inSize) * 100).toFixed(0)}%)`);
}

function stubD1Placeholders() {
  console.log(`  ⏭  Nut/Sprite/StringTable: TODO Phase 1.5 (data not yet extracted)`);
}

// ── compile Manifest (T2.3) ────────────────────────────────────────
// Emits dist/data/manifest.bin (FlatBuffers) + dist/data/manifest.json (dev mirror).
// Source of truth for sha256 / sizeBytes is recordManifestEntry calls above.
// pvf_hash / extractor_version pulled from upstream baseline manifest.
async function compileManifest() {
  if (manifestEntries.length === 0) {
    console.log(`  ⏭  manifest: no entries collected, skipping`);
    return;
  }

  // Read upstream baseline manifest for pvf_hash / extractor_version
  const baselinePath = path.join(SHARDS_DIR, "manifest.json");
  let pvfHash = "unknown";
  let extractorVersion = "v2.0.0";
  if (existsSync(baselinePath)) {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    pvfHash = baseline.pvf_hash || pvfHash;
    extractorVersion = baseline.extractor_version || extractorVersion;
  }

  const { ContentManifest } = await import(toFileUrl(path.join(GEN_DIR, "content-manifest.js")));
  const { ManifestEntry } = await import(toFileUrl(path.join(GEN_DIR, "manifest-entry.js")));
  const { ShardKind } = await import(toFileUrl(path.join(GEN_DIR, "shard-kind.js")));

  const builder = new flatbuffers.Builder(4096);

  // Build entries vector (bottom-up: strings first, then tables)
  const entryOffsets = manifestEntries
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(e => {
      const pathOff = builder.createString(e.path);
      const shaOff = builder.createString(e.sha256);
      const svOff = builder.createString(e.shape_version);
      const kindEnum =
        e.kind === "player"  ? ShardKind.player :
        e.kind === "monster" ? ShardKind.monster :
        e.kind === "dungeon" ? ShardKind.dungeon :
                               ShardKind.shared;
      ManifestEntry.startManifestEntry(builder);
      ManifestEntry.addPath(builder, pathOff);
      ManifestEntry.addKind(builder, kindEnum);
      ManifestEntry.addSizeBytes(builder, e.sizeBytes);
      ManifestEntry.addSha256(builder, shaOff);
      ManifestEntry.addShapeVersion(builder, svOff);
      return ManifestEntry.endManifestEntry(builder);
    });
  const entriesVec = ContentManifest.createEntriesVector(builder, entryOffsets);

  // Build root strings
  const mvOff = builder.createString("1.0.0");
  const exOff = builder.createString(new Date().toISOString());
  const pvfOff = builder.createString(pvfHash);
  const evOff = builder.createString(extractorVersion);

  ContentManifest.startContentManifest(builder);
  ContentManifest.addManifestVersion(builder, mvOff);
  ContentManifest.addExportedAt(builder, exOff);
  ContentManifest.addPvfHash(builder, pvfOff);
  ContentManifest.addExtractorVersion(builder, evOff);
  ContentManifest.addEntries(builder, entriesVec);
  const root = ContentManifest.endContentManifest(builder);
  builder.finish(root, "MFST");

  const buf = builder.asUint8Array();
  const binPath = path.join(DIST_DIR, "manifest.bin");
  writeFileSync(binPath, buf);

  // Dev-friendly JSON mirror
  const jsonMirror = {
    manifest_version: "1.0.0",
    exported_at: new Date().toISOString(),
    pvf_hash: pvfHash,
    extractor_version: extractorVersion,
    files: manifestEntries.sort((a, b) => a.path.localeCompare(b.path)).map(e => ({
      path: e.path,
      sha256: e.sha256,
      sizeBytes: e.sizeBytes,
      kind: e.kind,
      shape_version: e.shape_version,
    })),
  };
  writeFileSync(path.join(DIST_DIR, "manifest.json"), JSON.stringify(jsonMirror, null, 2));

  console.log(`  ✅ manifest.bin       ${manifestEntries.length} entries, ${formatSize(buf.byteLength)}`);
  console.log(`  ✅ manifest.json      (dev mirror)`);
}

// ── extractProvenance helper ───────────────────────────────────────
function extractProvenance(obj, path = '') {
  if (obj === null || typeof obj !== 'object') {
    return null;
  }

  if (Array.isArray(obj)) {
    const arr = obj.map((item, i) => extractProvenance(item, `${path}[${i}]`));
    return arr.some(x => x !== null) ? arr : null;
  }

  const prov = {};
  let hasProvenance = false;

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'provenance' ||
        key === 'sourceType' ||
        key === 'requiresManualVerification' ||
        key === 'sectionName' ||
        key === 'sourceRef' ||
        key === 'raw') {
      prov[key] = value;
      hasProvenance = true;
    } else {
      const nested = extractProvenance(value, `${path}.${key}`);
      if (nested !== null) {
        prov[key] = nested;
        hasProvenance = true;
      }
    }
  }

  return hasProvenance ? prov : null;
}

// ── helpers ────────────────────────────────────────────────────────
function toFileUrl(p) {
  // Windows: file:///C:/... — path.resolve gives D:/... after toLowerCase drive
  return "file:///" + p.replace(/\\/g, "/");
}
function formatSize(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(2) + " MB";
}

// ── main ───────────────────────────────────────────────────────────
async function main() {
  if (!kindFilter || kindFilter === "shared") {
    await compileSharedEnums();
    await compilePhysics();
  }
  if (!kindFilter || kindFilter === "players") {
    const playersDir = path.join(SHARDS_DIR, "players");
    if (existsSync(playersDir)) {
      const files = readdirSync(playersDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        await compilePlayerShard(path.basename(file, '.json'));
      }
    }
  }
  if (!kindFilter || kindFilter === "monsters") {
    // Discover all monster shards
    const monstersDir = path.join(SHARDS_DIR, "monsters");
    if (existsSync(monstersDir)) {
      const files = readdirSync(monstersDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        await compileMonsterShard(path.basename(file, '.json'));
      }
    }
  }
  if (!kindFilter || kindFilter === "dungeons") {
    const dungeonsDir = path.join(SHARDS_DIR, "dungeons");
    if (existsSync(dungeonsDir)) {
      const files = readdirSync(dungeonsDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        await compileDungeonShard(path.basename(file, '.json'));
      }
    }
  }
  if (!kindFilter) stubD1Placeholders();

  // Always emit manifest after all shards compiled
  await compileManifest();

  console.log("");
  console.log(`[compile-assets] compiled ${compiled.length} shard(s)`);
  if (compiled.length > 0) {
    console.log(`[compile-assets] total: ${formatSize(totalIn)} → ${formatSize(totalOut)} (-${((1 - totalOut / totalIn) * 100).toFixed(0)}%)`);
    if (!inlineMode && totalProv > 0) {
      console.log(`[compile-assets] provenance sidecar: ${formatSize(totalProv)}`);
    }
  }
  console.log(`[compile-assets] output: ${path.relative(ROOT, DIST_DIR)}`);
}

main().catch(e => {
  console.error("[compile-assets] FATAL:", e);
  process.exit(1);
});
