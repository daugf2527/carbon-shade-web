/**
 * Four-way consistency probe: .fbs schema compilation closure
 *
 * SOT: src/engine/schema/ filesystem + flatc namespace output
 *
 * Two invariants:
 *   1. Each .fbs file MUST have a corresponding generated TS class (flatc
 *      outputs to namespace subdirs as kebab-case-of-rootType.ts).
 *   2. ani.fbs MUST exist (field-matrix §一 Animation is tick step #1).
 *
 * **2026-05-28**: Phase 0 T0.1 (flatc install) + T1.5 (ani.fbs) +
 * T1.8 (flatc compile all 5) closed → this test now asserts 0 failures.
 * If a new .fbs is added without re-running compile-schema.mjs, this fails.
 *
 * 2026-05-28 created (Batch B step 3, A4 行为切 Test #3).
 * 2026-05-28 updated: Phase 0 closed — switched from "expected 5 failures" to "expected 0".
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();
const schemaDir = join(ROOT, "src/engine/schema");
assert.ok(existsSync(schemaDir), `src/engine/schema/ does not exist`);

const fbsFiles = readdirSync(schemaDir).filter((f) => f.endsWith(".fbs"));

// 递归扫 schemaDir 下所有生成的 .ts (flatc 按 namespace 分子目录)
const allGeneratedTs: string[] = [];
const walk = (dir: string): void => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fp = join(dir, entry.name);
    if (entry.isDirectory()) walk(fp);
    else if (entry.name.endsWith(".ts")) allGeneratedTs.push(entry.name.replace(/\.ts$/, ""));
  }
};
walk(schemaDir);

const failures: string[] = [];

// Invariant 1: each .fbs's root_type (or stem-def fallback) must be in generated set.
// include-only .fbs (no root_type, used purely as a header for other schemas) are
// tolerated as long as their stem appears anywhere in the generated tree.
for (const fbs of fbsFiles) {
  const stem = fbs.replace(/\.fbs$/, "");
  const fbsContent = readFileSync(join(schemaDir, fbs), "utf-8");
  const rootMatch = fbsContent.match(/root_type\s+(\w+)\s*;/);
  const rootKebab = rootMatch
    ? rootMatch[1].replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
    : null;

  if (rootMatch === null) {
    // include-only fbs (e.g. pairs.fbs): 解析所有 `table Xxx` 声明，逐个验证生成
    const tableMatches = [...fbsContent.matchAll(/table\s+(\w+)\s*\{/g)];
    if (tableMatches.length === 0) {
      failures.push(`${fbs} (include-only) → no table declarations found`);
      continue;
    }
    const missing = tableMatches
      .map((m) => m[1].replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase())
      .filter((kebab) => !allGeneratedTs.includes(kebab));
    if (missing.length > 0) {
      failures.push(`${fbs} (include-only) → ${missing.length} tables not generated: ${missing.join(", ")}. Run: node scripts/compile-schema.mjs`);
    }
    continue;
  }

  const ok = allGeneratedTs.includes(`${stem}-def`) ||
    (rootKebab !== null && allGeneratedTs.includes(rootKebab));
  if (!ok) {
    failures.push(`${fbs} (root_type=${rootMatch[1]}) → no matching .ts in generated tree. Run: node scripts/compile-schema.mjs`);
  }
}

// Invariant 2: ani.fbs exists
if (!fbsFiles.includes("ani.fbs")) {
  failures.push(
    `ani.fbs missing — field-matrix §一 Animation is tick step #1 ` +
      `but has no schema. Add it before implementing Animation System.`,
  );
}

assert.equal(
  failures.length,
  0,
  `.fbs compilation closure broken (${failures.length} failures).\n` +
    `If you added a .fbs: re-run scripts/compile-schema.mjs.\n` +
    `Failures:\n  - ${failures.join("\n  - ")}`,
);

console.log(
  `four-way-consistency-fbs-compiled: ${fbsFiles.length}/${fbsFiles.length} .fbs compiled, ani.fbs exists`,
);
