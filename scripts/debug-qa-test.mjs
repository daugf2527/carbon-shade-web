#!/usr/bin/env node
/**
 * Debug script for QA tests
 *
 * Runs a single test in headed mode with slow-mo and debug logging
 *
 * Usage:
 *   node scripts/debug-qa-test.mjs [test-name]
 *
 * Examples:
 *   node scripts/debug-qa-test.mjs "1.1 Walk"
 *   node scripts/debug-qa-test.mjs "2.1 Attack"
 */

import { spawn } from "node:child_process";

const testName = process.argv[2] || "1.1 Walk";

console.log(`[DEBUG] Running test: ${testName}`);
console.log(`[DEBUG] Mode: headed + slow-mo + debug`);
console.log(`[DEBUG] Press Ctrl+C to stop\n`);

const args = [
  "playwright",
  "test",
  "tests/browser/combat-qa.spec.ts",
  "--headed",
  "--workers=1",
  "--timeout=300000", // 5 minutes for debugging
  `--grep=${testName}`,
  "--reporter=line",
];

const proc = spawn("npx", args, {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    PWDEBUG: "1", // Enable Playwright Inspector
  },
});

proc.on("exit", (code) => {
  console.log(`\n[DEBUG] Test exited with code ${code}`);
  process.exit(code ?? 0);
});

proc.on("error", (err) => {
  console.error(`[DEBUG] Error: ${err.message}`);
  process.exit(1);
});
