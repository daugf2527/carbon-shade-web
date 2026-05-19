#!/usr/bin/env node
/**
 * manifest-consumers.mjs — Track JSON/data manifest ↔ TypeScript consumer relationships.
 *
 * Usage:
 *   node tools/manifest-consumers.mjs [--src <dir>] [--output json|md]
 *
 * Extensibility:
 *   Add manifest directories to MANIFEST_DIRS. The script scans those dirs for
 *   .json files and then traces which TS files import/load them.
 *   Add consumption patterns to CONSUMPTION_PATTERNS for new loading mechanisms
 *   (fetch, dynamic imports, custom loaders, etc.).
 *
 * Output (JSON):
 *   { manifests: [{ file, consumers: [{file, line, method}] }],
 *     orphans: [{file}] }
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Configurable: manifest directories ─────────────────────────────────

const MANIFEST_DIRS = [
  "src/data/manifest/",
  // Future: add new manifest directories here
  // "src/data/config/",
  // "src/ai/manifests/",
];

// ── Configurable: consumption patterns ─────────────────────────────────
// Each pattern's first capture group is the path/filename being consumed.

const CONSUMPTION_PATTERNS = [
  // import X from "./path/file.json" with { type: "json" }
  /import\s+\w+\s+from\s+["'](.+?\.json)["']/g,
  // import { X } from "./path/file.json"
  /import\s+\{[^}]+\}\s+from\s+["'](.+?\.json)["']/g,
  // Future: loadManifest("./path/file.json")
  // /loadManifest\(\s*["'](.+?\.json)["']/g,
  // Future: await fetch("./path/config.json")
  // /fetch\(\s*["'](.+?\.json)["']/g,
  // Future: require("./path/file.json")
  // /require\(\s*["'](.+?\.json)["']/g,
];

// ── File scanning ──────────────────────────────────────────────────────

function* walkDir(dir, extensions = [".ts", ".tsx", ".mjs", ".js", ".json"]) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = resolve(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git" || e.name === "dist" || e.name === ".tmp") continue;
        yield* walkDir(full, extensions);
      } else if (extensions.includes(extname(e.name))) {
        yield full;
      }
    }
  } catch {
    // directory may not exist yet
  }
}

function linesOf(filePath) {
  try {
    return readFileSync(filePath, "utf-8").split("\n");
  } catch {
    return [];
  }
}

// ── Resolution ─────────────────────────────────────────────────────────
// Resolve a relative import path against the importing file's directory.

function resolveImport(importPath, importerRel) {
  const importerDir = dirname(importerRel);
  const raw = resolve(importerDir, importPath);
  // Normalize: strip leading ./
  return raw.startsWith("./") ? raw.slice(2) : raw;
}

// ── Main ───────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const srcDir = args.includes("--src") ? args[args.indexOf("--src") + 1] : "src";
  const outputFmt = args.includes("--output") ? args[args.indexOf("--output") + 1] : "json";

  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const absSrc = resolve(projectRoot, srcDir);

  // Collect all manifest files
  const manifestFiles = new Set();
  for (const mdir of MANIFEST_DIRS) {
    const absMdir = resolve(projectRoot, mdir);
    for (const f of walkDir(absMdir)) {
      if (extname(f) === ".json") {
        manifestFiles.add(relative(projectRoot, f));
      }
    }
  }

  // Scan all TS files for manifest consumption
  const consumers = new Map(); // manifestPath → [{file, line, method}]
  const consumerFiles = new Map(); // consumerFile → [manifestPath]

  for (const file of walkDir(absSrc, [".ts", ".tsx", ".mjs", ".js"])) {
    const relPath = relative(projectRoot, file);
    const lines = linesOf(file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of CONSUMPTION_PATTERNS) {
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(line)) !== null) {
          const rawImport = m[1];
          const resolved = resolveImport(rawImport, relPath);

          // Check if this import resolves to a known manifest
          for (const mf of manifestFiles) {
            if (resolved === mf || resolved.endsWith(mf)) {
              if (!consumers.has(mf)) consumers.set(mf, []);
              consumers.get(mf).push({ file: relPath, line: i + 1, method: "import" });

              if (!consumerFiles.has(relPath)) consumerFiles.set(relPath, []);
              if (!consumerFiles.get(relPath).includes(mf)) {
                consumerFiles.get(relPath).push(mf);
              }
            }
          }
        }
      }
    }
  }

  // Build output
  const manifests = [...manifestFiles].sort().map(mf => ({
    file: mf,
    consumers: consumers.get(mf) || [],
  }));

  const orphans = manifests.filter(m => m.consumers.length === 0).map(m => m.file);

  if (outputFmt === "md") {
    console.log("# Manifest Consumer Trace\n");
    console.log(`**Total manifests**: ${manifestFiles.size} | **Orphans (no consumers)**: ${orphans.length}\n`);

    for (const m of manifests) {
      if (m.consumers.length === 0) continue;
      console.log(`## \`${m.file}\`\n`);
      console.log("| Consumer | Line | Method |");
      console.log("|----------|------|--------|");
      for (const c of m.consumers) {
        console.log(`| \`${c.file}\` | ${c.line} | ${c.method} |`);
      }
      console.log();
    }

    if (orphans.length > 0) {
      console.log("## Orphans (no consumers found)\n");
      for (const o of orphans) {
        console.log(`- \`${o}\``);
      }
    }
  } else {
    console.log(JSON.stringify({ manifests, orphans, stats: { totalManifests: manifestFiles.size, orphanCount: orphans.length } }, null, 2));
  }
}

main();
