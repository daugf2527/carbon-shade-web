#!/usr/bin/env node
// scripts/audit-verify.mjs — re-check agent findings against actual code.
//
// Why: per feedback-verify-agent-output-before-reporting, agent claims about
// file:line / "missing" / "implemented as X" are UNVERIFIED until checked.
// This script parses agent finding .md files and re-reads each cited line
// range to confirm the evidence_excerpt matches reality.
//
// Usage: node scripts/audit-verify.mjs verification/audit-<timestamp>/
//
// Each finding gets stamped with one of:
//   VERIFIED       — evidence_excerpt matches the cited file:line (whitespace-normalized)
//   CITATION_DRIFT — file exists but content at line range differs
//   FILE_MISSING   — cited file does not exist
//   FORMAT_ERROR   — finding is malformed and can't be parsed
//
// Output: <audit-dir>/SUMMARY.md with verified findings highlighted, plus
// a JSON sidecar <audit-dir>/verified.json for CI consumption.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";

const ROOT = process.cwd();
const auditDirArg = process.argv[2];
if (!auditDirArg) {
  console.error("Usage: node scripts/audit-verify.mjs <audit-dir>");
  console.error("       e.g.  node scripts/audit-verify.mjs verification/audit-20260523-150000/");
  process.exit(2);
}

const auditDir = resolve(ROOT, auditDirArg);
if (!existsSync(auditDir)) {
  console.error(`[audit-verify] dir not found: ${auditDir}`);
  process.exit(2);
}

// ── Parse findings from agent-*.md files ────────────────────────────────────

// Finding format (verbatim from .claude/skills/audit/SKILL.md):
//   ## FINDING <num>
//   **severity**: P0 | P1 | P2
//   **claim**: <one-line>
//   **citation**: <relative/path>:<lineStart>-<lineEnd>   (or :<lineStart>)
//   **evidence_excerpt**:
//   ```
//   <verbatim text>
//   ```
//   **reasoning**: <why>
//   ---

function parseAgentFindings(filePath) {
  const text = readFileSync(filePath, "utf-8");
  const findings = [];
  // Split on `## FINDING` headers; the first chunk is preamble (file title etc.)
  const parts = text.split(/^## FINDING\s+/m);
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const finding = { agentFile: basename(filePath) };

    // <num> on the same line as the header
    const numMatch = chunk.match(/^([^\n]+)/);
    finding.id = numMatch ? numMatch[1].trim() : `${i}`;

    finding.severity = (chunk.match(/\*\*severity\*\*:\s*(P[012])/i) || [])[1] || null;
    finding.claim = ((chunk.match(/\*\*claim\*\*:\s*([^\n]+)/) || [])[1] || "").trim();

    const citationMatch = chunk.match(/\*\*citation\*\*:\s*([^\n]+)/);
    if (citationMatch) {
      const raw = citationMatch[1].trim();
      const m = raw.match(/^(.+?):(\d+)(?:-(\d+))?$/);
      if (m) {
        finding.citationPath = m[1].trim();
        finding.citationLineStart = parseInt(m[2], 10);
        finding.citationLineEnd = m[3] ? parseInt(m[3], 10) : finding.citationLineStart;
      } else {
        finding.citationRaw = raw;
      }
    }

    const excerptMatch = chunk.match(/\*\*evidence_excerpt\*\*:\s*\n```[a-zA-Z]*\n([\s\S]*?)\n```/);
    finding.evidenceExcerpt = excerptMatch ? excerptMatch[1] : null;

    const reasoningMatch = chunk.match(/\*\*reasoning\*\*:\s*([\s\S]*?)(?:\n---|\n## |$)/);
    finding.reasoning = reasoningMatch ? reasoningMatch[1].trim() : "";

    findings.push(finding);
  }
  return findings;
}

// ── Verification ─────────────────────────────────────────────────────────────

function normalize(s) {
  // Strip trailing whitespace per line, collapse multiple spaces, drop blank
  // leading/trailing lines. Tolerate quote-style differences in mostly-quoted text.
  return s
    .split(/\r?\n/)
    .map(line => line.replace(/\s+$/, "").replace(/\s+/g, " "))
    .filter((line, i, arr) => !(line === "" && (i === 0 || i === arr.length - 1)))
    .join("\n")
    .trim();
}

function verifyFinding(finding) {
  if (!finding.citationPath || !finding.citationLineStart) {
    return { status: "FORMAT_ERROR", detail: "missing or malformed citation" };
  }
  if (!finding.evidenceExcerpt) {
    return { status: "FORMAT_ERROR", detail: "missing evidence_excerpt block" };
  }
  const fullPath = resolve(ROOT, finding.citationPath);
  if (!existsSync(fullPath)) {
    return { status: "FILE_MISSING", detail: `${finding.citationPath} not found` };
  }
  let fileContent;
  try {
    fileContent = readFileSync(fullPath, "utf-8");
  } catch (e) {
    return { status: "FILE_MISSING", detail: `read failed: ${e.message}` };
  }
  const lines = fileContent.split(/\r?\n/);
  const start = finding.citationLineStart - 1;       // 1-indexed → 0-indexed
  const end = finding.citationLineEnd;                // inclusive end → exclusive slice
  if (start < 0 || start >= lines.length) {
    return { status: "CITATION_DRIFT", detail: `line ${finding.citationLineStart} out of range (file has ${lines.length} lines)` };
  }
  const actualRange = lines.slice(start, end).join("\n");
  const actualNorm = normalize(actualRange);
  const expectedNorm = normalize(finding.evidenceExcerpt);

  if (actualNorm === expectedNorm) {
    return { status: "VERIFIED", detail: "exact match" };
  }
  // Soft match: expected is a substring of actual (excerpt is partial)
  if (actualNorm.includes(expectedNorm) && expectedNorm.length > 0) {
    return { status: "VERIFIED", detail: "soft substring match" };
  }
  if (expectedNorm.includes(actualNorm) && actualNorm.length > 0) {
    return { status: "VERIFIED", detail: "expected wider than cited; cited content is subset" };
  }
  return {
    status: "CITATION_DRIFT",
    detail: `evidence_excerpt does not match file content at ${finding.citationPath}:${finding.citationLineStart}-${finding.citationLineEnd}`,
    actualPreview: actualRange.slice(0, 200),
    expectedPreview: finding.evidenceExcerpt.slice(0, 200),
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const agentFiles = readdirSync(auditDir).filter(f => f.startsWith("agent-") && f.endsWith(".md"));
if (agentFiles.length === 0) {
  console.error(`[audit-verify] no agent-*.md files in ${auditDir}`);
  process.exit(2);
}

const allFindings = [];
for (const f of agentFiles) {
  const findings = parseAgentFindings(join(auditDir, f));
  for (const finding of findings) {
    finding.verification = verifyFinding(finding);
    allFindings.push(finding);
  }
}

// ── Render SUMMARY.md ────────────────────────────────────────────────────────

const counts = { VERIFIED: 0, CITATION_DRIFT: 0, FILE_MISSING: 0, FORMAT_ERROR: 0 };
const bySeverity = { P0: [], P1: [], P2: [], NULL: [] };
for (const f of allFindings) {
  counts[f.verification.status]++;
  (bySeverity[f.severity || "NULL"] || bySeverity.NULL).push(f);
}

const out = [];
out.push(`# Audit Verification Summary — ${new Date().toISOString()}`);
out.push("");
out.push(`Source dir: \`${auditDirArg}\``);
out.push(`Findings parsed: **${allFindings.length}** across ${agentFiles.length} agent file(s).`);
out.push("");
out.push(`| Status | Count |`);
out.push(`|---|---|`);
out.push(`| ✅ VERIFIED | ${counts.VERIFIED} |`);
out.push(`| ⚠️ CITATION_DRIFT | ${counts.CITATION_DRIFT} |`);
out.push(`| ❌ FILE_MISSING | ${counts.FILE_MISSING} |`);
out.push(`| 🔴 FORMAT_ERROR | ${counts.FORMAT_ERROR} |`);
out.push("");
out.push("**Treat only `VERIFIED` findings as facts. Everything else is unverified and must not be reported as a bug without further checking.**");
out.push("");

for (const sev of ["P0", "P1", "P2", "NULL"]) {
  const items = bySeverity[sev];
  if (items.length === 0) continue;
  out.push(`## Severity ${sev === "NULL" ? "(unspecified)" : sev}`);
  out.push("");
  for (const f of items) {
    const badge = f.verification.status === "VERIFIED" ? "✅"
      : f.verification.status === "CITATION_DRIFT" ? "⚠️"
      : f.verification.status === "FILE_MISSING" ? "❌"
      : "🔴";
    out.push(`### ${badge} [${f.verification.status}] ${f.id} — ${f.claim || "(no claim)"}`);
    out.push("");
    out.push(`- **From**: \`${f.agentFile}\``);
    out.push(`- **Citation**: \`${f.citationPath || "?"}:${f.citationLineStart ?? "?"}-${f.citationLineEnd ?? "?"}\``);
    out.push(`- **Verification**: ${f.verification.detail}`);
    if (f.verification.status === "CITATION_DRIFT") {
      out.push(`  - actual preview: \`${(f.verification.actualPreview || "").replace(/\n/g, " ↵ ").slice(0, 150)}\``);
      out.push(`  - expected preview: \`${(f.verification.expectedPreview || "").replace(/\n/g, " ↵ ").slice(0, 150)}\``);
    }
    if (f.reasoning) {
      out.push(`- **Reasoning**: ${f.reasoning.slice(0, 200)}${f.reasoning.length > 200 ? "..." : ""}`);
    }
    out.push("");
  }
}

const summary = out.join("\n");
const summaryPath = join(auditDir, "SUMMARY.md");
writeFileSync(summaryPath, summary, "utf-8");

const jsonPath = join(auditDir, "verified.json");
writeFileSync(jsonPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: auditDirArg,
  counts,
  findings: allFindings.map(f => ({
    id: f.id,
    agentFile: f.agentFile,
    severity: f.severity,
    claim: f.claim,
    citation: f.citationPath ? `${f.citationPath}:${f.citationLineStart}-${f.citationLineEnd}` : null,
    verification: f.verification,
  })),
}, null, 2));

console.log(summary);
console.log(`\nWritten: ${summaryPath}`);
console.log(`         ${jsonPath}`);

// Exit code: non-zero if any P0 finding is NOT verified
const unverifiedP0 = allFindings.filter(f => f.severity === "P0" && f.verification.status !== "VERIFIED");
if (unverifiedP0.length > 0) {
  console.error(`\n[audit-verify] ${unverifiedP0.length} P0 finding(s) unverified — refusing exit 0.`);
  process.exit(1);
}
process.exit(0);
