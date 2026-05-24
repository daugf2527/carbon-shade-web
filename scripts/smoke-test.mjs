/**
 * Smoke test runner — compiles tests/smoke/*.test.ts then executes them.
 *
 * Smoke tests exercise real-PVF end-to-end and are gated by DNF_PVF_PATH
 * (skipping gracefully when the env var is unset). They live outside
 * tests/static/ so `npm run static:test` (CI baseline) does not require
 * a PVF on disk.
 *
 * Usage:
 *   DNF_PVF_PATH=/path/to/Script.pvf npm run smoke:pipeline
 *
 * Honors --bail to stop at the first failure (default: run all and report).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const compiledRoot = path.join(root, ".tmp", "test-js");
const args = process.argv.slice(2);
const bail = args.includes("--bail");

// Ensure TS compiled. If `.tmp/test-js/tests/smoke/` exists, assume static-test
// already compiled. Otherwise compile here.
if (!existsSync(path.join(compiledRoot, "tests", "smoke"))) {
  const compile = spawnSync(process.execPath, [
    path.join(root, "scripts", "run-tsc.mjs"),
    "-p", path.join(root, "tsconfig.test.json"),
  ], { cwd: root, encoding: "utf8" });
  if (compile.status !== 0) {
    console.error("TS compile failed:");
    if (compile.stdout) process.stdout.write(compile.stdout);
    if (compile.stderr) process.stderr.write(compile.stderr);
    process.exit(compile.status ?? 1);
  }
}

const smokeDir = path.join(compiledRoot, "tests", "smoke");
if (!existsSync(smokeDir)) {
  console.error(`No compiled smoke tests at ${smokeDir}`);
  process.exit(0);
}

function walk(dir, suffix) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) out.push(...walk(file, suffix));
    else if (file.endsWith(suffix)) out.push(file);
  }
  return out.sort();
}

const tests = walk(smokeDir, ".test.js");
if (tests.length === 0) {
  console.error("No smoke tests found.");
  process.exit(0);
}

const results = [];
let passed = true;
for (const file of tests) {
  const startMs = Date.now();
  const r = spawnSync(process.execPath, [file], { cwd: root, encoding: "utf8" });
  const ok = r.status === 0;
  const durationMs = Date.now() - startMs;
  const result = {
    file: path.relative(compiledRoot, file),
    passed: ok,
    durationMs,
    stdout: r.stdout,
    stderr: r.stderr,
    status: r.status ?? 1,
  };
  results.push(result);
  if (!ok) {
    passed = false;
    if (bail) break;
  }
}

mkdirSync(path.join(root, ".tmp"), { recursive: true });
const payload = {
  passed,
  command: "node scripts/smoke-test.mjs",
  status: passed ? 0 : 1,
  results,
};
writeFileSync(path.join(root, ".tmp", "smoke-test-results.json"), JSON.stringify(payload, null, 2));

if (!passed) {
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(payload, null, 2));
