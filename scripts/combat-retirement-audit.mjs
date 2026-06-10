#!/usr/bin/env node

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC_COMBAT = join(ROOT, "src", "combat");
const DEFAULT_DOC = join(ROOT, "docs", "engineering", "combat-retirement-audit-2026-06-10.md");

const args = process.argv.slice(2);
const outputFmt = args.includes("--output") ? args[args.indexOf("--output") + 1] : "text";
const outFile = args.includes("--out-file") ? args[args.indexOf("--out-file") + 1] : null;
const skipDoc = args.includes("--no-doc");

function normalize(filePath) {
  return relative(ROOT, filePath).replaceAll("\\", "/");
}

function walk(dir, predicate = () => true) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, predicate));
    } else if (entry.isFile() && predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function readText(filePath) {
  return readFileSync(filePath, "utf-8");
}

function matchLines(filePath, patterns) {
  const rel = normalize(filePath);
  const lines = readText(filePath).split(/\r?\n/);
  const hits = [];
  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        hits.push({
          file: rel,
          line: index + 1,
          text: line.trim(),
        });
        break;
      }
    }
  });
  return hits;
}

function matchLinesWithKinds(filePath, matchers) {
  const rel = normalize(filePath);
  const lines = readText(filePath).split(/\r?\n/);
  const hits = [];
  lines.forEach((line, index) => {
    for (const matcher of matchers) {
      if (matcher.pattern.test(line)) {
        hits.push({
          kind: matcher.kind,
          file: rel,
          line: index + 1,
          text: line.trim(),
        });
        break;
      }
    }
  });
  return hits;
}

function uniqueByFile(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.file}:${entry.line}:${entry.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const combatFiles = walk(SRC_COMBAT, (file) => file.endsWith(".ts")).map(normalize).sort();

const runtimeFiles = [
  ...walk(join(ROOT, "src"), (file) => file.endsWith(".ts") || file.endsWith(".json")),
  ...walk(join(ROOT, "scripts"), (file) => file.endsWith(".mjs") || file.endsWith(".js")),
].filter((file) => {
  const rel = normalize(file);
  return !rel.startsWith("src/combat/") && rel !== "scripts/combat-retirement-audit.mjs";
});
const truthFiles = walk(join(ROOT, "tests", "truth"), (file) => file.endsWith(".ts"));
const staticFiles = walk(join(ROOT, "tests", "static"), (file) => file.endsWith(".ts"));
const browserFiles = walk(join(ROOT, "tests", "browser"), (file) => file.endsWith(".ts"));
const docFiles = [
  ...walk(join(ROOT, "docs"), (file) => file.endsWith(".md")),
  join(ROOT, "CLAUDE.md"),
].filter((file) => resolve(file) !== DEFAULT_DOC);

const runtimeMatchers = [
  { kind: "source-ref", pattern: /"sourceRef":\s*"src\/combat\// },
  { kind: "source-ref", pattern: /ACTION_MANIFEST_DATA_SOURCE\s*=\s*"src\/combat\// },
  { kind: "type-only", pattern: /import\s+type\s+.*from\s+["'][^"']*combat\// },
  { kind: "runtime-value", pattern: /import\s+(?!type\b).*from\s+["'][^"']*combat\// },
];
const testImportPatterns = [
  /from\s+["'][^"']*combat\//,
  /import\s+["'][^"']*combat\//,
];
const docMentionPatterns = [
  /src\/combat\//,
  /\bCombatKernel\b/,
  /\bDamageFormula\.ts\b/,
];

const runtimeImports = uniqueByFile(runtimeFiles.flatMap((file) => matchLinesWithKinds(file, runtimeMatchers)));
const truthImports = uniqueByFile(truthFiles.flatMap((file) => matchLines(file, testImportPatterns)));
const staticImports = uniqueByFile(staticFiles.flatMap((file) => matchLines(file, testImportPatterns)));
const browserImports = uniqueByFile(browserFiles.flatMap((file) => matchLines(file, testImportPatterns)));
const docsMentions = uniqueByFile(docFiles.flatMap((file) => matchLines(file, docMentionPatterns)));

function uniqueFileCount(entries) {
  return new Set(entries.map((entry) => entry.file)).size;
}

function uniqueFileCountByKind(entries) {
  const buckets = {
    "type-only": new Set(),
    "runtime-value": new Set(),
    "source-ref": new Set(),
  };
  for (const entry of entries) {
    if (entry.kind in buckets) {
      buckets[entry.kind].add(entry.file);
    }
  }
  return {
    "type-only": buckets["type-only"].size,
    "runtime-value": buckets["runtime-value"].size,
    "source-ref": buckets["source-ref"].size,
  };
}

const runtimeCouplingKinds = uniqueFileCountByKind(runtimeImports);

const payload = {
  generatedAt: new Date().toISOString(),
  passed: true,
  summary: {
    combatFileCount: combatFiles.length,
    runtimeImportCount: uniqueFileCount(runtimeImports),
    truthImportCount: uniqueFileCount(truthImports),
    staticImportCount: uniqueFileCount(staticImports),
    browserImportCount: uniqueFileCount(browserImports),
    docsMentionCount: uniqueFileCount(docsMentions),
    runtimeCouplingKinds,
  },
  combatFiles,
  runtimeImports,
  truthImports,
  staticImports,
  browserImports,
  docsMentions,
};

function renderMarkdown(data) {
  const lines = [];
  lines.push("# Combat Retirement Audit (2026-06-10)");
  lines.push("");
  lines.push(`- 生成时间: ${data.generatedAt}`);
  lines.push(`- src/combat 文件数: ${data.summary.combatFileCount}`);
  lines.push(`- 运行时/脚本依赖: ${data.summary.runtimeImportCount}`);
  lines.push(`- runtime 分层: type-only=${data.summary.runtimeCouplingKinds["type-only"]}, runtime-value=${data.summary.runtimeCouplingKinds["runtime-value"]}, source-ref=${data.summary.runtimeCouplingKinds["source-ref"]}`);
  lines.push(`- truth 测试依赖: ${data.summary.truthImportCount}`);
  lines.push(`- static 测试依赖: ${data.summary.staticImportCount}`);
  lines.push(`- browser 测试依赖: ${data.summary.browserImportCount}`);
  lines.push(`- 文档引用: ${data.summary.docsMentionCount}`);
  lines.push("");
  lines.push("## 结论");
  lines.push("");
  lines.push("- P5 `src/combat/` 退役尚未具备删除条件。");
  lines.push("- 主要阻塞来自四类：运行时源引用、truth 测试、static 测试、文档/SSOT。");
  lines.push("- runtime 外部耦合已经可分层：`type-only` 可优先迁移；`runtime-value` 次之；`source-ref` 最后清理。");
  lines.push("- 这份清单是删 `src/combat/` 前的最小硬证据，不再靠人工 grep 回忆。");
  lines.push("");

  const sections = [
    ["运行时/脚本依赖", data.runtimeImports],
    ["Truth 测试依赖", data.truthImports],
    ["Static 测试依赖", data.staticImports],
    ["Browser 测试依赖", data.browserImports],
    ["文档引用", data.docsMentions],
  ];

  for (const [title, entries] of sections) {
    lines.push(`## ${title}`);
    lines.push("");
    if (entries.length === 0) {
      lines.push("(none)");
      lines.push("");
      continue;
    }
    for (const entry of entries) {
      lines.push(`- \`${entry.file}:${entry.line}\` ${entry.text}`);
    }
    lines.push("");
  }

  lines.push("## 下一步建议");
  lines.push("");
  lines.push("1. 先清 `type-only` 耦合：`src/data/official/*`、`src/data/manifest/*` 这些只吃 combat type 的文件优先迁出。");
  lines.push("2. 再清 `runtime-value` 耦合：`src/game/*`、manifest loader 这类真正执行 combat 逻辑的边。");
  lines.push("3. 最后清 `source-ref`：manifest/status provenance 的 `src/combat/*` 字符串引用。");
  lines.push("4. 把 truth tests 从 `src/combat/*` 迁到 `src/engine/*` 对等实现。");
  lines.push("5. 把 static tests 里仍直接构造 `CombatKernel` 的用例分批迁出或归档。");
  lines.push("6. 只有当上面几类归零后，才进入真正的 `src/combat/` 删除批次。");
  lines.push("");
  return lines.join("\n");
}

if (!skipDoc) {
  mkdirSync(dirname(DEFAULT_DOC), { recursive: true });
  writeFileSync(DEFAULT_DOC, renderMarkdown(payload), "utf-8");
}

const output =
  outputFmt === "json"
    ? JSON.stringify(payload, null, 2)
    : renderMarkdown(payload);

if (outFile) {
  const target = resolve(ROOT, outFile);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, output, "utf-8");
} else {
  process.stdout.write(output + "\n");
}
