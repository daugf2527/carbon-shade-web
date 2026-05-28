/**
 * Four-way consistency probe: sim-worker stub markers
 *
 * SOT: src/engine/workers/sim-worker.ts
 *
 * sim-worker.ts is intentional Phase 2 Day 1 skeleton (commit 2c4d016).
 * It has TODOs marking unimplemented Stage 2 work.
 *
 * Guarantee: TODO count must be >= STUB_MIN. If someone deletes TODOs without
 * implementing them (refactor accident), test fails to restore tracking.
 *
 * When you IMPLEMENT a TODO: decrement STUB_MIN, document what was implemented.
 *
 * 2026-05-28 created (Batch B step 3, A4 行为切 Test #4).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();

const STUB_MIN = 2;

const src = readFileSync(join(ROOT, "src/engine/workers/sim-worker.ts"), "utf-8");
const todoLines = src.split("\n").filter((l) => l.includes("TODO Stage 2"));

assert.ok(
  todoLines.length >= STUB_MIN,
  `sim-worker.ts only has ${todoLines.length} "TODO Stage 2" markers (expected >= ${STUB_MIN}).\n` +
    `If you implemented a stub: decrement STUB_MIN here, document what was implemented.\n` +
    `If markers were deleted without implementation: restore them — they track incomplete work.`,
);

console.log(
  `four-way-consistency-sim-worker-stubs: ${todoLines.length} TODO markers present (>= STUB_MIN ${STUB_MIN})`,
);
