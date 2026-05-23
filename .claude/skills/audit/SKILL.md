---
name: audit
description: |
  Run agent-based audits with MANDATORY claim verification. Use when you need
  deeper than-test inspection of dnf-extract C++ / dnf-native parsers / pipeline
  closed-loop / completeness vs design doc. Agent claims are treated as
  UNVERIFIED until scripts/audit-verify.mjs re-checks each cited file:line.
trigger: when user asks "audit X", "deep check X", or "agent 扫一下 X"
---

# /audit — Agent audit with mandatory verification

**Why this exists**: H1-H11 static tests verify **consistency** (parser produces
expected output for given input), not **truth**. Real bugs (iconv UB, GlobalTable
UAF, NutExtractor "unknown" sentinel, 6-int hitbox semantics confusion) keep
slipping past those tests. They get caught by ad-hoc multi-agent audits — but
ad-hoc means inconsistent.

This skill formalizes the audit-then-verify loop so it's repeatable.

**Critical rule** (per `feedback-verify-agent-output-before-reporting`):
**Agent claims are NEVER fact**. The whole pipeline ends with `scripts/audit-verify.mjs`
re-reading each cited file:line to confirm the claim. Findings without verification
get tagged `[UNVERIFIED]` in the final report.

## Workflow

### 1. Pick topics

Read `.claude/skills/audit/topics.json` (co-located with this skill so it ships
in the repo; the parent `.claude/` is mostly gitignored). Each topic has:
- `id` — short slug
- `scope` — files / dirs to inspect
- `question` — what to look for
- `model` — sonnet (default) / opus
- `max_findings` — soft cap

Default: run **all** topics in parallel. To filter: ask the user which topics, or
run a subset like `["memory-safety", "ts-parser-truth"]`.

### 2. Dispatch parallel agents

Use the `Agent` tool with `subagent_type: "general-purpose"` and `model: "sonnet"`
(or opus for high-stakes). **Always pass `model` explicitly** per
`feedback-parallel-agents-min-sonnet`.

For each topic, prompt the agent to write findings to
`verification/audit-<timestamp>/agent-<topic-id>.md` using THIS EXACT FORMAT:

```markdown
# Audit: <topic-id>

## FINDING <num>

**severity**: P0 | P1 | P2
**claim**: <one-line summary>
**citation**: <relative/path/to/file>:<lineStart>-<lineEnd>
**evidence_excerpt**:
```
<exact text from the file at that line range — no paraphrase>
```
**reasoning**: <why this is a finding>

---
```

The `evidence_excerpt` MUST be a verbatim copy of the cited lines. The verify
script will fail-match if you paraphrase, summarize, or trim. Citation line
range is INCLUSIVE on both ends.

Include this constraint verbatim in the agent prompt.

### 3. Run verification

After all agents return, invoke:

```bash
node scripts/audit-verify.mjs verification/audit-<timestamp>/
```

This script:
- Parses every `agent-*.md` finding
- Reads each cited file at the line range
- Normalizes whitespace, compares to `evidence_excerpt`
- Marks each finding `VERIFIED` / `CITATION_DRIFT` / `FILE_MISSING`
- Writes `verification/audit-<timestamp>/SUMMARY.md` with the verified findings
  highlighted and unverified ones flagged

### 4. Report to user

Show the SUMMARY.md content. Use `[VERIFIED P0]` / `[UNVERIFIED P1]` prefixes
when relaying findings. **Never report an unverified P0/P1 as if it were a
confirmed bug** — that's the exact failure mode this skill exists to prevent.

## Output structure

```
verification/audit-<timestamp>/
├── agent-memory-safety.md       # raw agent findings
├── agent-ts-parser-truth.md
├── agent-pipeline-closure.md
├── agent-deliverable-presence.md
└── SUMMARY.md                   # produced by audit-verify.mjs
```

## When NOT to use this

- Quick sanity check: use `npm run static:test` + `npm run completion`
- Type errors: use `npm run typecheck`
- Build break: use `npm run build`
- Single-file lookup: use Read + Grep directly

The audit is for **catching what tests can't** — semantic errors, missing pieces,
cross-file inconsistencies, language-boundary bugs (C++/TS).

## Reference

- Verification policy: `feedback-verify-agent-output-before-reporting`
- Sonnet minimum: `feedback-parallel-agents-min-sonnet`
- Topic registry: `.claude/skills/audit/topics.json`
- Companion: `npm run completion` for presence checks
