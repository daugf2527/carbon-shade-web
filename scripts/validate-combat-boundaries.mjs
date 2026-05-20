#!/usr/bin/env node
// scripts/validate-combat-boundaries.mjs — Validate combat kernel boundaries
//
// Checks:
//  1. No Phaser imports in src/combat/ (kernel must remain framework-free)
//  2. Velocity writes only in files listed in .ci/combat-boundaries.json
//
// Usage: node scripts/validate-combat-boundaries.mjs

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(ROOT, ".ci", "combat-boundaries.json");

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
let failed = false;

// ── 1. Phaser import boundary ──────────────────────────────────────────

console.log("Checking src/combat/ for Phaser imports...");
try {
  const result = execSync(
    `grep -rn "from ['\\"]phaser" src/combat/ || grep -rn "import.*phaser" src/combat/`,
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.trim()) {
    console.error("FAIL: Phaser import found in src/combat/ — kernel must remain Phaser-free");
    console.error(result.trim());
    failed = true;
  } else {
    console.log("OK: No Phaser imports in combat kernel");
  }
} catch {
  // grep returns exit 1 when no matches — that's success for us
  console.log("OK: No Phaser imports in combat kernel");
}

// ── 2. Velocity write locations ────────────────────────────────────────

console.log("\nChecking velocity writes against allowlist...");
const allowlist = config.velocityWriteAllowlist;

const violations = execSync(
  `grep -rn "\\.velocity\\s*[.=]" src/combat/ --include="*.ts"`,
  { cwd: ROOT, encoding: "utf8" },
).trim().split("\n").filter(line => {
  if (!line) return false;
  return !allowlist.some(entry => line.startsWith(entry.file));
});

if (violations.length > 0) {
  console.error("FAIL: velocity writes found outside allowed files:");
  for (const v of violations) {
    console.error(`  ${v}`);
  }
  console.error("");
  console.error("Allowed files (from .ci/combat-boundaries.json):");
  for (const entry of allowlist) {
    console.error(`  - ${entry.file} (${entry.reason})`);
  }
  failed = true;
} else {
  console.log("OK: All velocity writes in allowed files");
}

// ── Report ─────────────────────────────────────────────────────────────

if (failed) {
  process.exit(1);
}
console.log("\nAll combat boundary checks passed.");
