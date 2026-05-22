#!/usr/bin/env node
// scripts/validate-combat-boundaries.mjs — Validate combat kernel boundaries
//
// Checks:
//  1. No Phaser imports in src/combat/ (kernel must remain framework-free)
//  2. Velocity writes only in files listed in .ci/combat-boundaries.json
//
// Usage: node scripts/validate-combat-boundaries.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(ROOT, ".ci", "combat-boundaries.json");

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
let failed = false;

function walkTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkTsFiles(fullPath));
    } else if (fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function scanCombat(pattern) {
  const combatRoot = resolve(ROOT, "src", "combat");
  const matches = [];
  for (const file of walkTsFiles(combatRoot)) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (pattern.test(line)) matches.push(`${rel}:${index + 1}:${line}`);
    });
  }
  return matches;
}

// ── 1. Phaser import boundary ──────────────────────────────────────────

console.log("Checking src/combat/ for Phaser imports...");
const phaserImports = scanCombat(/from\s+['"]phaser|import.*phaser/);
if (phaserImports.length > 0) {
  console.error("FAIL: Phaser import found in src/combat/ — kernel must remain Phaser-free");
  console.error(phaserImports.join("\n"));
  failed = true;
} else {
  console.log("OK: No Phaser imports in combat kernel");
}

// ── 2. Velocity write locations ────────────────────────────────────────

console.log("\nChecking velocity writes against allowlist...");
const allowlist = config.velocityWriteAllowlist;

const violations = scanCombat(/\.velocity\s*[.=]/).filter(line => {
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
