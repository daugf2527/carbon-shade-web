#!/usr/bin/env node
/**
 * consistency-check.mjs — Memory / docs / code / git 四方一致性扫描
 *
 * Usage:
 *   node scripts/consistency-check.mjs                # 文本报告 (stdout)
 *   node scripts/consistency-check.mjs --output json  # JSON
 *   node scripts/consistency-check.mjs --strict       # 任何 drift exit 1
 *
 * 设计意图（goal: 记忆/git/代码/文档四方一致性）：
 *   声明源（claim site）= 文档/memory 里写死的事实数字（"43 curated", "10 parsers", "478 API"...）
 *   实测源（truth site）= 文件系统/git/grep 当下实测
 *   drift = 任一 claim ≠ truth
 *
 * 该 script 不做"修复"，只扫漂移。修复后人工或 agent 再跑一遍验证。
 *
 * 加新检查：在 CHECKS[] 末尾追加 { name, claimSite, claim, truthSite, truth, ok }。
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const HOME = process.env.USERPROFILE || process.env.HOME || "";
const MEMORY_DIR = join(HOME, ".claude/projects/D--carbon-shade-web/memory");

const args = process.argv.slice(2);
const OUTPUT_JSON = args.includes("--output") && args[args.indexOf("--output") + 1] === "json";
const STRICT = args.includes("--strict");

// ── 通用工具 ────────────────────────────────────────────────────────────

function readTextSafe(path) {
  try { return readFileSync(path, "utf-8"); } catch { return null; }
}

function countTestFiles() {
  const dir = join(ROOT, "tests/static");
  if (!existsSync(dir)) return 0;
  let n = 0;
  const walk = (p) => {
    for (const entry of readdirSync(p, { withFileTypes: true })) {
      const fp = join(p, entry.name);
      if (entry.isDirectory()) walk(fp);
      else if (entry.name.endsWith(".test.ts")) n++;
    }
  };
  walk(dir);
  return n;
}

function countParserFiles() {
  const dir = join(ROOT, "src/dnf-native-combat/data/parsers");
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter(f =>
    /^(Chr|Mob|Atk|Skl|Ani|Dgn|Etc|Map|Nut|Img)Parser\.ts$|NutExtractor\.ts$/.test(f)
  ).length;
}

function getNpmScripts() {
  const pkg = JSON.parse(readTextSafe(join(ROOT, "package.json")) || "{}");
  return Object.keys(pkg.scripts || {});
}

function git(cmd) {
  try { return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf-8" }).trim(); }
  catch { return null; }
}

function extractRegex(text, re) {
  if (!text) return null;
  const m = text.match(re);
  return m ? m[1] : null;
}

// ── 声明 / 实测 收集 ────────────────────────────────────────────────────

const claudeMd = readTextSafe(join(ROOT, "CLAUDE.md"));
const docsReadme = readTextSafe(join(ROOT, "docs/README.md"));
const memoryIndex = readTextSafe(join(MEMORY_DIR, "MEMORY.md"));
const nutValidation = readTextSafe(join(ROOT, "docs/engineering/nut-validation-2026-05-27.md"));

const checks = [];

// 1. CLAUDE.md "10 parsers" claim vs filesystem
checks.push({
  name: "claude-md/parsers-count",
  claimSite: "CLAUDE.md (Architecture)",
  claim: extractRegex(claudeMd, /Chr\/Mob\/Atk\/Skl\/Ani\/Dgn\/Etc\/Map\/Nut\/Img \((\d+) total/),
  truthSite: "src/dnf-native-combat/data/parsers/*.ts",
  truth: String(countParserFiles()),
});

// 2. CLAUDE.md "baseline 43 curated files" vs scripts/stage1-baseline.mjs
const baselineSrc = readTextSafe(join(ROOT, "scripts/stage1-baseline.mjs")) || "";
const curatedMatch = baselineSrc.match(/CURATED_FILES\s*=\s*\[([\s\S]*?)\]/);
const curatedCount = curatedMatch
  ? curatedMatch[1].split(/\n/).filter(l => l.trim().startsWith('"') || l.trim().startsWith("'")).length
  : "unknown";
checks.push({
  name: "claude-md/baseline-curated-count",
  claimSite: "CLAUDE.md (Commands table)",
  claim: extractRegex(claudeMd, /baseline.*?\((\d+) curated files/),
  truthSite: "scripts/stage1-baseline.mjs CURATED_FILES",
  truth: String(curatedCount),
});

// 3. NPM scripts 的所有命令是否在 CLAUDE.md Commands 表里有出现
const scripts = getNpmScripts();
const missingFromClaude = scripts.filter(s => claudeMd && !claudeMd.includes(`npm run ${s}`));
checks.push({
  name: "claude-md/npm-scripts-coverage",
  claimSite: "CLAUDE.md Commands",
  claim: `${scripts.length - missingFromClaude.length} scripts referenced`,
  truthSite: "package.json scripts",
  truth: `${scripts.length} scripts defined`,
  drift: missingFromClaude.length > 0 ? `Missing from CLAUDE.md: ${missingFromClaude.join(", ")}` : null,
});

// 4. CLAUDE.md "Active branch: dnf-native" vs git
const currentBranch = git("rev-parse --abbrev-ref HEAD");
checks.push({
  name: "claude-md/active-branch",
  claimSite: "CLAUDE.md (Project identity)",
  claim: extractRegex(claudeMd, /Active branch: `([^`]+)`/),
  truthSite: "git rev-parse --abbrev-ref HEAD",
  truth: currentBranch,
});

// 5. tests/static 总数 vs CLAUDE.md（如果声明了）
const testCount = countTestFiles();
checks.push({
  name: "code/static-test-count",
  claimSite: "(self-report)",
  claim: String(testCount),
  truthSite: "tests/static/**/*.test.ts",
  truth: String(testCount),
  info: "informational: live count",
});

// 6. 22-system claim 与 nut-validation 报告的一致性
const truthState = readTextSafe(join(MEMORY_DIR, "22-system-truth-state.md"));
const memClaim478 = extractRegex(truthState, /case-sensitive 引擎 API \| (\d+)/);
// nut-validation 多处出现 478，取最权威的 §十 audit 修正后的数
const nutClaim478 = extractRegex(nutValidation, /剔除后\*\*实测 (\d+) case-sensitive/);
checks.push({
  name: "memory/nut-validation/api-count",
  claimSite: "22-system-truth-state.md",
  claim: memClaim478,
  truthSite: "docs/engineering/nut-validation-2026-05-27.md §十 audit",
  truth: nutClaim478,
});

// 7. memory 索引 vs 实际文件
let memoryFiles = [];
try { memoryFiles = readdirSync(MEMORY_DIR).filter(f => f.endsWith(".md") && f !== "MEMORY.md"); } catch {}
const indexedFiles = (memoryIndex || "").match(/\(([a-z0-9-]+\.md)\)/g)?.map(s => s.slice(1, -1)) || [];
const orphanFiles = memoryFiles.filter(f => !indexedFiles.includes(f));
const deadLinks = indexedFiles.filter(f => !memoryFiles.includes(f));
checks.push({
  name: "memory/index-vs-files",
  claimSite: "MEMORY.md",
  claim: `${indexedFiles.length} entries indexed`,
  truthSite: `${MEMORY_DIR}/*.md`,
  truth: `${memoryFiles.length} memory files on disk`,
  drift: (orphanFiles.length || deadLinks.length)
    ? `Orphan (in dir, not in index): ${orphanFiles.join(", ") || "none"}; Dead links (in index, not in dir): ${deadLinks.join(", ") || "none"}`
    : null,
});

// 8. memory 内 [[wiki-links]] 死链（排除已知的 skill 引用）
const KNOWN_SKILL_REFS = new Set([
  "dnf-physics-extraction",
  "dispatching-parallel-agents",
  "executing-plans",
  "finishing-a-development-branch",
  "session-debrief",
  "subagent-driven-development",
  "systematic-debugging",
  "test-driven-development",
  "using-superpowers",
  "verify-all",
  "gen-test",
  "add-action",
  "closed-loop",
]);
const wikiLinks = new Set();
for (const f of memoryFiles) {
  const text = readTextSafe(join(MEMORY_DIR, f)) || "";
  for (const m of text.matchAll(/\[\[([a-z0-9-]+)\]\]/g)) wikiLinks.add(m[1]);
}
const memorySlugs = new Set(memoryFiles.map(f => f.replace(/\.md$/, "")));
const deadWikiLinks = [...wikiLinks].filter(l => !memorySlugs.has(l) && !KNOWN_SKILL_REFS.has(l));
checks.push({
  name: "memory/wiki-links",
  claimSite: "memory/*.md [[links]]",
  claim: `${wikiLinks.size} unique [[links]]`,
  truthSite: `memory/*.md slugs + known skill names`,
  truth: `${memorySlugs.size} memory + ${KNOWN_SKILL_REFS.size} skills`,
  drift: deadWikiLinks.length ? `Dead [[links]] (not memory, not skill): ${deadWikiLinks.join(", ")}` : null,
});

// 9. uncommitted 工作树 — 提示性
const dirty = git("status --porcelain")?.split("\n").filter(Boolean).length || 0;
const ahead = extractRegex(git("status -sb") || "", /ahead (\d+)/) || "0";
checks.push({
  name: "git/working-tree",
  claimSite: "(none)",
  claim: "—",
  truthSite: "git status",
  truth: `${dirty} modified, ahead ${ahead}`,
  info: dirty > 0 || Number(ahead) > 0 ? "uncommitted/unpushed work" : "clean",
});

// 10. CLAUDE.md 引用的 docs/* 路径必须存在
const docRefs = (claudeMd || "").match(/docs\/[a-z0-9/_.-]+\.md/gi) || [];
const missingDocs = docRefs.filter(p => !existsSync(join(ROOT, p)));
checks.push({
  name: "claude-md/doc-refs",
  claimSite: "CLAUDE.md links",
  claim: `${docRefs.length} doc paths referenced`,
  truthSite: "filesystem",
  truth: `${docRefs.length - missingDocs.length} exist`,
  drift: missingDocs.length ? `Missing: ${[...new Set(missingDocs)].join(", ")}` : null,
});

// ════════════════════════════════════════════════════════════════════════
// 成熟度竖切组（11-15）— 不只查"存在性"，沿业务线追"成熟度"。
// 设计动机：浅层 horizontal check 扫数量全绿，纵向 vertical check 才能抓
// 到"声明已落 / 代码是 echo stub"这种漂移。详见 [[feedback-maturity-not-binary]]。
// ════════════════════════════════════════════════════════════════════════

// 11. .fbs schema 编译闭环 — .fbs 数 vs flatc 输出 .ts 数
// flatc 25.x 按 namespace 输出到子目录（如 carbon-shade/engine/schema/<name>-def.ts），
// 不是同目录 *_generated.ts。check 改为：每个 .fbs 必须有对应 <stem>-def.ts 存在于 generated 目录。
const schemaDir = join(ROOT, "src/engine/schema");
const fbsFiles = existsSync(schemaDir)
  ? readdirSync(schemaDir).filter(f => f.endsWith(".fbs"))
  : [];
// 递归扫 schemaDir 找所有 .ts（namespace 子目录里）
const allGeneratedTs = [];
if (existsSync(schemaDir)) {
  const walk = (p) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const fp = join(p, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith(".ts")) allGeneratedTs.push(e.name.replace(/\.ts$/, ""));
    }
  };
  walk(schemaDir);
}
// 每个 .fbs 必须有同 stem 或 root_type 名（kebab-case）的生成 .ts 之一存在
// include-only .fbs (无 root_type, 仅作 header) 容忍: 检查 stem 是否出现在任何生成 .ts 中
const uncompiledFbs = fbsFiles.filter(fbs => {
  const stem = fbs.replace(/\.fbs$/, "");
  const fbsContent = readTextSafe(join(schemaDir, fbs)) || "";
  const rootMatch = fbsContent.match(/root_type\s+(\w+)\s*;/);
  const rootKebab = rootMatch
    ? rootMatch[1].replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
    : null;
  if (rootMatch === null) {
    // include-only fbs (e.g. pairs.fbs): 解析所有 `table Xxx` 声明，逐个验证生成
    const tableMatches = [...fbsContent.matchAll(/table\s+(\w+)\s*\{/g)];
    if (tableMatches.length === 0) return true;  // 真正空 fbs，标记为未编译
    return tableMatches
      .map(m => m[1].replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase())
      .some(kebab => !allGeneratedTs.includes(kebab));
  }
  return !(
    allGeneratedTs.includes(`${stem}-def`) ||
    (rootKebab !== null && allGeneratedTs.includes(rootKebab))
  );
});
checks.push({
  name: "maturity/fbs-compiled",
  claimSite: ".fbs schema files",
  claim: `${fbsFiles.length} .fbs declared`,
  truthSite: "src/engine/schema/**/*-def.ts (flatc TS output)",
  truth: `${fbsFiles.length - uncompiledFbs.length}/${fbsFiles.length} compiled`,
  drift: uncompiledFbs.length > 0
    ? `${uncompiledFbs.length} .fbs uncompiled: ${uncompiledFbs.join(", ")}. Run: node scripts/compile-schema.mjs`
    : null,
});

// 12. ani.fbs 缺口 — field-matrix §七 把 Animation 列为每帧 tick 第 1 步，必须有 ani.fbs
const fieldMatrix = readTextSafe(join(ROOT, "docs/engineering/22-system-field-matrix.md")) || "";
const hasAnimationSystem = /## 一、Animation 系统/.test(fieldMatrix);
const hasAniFbs = fbsFiles.includes("ani.fbs");
checks.push({
  name: "maturity/animation-fbs",
  claimSite: "22-system-field-matrix.md §一 Animation",
  claim: hasAnimationSystem ? "Animation 系统已盘字段 (HOT, 每帧 tick 第 1 步)" : "(未提及)",
  truthSite: "src/engine/schema/ani.fbs",
  truth: hasAniFbs ? "exists" : "MISSING",
  drift: hasAnimationSystem && !hasAniFbs
    ? "field-matrix 列了 Animation 系统但 ani.fbs 缺失 (frames[i].attackBoxes/damageBoxes 无 schema)"
    : null,
});

// 13. sim-worker 成熟度 — 是否仍为 skeleton/echo stub
const simWorker = readTextSafe(join(ROOT, "src/engine/workers/sim-worker.ts")) || "";
const stubMarkers = [
  /skeleton/i,
  /TODO Stage 2/,
  /"skeleton:"\s*\+/,
];
const stubHits = stubMarkers.filter(re => re.test(simWorker)).length;
checks.push({
  name: "maturity/sim-worker-stub",
  claimSite: "sim-worker.ts content",
  claim: stubHits > 0 ? "still echo skeleton" : "no stub markers",
  truthSite: "skeleton/TODO markers",
  truth: `${stubHits}/${stubMarkers.length} markers present`,
  info: stubHits > 0
    ? `sim-worker 仍是 skeleton — Phase 3 T3.1 未启动。描述时不要写"Day 1 骨架已落"，应写"接口 stub"`
    : "sim-worker 已脱离 skeleton 态",
});

// 14. Phase 0 deliverables 存在性 — GameLoop / ShardLoader
const t04 = existsSync(join(ROOT, "src/engine/core/GameLoop.ts"));
const t03 = existsSync(join(ROOT, "src/engine/loader/ShardLoader.ts"));
const phase0Missing = [];
if (!t03) phase0Missing.push("T0.3 ShardLoader (src/engine/loader/)");
if (!t04) phase0Missing.push("T0.4 GameLoop (src/engine/core/)");
checks.push({
  name: "maturity/phase0-deliverables",
  claimSite: "2026-05-27-stage2-roadmap.md Phase 0",
  claim: "T0.3 + T0.4 in Phase 0 (1d)",
  truthSite: "src/engine/{loader,core}/",
  truth: `${2 - phase0Missing.length}/2 exist`,
  drift: phase0Missing.length ? `Missing: ${phase0Missing.join("; ")}` : null,
});

// 15. flatc 工具链就绪 — T0.1 验收条件 `flatc --version`
let flatcAvailable = false;
try {
  execSync("flatc --version", { stdio: "ignore" });
  flatcAvailable = true;
} catch {}
checks.push({
  name: "maturity/flatc-toolchain",
  claimSite: "Phase 0 T0.1 验收 `flatc --version` 输出正常",
  claim: "flatc CLI in PATH",
  truthSite: "shell which flatc",
  truth: flatcAvailable ? "available" : "NOT in PATH",
  drift: flatcAvailable ? null : "T0.1 未完成。详见 scripts/compile-schema.mjs 安装指引",
});

// 16. audit FIXED verdict 假阳性扫描 — fixverify 标 FIXED 但 working tree 仍在改
// 选最新 fixverify 目录（按 mtime 排，而非字母序——避免 20260523 字母上排在 2026-05-24 后面被错选）
const latestFixverify = (() => {
  const root = join(ROOT, "verification");
  if (!existsSync(root)) return null;
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter(e => e.isDirectory() && /audit-.*-fixverify$/.test(e.name))
    .map(e => {
      try {
        const st = execSync(`git log -1 --format=%ct -- "verification/${e.name}"`, { cwd: ROOT, encoding: "utf-8" }).trim();
        return { name: e.name, ts: Number(st) || 0 };
      } catch { return { name: e.name, ts: 0 }; }
    })
    .sort((a, b) => b.ts - a.ts);
  return dirs.length ? join(root, dirs[0].name) : null;
})();
let unfixedCount = 0;
let totalFixverifyFindings = 0;
if (latestFixverify) {
  for (const f of readdirSync(latestFixverify).filter(n => n.endsWith(".md"))) {
    const text = readTextSafe(join(latestFixverify, f)) || "";
    for (const m of text.matchAll(/\*\*verdict\*\*:\s*(\w+)/g)) {
      totalFixverifyFindings++;
      if (m[1] === "UNFIXED") unfixedCount++;
    }
  }
}
checks.push({
  name: "maturity/audit-unfixed",
  claimSite: latestFixverify ? `${latestFixverify.replace(ROOT, "")} verdicts` : "(no fixverify)",
  claim: "audit findings closed",
  truthSite: "**verdict**: UNFIXED count",
  truth: `${unfixedCount}/${totalFixverifyFindings} UNFIXED`,
  info: unfixedCount > 0
    ? `${unfixedCount} finding 仍 UNFIXED — 别假设 audit 全闭环。F3 类 mirror-coded fix 也可能假阳性`
    : "all closed",
});

// 17. 半成品（TODO/FIXME/skeleton/stub）扫描 — 老化趋势警报
// Sourced from verification/half-finished.md (A5 agent 2026-05-28 基线: 9 TODO 全 ≤ 5 天)
// 设计意图：单看绝对数无意义，看趋势——TODO 持续累积说明半成品在堆积。
let todoCount = 0;
let stubMarkerCount = 0;
const TODO_BASELINE = 18;  // 2026-05-28 baseline (consistency 宽口径 vs A5 报告 9 是因为 A5 用了更精细过滤)
const STUB_BASELINE = 36;  // skeleton+stub+not implemented 总数（含描述性 stub 词）
const codeRoots = ["src", "scripts", "tools"];
for (const root of codeRoots) {
  const rootDir = join(ROOT, root);
  if (!existsSync(rootDir)) continue;
  const walk = (p) => {
    for (const entry of readdirSync(p, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const fp = join(p, entry.name);
      if (entry.isDirectory()) { walk(fp); continue; }
      if (!/\.(ts|mjs|cjs|js)$/.test(entry.name)) continue;
      const text = readTextSafe(fp) || "";
      todoCount += (text.match(/\bTODO\b|\bFIXME\b|\bXXX\b|\bHACK\b/g) || []).length;
      stubMarkerCount += (text.match(/\bskeleton\b|\bstub\b|"not implemented"|'not implemented'/gi) || []).length;
    }
  };
  walk(rootDir);
}
const todoDelta = todoCount - TODO_BASELINE;
checks.push({
  name: "maturity/half-finished",
  claimSite: "verification/half-finished.md (A5 baseline 2026-05-28)",
  claim: `${TODO_BASELINE} TODO + ${STUB_BASELINE} stub markers`,
  truthSite: "src/ scripts/ tools/ live grep",
  truth: `${todoCount} TODO + ${stubMarkerCount} stub`,
  info: todoDelta > 5
    ? `⚠️ TODO 净增 ${todoDelta} — 半成品在累积，run A5 重新基线`
    : todoDelta < -3
    ? `✅ TODO 净减 ${-todoDelta} — 实装在推进，update baseline in script`
    : `TODO 在 baseline ±5 范围内`,
});

// 18. memory frontmatter verified_at 字段覆盖率
let memoryWithVerifiedAt = 0;
const oldMemoryWithoutVerifiedAt = [];
const NOW = Date.now();
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
for (const f of memoryFiles) {
  const text = readTextSafe(join(MEMORY_DIR, f)) || "";
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) continue; // 老格式无 frontmatter，不计
  if (fmMatch[1].includes("verified_at:")) {
    memoryWithVerifiedAt++;
  } else {
    // 看文件名带日期且老于 30 天的，建议补 verified_at
    const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      const fileDate = new Date(dateMatch[1]).getTime();
      if (NOW - fileDate > THIRTY_DAYS_MS) oldMemoryWithoutVerifiedAt.push(f);
    }
  }
}
checks.push({
  name: "maturity/memory-verified-at",
  claimSite: "memory/*.md frontmatter verified_at",
  claim: `${memoryWithVerifiedAt} memory carry verified_at`,
  truthSite: "frontmatter scan",
  truth: `${oldMemoryWithoutVerifiedAt.length} old (>30d) memory missing verified_at`,
  info: oldMemoryWithoutVerifiedAt.length > 0
    ? `老 memory 待加 verified_at: ${oldMemoryWithoutVerifiedAt.slice(0, 5).join(", ")}${oldMemoryWithoutVerifiedAt.length > 5 ? " ..." : ""}`
    : "all old memory carry verified_at",
});

// 19. P2a 真值表解封成熟度 — system-api-map 真值表 + truth 测试是否到位
const sysApiMap = readTextSafe(join(ROOT, "src/data/manifest/truth/system-api-map.ts")) || "";
const sysApiTestPresent = existsSync(join(ROOT, "tests/truth/system-api-map.test.ts"));
const hotBucketCount = (sysApiMap.match(/hot:\s*true/g) || []).length;
const extractedApiCount = (sysApiMap.match(/evidence:\s*"extracted"/g) || []).length;
checks.push({
  name: "maturity/p2a-system-api-map",
  claimSite: "2026-06-04-engine-native-rewrite-roadmap.md P2a 真值解封",
  claim: "5 HOT 横切系统 API 归属经真值表确认 (extracted-grade)",
  truthSite: "src/data/manifest/truth/system-api-map.ts + tests/truth/system-api-map.test.ts",
  truth: `${hotBucketCount} HOT buckets / ${extractedApiCount} extracted / test ${sysApiTestPresent ? "present" : "MISSING"}`,
  drift: (hotBucketCount >= 5 && extractedApiCount >= 5 && sysApiTestPresent)
    ? null
    : `P2a 真值表退化:期望 >=5 HOT buckets + >=5 extracted + truth 测试存在,实得 ${hotBucketCount}/${extractedApiCount}/${sysApiTestPresent}`,
});

// 20. P2b 横切支撑层成熟度 — 5 个 HOT 横切系统 class + 编排器接入 + 测试
const crossSystems = ["MathSystem", "DataStoreSystem", "TimerSystem", "TimeSystem", "PredicateSystem"];
const crossPresent = crossSystems.filter((s) =>
  existsSync(join(ROOT, `src/engine/kernel/systems/${s}.ts`))).length;
const crossTestPresent = existsSync(join(ROOT, "tests/static/engine-crosscutting-systems.test.ts"));
const engineSystemSrc = readTextSafe(join(ROOT, "src/engine/kernel/EngineSystem.ts")) || "";
const hasSnapshot = /snapshot\?\(\):/.test(engineSystemSrc);
const hasProvides = /provides\?:/.test(engineSystemSrc);
checks.push({
  name: "maturity/p2b-crosscutting-systems",
  claimSite: "2026-06-04-engine-native-rewrite-roadmap.md P2b 横切支撑层",
  claim: "5 HOT 横切 System class 接入编排器 + 多帧 stateHash 可复现",
  truthSite: "src/engine/kernel/systems/ + EngineSystem.snapshot/provides + 测试",
  truth: `${crossPresent}/5 systems, snapshot=${hasSnapshot}, provides=${hasProvides}, test ${crossTestPresent ? "present" : "MISSING"}`,
  drift: (crossPresent === 5 && hasSnapshot && hasProvides && crossTestPresent)
    ? null
    : `P2b 横切层退化:期望 5 系统 + snapshot + provides + 测试,实得 ${crossPresent}/5 snapshot=${hasSnapshot} provides=${hasProvides} test=${crossTestPresent}`,
});

// 21. P3.0 攻击闭环成熟度 — 真实领域系统接入 kernel(非 mock)
const domainSystems = ["AnimationSystem", "CombatResolutionSystem", "HitstunSystem", "AirborneSystem", "ActionSystem", "InputSystem", "EnemyAISystem"];
const domainPresent = domainSystems.filter((s) =>
  existsSync(join(ROOT, `src/engine/kernel/systems/${s}.ts`))).length;
const loopTests = [
  "engine-combat-loop.test.ts",
  "engine-airborne-loop.test.ts",
  "engine-input-action-loop.test.ts",
  "engine-two-way-fight.test.ts",
].filter((t) => existsSync(join(ROOT, "tests/static", t))).length;
const actorSrc = readTextSafe(join(ROOT, "src/engine/core/Actor.ts")) || "";
const actorHasComponents = /animationPlayer/.test(actorSrc) && /reaction:/.test(actorSrc) && /airborne:/.test(actorSrc) && /intent:/.test(actorSrc);
checks.push({
  name: "maturity/p3.0-attack-loop",
  claimSite: "2026-06-04-engine-native-rewrite-roadmap.md P3.0 核心系统接入",
  claim: "真实领域系统(7)接入 kernel 跑通攻击/浮空/输入/双向战斗端到端",
  truthSite: "src/engine/kernel/systems/ 领域 system + Actor 组件 + 4 端到端测试",
  truth: `${domainPresent}/7 domain systems, actor-components=${actorHasComponents}, ${loopTests}/4 e2e tests`,
  drift: (domainPresent === 7 && actorHasComponents && loopTests === 4)
    ? null
    : `P3.0 退化:期望 7 领域系统 + Actor 组件(含 intent) + 4 端到端测试,实得 ${domainPresent}/7 components=${actorHasComponents} tests=${loopTests}/4`,
});

// 22. P3.1 运行时切换成熟度 — EngineKernel 是 CombatScene 的运行时主线(非 CombatKernel)
const combatSceneSrc = readTextSafe(join(ROOT, "src/game/CombatScene.ts")) || "";
const sceneUsesEngineKernel = /new EngineKernel\(/.test(combatSceneSrc) && !/new CombatKernel\(/.test(combatSceneSrc);
const engineKernelSrc = readTextSafe(join(ROOT, "src/engine/kernel/EngineKernel.ts")) || "";
const kernelHasSceneApi = /requestAction\(/.test(engineKernelSrc) && /debugSnapshot\(/.test(engineKernelSrc) && /debugHitBoxes\(/.test(engineKernelSrc);
const engineCtxSrc = readTextSafe(join(ROOT, "src/engine/kernel/EngineContext.ts")) || "";
const busHasSubscribe = /\bon\(type:/.test(engineCtxSrc) && /readonly archive/.test(engineCtxSrc);
// Peripherals adapted (no CombatKernel import in any of the 3 wired components)
const peripheralsAdapted = ["src/game/TouchControls.ts", "src/engine/replay/InputRecorder.ts", "src/game/layers/DebugLayer.ts"]
  .every((p) => !/CombatKernel/.test(readTextSafe(join(ROOT, p)) || "CombatKernel"));
checks.push({
  name: "maturity/p3.1-runtime-switch",
  claimSite: "2026-06-04-engine-native-rewrite-roadmap.md P3.1 运行时切换",
  claim: "CombatScene 跑 EngineKernel(非 CombatKernel) + kernel 暴露场景 API + bus 可订阅 + 外围 3 组件适配",
  truthSite: "src/game/CombatScene.ts + EngineKernel scene API + EngineEventBus.on/archive + 外围组件无 CombatKernel import",
  truth: `scene-uses-engine=${sceneUsesEngineKernel}, kernel-scene-api=${kernelHasSceneApi}, bus-subscribe=${busHasSubscribe}, peripherals-adapted=${peripheralsAdapted}`,
  drift: (sceneUsesEngineKernel && kernelHasSceneApi && busHasSubscribe && peripheralsAdapted)
    ? null
    : `P3.1 退化:期望 scene→EngineKernel + 场景 API + bus 订阅 + 外围适配,实得 scene=${sceneUsesEngineKernel} api=${kernelHasSceneApi} bus=${busHasSubscribe} peripherals=${peripheralsAdapted}`,
});

// 23. P3 收尾成熟度 — EngineKernel scenario/replay 从 stub 变真值实装
const scenarioBoolsSrc = readTextSafe(join(ROOT, "src/engine/core/ScenarioBooleans.ts")) || "";
const scenarioBoolCount = (scenarioBoolsSrc.match(/Observed:\s*boolean/g) || []).length;
// runDeterministicScenario must return the booleans type, NOT the old `{ booleans: {} }` stub.
const scenarioImpl = /runDeterministicScenario\(\):\s*EngineScenarioBooleans/.test(engineKernelSrc)
  && !/return \{ booleans: \{\} \}/.test(engineKernelSrc);
// replay.export must build a real payload, NOT the old `export: () => null` stub.
const replayImpl = /finalStateHash:\s*this\._lastStateHash/.test(engineKernelSrc)
  && !/export:\s*\(\)\s*=>\s*null/.test(engineKernelSrc);
// CombatResolutionSystem must wire scenario observation on hit.
const combatResSrc = readTextSafe(join(ROOT, "src/engine/kernel/systems/CombatResolutionSystem.ts")) || "";
const scenarioWired = /ctx\.scenario\.normalHitObserved\s*=\s*true/.test(combatResSrc)
  && /ctx\.scenario\.launchObserved\s*=\s*true/.test(combatResSrc);
// 09-Status: StatusSystem must exist (tick-based, kernel-integrated) and wire bleedObserved.
const statusSysSrc = readTextSafe(join(ROOT, "src/engine/kernel/systems/StatusSystem.ts")) || "";
const bleedWired = /ctx\.scenario\.bleedObserved\s*=\s*true/.test(statusSysSrc)
  && /class StatusSystem/.test(statusSysSrc)
  && /phase = "CLEANUP"/.test(statusSysSrc);
checks.push({
  name: "maturity/p3-engine-scenario-replay",
  claimSite: "transient-purring-matsumoto.md B 组 + 09-Status + changelog",
  claim: "scenario(7 bool)/replay/runDeterministicScenario 真值实装 + 命中接线 + bleed DOT 接线",
  truthSite: "src/engine/core/ScenarioBooleans.ts + EngineKernel.ts + CombatResolutionSystem.ts + StatusSystem.ts",
  truth: `bools=${scenarioBoolCount}/7, scenarioImpl=${scenarioImpl}, replayImpl=${replayImpl}, hitWired=${scenarioWired}, bleedWired=${bleedWired}`,
  drift: (scenarioBoolCount === 7 && scenarioImpl && replayImpl && scenarioWired && bleedWired)
    ? null
    : `P3/09 退化:期望 7 bool + scenario/replay 实装 + 命中接线 + bleed DOT 接线,实得 bools=${scenarioBoolCount}/7 scenario=${scenarioImpl} replay=${replayImpl} hit=${scenarioWired} bleed=${bleedWired}`,
});

// 24. 08-Resource 成熟度 — tick-based MP regen + cooldown 接入 kernel(对称 09-Status)
const resourcePoolSrc = readTextSafe(join(ROOT, "src/engine/core/ResourcePool.ts")) || "";
const resourceSysSrc = readTextSafe(join(ROOT, "src/engine/kernel/systems/ResourceSystem.ts")) || "";
const resourcePure = /export function regenMp/.test(resourcePoolSrc)
  && /export function cooldownMsToTicks/.test(resourcePoolSrc)
  && /class CooldownLedger/.test(resourcePoolSrc)
  && /export function trySpendForSkill/.test(resourcePoolSrc);
const resourceSysWired = /class ResourceSystem/.test(resourceSysSrc)
  && /phase = "LOGIC"/.test(resourceSysSrc)
  && /requestSkill\(/.test(resourceSysSrc);
// MP must fold into the kernel stateHash (tick-based determinism, not the legacy wall-clock class).
const engineKernelSrcR = readTextSafe(join(ROOT, "src/engine/kernel/EngineKernel.ts")) || "";
const mpInHash = /mp=\$\{a\.mp\.toFixed/.test(engineKernelSrcR) && /a\.cooldowns\.fingerprint\(\)/.test(engineKernelSrcR);
checks.push({
  name: "maturity/p4-engine-resource",
  claimSite: "08-Resource (engine-native-rewrite-roadmap.md) + changelog",
  claim: "MP regen+cooldown tick-based 确定性化接入 kernel(纯逻辑+ResourceSystem+stateHash 折叠)",
  truthSite: "src/engine/core/ResourcePool.ts + kernel/systems/ResourceSystem.ts + EngineKernel.computeStateHash",
  truth: `pure=${resourcePure}, system=${resourceSysWired}, mpInHash=${mpInHash}`,
  drift: (resourcePure && resourceSysWired && mpInHash)
    ? null
    : `08-Resource 退化:期望 纯逻辑+ResourceSystem(LOGIC)+MP/cd 折进 hash,实得 pure=${resourcePure} system=${resourceSysWired} mpInHash=${mpInHash}`,
});

// 25. 03-Monster/AI 真值化 — EnemyAISystem 读 mob shard sight/attackDelay(非硬编码 DEFAULT_CFG)
const aiConfigSrc = readTextSafe(join(ROOT, "src/engine/core/MonsterAIConfig.ts")) || "";
const enemyAiSrc = readTextSafe(join(ROOT, "src/engine/kernel/systems/EnemyAISystem.ts")) || "";
const aiConfigParse = /export function aiConfigFromMobShard/.test(aiConfigSrc)
  && /mob\.sight/.test(aiConfigSrc) && /mob\.attackDelay/.test(aiConfigSrc);
// EnemyAISystem must read per-actor aiConfig (not the removed static DEFAULT_CFG hardcode).
const aiReadsConfig = /actor\.aiConfig \?\? DEFAULT_MONSTER_AI_CONFIG/.test(enemyAiSrc)
  && !/private static readonly DEFAULT_CFG/.test(enemyAiSrc);
// CombatScene wires goblin truth onto the grunt.
const sceneSrcAi = readTextSafe(join(ROOT, "src/game/CombatScene.ts")) || "";
const aiWiredInScene = /aiConfigFromGoblinTruth\(\)/.test(sceneSrcAi);
checks.push({
  name: "maturity/p4-engine-monster-ai",
  claimSite: "03-Monster/AI (22-system-field-matrix 系统C) + changelog",
  claim: "EnemyAISystem 从硬编码 DEFAULT_CFG 改为读 mob shard sight/attackDelay 真值 + scene 接线",
  truthSite: "src/engine/core/MonsterAIConfig.ts + kernel/systems/EnemyAISystem.ts + CombatScene.ts",
  truth: `parse=${aiConfigParse}, readsConfig=${aiReadsConfig}, sceneWired=${aiWiredInScene}`,
  drift: (aiConfigParse && aiReadsConfig && aiWiredInScene)
    ? null
    : `03-AI 退化:期望 shard 解析 + EnemyAISystem 读 aiConfig(无 DEFAULT_CFG 硬编码)+ scene 接线,实得 parse=${aiConfigParse} reads=${aiReadsConfig} scene=${aiWiredInScene}`,
});

// 26. hitstun 真值化 — ReactionResolver 读受击方 stats.hitRecovery(非硬编码 DEFAULT_HITSTUN_MS)
const reactionResolverSrc = readTextSafe(join(ROOT, "src/engine/core/ReactionResolver.ts")) || "";
const actorSrcH = readTextSafe(join(ROOT, "src/engine/core/Actor.ts")) || "";
// applyHitReaction must source hitstun from the defender stat (DEFAULT only as fallback).
const hitstunFromStat = /defender\.stats\.hitRecovery \?\? DEFAULT_HITSTUN_MS/.test(reactionResolverSrc);
// ActorStats must carry hitRecovery + both extractors must populate it. Player side is level-aware
// (statAtLevel over the growth curve, not just base) — a stronger wiring than a flat growthBase.
const hitRecoveryStat = /hitRecovery\?: number/.test(actorSrcH)
  && /hitRecovery: growth\?\.hitRecovery \? statAtLevel\(growth\.hitRecovery\.values/.test(actorSrcH)
  && /hitRecovery: scalarVal\(mob\.hitRecovery/.test(actorSrcH);
checks.push({
  name: "maturity/p4-engine-hitstun",
  claimSite: "hitstun 真值化 (22-system field-matrix 受击硬直) + changelog",
  claim: "ReactionResolver hitstun 从死值 DEFAULT_HITSTUN_MS 改为读受击方 stats.hitRecovery 真值",
  truthSite: "src/engine/core/ReactionResolver.ts + Actor.ts (ActorStats.hitRecovery + 提取)",
  truth: `fromStat=${hitstunFromStat}, statWired=${hitRecoveryStat}`,
  drift: (hitstunFromStat && hitRecoveryStat)
    ? null
    : `hitstun 退化:期望 ReactionResolver 读 defender.stats.hitRecovery + ActorStats 携带提取,实得 fromStat=${hitstunFromStat} statWired=${hitRecoveryStat}`,
});

// 27. D-group weapon-timeline flatten — 纯函数 + AnimationPlayer.play 接线(机械就位,数据待流入)
const flattenerSrc = readTextSafe(join(ROOT, "src/engine/core/weaponTimelineFlattener.ts")) || "";
const aniPlayerSrc = readTextSafe(join(ROOT, "src/engine/core/AnimationPlayer.ts")) || "";
const flattenerPure = /export function flattenWeaponTimeline/.test(flattenerSrc)
  && /Math\.max\(bodyFrames\.length, weaponFrames\.length\)/.test(flattenerSrc);
const playWired = /weaponTimeline\?: readonly AniFrame\[\]/.test(aniPlayerSrc)
  && /flattenWeaponTimeline\(anim\.frames, anim\.weaponTimeline\)/.test(aniPlayerSrc);
checks.push({
  name: "maturity/d-weapon-timeline-flatten",
  claimSite: "transient-purring-matsumoto.md D 组 + changelog",
  claim: "weaponTimeline 平铺纯函数 + AnimationPlayer.play 接线(机械就位,baseline 数据 16.2% BLOCKED 待流入)",
  truthSite: "src/engine/core/weaponTimelineFlattener.ts + AnimationPlayer.ts",
  truth: `flattener=${flattenerPure}, playWired=${playWired}`,
  drift: (flattenerPure && playWired)
    ? null
    : `D 组退化:期望 flattenWeaponTimeline 纯函数 + AniDef.weaponTimeline + play 接线,实得 flattener=${flattenerPure} play=${playWired}`,
});

// 28. cancel-window 谓词真值化 — skill cancelWindow PVF 真值解析 + 纯谓词(FSM 接线待后续)
const cancelWindowSrc = readTextSafe(join(ROOT, "src/engine/core/CancelWindow.ts")) || "";
const cancelWindowPure = /export function parseCancelWindow/.test(cancelWindowSrc)
  && /export function isInCancelWindow/.test(cancelWindowSrc)
  && /cancelWindowStart/.test(cancelWindowSrc) && /cancelWindowDuration/.test(cancelWindowSrc);
checks.push({
  name: "maturity/engine-cancel-window",
  claimSite: "cancel-window 真值化 (skill cancelWindow PVF) + changelog",
  claim: "skill cancelWindow PVF 真值解析 + 纯谓词 isInCancelWindow/canCancelInto(FSM/skill-action 接线待后续)",
  truthSite: "src/engine/core/CancelWindow.ts + tests/static/engine-cancel-window.test.ts",
  truth: `pure=${cancelWindowPure}`,
  drift: cancelWindowPure
    ? null
    : `cancel-window 退化:期望 parseCancelWindow + isInCancelWindow 纯谓词读 cancelWindowStart/Duration 真值,实得 pure=${cancelWindowPure}`,
});

// 29. 水平击退真值化 — KnockbackPhysics 工作状态(镜像 airborne)+ ReactionResolver 接 pushAside 真值
const knockbackSrc = readTextSafe(join(ROOT, "src/engine/core/KnockbackPhysics.ts")) || "";
const knockbackSysSrc = readTextSafe(join(ROOT, "src/engine/kernel/systems/KnockbackSystem.ts")) || "";
const reactionSrcK = readTextSafe(join(ROOT, "src/engine/core/ReactionResolver.ts")) || "";
const engineKernelSrcK = readTextSafe(join(ROOT, "src/engine/kernel/EngineKernel.ts")) || "";
const knockbackPure = /export function applyKnockback/.test(knockbackSrc)
  && /export function tickKnockback/.test(knockbackSrc) && /KNOCKBACK_FRICTION/.test(knockbackSrc);
const knockbackWired = /class KnockbackSystem/.test(knockbackSysSrc)
  && /computeKnockbackVx/.test(reactionSrcK) && /pushAsideValue/.test(reactionSrcK);
const xInHash = /x=\$\{a\.x\.toFixed/.test(engineKernelSrcK);
checks.push({
  name: "maturity/engine-knockback",
  claimSite: "水平击退真值化 (P4-GAP fill, pushAside 真值) + changelog",
  claim: "水平击退 KnockbackPhysics 工作状态(镜像 airborne,不破 stateHash)+ ReactionResolver 接 pushAside×pushBack 真值 + x 入 hash",
  truthSite: "src/engine/core/KnockbackPhysics.ts + kernel/systems/KnockbackSystem.ts + ReactionResolver.ts",
  truth: `pure=${knockbackPure}, wired=${knockbackWired}, xInHash=${xInHash}`,
  drift: (knockbackPure && knockbackWired && xInHash)
    ? null
    : `水平击退退化:期望 KnockbackPhysics 纯逻辑 + ReactionResolver 接 pushAside + x 入 hash,实得 pure=${knockbackPure} wired=${knockbackWired} xInHash=${xInHash}`,
});

// 30. skill-action infra §1 — tick-based command 匹配核心(命令序列 PVF 真值解析 + 匹配)
const cmdMatcherSrc = readTextSafe(join(ROOT, "src/engine/input/CommandMatcher.ts")) || "";
const cmdMatcherPure = /export function parseCommand/.test(cmdMatcherSrc)
  && /export function matchCommand/.test(cmdMatcherSrc)
  && /COMMAND_WINDOW_TICKS/.test(cmdMatcherSrc);
checks.push({
  name: "maturity/skill-action-command-matcher",
  claimSite: "skill-action infra §1 (skill command PVF) + changelog",
  claim: "tick-based command 序列解析(, 序列/& 同时)+ 匹配纯逻辑(命令窗口 tick 化,非墙钟 InputCommand)",
  truthSite: "src/engine/input/CommandMatcher.ts + tests/static/engine-command-matcher.test.ts",
  truth: `pure=${cmdMatcherPure}`,
  drift: cmdMatcherPure
    ? null
    : `command-matcher 退化:期望 parseCommand + matchCommand + COMMAND_WINDOW_TICKS(tick-based),实得 pure=${cmdMatcherPure}`,
});

// 31. skill-action infra §2 — SkillInputSystem 把 command 匹配接活(intent→buffer→匹配→skill action)
const skillInputSrc = readTextSafe(join(ROOT, "src/engine/kernel/systems/SkillInputSystem.ts")) || "";
const actorSrcSI = readTextSafe(join(ROOT, "src/engine/core/Actor.ts")) || "";
const skillInputWired = /class SkillInputSystem/.test(skillInputSrc)
  && /matchCommand\(/.test(skillInputSrc) && /this\.actions\.request\(/.test(skillInputSrc);
const intentExtended = /commandDir\?:/.test(actorSrcSI) && /button\?:/.test(actorSrcSI);
checks.push({
  name: "maturity/skill-action-input-bridge",
  claimSite: "skill-action infra §2 (command→skill 触发) + changelog",
  claim: "SkillInputSystem 把 §1 匹配核心接活(Actor.intent 扩 commandDir/button → buffer → 匹配 → ActionSystem.request skill)",
  truthSite: "src/engine/kernel/systems/SkillInputSystem.ts + Actor.ts (ActorIntent)",
  truth: `bridge=${skillInputWired}, intentExtended=${intentExtended}`,
  drift: (skillInputWired && intentExtended)
    ? null
    : `skill-input 退化:期望 SkillInputSystem(buffer+matchCommand+request)+ ActorIntent 扩 commandDir/button,实得 bridge=${skillInputWired} intent=${intentExtended}`,
});

// 32. skill-action infra §3 — cancelWindow 谓词接入 ActionSystem 取消链(把 cancel-window 谓词接活)
// 成熟度真检(防假绿,2026-06-08):不止验"代码路径在",还要验"config 是否真供给"——cancelWindows
// map 仅由 define(name, anim, cancelWindow) 第三参填充。若全项目零处传第三参，谓词恒空转(no-op)，
// 此时应诚实报 wired-but-no-config，而非笼统 cancelWired=true(那正是门禁自己掉进二元陷阱)。
const actionSysSrc = readTextSafe(join(ROOT, "src/engine/kernel/systems/ActionSystem.ts")) || "";
const cancelPredicateWired = /isInCancelWindow\(/.test(actionSysSrc)
  && /cancelWindows/.test(actionSysSrc)
  && /inCancelWindow/.test(actionSysSrc);
// 扫 CombatScene 的 actions.define(...) 调用是否真传了 cancelWindow config(第三参)。
// define 全在 CombatScene.defineActions()，形如 define("attack1", attack(4,1))——第二参是带逗号的
// 函数调用，所以不能数逗号(会被内层逗号骗)。真传 config 时调用里必含 cancelWindow/parseCancelWindow
// 标识，据此检测；当前全是 2 参 → 无标识 → configSupplied=false(诚实：map 恒空、谓词 no-op)。
const combatSceneForCancel = readTextSafe(join(ROOT, "src/game/CombatScene.ts")) || "";
const cancelConfigSupplied = /\.define\([^)]*(?:cancelWindow|parseCancelWindow|CancelWindow)/.test(combatSceneForCancel);
const cancelWired = cancelPredicateWired; // 谓词路径就位(向后兼容既有 claim)
checks.push({
  name: "maturity/skill-action-cancel-chain",
  claimSite: "skill-action infra §3 (cancelWindow→ActionSystem) + changelog",
  claim: cancelConfigSupplied
    ? "cancelWindow 谓词接入 ActionSystem gating + 有 action 注册真 cancelWindow config(取消链生效)"
    : "cancelWindow 谓词已接入 ActionSystem.tick gating，但当前零 action 传 cancelWindow config → map 恒空、谓词 no-op(地基就位待数据，诚实标注)",
  truthSite: "src/engine/kernel/systems/ActionSystem.ts + core/CancelWindow.ts",
  truth: `predicateWired=${cancelPredicateWired}, configSupplied=${cancelConfigSupplied}`,
  drift: cancelPredicateWired
    ? null
    : `cancel-chain 退化:期望 ActionSystem gating 用 isInCancelWindow + cancelWindows 存储,实得 predicateWired=${cancelPredicateWired}`,
});

// ── 评估 drift ──────────────────────────────────────────────────────────
for (const c of checks) {
  if (c.drift !== undefined) {
    c.ok = c.drift === null;
  } else if (c.info) {
    c.ok = true; // informational
  } else {
    c.ok = c.claim != null && c.truth != null && String(c.claim).trim() === String(c.truth).trim();
    if (!c.ok && c.claim != null && c.truth != null) {
      c.drift = `claim="${c.claim}" ≠ truth="${c.truth}"`;
    } else if (!c.ok) {
      c.drift = `unable to extract (claim=${c.claim}, truth=${c.truth})`;
    }
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  totalChecks: checks.length,
  passed: checks.filter(c => c.ok).length,
  drifts: checks.filter(c => !c.ok),
};

// ── 输出 ────────────────────────────────────────────────────────────────

if (OUTPUT_JSON) {
  console.log(JSON.stringify({ summary, checks }, null, 2));
} else {
  console.log(`# 4-Way Consistency Check`);
  console.log(`Generated: ${summary.generatedAt}`);
  console.log(`Verdict: ${summary.drifts.length === 0 ? "✅ ALL CONSISTENT" : `⚠️ ${summary.drifts.length} DRIFT(S)`}`);
  console.log("");
  for (const c of checks) {
    const icon = c.ok ? "✅" : "⚠️";
    console.log(`${icon} ${c.name}`);
    console.log(`   claim   : ${c.claim} (${c.claimSite})`);
    console.log(`   truth   : ${c.truth} (${c.truthSite})`);
    if (c.drift) console.log(`   drift   : ${c.drift}`);
    if (c.info) console.log(`   info    : ${c.info}`);
    console.log("");
  }
}

if (STRICT && summary.drifts.length > 0) process.exit(1);
process.exit(0);
