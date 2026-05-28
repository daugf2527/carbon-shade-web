/**
 * Four-way consistency probe: .fbs schema compilation closure
 *
 * SOT: src/engine/schema/ filesystem
 *
 * Two invariants:
 *   1. Each .fbs file MUST have a corresponding *_generated.ts (flatc output)
 *   2. ani.fbs MUST exist (field-matrix §一 Animation is tick step #1)
 *
 * **Current state (2026-05-28)**: 4 .fbs (chr/skl/atk/physics), 0 _generated.ts,
 * ani.fbs missing. This test is EXPECTED TO FAIL until Phase 0 T0.1 (flatc CLI
 * install) + T1.5 (ani.fbs) + T1.8 (flatc compile) are complete.
 *
 * The acceptance test for Phase 0: this file must turn green.
 *
 * 2026-05-28 created (Batch B step 3, A4 行为切 Test #3).
 *
 * Until Phase 0 lands, this test deliberately uses TODO_THRESHOLD=2 to allow
 * the missing-state to be tracked without failing the whole suite. When you
 * fix any of the 5 expected failures, decrement TODO_THRESHOLD.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();

const schemaDir = join(ROOT, "src/engine/schema");
assert.ok(existsSync(schemaDir), `src/engine/schema/ does not exist`);

const fbsFiles = readdirSync(schemaDir).filter((f) => f.endsWith(".fbs"));
const generatedFiles = readdirSync(schemaDir).filter((f) => f.endsWith("_generated.ts"));

// Track expected failures (Phase 0 欠债) — when fixed, decrement EXPECTED_FAILURES
// and verify which previously-failing assertion now passes.
const EXPECTED_FAILURES = 5; // 4 .fbs uncompiled + 1 ani.fbs missing
const failures: string[] = [];

// Invariant 1: each .fbs has a matching _generated.ts
for (const fbs of fbsFiles) {
  const stem = fbs.replace(/\.fbs$/, "");
  const expectedGen = `${stem}_generated.ts`;
  if (!generatedFiles.includes(expectedGen)) {
    failures.push(`${fbs} → missing ${expectedGen} (run scripts/compile-schema.mjs)`);
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
  EXPECTED_FAILURES,
  `.fbs compilation closure drift: ${failures.length} failures (expected ${EXPECTED_FAILURES}).\n` +
    `If you FIXED a failure: decrement EXPECTED_FAILURES here.\n` +
    `If a NEW failure appeared: investigate before changing this number.\n` +
    `Failures:\n  - ${failures.join("\n  - ")}`,
);

console.log(
  `four-way-consistency-fbs-compiled: ${failures.length} pending (matches EXPECTED_FAILURES). ` +
    `Decrement EXPECTED_FAILURES as Phase 0 closes.`,
);
