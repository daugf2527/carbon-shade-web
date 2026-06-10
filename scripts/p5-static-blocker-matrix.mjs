#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const AUDIT_JSON = join(ROOT, ".tmp", "combat-retirement-audit-latest.json");
const DEFAULT_DOC = join(ROOT, "docs", "engineering", "p5-static-blocker-matrix-2026-06-10.md");

const args = process.argv.slice(2);
const outputFmt = args.includes("--output") ? args[args.indexOf("--output") + 1] : "text";
const outFile = args.includes("--out-file") ? args[args.indexOf("--out-file") + 1] : null;
const skipDoc = args.includes("--no-doc");

function readAudit() {
  return JSON.parse(readFileSync(AUDIT_JSON, "utf-8"));
}

function classify(entry) {
  const text = entry.text;
  if (text.includes("CombatKernel.js") || text.includes("FixedStepSimulation.js")) return "kernel-shell";
  if (
    text.includes("ActorFactory.js")
    || text.includes("HitResolver2D5.js")
    || text.includes("HitDecisionResolver.js")
    || text.includes("DamageResolver.js")
    || text.includes("StatusEffectSystem.js")
    || text.includes("ReactionResolver.js")
  ) return "combat-subsystems";
  if (
    text.includes("ReplayRecorder.js")
    || text.includes("RunCommandDetector.js")
    || text.includes("SOCDCleaner.js")
  ) return "replay-input";
  if (
    text.includes("FrameDataAction.js")
    || text.includes("types.js")
    || text.includes("CombatEventBus.js")
  ) return "data-surface";
  return "unclassified";
}

const bucketMeta = {
  "kernel-shell": {
    label: "kernel-shell",
    summary: "直接 new / 驱动 CombatKernel 或 FixedStepSimulation，是真正的 static 主阻塞。",
    nextStep: "优先给这组补 engine 对等 harness 或归档策略。",
  },
  "combat-subsystems": {
    label: "combat-subsystems",
    summary: "绕过 CombatKernel 但仍直接拼装 combat 子系统，适合作为中间迁移批次。",
    nextStep: "按功能把几条链迁到 engine core/system 对等实现。",
  },
  "replay-input": {
    label: "replay-input",
    summary: "依赖 replay / 输入工具，不一定卡在主 kernel，但仍阻塞 combat 目录删除。",
    nextStep: "优先切到 engine replay / input 或把工具类型外提。",
  },
  "data-surface": {
    label: "data-surface",
    summary: "只绑定动作表/类型/事件壳，属于最便宜的清理层。",
    nextStep: "先把这层从 src/combat/* 拆到 data/runtime 入口。",
  },
  unclassified: {
    label: "unclassified",
    summary: "当前规则未覆盖；需要单独看 import 形态。",
    nextStep: "补分类后再排迁移顺序。",
  },
};

function buildRows(audit) {
  const byFile = new Map();
  for (const entry of audit.staticImports) {
    const bucket = classify(entry);
    if (!byFile.has(entry.file)) {
      byFile.set(entry.file, { file: entry.file, bucket, imports: [] });
    }
    const row = byFile.get(entry.file);
    row.imports.push(entry.text);
    if (row.bucket === "data-surface" && bucket !== "data-surface") {
      row.bucket = bucket;
    }
    if (row.bucket === "replay-input" && (bucket === "kernel-shell" || bucket === "combat-subsystems")) {
      row.bucket = bucket;
    }
    if (row.bucket === "combat-subsystems" && bucket === "kernel-shell") {
      row.bucket = bucket;
    }
  }
  return [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));
}

function summarize(rows) {
  const counts = {
    "kernel-shell": 0,
    "combat-subsystems": 0,
    "replay-input": 0,
    "data-surface": 0,
    unclassified: 0,
  };
  for (const row of rows) counts[row.bucket] += 1;
  return counts;
}

function renderMarkdown(audit, rows) {
  const counts = summarize(rows);
  const lines = [];
  lines.push("# P5 Static Blocker Matrix (2026-06-10)");
  lines.push("");
  lines.push(`依据 [docs/planning/2026-06-04-engine-native-rewrite-roadmap.md](../planning/2026-06-04-engine-native-rewrite-roadmap.md)，P5 不只是 truth 迁移，还要求 static gate 脱离 \`src/combat/*\`。`);
  lines.push("");
  lines.push(`- 数据来源: [docs/engineering/combat-retirement-audit-2026-06-10.md](./combat-retirement-audit-2026-06-10.md)`);
  lines.push(`- 当前 static blocker 文件数: ${audit.summary.staticImportCount}`);
  lines.push(`- 一级分层: kernel-shell=${counts["kernel-shell"]}, combat-subsystems=${counts["combat-subsystems"]}, replay-input=${counts["replay-input"]}, data-surface=${counts["data-surface"]}`);
  lines.push("");
  lines.push("## 分层说明");
  lines.push("");
  lines.push("| 分层 | 文件数 | 含义 | 下一步 |");
  lines.push("|---|---:|---|---|");
  for (const key of ["kernel-shell", "combat-subsystems", "replay-input", "data-surface"]) {
    const meta = bucketMeta[key];
    lines.push(`| \`${meta.label}\` | ${counts[key]} | ${meta.summary} | ${meta.nextStep} |`);
  }
  lines.push("");
  lines.push("## 文件矩阵");
  lines.push("");
  lines.push("| static test | 分层 | 当前 combat 绑定 | 迁移顺序 |");
  lines.push("|---|---|---|---|");
  for (const row of rows) {
    const imports = row.imports.map((entry) => `\`${entry}\``).join("<br>");
    const order =
      row.bucket === "data-surface" ? "P5-A" :
      row.bucket === "replay-input" ? "P5-B" :
      row.bucket === "combat-subsystems" ? "P5-C" :
      row.bucket === "kernel-shell" ? "P5-D" :
      "TBD";
    lines.push(`| \`${row.file}\` | \`${row.bucket}\` | ${imports} | ${order} |`);
  }
  lines.push("");
  lines.push("## 结论");
  lines.push("");
  lines.push("1. static blocker 的真正主阻塞不是零散类型，而是 32 个直接依赖 `CombatKernel` / `FixedStepSimulation` 的 `kernel-shell` 用例。");
  lines.push("2. `data-surface` 已清零，说明动作表/类型/事件壳这层可以独立迁出，不必和 `CombatKernel` 主迁移绑在一起。");
  lines.push("3. `combat-subsystems` 只有 2 个文件，适合在 engine core/system 对等实现补齐后单独迁。");
  lines.push("4. `replay-input` 4 个文件说明 replay / input 工具链仍是 `src/combat/` 删除前的独立尾巴。");
  lines.push("");
  return lines.join("\n");
}

const audit = readAudit();
const rows = buildRows(audit);
const output = outputFmt === "json"
  ? JSON.stringify({ summary: summarize(rows), rows }, null, 2)
  : renderMarkdown(audit, rows);

if (!skipDoc) {
  mkdirSync(dirname(DEFAULT_DOC), { recursive: true });
  writeFileSync(DEFAULT_DOC, renderMarkdown(audit, rows), "utf-8");
}

if (outFile) {
  const target = resolve(ROOT, outFile);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, output, "utf-8");
} else {
  process.stdout.write(output + "\n");
}
