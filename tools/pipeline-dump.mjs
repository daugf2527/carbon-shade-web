#!/usr/bin/env node
/**
 * pipeline-dump.mjs — Extract pipeline/execution-order definitions from source.
 *
 * Usage:
 *   node tools/pipeline-dump.mjs [--src <dir>] [--output json|md]
 *
 * Extensibility:
 *   Add pipeline registration patterns to PIPELINE_PATTERNS.
 *   Each pattern has:
 *     - regex:    captures {name} and {phase} from a line
 *     - fileHint: optional regex to filter which files to scan (e.g. /kernel/)
 *   For entirely new pipeline systems, add a new entry to PIPELINE_PATTERNS.
 *
 * Output (JSON):
 *   { pipelines: [{ name, file, stages: [{name, phase, line}] }] }
 *
 * Merging: consecutive lines matching the same pattern in the same file
 *   within 3 lines of each other are grouped as one pipeline.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Configurable patterns ──────────────────────────────────────────────

const PIPELINE_PATTERNS = [
  {
    // this.pipeline.push({ name: "StageName", phase: "INPUT", tick: ... })
    regex: /\.pipeline\.push\(\s*\{\s*name:\s*["']([^"']+)["'],\s*phase:\s*["']([^"']+)["']/,
    fileHint: null,  // scan all files; set to /kernel/ to restrict
  },
  // Future patterns for different pipeline systems:
  // {
  //   regex: /\.addStage\(\s*["']([^"']+)["'],\s*["']([^"']+)["']/,
  //   fileHint: /GameLoop\.ts/,
  // },
  // {
  //   regex: /registerTick\(\s*["']([^"']+)["'],\s*["']([^"']+)["']/,
  //   fileHint: null,
  // },
];

// ── File scanning ──────────────────────────────────────────────────────

function* walkDir(dir, extensions = [".ts", ".tsx", ".mjs", ".js"]) {
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
}

function linesOf(filePath) {
  try {
    return readFileSync(filePath, "utf-8").split("\n");
  } catch {
    return [];
  }
}

// ── Extraction ─────────────────────────────────────────────────────────

function extractPipeline(lines, relPath, patterns) {
  const results = [];

  for (const pat of patterns) {
    if (pat.fileHint && !pat.fileHint.test(relPath)) continue;

    const stages = [];
    for (let i = 0; i < lines.length; i++) {
      const m = pat.regex.exec(lines[i]);
      if (m) {
        stages.push({ name: m[1], phase: m[2], line: i + 1 });
      }
    }

    if (stages.length > 0) {
      results.push({
        patternIndex: patterns.indexOf(pat),
        file: relPath,
        stages,
      });
    }
  }

  return results;
}

// ── Main ───────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const srcDir = args.includes("--src") ? args[args.indexOf("--src") + 1] : "src";
  const outputFmt = args.includes("--output") ? args[args.indexOf("--output") + 1] : "json";

  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const absSrc = resolve(projectRoot, srcDir);

  const allPipelines = [];

  for (const file of walkDir(absSrc)) {
    const relPath = relative(projectRoot, file);
    const lines = linesOf(file);
    const found = extractPipeline(lines, relPath, PIPELINE_PATTERNS);
    allPipelines.push(...found);
  }

  if (outputFmt === "md") {
    console.log("# Pipeline Definitions\n");
    for (const pipe of allPipelines) {
      console.log(`## ${pipe.file}\n`);
      console.log("| # | Stage | Phase | Line |");
      console.log("|---|-------|-------|------|");
      for (let i = 0; i < pipe.stages.length; i++) {
        const s = pipe.stages[i];
        console.log(`| ${i + 1} | \`${s.name}\` | \`${s.phase}\` | ${s.line} |`);
      }
      console.log();
    }
    console.log(`**Total pipelines**: ${allPipelines.length} | **Total stages**: ${allPipelines.reduce((s, p) => s + p.stages.length, 0)}`);
  } else {
    console.log(JSON.stringify({ pipelines: allPipelines }, null, 2));
  }
}

main();
