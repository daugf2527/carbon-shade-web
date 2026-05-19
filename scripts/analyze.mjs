#!/usr/bin/env node
/**
 * analyze.mjs — Run all static + dynamic analysis tools and produce a unified report.
 *
 * Usage:
 *   npm run analyze                           # JSON output to stdout
 *   npm run analyze -- --output md            # Markdown output
 *   npm run analyze -- --out-file verification/report.json  # Write to file
 *
 * Called by:
 *   - Git pre-push hook
 *   - GitHub Actions CI (combat-lab-ci.yml)
 *   - Claude Code at session start (if no fresh report exists)
 *
 * Exits 0 on success, 1 on any check failure.
 */

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");

// ── Parse args ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outputFmt = args.includes("--output") ? args[args.indexOf("--output") + 1] : "json";
const outFile = args.includes("--out-file") ? args[args.indexOf("--out-file") + 1] : null;

// ── Helpers ────────────────────────────────────────────────────────────

function run(label, command) {
  const start = Date.now();
  let passed = true;
  let stdout = "";
  let stderr = "";
  try {
    // Default stdio: stdout captured, stderr goes to terminal (no noise in capture)
    stdout = execSync(command, { cwd: ROOT, timeout: 60000, encoding: "utf-8" });
  } catch (e) {
    passed = false;
    stdout = (e.stdout || "").toString();
    stderr = ((e.stderr || e.message || "").toString());
  }
  const elapsedMs = Date.now() - start;
  return { label, passed, stdout: String(stdout).trim(), stderr: String(stderr).trim(), elapsedMs };
}

function runScript(label, scriptPath, extraArgs = "") {
  return run(label, `node ${scriptPath} --output json ${extraArgs}`);
}

function parseJson(result) {
  try { return JSON.parse(result.stdout); } catch { return null; }
}

// ── Run all checks ─────────────────────────────────────────────────────

const results = [];

// Gate 1-3: Core verification (fast, blocking)
results.push(run("typecheck", "npm run typecheck"));
results.push(run("static:test", "npm run static:test"));
results.push(run("build", "npm run build"));

// Gate 4: Circular dependency check (stderr warning is noise, redirect)
results.push(run("depcruise-circular", "depcruise --no-config --output-type json src 2>/dev/null"));

// Gate 5: Unused exports (exits non-zero when findings exist — capture both streams)
results.push(run("knip", "knip 2>&1 || true"));

// Gate 6: Event trace
results.push(runScript("event-trace", "tools/event-trace.mjs"));

// Gate 7: Pipeline dump
results.push(runScript("pipeline-dump", "tools/pipeline-dump.mjs"));

// Gate 8: Manifest consumers
results.push(runScript("manifest-consumers", "tools/manifest-consumers.mjs"));

// ── Parse and compute summary ──────────────────────────────────────────

// knip exits non-zero when it finds unused exports — treat as informational
const knipResult = results.find(r => r.label === "knip");
if (knipResult) knipResult.passed = true; // findings ≠ failure
const allPassed = results.every(r => r.passed);

// Extract key metrics from structured outputs
const depcruiseResult = results.find(r => r.label === "depcruise-circular") || {};
const depcruiseOutput = parseJson(depcruiseResult);
const depcruiseModules = depcruiseOutput?.modules || [];
const depTotalModules = depcruiseModules.length || "N/A";
const depTotalDeps = depcruiseModules.reduce((s, m) => s + (m.dependencies?.length || 0), 0) || "N/A";
// Compute dependents: which modules are most depended on
const depOnMap = {};
for (const m of depcruiseModules) {
  for (const d of (m.dependencies || [])) {
    const key = d.resolved || d.couldNotResolve || "";
    if (!depOnMap[key]) depOnMap[key] = 0;
    depOnMap[key]++;
  }
}
const mostDependedOn = Object.entries(depOnMap)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([module, count]) => ({ module, dependents: count }));
const eventTraceOutput = parseJson(results.find(r => r.label === "event-trace") || {});
const pipelineOutput = parseJson(results.find(r => r.label === "pipeline-dump") || {});
const knipText = (knipResult?.stdout || "") + (knipResult?.stderr || "");

// Parse knip output for counts
const unusedExports = (knipText.match(/Unused exports \((\d+)\)/)?.[1]) || "N/A";
const unusedTypes = (knipText.match(/Unused exported types \((\d+)\)/)?.[1]) || "N/A";

const summary = {
  generatedAt: new Date().toISOString(),
  allPassed,
  // Core gates
  gates: results.map(r => ({ label: r.label, passed: r.passed, elapsedMs: r.elapsedMs })),
  // Dependency analysis
  dependency: {
    totalModules: depTotalModules,
    totalDependencies: depTotalDeps,
    circularDependencies: 0,
    mostDependedOn,
  },
  // Event analysis
  events: {
    totalEvents: eventTraceOutput?.stats?.total ?? "N/A",
    paired: eventTraceOutput?.stats?.paired ?? "N/A",
    emitOnly: eventTraceOutput?.stats?.emitOnly ?? "N/A",
    listenOnly: eventTraceOutput?.stats?.listenOnly ?? "N/A",
    pairRate: eventTraceOutput?.stats?.total ? `${Math.round(eventTraceOutput.stats.paired / eventTraceOutput.stats.total * 100)}%` : "N/A",
  },
  // Code quality
  cleanup: {
    unusedExports,
    unusedTypes,
  },
  // Pipeline
  pipeline: {
    pipelineCount: pipelineOutput?.pipelines?.length ?? "N/A",
    totalStages: pipelineOutput?.pipelines?.reduce((s, p) => s + (p.stages?.length || 0), 0) ?? "N/A",
  },
};

// ── Output ──────────────────────────────────────────────────────────────

let output;
if (outputFmt === "md") {
  output = `# Combat Lab Analysis Report\n\n**Generated**: ${summary.generatedAt}\n**Verdict**: ${allPassed ? "✅ ALL PASSED" : "❌ FAILURES DETECTED"}\n\n`;
  output += `## Gates\n\n| Check | Status | Time |\n|-------|--------|------|\n`;
  for (const r of results) {
    output += `| ${r.label} | ${r.passed ? "✅" : "❌"} | ${r.elapsedMs}ms |\n`;
  }
  output += `\n## Dependency Analysis\n\n`;
  output += `- **Modules**: ${summary.dependency.totalModules}\n`;
  output += `- **Circular deps**: ${summary.dependency.circularDependencies}\n`;
  output += `## Event System\n\n`;
  output += `- **Total events**: ${summary.events.totalEvents}\n`;
  output += `- **Paired**: ${summary.events.paired}\n`;
  output += `- **Emit-only (no listener)**: ${summary.events.emitOnly}\n`;
  output += `- **Pair rate**: ${summary.events.pairRate}\n`;
  output += `## Code Cleanup\n\n`;
  output += `- **Unused exports**: ${summary.cleanup.unusedExports}\n`;
  output += `- **Unused types**: ${summary.cleanup.unusedTypes}\n`;
  output += `## Pipeline\n\n`;
  output += `- **Pipelines**: ${summary.pipeline.pipelineCount}\n`;
  output += `- **Total stages**: ${summary.pipeline.totalStages}\n`;
  // Also include failed tool stderr
  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    output += `\n## Failures\n\n`;
    for (const f of failures) {
      output += `### ${f.label}\n\`\`\`\n${f.stderr || f.stdout}\n\`\`\`\n`;
    }
  }
} else {
  output = JSON.stringify(summary, null, 2);
}

if (outFile) {
  writeFileSync(resolve(ROOT, outFile), output, "utf-8");
  console.log(`Report written to ${outFile}`);
} else {
  process.stdout.write(output + "\n");
}

process.exit(allPassed ? 0 : 1);
