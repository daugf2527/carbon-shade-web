#!/usr/bin/env node
/**
 * data-contract-audit.mjs — Field-level producer/consumer audit for shard JSONs.
 *
 * 元问题: shard 70% metadata. 每个字段 grep src/ 找 consumer, heuristic 分类
 * keep / sidecar / delete, 给 Phase 2 schema 设计提供数据基线。
 *
 * 扫:    verification/baseline-shards/**.json (16 shards)
 * 抽:    所有 leaf 字段路径 (按 dotted path, 数组用 [])
 * 找:    src/ 哪些文件 grep 到该 leaf key (top-level + 1-level qualified)
 * 分:    delete   = 0 src consumer (tests-only allowed for verification fields)
 *        sidecar  = consumer 仅在 tests/ 或 validator audit gate
 *        keep     = consumer 在 runtime src/ (engine / dnf-native runtime / data)
 * 出:    docs/engineering/data-contract-baseline.md
 *
 * Heuristic 是建议, 不是判决 — 用户 review 后改。
 *
 * 用法:
 *   node scripts/data-contract-audit.mjs              # 跑全部 + 写 md
 *   node scripts/data-contract-audit.mjs --dry        # 不写文件, 只 stdout
 *   node scripts/data-contract-audit.mjs --shard=swordman   # 单 shard 试跑
 *
 * 2026-05-29 created.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), "..");
const SHARDS_DIR = join(ROOT, "verification/baseline-shards");
const SRC_DIRS = ["src", "scripts", "tests", "tools/dnf-porting-src"];
const OUT_PATH = join(ROOT, "docs/engineering/data-contract-baseline.md");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const SHARD_FILTER = argv.find(a => a.startsWith("--shard="))?.slice("--shard=".length);

// ─── Step 1: enumerate shards ───────────────────────────────────────────────
function findShards(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findShards(p));
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(p);
  }
  return out;
}
const allShards = findShards(SHARDS_DIR);
const shards = SHARD_FILTER
  ? allShards.filter(p => p.includes(SHARD_FILTER))
  : allShards;
console.log(`# data-contract-audit (16 shards mode)`);
console.log(`Scanning ${shards.length} shards...`);

// ─── Step 2: extract leaf field paths ───────────────────────────────────────
// path 形如 "chr.jumpPower.value" | "skills[].coolTime.dungeonMs"
//          "animations[].frames[].attackBoxes" | "manifest.files[].sha256"
// 数组聚合成 [], 同一 shape 的多 element 共享 path
// extractPaths 现在能识别 dict (top 层 skills/animations/attacks/tables) 并聚合为 {}
// dict 判定: object 的 keys 全是 string 且 value shape 同质 (>3 keys 视为 dict, 否则视为 record)
function isDictLike(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length < 5) return false; // 小对象当 record
  // sample 检查: 前 3 个 value 是否都是 object 且 keys 高度重叠
  const samples = keys.slice(0, 3).map(k => obj[k]);
  if (!samples.every(v => v && typeof v === "object" && !Array.isArray(v))) return false;
  const keySets = samples.map(v => new Set(Object.keys(v)));
  if (keySets[0].size === 0) return false;
  const overlapRatio = [...keySets[0]].filter(k => keySets[1].has(k) && keySets[2].has(k)).length / keySets[0].size;
  return overlapRatio >= 0.5;
}
function extractPaths(node, prefix = "") {
  const paths = new Map(); // path -> {types: Set, sampleValue, sampleSize}
  function walk(node, prefix) {
    if (node === null) {
      addLeaf(prefix, "null", null);
      return;
    }
    if (typeof node !== "object") {
      addLeaf(prefix, typeof node, node);
      return;
    }
    if (Array.isArray(node)) {
      if (node.length === 0) {
        addLeaf(prefix, "array(empty)", null);
        return;
      }
      for (let i = 0; i < Math.min(node.length, 3); i++) {
        walk(node[i], prefix + "[]");
      }
      return;
    }
    // dict 聚合
    if (isDictLike(node)) {
      const keys = Object.keys(node);
      addLeaf(prefix + "{}", "dict", `dict<${keys.length} keys>`);
      // walk first value to extract inner structure
      walk(node[keys[0]], prefix + "{}");
      return;
    }
    if (Object.keys(node).length === 0) {
      addLeaf(prefix, "object(empty)", null);
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      const next = prefix ? `${prefix}.${k}` : k;
      walk(v, next);
    }
  }
  function addLeaf(path, type, value) {
    if (!paths.has(path)) {
      paths.set(path, {
        types: new Set([type]),
        sampleValue: typeof value === "string" ? value.slice(0, 60) : value,
      });
    } else {
      paths.get(path).types.add(type);
    }
  }
  walk(node, prefix);
  return paths;
}

// ─── Step 3: aggregate paths across all shards ──────────────────────────────
// path -> {shards: Set<shardName>, types: Set, sampleValue}
const fieldRegistry = new Map();
let totalShardBytes = 0;
const shardSummaries = [];
for (const shardPath of shards) {
  const shardName = relative(SHARDS_DIR, shardPath).replace(/\\/g, "/");
  const text = readFileSync(shardPath, "utf-8");
  totalShardBytes += text.length;
  const json = JSON.parse(text);
  const paths = extractPaths(json);
  shardSummaries.push({
    name: shardName,
    bytes: text.length,
    fieldCount: paths.size,
  });
  for (const [path, info] of paths) {
    if (!fieldRegistry.has(path)) {
      fieldRegistry.set(path, {
        shards: new Set([shardName]),
        types: new Set(info.types),
        sampleValue: info.sampleValue,
      });
    } else {
      const r = fieldRegistry.get(path);
      r.shards.add(shardName);
      for (const t of info.types) r.types.add(t);
      if (r.sampleValue === null && info.sampleValue !== null) r.sampleValue = info.sampleValue;
    }
  }
}
console.log(`  collected ${fieldRegistry.size} unique field paths`);

// ─── Step 4: extract unique leaf-key tokens for grep ────────────────────────
// 每个 path 取最后一段当 key — 这是 grep 的目标 (.someKey 形式)
// 同时取倒数第二段做 qualifier (e.g. "provenance.extractTimestamp" 的 "provenance")
function leafKey(path) {
  const parts = path.split(".");
  return parts[parts.length - 1].replace(/\[\]$/, "");
}
function parentKey(path) {
  const parts = path.split(".");
  if (parts.length < 2) return null;
  return parts[parts.length - 2].replace(/\[\]$/, "");
}

// 收集所有 leaf keys 一次性 grep — 比逐字段 spawn 快 100×
const allKeys = new Set();
for (const path of fieldRegistry.keys()) {
  allKeys.add(leafKey(path));
}
console.log(`  ${allKeys.size} unique leaf keys to grep`);

// ─── Step 5: bulk grep across src/scripts/tests ─────────────────────────────
// 一次性 grep 所有候选 key 的 .key 形式 — 拿到 file → key set 倒排索引
function bulkGrep(keys) {
  // grep 一次性扫所有 *.ts *.mjs *.js *.cpp *.h, 每行匹配一个 key
  // 用 alternation 太长会 ENAMETOOLONG; 分批 100 keys 一组
  const keyArr = [...keys].filter(k => k && k.length >= 3 && /^[a-zA-Z_]/.test(k));
  const fileKeyMap = new Map(); // file -> Set<key>
  const BATCH = 80;
  for (let i = 0; i < keyArr.length; i += BATCH) {
    const batch = keyArr.slice(i, i + BATCH);
    // pattern: \b(key1|key2|...)\b
    const pattern = `\\b(${batch.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`;
    const args = [
      "-r", "-n", "-o", "-E",
      "--include=*.ts", "--include=*.mjs", "--include=*.js",
      "--include=*.cpp", "--include=*.h", "--include=*.hpp",
      "--include=*.fbs",
      pattern,
      ...SRC_DIRS,
    ];
    const r = spawnSync("grep", args, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, cwd: ROOT });
    // grep -o 输出: file:lineno:matched
    for (const line of (r.stdout || "").split("\n")) {
      if (!line) continue;
      const m = line.match(/^([^:]+):\d+:(.+)$/);
      if (!m) continue;
      const [, file, matched] = m;
      if (!fileKeyMap.has(file)) fileKeyMap.set(file, new Set());
      fileKeyMap.get(file).add(matched);
    }
  }
  // 倒排: key -> Set<file>
  const keyFileMap = new Map();
  for (const [file, keys] of fileKeyMap) {
    for (const k of keys) {
      if (!keyFileMap.has(k)) keyFileMap.set(k, new Set());
      keyFileMap.get(k).add(file);
    }
  }
  return keyFileMap;
}
console.log(`  bulk grep across ${SRC_DIRS.join(", ")}...`);
const keyFileMap = bulkGrep(allKeys);
console.log(`  ${keyFileMap.size} keys have at least one match`);

// ─── Step 6: classify each field path ───────────────────────────────────────
// heuristic:
//   - shard-only (writer, no reader): consumer files \ writer files == empty
//   - tests-only / validator-only: all consumers in tests/ or validator.ts
//   - runtime: at least one consumer in src/engine/ or src/dnf-native-combat/ runtime path
//   - producer files identified by location: parsers/, exporter/, dnf-extract C++
const PRODUCER_PATTERNS = [
  /^src[\\/]dnf-native-combat[\\/]data[\\/]parsers[\\/]/,
  /^src[\\/]dnf-native-combat[\\/]data[\\/]exporter[\\/]/,
  /^src[\\/]dnf-native-combat[\\/]data[\\/]importer[\\/]/,
  /^src[\\/]dnf-native-combat[\\/]data[\\/]validator\.ts$/,  // validator writes via Zod schemas
  /^tools[\\/]dnf-porting-src[\\/]/,
];
function isProducer(file) {
  return PRODUCER_PATTERNS.some(re => re.test(file));
}
function isTestOnly(file) {
  return /^tests[\\/]/.test(file);
}
function isRuntime(file) {
  // engine/ + game/ + combat/ + main.ts + data/official/ + dnf-native runtime (非 producer 且非 validator)
  // validator.ts 是 audit gate, 算 sidecar 类
  if (/validator\.ts$/.test(file)) return false;
  if (/^src[\\/]engine[\\/]/.test(file)) return true;
  if (/^src[\\/]game[\\/]/.test(file)) return true;
  if (/^src[\\/]combat[\\/]/.test(file)) return true;
  if (/^src[\\/]main\.ts$/.test(file)) return true;
  if (/^src[\\/]data[\\/]official[\\/]/.test(file)) return true;
  if (/^src[\\/]dnf-native-combat[\\/]/.test(file) && !isProducer(file)) return true;
  return false;
}
function isAuditGate(file) {
  return /validator\.ts$/.test(file);
}
function isScript(file) {
  return /^scripts[\\/]/.test(file);
}
function isFbs(file) {
  return file.endsWith(".fbs");
}

function classify(path, info) {
  const key = leafKey(path);
  const files = keyFileMap.get(key) || new Set();
  const producers = [];
  const runtimeConsumers = [];
  const auditConsumers = [];
  const testConsumers = [];
  const scriptConsumers = [];
  const fbsConsumers = [];
  for (const f of files) {
    if (isFbs(f)) fbsConsumers.push(f);
    else if (isAuditGate(f)) auditConsumers.push(f);
    else if (isProducer(f)) producers.push(f);
    else if (isRuntime(f)) runtimeConsumers.push(f);
    else if (isTestOnly(f)) testConsumers.push(f);
    else if (isScript(f)) scriptConsumers.push(f);
  }
  // 决策树
  let decision, reason;
  if (runtimeConsumers.length > 0) {
    decision = "keep";
    reason = `runtime consumer: ${runtimeConsumers.slice(0,2).join(", ")}${runtimeConsumers.length>2?"...":""}`;
  } else if (auditConsumers.length > 0 || testConsumers.length > 0 || scriptConsumers.length > 0) {
    decision = "sidecar";
    reason = `audit/tests/scripts only (${auditConsumers.length}A+${testConsumers.length}T+${scriptConsumers.length}S)`;
  } else if (producers.length > 0) {
    decision = "delete";
    reason = `producer-only, no consumer found`;
  } else {
    decision = "delete";
    reason = files.size === 0 ? "no grep match anywhere" : `only fbs schema match (${fbsConsumers.length})`;
  }
  if (key === "raw" || key === "sections") {
    decision = "delete";
    reason = "key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费";
  }
  // ─── 业务白名单 override (2026-05-29 review by user) ─────────────────────
  // 这些字段 Phase 3 战斗 tick 一定要读, 但 runtime 还没写所以 grep 0 命中.
  // 直接固化结论, 避免每次 review 都重决.
  // 出处: docs/engineering/data-contract-baseline.md review pass 1
  const BUSINESS_KEEP_KEYS = new Set([
    // 角色成长 (chr.growth — 17 级数值表 × 9 字段)
    "growth", "hpMax", "mpMax", "physicalAttack", "magicalAttack",
    "physicalDefense", "magicalDefense", "mpRegenSpeed",
    // 物理常数枚举 (DNF 物理引擎要全套)
    "downParamType", "knockBackType", "zAccelType",
    "speedValueDefault", "yNormalMoveVelocity", "xNormalMoveVelocity",
    "lightObjectMaxWeight", "middleObjectMaxWeight",
    "meleeHitDelayStatusType", "hitRecoveryStatusType",
    "defaultGravityAccel", "forceToVelocityConst",
    // 怪物倍率 (mob.abilityCategory)
    "abilityCategory", "equipment_magical_attack", "equipment_magical_defense",
    "equipment_physical_attack", "equipment_physical_defense", "hp max",
    // 攻击 hitbox / damage box (frame data 核心)
    "damageBoxes", "attackBoxes", "anchor", "x1", "y1", "z1", "x2", "y2", "z2",
    // 元素枚举 (enums.json tables — 伤害公式判抗性)
    "tables",
  ]);
  const BUSINESS_KEEP_PATH_PATTERNS = [
    /^chr\.growth/,
    /\.abilityCategory\./,
    /animations\{?\}?\.frames\[\]\.(damageBoxes|attackBoxes|anchor)/,
    /^constants\.(downParamType|knockBackType|zAccelType)\./,
    /^constants\.(speedValueDefault|yNormalMoveVelocity|xNormalMoveVelocity|lightObjectMaxWeight|middleObjectMaxWeight|meleeHitDelayStatusType|hitRecoveryStatusType|defaultGravityAccel|forceToVelocityConst)$/,
    /^tables\{?\}?\./,  // enums.tables.* — 元素表
    /^maps\[\]\.(monsterSpawns|passiveObjects|specialPassiveObjects)/,  // 副本布点 Phase 4
    /^dgn\.mapSpecification/,  // 副本地图布局
    /\.attackKind\[\]\.(t|v)$/,  // mob.attackKind 24-元素数组
    /^chr\.moduleDamageRate/,  // B 档保险留 (review pass 1 倾向留)
    /^skills\{?\}?\.levelProperty\[\]\.(t|v)$/,  // 技能等级数据 Phase 4 进阶要用
  ];
  if (BUSINESS_KEEP_KEYS.has(key) ||
      BUSINESS_KEEP_PATH_PATTERNS.some(re => re.test(path))) {
    decision = "keep";
    reason = "business whitelist (review pass 1) — Phase 3+ runtime 必读, runtime 代码暂未写";
  }
  // ─── OOS 黑名单 override ─────────────────────────────────────────────────
  // 这些字段属于 70-cap PVE 范围外, 明确不要.
  // awakening = 觉醒 (Lv75+ 解锁), worldmapPatternInfo = 现代世界地图
  const OOS_PATH_PATTERNS = [
    /^chr\.awakening\.(names|skillSlots|tier1SlotCounts|tier2SlotCounts)/,
    /^dgn\.worldmapPatternInfo/,
  ];
  if (OOS_PATH_PATTERNS.some(re => re.test(path))) {
    decision = "delete";
    reason = "OOS — 70-cap PVE 范围外 (awakening Lv75+ / worldmap 现代系统)";
  }
  // metadata 字段硬归 sidecar — 这些是 audit/build-time, 不应进 runtime hot path
  // 即使 validator.ts 或 tests 读, 也不该混在业务数据里走 .bin
  const METADATA_KEYS = new Set([
    "provenance", "extractTimestamp", "extractorVersion", "sourceRef",
    "sourcePvfHash", "sourceType", "requiresManualVerification",
    "sectionName", "shape_version", "extractor_version", "extracted_at",
    "exported_at", "manifest_version", "pvf_hash", "sha256", "sizeBytes",
    "contentSha256",
  ]);
  // 还要看 path 是否在 provenance 子树下
  const inProvenanceSubtree = path.includes(".provenance.") || path.endsWith(".provenance");
  if (METADATA_KEYS.has(key) || inProvenanceSubtree) {
    decision = "sidecar";
    reason = `metadata 字段 — audit/build-time only, 不进 runtime .bin`;
  }
  // unit 字段同样是 build-time hint, 不必每 leaf 都带
  if (key === "unit" && path.endsWith(".unit")) {
    decision = "sidecar";
    reason = `unit 是 build-time hint, schema 默认即可`;
  }
  return {
    decision,
    reason,
    producers: producers.length,
    runtimeConsumers: runtimeConsumers.length,
    auditConsumers: auditConsumers.length,
    testConsumers: testConsumers.length,
    scriptConsumers: scriptConsumers.length,
    fbsConsumers: fbsConsumers.length,
    consumerSamples: [...runtimeConsumers, ...auditConsumers, ...testConsumers].slice(0, 3),
  };
}

const classified = [];
for (const [path, info] of fieldRegistry) {
  const c = classify(path, info);
  classified.push({
    path,
    shardCount: info.shards.size,
    types: [...info.types].join("|"),
    sampleValue: info.sampleValue,
    ...c,
  });
}

// ─── Step 7: aggregate stats ───────────────────────────────────────────────
const byDecision = { keep: 0, sidecar: 0, delete: 0 };
for (const c of classified) byDecision[c.decision]++;

// 估算 metadata 字节
// 算法: 对每个 shard 做全 walk, 每个 node 看它的 path 是否落在某分类子树, 整树归类
function estimateBytes(decision) {
  let total = 0;
  // 预算子树根: 任何 path 含某 decision 字段, 把它的 parent path 也视为该 decision 候选根
  // 但更简单: 直接基于 key 末段判断 metadata-like
  function nodeDecision(prefix, key) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const c = classifiedMap.get(fullPath);
    if (c) return c.decision;
    const dictPath = fullPath + "{}";
    const dc = classifiedMap.get(dictPath);
    if (dc) return dc.decision;
    // 子树继承: 没 classified 命中, 用 key/path 启发式
    const METADATA_KEYS = new Set([
      "provenance", "extractTimestamp", "extractorVersion", "sourceRef",
      "sourcePvfHash", "sourceType", "requiresManualVerification",
      "sectionName", "extractor_version", "extract_timestamp",
      "source_ref", "source_pvf_hash", "section_name",
    ]);
    if (METADATA_KEYS.has(key)) return "sidecar";
    if (fullPath.includes(".provenance.") || fullPath.endsWith(".provenance")) return "sidecar";
    if (key === "raw" || key === "sections") return "delete";
    // OOS 子树整体当 delete
    if (/^chr\.awakening\./.test(fullPath) || /^dgn\.worldmapPatternInfo/.test(fullPath)) {
      return "delete";
    }
    // 业务白名单子树整体当 keep
    if (/^chr\.growth/.test(fullPath) ||
        /\.abilityCategory\b/.test(fullPath) ||
        /^constants\b/.test(fullPath) ||
        /^tables\b/.test(fullPath) ||
        /\.(damageBoxes|attackBoxes|anchor)\b/.test(fullPath) ||
        /^dgn\.mapSpecification/.test(fullPath)) {
      return "keep";
    }
    return null;
  }
  for (const shardPath of shards) {
    const text = readFileSync(shardPath, "utf-8");
    const json = JSON.parse(text);
    function walk(node, prefix, key, parentDecision) {
      // 先判本节点 decision
      const d = key === undefined ? null : nodeDecision(prefix, key);
      const myDecision = d || parentDecision;
      const newPrefix = key === undefined ? "" : (prefix ? `${prefix}.${key}` : key);
      if (node === null || typeof node !== "object") {
        // leaf: 按当前 decision 归类
        if (myDecision === decision) {
          return JSON.stringify(node).length + (key ? key.length + 4 : 0);
        }
        return 0;
      }
      if (Array.isArray(node)) {
        let s = 0;
        for (let i = 0; i < node.length; i++) s += walk(node[i], newPrefix + "[]", undefined, myDecision);
        // 也算上 array 框 [] 和 , 间隔
        if (myDecision === decision) s += 2 + Math.max(0, node.length - 1);
        return s;
      }
      let s = 0;
      // object 框 {} 和 keys/colons/commas — 简化: 跟着子项走
      for (const [k, v] of Object.entries(node)) {
        s += walk(v, newPrefix, k, myDecision);
      }
      // 加上 object 本身的框开销 (仅当本 object 整体归类时)
      if (myDecision === decision && !parentDecision) {
        // 估算本层 keys 的字符数
        let frame = 2; // {}
        for (const k of Object.keys(node)) frame += k.length + 4; // "k":
        s += frame;
      }
      return s;
    }
    total += walk(json, "", undefined, null);
  }
  return total;
}

// 建一个 path → classified 的 O(1) 查找表
const classifiedMap = new Map();
for (const c of classified) classifiedMap.set(c.path, c);
const deleteBytes = estimateBytes("delete");
const sidecarBytes = estimateBytes("sidecar");

// ─── Step 8: emit markdown ─────────────────────────────────────────────────
function fmtBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024*1024) return (n/1024).toFixed(1) + " KB";
  return (n/1024/1024).toFixed(2) + " MB";
}
function mdEscape(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 50);
}

const md = [];
md.push("# Data Contract Baseline (Stage 1 shard fields)");
md.push("");
md.push(`**生成时间**: ${new Date().toISOString()}  `);
md.push(`**生成脚本**: \`scripts/data-contract-audit.mjs\`  `);
md.push(`**扫描范围**: ${shards.length} shards, ${fieldRegistry.size} unique field paths  `);
md.push(`**分类原则**: producer/consumer 实测 grep, heuristic 给建议 (keep/sidecar/delete), **review override 优先**`);
md.push("");
md.push("## 元摘要");
md.push("");
md.push("| 指标 | 值 |");
md.push("|------|-----|");
md.push(`| Shard 总字节 | ${fmtBytes(totalShardBytes)} |`);
md.push(`| 字段总数 (unique paths) | ${fieldRegistry.size} |`);
md.push(`| **keep** (runtime 真消费) | ${byDecision.keep} (${(byDecision.keep*100/fieldRegistry.size).toFixed(0)}%) |`);
md.push(`| **sidecar** (仅 tests/scripts 读) | ${byDecision.sidecar} (${(byDecision.sidecar*100/fieldRegistry.size).toFixed(0)}%) |`);
md.push(`| **delete** (0 消费 or producer-only) | ${byDecision.delete} (${(byDecision.delete*100/fieldRegistry.size).toFixed(0)}%) |`);
md.push(`| sidecar 估算字节 | ${fmtBytes(sidecarBytes)} (${(sidecarBytes*100/totalShardBytes).toFixed(0)}% of shard) |`);
md.push(`| delete 估算字节 | ${fmtBytes(deleteBytes)} (${(deleteBytes*100/totalShardBytes).toFixed(0)}% of shard) |`);
md.push(`| Phase 2 .bin 候选体积 | ${fmtBytes(totalShardBytes - sidecarBytes - deleteBytes)} (keep only) |`);
md.push("");

// ─── Decisions: delete first (death rows), then sidecar, then keep ─────────
function emitSection(title, decision, anchor) {
  md.push(`## ${title}`);
  md.push("");
  const rows = classified.filter(c => c.decision === decision)
    .sort((a, b) => b.shardCount - a.shardCount || a.path.localeCompare(b.path));
  if (rows.length === 0) {
    md.push("(none)");
    md.push("");
    return;
  }
  md.push("| field path | shards | types | producers | runtime | audit | tests | scripts | reason | sample |");
  md.push("|------------|--------|-------|-----------|---------|-------|-------|---------|--------|--------|");
  for (const r of rows) {
    md.push(`| \`${r.path}\` | ${r.shardCount} | ${r.types} | ${r.producers} | ${r.runtimeConsumers} | ${r.auditConsumers} | ${r.testConsumers} | ${r.scriptConsumers} | ${mdEscape(r.reason)} | ${mdEscape(r.sampleValue)} |`);
  }
  md.push("");
}

emitSection("一、🗑️ delete 候选 (0 runtime consumer)", "delete");
emitSection("二、📦 sidecar 候选 (仅 tests/scripts 用)", "sidecar");
emitSection("三、✅ keep (runtime 真消费)", "keep");

md.push("## 四、Shard 体积分布");
md.push("");
md.push("| shard | bytes | fields |");
md.push("|-------|-------|--------|");
for (const s of shardSummaries.sort((a,b)=>b.bytes-a.bytes)) {
  md.push(`| ${s.name} | ${fmtBytes(s.bytes)} | ${s.fieldCount} |`);
}
md.push("");

md.push("## 五、heuristic 限制");
md.push("");
md.push("- **业务白名单 override**: `chr.growth` / `mob.abilityCategory` / `constants.*` / `tables` / `damageBoxes/attackBoxes/anchor` / `maps[].*Objects` 等已硬编码归 keep, 因为 runtime 代码还没写但 Phase 3 确定要用. 来源: review pass 1 (2026-05-29).");
md.push("- **OOS 黑名单**: `chr.awakening.*` (Lv75+ 觉醒) / `dgn.worldmapPatternInfo` (现代世界地图) 已硬编码归 delete, 70-cap PVE 范围外.");
md.push("- **grep 是字面量匹配**: 字段名通过模板字符串、解构、动态 key 访问的, heuristic 检测不到.");
md.push("- **producer 列表是白名单**: parsers/exporter/importer/validator + tools/dnf-porting-src. 这之外的写入点会被算成 consumer.");
md.push("- **runtime 定义**: src/engine/ + src/game/ + src/combat/ + src/data/official/ + src/dnf-native-combat 内非 producer 文件. dnf-native runtime 子目录 (如 stateMachine, simulation) 还没建, 当前所有 dnf-native 都被算成 producer — Phase 2 起跑后这条会自动转好.");
md.push("- **leaf key 太短的字段** (`raw` / `sections`) 已硬编码为 delete (实测无消费, 见 Stage 1 audit).");
md.push("- **同名但语义不同的 key** (e.g. `value` 出现在 jumpPower / liftUp / coolTime / requiredLevel) heuristic 一律按命中文件聚合, 不分语义. 这通常没问题, 因为同名字段的消费策略一致 (要么都 runtime 要么都 sidecar).");
md.push("");
md.push("## 六、下一步");
md.push("");
md.push("1. **review 一节 delete 候选** — 标 false-positive (动态访问/未来要用) 改成 keep");
md.push("2. **review 一节 sidecar 候选** — 决定是否真的搬到 dist/data/_provenance/ 单独存");
md.push("3. **基于 keep 列表设计 Phase 2 .fbs** — 每个 root_type 字段必在 keep 列表里有对应路径");
md.push("4. **裁过的 schema 不再有 71% metadata** — Phase 2 .bin 体积可压到 keep + 必要 audit gate");
md.push("");

const mdText = md.join("\n");
if (DRY) {
  console.log("---DRY RUN, would write to: " + OUT_PATH);
  console.log(mdText.slice(0, 2000));
} else {
  if (!existsSync(dirname(OUT_PATH))) mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, mdText, "utf-8");
  console.log(`\n✅ wrote ${OUT_PATH}`);
  console.log(`   ${classified.length} fields classified`);
  console.log(`   keep=${byDecision.keep}, sidecar=${byDecision.sidecar}, delete=${byDecision.delete}`);
  console.log(`   sidecar bytes: ${fmtBytes(sidecarBytes)} (${(sidecarBytes*100/totalShardBytes).toFixed(0)}%)`);
  console.log(`   delete bytes:  ${fmtBytes(deleteBytes)} (${(deleteBytes*100/totalShardBytes).toFixed(0)}%)`);
}
