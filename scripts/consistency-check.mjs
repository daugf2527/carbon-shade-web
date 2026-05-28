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
const uncompiledFbs = fbsFiles.filter(fbs => {
  const stem = fbs.replace(/\.fbs$/, "");
  const fbsContent = readTextSafe(join(schemaDir, fbs)) || "";
  const rootMatch = fbsContent.match(/root_type\s+(\w+)\s*;/);
  const rootKebab = rootMatch
    ? rootMatch[1].replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
    : null;
  // 任一存在即算编译完成：<stem>-def.ts 或 <root-kebab>.ts
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
