#!/usr/bin/env node
// generate-actions.mjs — One-click pipeline: PVF → .skl extraction → SklAnalyzer → SklToActionMapper → JSON output
// Phase 5 of 6-phase frame-level restoration plan.
// Self-contained Node.js ESM script (no external dependencies).

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// ── CLI argument parsing ──

function parseArgs(args) {
  const opts = {
    pvf: null,
    job: "swordman",
    skill: null,
    out: resolve(PROJECT_ROOT, ".tmp/generated-actions"),
    list: false,
    summary: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--pvf": opts.pvf = args[++i] ?? null; break;
      case "--job": opts.job = args[++i] ?? "swordman"; break;
      case "--skill": opts.skill = args[++i] ?? null; break;
      case "--out": opts.out = resolve(args[++i] ?? opts.out); break;
      case "--list": opts.list = true; break;
      case "--summary": opts.summary = true; break;
      case "--help":
        console.log(`generate-actions.mjs — One-click pipeline for DNF .skl → FrameDataAction

Usage: node scripts/generate-actions.mjs [options]

Options:
  --pvf <path>       Path to Script.pvf (required)
  --job <name>       Filter by job: swordman, demonicswordman (default: swordman)
  --skill <suffix>   Map a single skill by file path suffix
  --out <dir>        Output directory for JSON files (default: .tmp/generated-actions/)
  --list             List available .skl files without mapping
  --summary          Print summary JSON to stdout instead of writing files
  --help             Show this help`);
        process.exit(0);
      default:
        console.error(`Unknown option: ${arg}`);
        console.error("Use --help for usage.");
        process.exit(1);
    }
  }

  if (!opts.pvf && !opts.list) {
    console.error("Error: --pvf <path> is required (except with --help)");
    console.error("Use --help for usage.");
    process.exit(1);
  }

  return opts;
}

// ── Load compiled modules ──

async function loadModules() {
  const testJsDir = resolve(PROJECT_ROOT, ".tmp/test-js/src/extraction");
  const { PvfParser } = await import(`file://${testJsDir}/PvfParser.js`);
  const { SklAnalyzer } = await import(`file://${testJsDir}/SklAnalyzer.js`);
  const { SklToActionMapper } = await import(`file://${testJsDir}/SklToActionMapper.js`);
  return { PvfParser, SklAnalyzer, SklToActionMapper };
}

// ── Main pipeline ──

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log("Loading compiled modules from .tmp/test-js/...");
  const { PvfParser, SklAnalyzer, SklToActionMapper } = await loadModules();

  console.log(`Loading Script.pvf: ${opts.pvf}`);
  const pvfBuf = readFileSync(opts.pvf);
  const container = PvfParser.parse(pvfBuf);
  console.log(`PVF loaded: ${container.files.length} files, version v${container.fileVersion}`);

  // Filter .skl files
  const jobPattern = opts.job.toLowerCase();
  const sklFiles = container.files.filter(f =>
    f.path.endsWith(".skl") &&
    f.path.toLowerCase().includes(jobPattern)
  );

  // Optionally filter to a single skill
  const targets = opts.skill
    ? sklFiles.filter(f => f.path.includes(opts.skill))
    : sklFiles;

  console.log(`Found ${targets.length} .skl files (job: ${opts.job})${opts.skill ? `, filter: "${opts.skill}"` : ""}`);

  if (opts.list) {
    console.log("\nAvailable .skl files:");
    targets.forEach((f, i) => console.log(`  [${i + 1}] ${f.path} (${f.size} bytes)`));
    console.log(`\nTotal: ${targets.length} files`);
    process.exit(0);
  }

  // Process each .skl
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  const allWarnings = [];

  for (let i = 0; i < targets.length; i++) {
    const entry = targets[i];
    if (!entry) continue;
    try {
      // Extract raw bytes
      const data = PvfParser.extractFile(pvfBuf, container, entry.path);
      if (!data) {
        console.error(`  [${i + 1}/${targets.length}] SKIP: ${entry.path} — extractFile returned null`);
        errorCount++;
        continue;
      }

      // Parse with SklAnalyzer
      const sklDef = SklAnalyzer.parseAndAnalyze(data, undefined, entry.path);

      // Map to FrameDataAction format
      const mapped = SklToActionMapper.map(sklDef, undefined);

      results.push(mapped);
      successCount++;

      // Collect warnings
      if (mapped.warnings.length > 0) {
        allWarnings.push({ skill: entry.path, warnings: mapped.warnings });
      }

      // Progress indicator
      if ((i + 1) % 10 === 0 || i === targets.length - 1) {
        console.log(`  [${i + 1}/${targets.length}] Processed: ${entry.path} → ${mapped.actionName} (id=${mapped.skillId})`);
      }
    } catch (err) {
      console.error(`  [${i + 1}/${targets.length}] ERROR: ${entry.path} — ${err.message}`);
      errorCount++;
    }
  }

  // ── Output ──

  if (opts.summary) {
    // Print summary to stdout
    const summary = {
      totalSkills: targets.length,
      mappedSuccessfully: successCount,
      errors: errorCount,
      skillsWithCooldown: results.filter(r => r.cooldownMs != null).length,
      skillsWithMpCost: results.filter(r => r.mpCost != null).length,
      skillsWithCastTime: results.filter(r => r.castTimeMs != null).length,
      skillsWithWarnings: allWarnings.length,
      generatedAt: new Date().toISOString(),
      source: opts.pvf,
      job: opts.job,
    };
    console.log(JSON.stringify(summary, null, 2));
  } else {
    // Write individual JSON files
    mkdirSync(opts.out, { recursive: true });
    let writtenCount = 0;
    for (const result of results) {
      const fileName = `skill_${result.skillId}.json`;
      const filePath = resolve(opts.out, fileName);
      writeFileSync(filePath, JSON.stringify(result, null, 2), "utf-8");
      writtenCount++;
    }
    console.log(`\nWritten ${writtenCount} files to ${opts.out}/`);
  }

  // Final report
  console.log(`\nPipeline complete: ${successCount} mapped, ${errorCount} errors, ${allWarnings.length} skills with warnings`);

  if (allWarnings.length > 0) {
    console.log(`\nWarnings summary:`);
    allWarnings.slice(0, 5).forEach(w => {
      console.log(`  ${w.skill}: ${w.warnings.join("; ")}`);
    });
    if (allWarnings.length > 5) {
      console.log(`  ... and ${allWarnings.length - 5} more`);
    }
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
