#!/usr/bin/env node
/**
 * Trace script for QA tests
 *
 * Runs tests with trace recording to analyze what's happening
 *
 * Usage:
 *   node scripts/trace-qa-test.mjs
 *
 * After running, view trace with:
 *   npx playwright show-trace test-results/.../trace.zip
 */

import { spawn } from "node:child_process";

console.log(`[TRACE] Running QA tests with trace recording`);
console.log(`[TRACE] This will generate trace files for analysis\n`);

const args = [
  "playwright",
  "test",
  "tests/browser/combat-qa.spec.ts",
  "--workers=1",
  "--timeout=180000", // 3 minutes
  "--trace=on",
  "--reporter=line",
  "--grep=1.1 Walk", // Start with just one test
];

const proc = spawn("npx", args, {
  stdio: "inherit",
  shell: true,
});

proc.on("exit", (code) => {
  console.log(`\n[TRACE] Test exited with code ${code}`);

  if (code !== 0) {
    console.log(`\n[TRACE] To view trace:`);
    console.log(`  npx playwright show-trace test-results/**/trace.zip`);
  }

  process.exit(code ?? 0);
});
