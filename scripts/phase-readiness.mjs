#!/usr/bin/env node
/**
 * phase-readiness.mjs — Phase X → Phase X+1 driveability gate.
 *
 * 它检查的不是 drift（claim vs truth），而是 fitness：
 *   producer.shape ⊃ consumer.needs
 *
 * 当前实现：Phase 1 → Phase 2 readiness
 *   - 输入: src/engine/schema/*.fbs + 生成的 *-def.ts + dist 侧 shard JSON
 *   - 模拟 T2.1 (compile-runtime-assets.mjs) 入口需要：
 *       a) 每个 shard 顶层 root_type 必须存在
 *       b) shard JSON 顶层 keys 必须在 root_type 字段里全覆盖
 *       c) dict 类型字段必须有 pair-table 或 rewrite 策略
 *       d) chr/mob/skl/atk/ani 子 keys 必须在对应 def 里全覆盖
 *       e) generated TS 必须可 import（typecheck pass 已保证，这里只 sanity ls）
 *
 * 用法:
 *   node scripts/phase-readiness.mjs              # 跑全部 phase
 *   node scripts/phase-readiness.mjs --phase=2    # 只跑 Phase 2 readiness
 *   node scripts/phase-readiness.mjs --strict     # 任何 blocker exit 1
 *
 * 设计原则（产生原因见 CLAUDE.md "战略层 phase-readiness"）:
 *   - 每个检查输出 producer/consumer 双视角
 *   - 输出格式与 consistency-check.mjs 对齐（同一阅读体验）
 *   - 只读，不写文件
 *
 * 2026-05-29 created.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), "..");

// ─── CLI args ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const STRICT = argv.includes("--strict");
const PHASE_ARG = argv.find(a => a.startsWith("--phase="));
const PHASE = PHASE_ARG ? Number(PHASE_ARG.slice("--phase=".length)) : null;

// ─── Helpers ────────────────────────────────────────────────────────────────
function readJson(p) {
  return JSON.parse(readFileSync(p, "utf-8"));
}
function readText(p) {
  return existsSync(p) ? readFileSync(p, "utf-8") : null;
}
function exists(p) {
  try { statSync(p); return true; } catch { return false; }
}

// Parse .fbs file into {namespace, tables: [{name, fields:[{name,type}]}], rootType}
function parseFbs(text) {
  const out = { tables: [], structs: [], rootType: null, includes: [] };
  const includeRe = /^\s*include\s+"([^"]+)";/gm;
  let m;
  while ((m = includeRe.exec(text)) !== null) out.includes.push(m[1]);

  const rootRe = /root_type\s+(\w+)\s*;/;
  const rm = text.match(rootRe);
  if (rm) out.rootType = rm[1];

  // Strip comments
  const stripped = text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

  const tableRe = /\b(table|struct)\s+(\w+)\s*\{([^}]*)\}/g;
  while ((m = tableRe.exec(stripped)) !== null) {
    const [, kind, name, body] = m;
    const fields = [];
    const fieldRe = /(\w+)\s*:\s*([^;=]+?)\s*(?:=\s*[^;]+)?;/g;
    let fm;
    while ((fm = fieldRe.exec(body)) !== null) {
      fields.push({ name: fm[1], type: fm[2].trim() });
    }
    (kind === "table" ? out.tables : out.structs).push({ name, fields });
  }
  return out;
}

// Scan a directory recursively for FBS schemas
function scanFbs(dir) {
  const result = {};
  for (const f of readdirSync(dir)) {
    if (f.endsWith(".fbs")) {
      const text = readFileSync(join(dir, f), "utf-8");
      result[f] = parseFbs(text);
    }
  }
  return result;
}

// snake_case <-> camelCase tolerance for field-coverage check
function normalizeKey(k) {
  return k.toLowerCase().replace(/_/g, "");
}

// ─── Check engine ───────────────────────────────────────────────────────────
const checks = [];
function addCheck(c) { checks.push(c); }

// ─── Phase 2 readiness checks ───────────────────────────────────────────────

function runPhase2Checks() {
  const SCHEMA_DIR = join(ROOT, "src/engine/schema");
  const GEN_DIR = join(SCHEMA_DIR, "carbon-shade/engine/schema");
  const SHARDS_DIR = join(ROOT, "verification/baseline-shards");
  const EXPORTER_TS = join(ROOT, "src/dnf-native-combat/data/exporter/RuntimeExporter.ts");

  const fbs = scanFbs(SCHEMA_DIR);
  const allTables = new Map();
  for (const [, schema] of Object.entries(fbs)) {
    for (const t of schema.tables) allTables.set(t.name, t);
    for (const s of schema.structs) allTables.set(s.name, s);
  }

  // — Check P2-1: shard-level root_type 完备性 ─────────────────────────────
  // Producer: TS 侧 RuntimeExporter.ts 已声明 PlayerRuntimeShape /
  //           MonsterRuntimeShape / DungeonRuntimeShape / SharedPhysicsShape /
  //           SharedEnumsShape / RuntimeManifest（6 个 shape）
  // Consumer: T2.1 序列化 dist/data/<kind>/*.json → .bin，每个 kind 必须有 root_type
  const expectedRoots = [
    { name: "PlayerShard",   tsContract: "PlayerRuntimeShape",   shardSample: "players/swordman.json" },
    { name: "MonsterShard",  tsContract: "MonsterRuntimeShape",  shardSample: "monsters/goblin.json" },
    { name: "DungeonShard",  tsContract: "DungeonRuntimeShape",  shardSample: "dungeons/jungle.json" },
    { name: "SharedEnums",   tsContract: "SharedEnumsShape",     shardSample: "shared/enums.json" },
  ];
  // Already present roots: PhysicsConstants (via physics.fbs), ContentManifest (via manifest.fbs)
  const existingRoots = new Set(
    Object.values(fbs).map(s => s.rootType).filter(Boolean)
  );
  const missingRoots = expectedRoots.filter(r => !existingRoots.has(r.name));
  addCheck({
    id: "P2-1/shard-root-type",
    producer: "src/engine/schema/*.fbs root_type 集合",
    consumer: "T2.1 compile-runtime-assets.mjs serializeShard()",
    status: missingRoots.length === 0 ? "ok" : "blocker",
    detail: missingRoots.length === 0
      ? `${expectedRoots.length}/${expectedRoots.length} shard wrapper present`
      : `${missingRoots.length} shard wrappers missing: ${missingRoots.map(r => r.name).join(", ")}`,
    info: missingRoots.length === 0 ? null
      : `TS contract 已存在 (RuntimeExporter.ts §42-91 PlayerRuntimeShape/...)，FBS 侧未复刻。无 root_type → flatc -b 不知该序列化哪个 table。`,
  });

  // — Check P2-2: shard 顶层 keys 在 root_type 里全覆盖 ────────────────────
  for (const expected of expectedRoots) {
    const shardPath = join(SHARDS_DIR, expected.shardSample);
    if (!exists(shardPath)) continue;
    const shard = readJson(shardPath);
    const topKeys = Object.keys(shard);
    const root = allTables.get(expected.name);
    if (!root) {
      addCheck({
        id: `P2-2/${expected.name}/coverage`,
        producer: `${expected.name} fields`,
        consumer: `${expected.shardSample} top-level keys (${topKeys.length})`,
        status: "blocker",
        detail: `root_type ${expected.name} 不存在 → 无法做覆盖检查`,
      });
      continue;
    }
    const fieldNames = new Set(root.fields.map(f => normalizeKey(f.name)));
    const missing = topKeys.filter(k => !fieldNames.has(normalizeKey(k)));
    addCheck({
      id: `P2-2/${expected.name}/coverage`,
      producer: `${expected.name} fields (${root.fields.length})`,
      consumer: `${expected.shardSample} top-level keys (${topKeys.length})`,
      status: missing.length === 0 ? "ok" : "blocker",
      detail: missing.length === 0
        ? `all ${topKeys.length} keys covered`
        : `${missing.length} keys missing in fbs: ${missing.join(", ")}`,
    });
  }

  // — Check P2-3: dict 类型字段 (Record<string, T>) 编码策略 ──────────────────
  // PlayerRuntimeShape.skills/animations/attacks 都是 Record<string, X>。
  // FBS 没 map 类型。必须有 pair-table 或文档化 rewrite。
  const dictFields = [
    { shape: "PlayerShard",  field: "skills",     valueType: "SklDef" },
    { shape: "PlayerShard",  field: "animations", valueType: "AniDef" },
    { shape: "PlayerShard",  field: "attacks",    valueType: "AtkDef" },
    { shape: "MonsterShard", field: "attacks",    valueType: "AtkDef" },
    { shape: "MonsterShard", field: "animations", valueType: "AniDef" },
    { shape: "SharedEnums",  field: "tables",     valueType: "Record<string,string>" },
  ];
  const pairTables = new Set();
  for (const t of allTables.values()) {
    if (t.fields && t.fields.length === 2 &&
        t.fields[0].name === "key" && t.fields[1].name === "value") {
      pairTables.add(t.name);
    }
  }
  const dictNoPair = dictFields.filter(d => {
    const root = allTables.get(d.shape);
    return !root; // if shape missing, already a P2-1 blocker
  }).length === dictFields.length
    ? dictFields  // shape missing → all dict checks moot
    : dictFields.filter(d => {
        const root = allTables.get(d.shape);
        if (!root) return true;
        const f = root.fields.find(x => normalizeKey(x.name) === normalizeKey(d.field));
        if (!f) return true;
        // dict represented in fbs must be vector of pair-table; check type contains pair
        return !/\[\w+Pair\]/.test(f.type);
      });
  addCheck({
    id: "P2-3/dict-encoding",
    producer: "FBS schema (no map type, must use [PairTable])",
    consumer: "TS Record<string, X> shard fields (skills/animations/attacks/tables)",
    status: dictNoPair.length === 0 ? "ok" : "blocker",
    detail: dictNoPair.length === 0
      ? `all ${dictFields.length} dict fields encoded as pair-vector`
      : `${dictNoPair.length} dict fields lack pair-table: ${dictNoPair.map(d => `${d.shape}.${d.field}`).join(", ")}`,
    info: dictNoPair.length === 0 ? null
      : `FlatBuffers 没有原生 map。每个 Record<string, X> 必须重写为 vector<XPair> + 在序列化时 sort by key。当前 8 个 .fbs 没有 SklPair / AniPair / AtkPair。`,
  });

  // — Check P2-4: chr/mob/skl/atk/ani 子 keys 在对应 def 全覆盖 ───────────────
  const defChecks = [
    { def: "ChrDef",  shardPath: "players/swordman.json", access: s => s.chr,                         label: "chr" },
    { def: "MobDef",  shardPath: "monsters/goblin.json",  access: s => s.mob,                         label: "mob" },
    { def: "SklDef",  shardPath: "players/swordman.json", access: s => Object.values(s.skills)[0],    label: "skill[0]" },
    { def: "AtkDef",  shardPath: "players/swordman.json", access: s => Object.values(s.attacks)[0],   label: "attack[0]" },
    { def: "AniDef",  shardPath: "players/swordman.json", access: s => Object.values(s.animations)[0],label: "animation[0]" },
  ];
  // Fields commonly stripped at runtime (kind/path/provenance/sections/raw are universal noise)
  const RUNTIME_STRIPPED = new Set(["kind","path","provenance","sections","raw"]);
  for (const dc of defChecks) {
    const shardPath = join(SHARDS_DIR, dc.shardPath);
    if (!exists(shardPath)) continue;
    const shard = readJson(shardPath);
    const inst = dc.access(shard);
    if (!inst) continue;
    const instKeys = Object.keys(inst).filter(k => !RUNTIME_STRIPPED.has(k));
    const def = allTables.get(dc.def);
    if (!def) {
      addCheck({
        id: `P2-4/${dc.def}/keys`,
        producer: `${dc.def}`,
        consumer: `${dc.shardPath}.${dc.label} (${instKeys.length} keys)`,
        status: "blocker",
        detail: `${dc.def} not found in fbs`,
      });
      continue;
    }
    const fieldNames = new Set(def.fields.map(f => normalizeKey(f.name)));
    const missing = instKeys.filter(k => !fieldNames.has(normalizeKey(k)));
    addCheck({
      id: `P2-4/${dc.def}/keys`,
      producer: `${dc.def} (${def.fields.length} fields)`,
      consumer: `${dc.shardPath}.${dc.label} (${instKeys.length} runtime keys)`,
      status: missing.length === 0 ? "ok" : "blocker",
      detail: missing.length === 0
        ? `all ${instKeys.length} runtime keys covered`
        : `${missing.length} keys missing: ${missing.join(", ")}`,
    });
  }

  // — Check P2-5: dungeon-shard.fbs 覆盖 dungeon shard 全部顶层 ──────────────
  // dungeon shard 顶层是 {shape_version, id, dgn, maps[], monsterRefs[]}
  // 期望 dungeon-shard.fbs root_type=DungeonShard.
  {
    const fbsDsh = fbs["dungeon-shard.fbs"];
    const root = fbsDsh?.rootType;
    addCheck({
      id: "P2-5/dungeon-shard-root",
      producer: `dungeon-shard.fbs root_type=${root || "(none)"}`,
      consumer: `dungeons/jungle.json {shape_version, id, dgn, maps[], monsterRefs[]}`,
      status: root === "DungeonShard" ? "ok" : "blocker",
      detail: root === "DungeonShard"
        ? "root covers full shard"
        : `root_type=${root} 不是 DungeonShard. dungeon shard 顶层 (maps/monsterRefs) 没被 wrap。`,
    });
  }

  // — Check P2-6: TS exporter shape vs FBS 双向同步 ─────────────────────────
  // RuntimeExporter.ts 声明的 shape 名称必须能在 fbs 里找到对应 root_type
  {
    const exporterText = readText(EXPORTER_TS) || "";
    const tsShapes = ["PlayerRuntimeShape","MonsterRuntimeShape","DungeonRuntimeShape","SharedPhysicsShape","SharedEnumsShape"];
    const declared = tsShapes.filter(s => exporterText.includes(`interface ${s}`));
    const fbsRootMap = {
      "PlayerRuntimeShape": "PlayerShard",
      "MonsterRuntimeShape": "MonsterShard",
      "DungeonRuntimeShape": "DungeonShard",
      "SharedPhysicsShape": "PhysicsConstants",
      "SharedEnumsShape": "SharedEnums",
    };
    const orphan = declared.filter(ts => !existingRoots.has(fbsRootMap[ts]));
    addCheck({
      id: "P2-6/ts-fbs-shape-parity",
      producer: `TS RuntimeExporter declares ${declared.length}/${tsShapes.length} shapes`,
      consumer: `FBS root_types must mirror`,
      status: orphan.length === 0 ? "ok" : "blocker",
      detail: orphan.length === 0
        ? "TS shape ↔ FBS root parity"
        : `${orphan.length} TS shape orphan (no FBS root): ${orphan.join(", ")}`,
    });
  }

  // — Check P2-7: compile-runtime-assets.mjs 入口存在 ─────────────────────────
  const T21_PATH = join(ROOT, "scripts/compile-runtime-assets.mjs");
  addCheck({
    id: "P2-7/t21-entry",
    producer: "(none — Phase 1 didn't write this script)",
    consumer: "Phase 2 T2.1: JSON shard → .bin pipeline driver",
    status: exists(T21_PATH) ? "ok" : "blocker",
    detail: exists(T21_PATH) ? "exists" : "missing — T2.1 has no entry point",
  });

  // — Check P2-8: npm script wired ────────────────────────────────────────────
  const pkgJson = readJson(join(ROOT, "package.json"));
  const hasCompile = "compile:assets" in pkgJson.scripts || "compile:schema" in pkgJson.scripts;
  addCheck({
    id: "P2-8/npm-script",
    producer: "package.json scripts",
    consumer: "developer/CI invocation",
    status: hasCompile ? "ok" : "blocker",
    detail: hasCompile ? "compile script wired" : "no compile:assets/compile:schema in npm scripts",
    info: !hasCompile ? "scripts/compile-schema.mjs 存在但没接进 npm run。CI 不知道要跑它。" : null,
  });

  // — Check P2-9 (META): metadata overhead ───────────────────────────────────
  // Phase 2 序列化前要决定 provenance 是否进 .bin。当前 shard 70% 是 metadata。
  const swordman = readJson(join(SHARDS_DIR, "players/swordman.json"));
  function stripProv(o) {
    if (Array.isArray(o)) return o.map(stripProv);
    if (o && typeof o === "object") {
      const stripKeys = new Set(["provenance","sections","raw","sourceType","requiresManualVerification","extractorVersion","extractTimestamp","sourceRef","sourcePvfHash","unit"]);
      const out = {};
      for (const [k,v] of Object.entries(o)) {
        if (stripKeys.has(k)) continue;
        out[k] = stripProv(v);
      }
      return out;
    }
    return o;
  }
  const orig = JSON.stringify(swordman).length;
  const clean = JSON.stringify(stripProv(swordman)).length;
  const overheadPct = Math.round((orig - clean) * 100 / orig);
  addCheck({
    id: "P2-9/metadata-overhead",
    producer: "Stage 1 shard JSON (provenance per-field)",
    consumer: "Phase 2 .bin runtime memory budget",
    status: overheadPct > 50 ? "warn" : "ok",
    detail: `swordman shard ${overheadPct}% metadata (${(orig-clean).toLocaleString()} / ${orig.toLocaleString()} bytes)`,
    info: overheadPct > 50
      ? `Phase 2 必须决定: provenance 走 sidecar (.bin 不带 prov, dist/data/_provenance/<id>.json 单独存) 还是 inline (.bin 带 prov 但浏览器多扛 ${Math.round((orig-clean)/1024)} KB/shard)。当前缺设计决策。`
      : null,
  });
}

// ─── Run ────────────────────────────────────────────────────────────────────
console.log("# Phase Readiness Gate");
console.log(`Generated: ${new Date().toISOString()}`);
console.log(`Mode: ${STRICT ? "strict (exit 1 on blocker)" : "report"}`);
console.log("");

if (PHASE === null || PHASE === 2) {
  console.log("## Phase 1 → Phase 2 readiness");
  console.log("");
  runPhase2Checks();
}

let blockerCount = 0;
let warnCount = 0;
let okCount = 0;
for (const c of checks) {
  if (c.status === "blocker") blockerCount++;
  else if (c.status === "warn") warnCount++;
  else okCount++;
}

console.log("");
console.log("## Results");
console.log("");
for (const c of checks) {
  const icon = c.status === "ok" ? "✅" : c.status === "warn" ? "⚠️ " : "❌";
  console.log(`${icon} ${c.id}`);
  console.log(`   producer : ${c.producer}`);
  console.log(`   consumer : ${c.consumer}`);
  console.log(`   detail   : ${c.detail}`);
  if (c.info) {
    for (const line of c.info.split("\n")) console.log(`   info     : ${line}`);
  }
  console.log("");
}

console.log(`Verdict: ${okCount} ok, ${warnCount} warn, ${blockerCount} blocker`);

if (STRICT && blockerCount > 0) {
  console.error(`\n${blockerCount} blocker(s) — Phase 2 not ready.`);
  process.exit(1);
}
