#!/usr/bin/env node
// scripts/closed-loop-status.mjs — detect which step of /closed-loop is in progress
//
// Reads artifacts in verification/ and prints the next-action step.
// Used by /closed-loop skill to resume from partial runs.
//
// Usage:
//   node scripts/closed-loop-status.mjs                  # detect latest
//   node scripts/closed-loop-status.mjs <audit-dir>      # explicit dir

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";

const ROOT = process.cwd();

function latestAuditDir() {
  const vdir = join(ROOT, "verification");
  if (!existsSync(vdir)) return null;
  const candidates = readdirSync(vdir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith("audit-") && !e.name.endsWith("-fixverify"))
    .map(e => ({ name: e.name, mtime: statSync(join(vdir, e.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return candidates.length > 0 ? candidates[0].name : null;
}

function inspect(auditDirName) {
  const auditDir = join(ROOT, "verification", auditDirName);
  if (!existsSync(auditDir)) {
    return { step: 1, reason: `audit dir ${auditDirName} does not exist; start fresh at step 1` };
  }

  const agentFiles = readdirSync(auditDir).filter(f => f.startsWith("agent-") && f.endsWith(".md"));
  if (agentFiles.length === 0) {
    return { step: 1, reason: "no agent-*.md findings yet; dispatch audit agents" };
  }

  const hasSummary = existsSync(join(auditDir, "SUMMARY.md"));
  if (!hasSummary) {
    return {
      step: 2,
      reason: `${agentFiles.length} agent finding file(s) present, no SUMMARY.md`,
      command: `node scripts/audit-verify.mjs verification/${auditDirName}/`,
    };
  }

  const hasCoreReview = existsSync(join(auditDir, "CORE-REVIEW.md"));
  if (!hasCoreReview) {
    return {
      step: 3,
      reason: "SUMMARY.md exists but CORE-REVIEW.md missing; main Claude must core-review each VERIFIED finding",
      command: "main Claude reads each VERIFIED finding's cited file and writes verdicts",
    };
  }

  const hasFixPlan = existsSync(join(auditDir, "FIX-PLAN.md"));
  if (!hasFixPlan) {
    return {
      step: 3.5,
      reason: "CORE-REVIEW.md exists but FIX-PLAN.md missing; user must choose what to fix (CHECKPOINT B)",
      command: "surface verdict table to user; await fix scope decision",
    };
  }

  // Check git diff for uncommitted changes
  let hasDiff = false;
  try {
    const diff = execSync("git diff --stat", { cwd: ROOT, encoding: "utf-8" }).trim();
    hasDiff = diff.length > 0;
  } catch {}

  if (!hasDiff) {
    return {
      step: 4,
      reason: "FIX-PLAN.md exists but no uncommitted edits; main Claude must apply fixes",
      command: "main Claude Edits per FIX-PLAN.md",
    };
  }

  // Check for fix-verify dir (matching the audit dir's timestamp)
  const tsMatch = auditDirName.match(/^audit-(\d{8}-\d{6})$/);
  const ts = tsMatch ? tsMatch[1] : null;
  const fixverifyDirName = ts ? `audit-${ts}-fixverify` : null;
  const fixverifyDir = fixverifyDirName ? join(ROOT, "verification", fixverifyDirName) : null;
  const hasFixverify = fixverifyDir && existsSync(fixverifyDir);

  if (!hasFixverify) {
    return {
      step: 5,
      reason: "fixes applied but no fix-verify dir; rebuild (if C++) then dispatch fix-verify agent",
      command: "if C++ changed: cmake --build ... + smoke test; then create fix-verify dir + Agent dispatch",
    };
  }

  const hasFixverifySummary = existsSync(join(fixverifyDir, "SUMMARY.md"));
  if (!hasFixverifySummary) {
    return {
      step: 7,
      reason: "fix-verify agent ran but audit-verify hasn't been re-run on it",
      command: `node scripts/audit-verify.mjs verification/${fixverifyDirName}/`,
    };
  }

  // Gauntlet check — opportunistic, may be slow so don't always run
  return {
    step: 8,
    reason: "fix-verify SUMMARY exists; run npm gates then go to CHECKPOINT D for commit",
    command: "npm run typecheck && npm run static:test && npm run build && npm run completion",
  };
}

const arg = process.argv[2];
const target = arg || latestAuditDir();
if (!target) {
  console.log(JSON.stringify({
    step: 1,
    reason: "no audit dir found in verification/; start fresh — invoke /closed-loop and pick audit topics",
    command: "/closed-loop",
  }, null, 2));
  process.exit(0);
}

const result = inspect(target);
result.auditDir = `verification/${target}/`;
console.log(JSON.stringify(result, null, 2));
process.exit(0);
