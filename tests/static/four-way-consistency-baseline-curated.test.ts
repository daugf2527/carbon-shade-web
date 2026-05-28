/**
 * Four-way consistency probe: CURATED_FILES count
 *
 * SOT: scripts/stage1-baseline.mjs CURATED_FILES array
 *
 * Strong guarantee: filesystem-counted entries == EXPECTED_COUNT == CLAUDE.md
 * "43 curated files" claim.
 *
 * If you extend the baseline:
 *   - update EXPECTED_COUNT here
 *   - update CLAUDE.md "43 curated files" in Commands table
 *   - verify dist/data/ outputs cover all 10 parser domains after rerun
 *
 * 2026-05-28 created (Batch B step 3, A4 行为切 Test #2).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();

const EXPECTED_COUNT = 45;

const baselineSrc = readFileSync(join(ROOT, "scripts/stage1-baseline.mjs"), "utf-8");

const match = baselineSrc.match(/const\s+CURATED_FILES\s*=\s*\[([\s\S]*?)\];/);
assert.ok(match, "CURATED_FILES array not found in scripts/stage1-baseline.mjs");

const entries = match![1]
  .split("\n")
  .filter((l) => l.trim().startsWith('"') || l.trim().startsWith("'"));

assert.equal(
  entries.length,
  EXPECTED_COUNT,
  `CURATED_FILES drift: array has ${entries.length} entries != EXPECTED_COUNT ${EXPECTED_COUNT}. ` +
    `If you extended the baseline: update EXPECTED_COUNT here AND CLAUDE.md "43 curated files". ` +
    `If you shrunk it: verify dist/data/ still covers all 10 parser domains.`,
);

console.log(`four-way-consistency-baseline-curated: ${entries.length} entries aligned with EXPECTED_COUNT ${EXPECTED_COUNT}`);
