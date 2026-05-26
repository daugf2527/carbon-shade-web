---
name: closed-loop
disable-model-invocation: true
description: |
  Run the full audit → core-review → fix → fix-verify → gate → commit
  workflow on a stage1 topic. Use when user says "跑闭环 X" / "audit + fix X"
  / "完整审一下 X" / "/closed-loop". Drives the 9-step trust chain end-to-end
  with mandatory human checkpoints at decision-critical steps.
trigger: when user explicitly invokes /closed-loop, OR says "完整闭环走一遍 / audit + 修 / 闭环跑 X"
---

# /closed-loop — Audit → Core-Review → Fix → Verify → Commit

## What this exists for

H1-H11 unit tests verify CONSISTENCY (parser matches its own fixtures) but
**don't catch semantic / cross-language / file-controlled bugs**. The full
closed-loop catches what tests can't, and crucially does it with **machine-
re-verifiable trust between every stage**:

```
sub-agents (broad discovery)
    ↓ each finding has structured citation
    ↓ audit-verify.mjs MECHANICALLY re-reads cited file:line
main Claude (single reviewer + implementer)
    ↓ judges REAL / REAL_LOWER / DESIGN / FALSE_POSITIVE per-finding
    ↓ fixes REAL findings directly via Edit
    ↓ re-dispatches same audit topic
sub-agents (fix verification)
    ↓ each fix-finding has structured citation pointing AT the fix
    ↓ audit-verify.mjs re-reads the fix citations
gate gauntlet (npm run analyze etc.)
    ↓ green
human checkpoint
    ↓ approves commit message + scope
git commit
```

**No step trusts the previous step's claim**. Each output is re-checked by
the next layer's mechanical or human verifier. This is the response to the
user's 2026-05-23 observation: "测试多但抓不到 bug，agent 独立扫的反而有效"
(see [[workflow-closed-loop-2026-05-23]]).

## When to invoke

Use this skill when:
- User explicitly says `/closed-loop` or "跑闭环" / "audit + 修" / "完整审"
- User asks to deep-audit + fix a specific scope (a topic from
  `.claude/skills/audit/topics.json`, or a custom scope)
- A major milestone is about to commit and we want one last semantic sweep

Do NOT use this skill for:
- Quick sanity check (use `npm run static:test` instead)
- Single-file lookup (use Read/Grep)
- Plain agent dispatch without verification (just use `Agent` tool directly)
- Drive-by perf optimization (different workflow)

## The 9 steps

### Step 1 — Audit dispatch

Read `.claude/skills/audit/topics.json` to know available topics. Ask user
which topic(s) (default: all 6 if user didn't specify). Create
`verification/audit-<YYYYMMDD-HHMMSS>/` directory; remember this path as
AUDIT_DIR for subsequent steps.

For each chosen topic, dispatch ONE Sonnet agent (use `Agent` tool with
`model: "sonnet"` per [[feedback-parallel-agents-min-sonnet]]). Each agent
must:
- Write findings to `AUDIT_DIR/agent-<topic-id>.md`
- Use the strict finding format defined in `.claude/skills/audit/SKILL.md`
- Receive constraint: "DO NOT modify files. DO NOT run npm. DO NOT invent
  citations."

Dispatch ALL agents in PARALLEL (single message, multiple Agent tool calls).

**State after step 1**: `AUDIT_DIR/agent-*.md` exists (one per topic).

### Step 2 — audit-verify (mechanical citation check)

Run:
```bash
node scripts/audit-verify.mjs <AUDIT_DIR>
```

Writes `<AUDIT_DIR>/SUMMARY.md` + `<AUDIT_DIR>/verified.json`. Each finding
gets stamped `VERIFIED` / `CITATION_DRIFT` / `FILE_MISSING` / `FORMAT_ERROR`.

This is fully automatic — no Claude judgment required.

**State after step 2**: `AUDIT_DIR/SUMMARY.md` + `verified.json` exist.

### ─── CHECKPOINT A (auto-pass unless user said "stop after each step") ───

Report the counts to user: "X VERIFIED / Y CITATION_DRIFT / Z
FORMAT_ERROR / W FILE_MISSING across N topics." Do not pause unless user
explicitly asked for it.

### Step 3 — Main Claude core-review

For EACH finding in `verified.json` with `verification.status === "VERIFIED"`:

1. `Read` the cited file at the cited line range, plus ±20 lines surrounding
   context. NEVER skip this — the citation-verification step only proves the
   cited code exists, not that the agent's *interpretation* is correct.
2. Judge the finding's claim and assign a **verdict**:
   - `REAL` — confirmed bug at the cited severity
   - `REAL_LOWER` — confirmed but severity overstated (specify the true
     severity)
   - `MITIGATED` — code does the cited thing but upstream check makes it
     unreachable in practice
   - `DESIGN` — intentional, not a bug
   - `FALSE_POSITIVE` — agent misread the code
3. Write a row to `AUDIT_DIR/CORE-REVIEW.md` in this format:

```markdown
## Agent <topic-id> — N VERIFIED

| # | Severity | Verdict | Notes |
|---|---|---|---|
| F1 | P0 | REAL | <one-line why it stands at this severity> |
| F2 | P0 | REAL_LOWER P1 | <one-line why severity is overstated> |
| ... |
```

Group findings by agent. End with a final tally:
- Total REAL by severity
- Cross-agent calibration notes (e.g., "test-effectiveness agent over-labels P0")

**Trust rule**: do not treat any finding as REAL until its cited code has
been read in this step. If you skip the Read, you've just trusted the
sub-agent verbatim — that's exactly the failure mode this workflow exists
to prevent.

**State after step 3**: `AUDIT_DIR/CORE-REVIEW.md` exists with verdict per
finding.

### ─── CHECKPOINT B (MANDATORY HUMAN) ───

Surface the verdict table to user. Ask:

```
Found N REAL findings (M P0, K P1, L P2) + Q REAL_LOWER. Top P0:
 - F1: <claim> @ <file:line>
 - F2: ...
What to fix? [all REAL P0+P1 / specific list / discuss / skip fix step]
```

**Wait for explicit user response. Do not proceed to fix without it.**

If user picks specific findings, write that list to
`AUDIT_DIR/FIX-PLAN.md` so step 4 has a stable to-do.

### Step 4 — Main Claude fixes

For each finding the user approved (per FIX-PLAN.md):

1. Re-read the cited code + sufficient surrounding context to understand
   the actual fix shape (don't just patch the cited line — find the right
   place to put the bounds check / null guard / throw).
2. Apply the fix via `Edit`. Each fix must:
   - Be **minimal** — don't refactor while fixing
   - Be **well-commented** — note "Audit F<N>: <one-line>" in the new code
     so the fix is traceable back to the finding
   - **Not change behavior for valid inputs** — fixes are defensive; valid
     PVF/test data should produce identical output before and after
3. Group fixes by file. Batch all fixes for one file into one Edit
   sequence to minimize regressions.

**Do not dispatch a fix sub-agent**. Per [[workflow-closed-loop-2026-05-23]]
principle #5: main Claude is the implementer. A fix sub-agent introduces
the same trust problem the audit sub-agents have, with no compensating
verification layer.

**State after step 4**: uncommitted edits in the working tree, listed by
`git diff --stat`.

### Step 5 — Rebuild (if C++ changed)

If any file under `tools/dnf-porting-src/` changed, rebuild + recopy:

```bash
cmake --build D:/carbon-shade-web/tools/dnf-porting-src/build
cp D:/carbon-shade-web/tools/dnf-porting-src/build/dnf-extract.exe \
   D:/carbon-shade-web/tools/dnf-extract.exe
```

Smoke-test with a real PVF call:

```bash
D:/carbon-shade-web/tools/dnf-extract.exe \
  --pvf "<PVF-path>" \
  --file character/swordman/swordman.chr 2>/dev/null | head -c 200
```

Output should be a valid typed JSON starting with `{"extractor_version":`.

If TS files changed, no rebuild — typecheck + static:test cover it (step 8).

### ─── CHECKPOINT C (MANDATORY HUMAN) ───

Show user `git diff --stat` + smoke test output. Ask:

```
N files changed (+X -Y). Smoke test: <OK / FAIL>. Diff looks reasonable?
[continue to fix-verify / inspect specific file / revert specific fix]
```

**Wait for response.** Do not proceed to commit step without it.

### Step 6 — Fix-verify agent dispatch

Create `verification/audit-<ORIGINAL_TS>-fixverify/` (suffix the original
audit dir's timestamp; this aids correlation).

Dispatch ONE Sonnet agent **per affected topic** (usually just the topics
the user chose findings from in step 3). Each agent's prompt MUST include:

1. The list of original findings it should re-check (read from
   `AUDIT_DIR/agent-<topic>.md`)
2. The strict finding format (same as step 1)
3. Verdict field added: `verdict: FIXED | PARTIAL | UNFIXED`
4. New `citation` must point at the **fix code** (where the new guard /
   check / throw lives), not the original buggy line
5. Constraint: "DO NOT find NEW issues; only verify the listed originals"

Output to `<FIXVERIFY_DIR>/agent-<topic>-fixverify.md`.

### Step 7 — audit-verify on the fix-verify reports

```bash
node scripts/audit-verify.mjs <FIXVERIFY_DIR>
```

This re-checks that the fix-verify agent's NEW citations (pointing at the
fix code) are real. The same FORMAT_ERROR / CITATION_DRIFT / FILE_MISSING
rules apply.

A `CITATION_DRIFT` here often means the agent's evidence_excerpt is the
right code but the line range is off-by-a-few — go read the code yourself
to confirm the fix is actually correct (line-range drift ≠ fix failure).

### Step 8 — Gate gauntlet

```bash
npm run typecheck      # TS type safety
npm run static:test    # 66+ probe suites
npm run build          # Vite production build
npm run completion     # Day deliverable presence
```

All must be green. If any fails, **fix that first** (loop back to step 4
within this session — do not commit a half-fixed state).

### ─── CHECKPOINT D (MANDATORY HUMAN) ───

Draft the commit message per [[feedback-check-git-state-before-staging]]
style:

```
<scope>: <one-line subject under 70 chars>

<body explaining WHY, not just WHAT. Reference the audit dir for traceability.>

Verification:
  npm run typecheck → pass
  npm run static:test → N/N
  npm run build → pass
  audit fix-verify: X/X FIXED, all citations VERIFIED

Audit artifacts:
  <AUDIT_DIR>/ (original + CORE-REVIEW.md)
  <FIXVERIFY_DIR>/ (fix verification)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Show user the full draft. Wait for "go" / "edit X" / "abort".

### Step 9 — Stage + commit

Per [[feedback-check-git-state-before-staging]]: **explicit file list, no
`git add -A`**. Only stage files YOU edited in step 4. Files modified by
the user pre-session stay out unless explicitly approved.

```bash
git add <file1> <file2> ... <fileN>
git status -s    # confirm clean staging
git commit -m "$(cat <<'EOF' ... EOF)"
git log --oneline -3
```

Report commit hash to user. Done.

## State machine: resuming from a partial run

If the user comes back mid-flow and says "继续闭环" / "/closed-loop resume",
detect state via artifacts:

```
Has AUDIT_DIR/agent-*.md ?
├── no  → step 1 not done, start fresh
└── yes → has AUDIT_DIR/SUMMARY.md ?
   ├── no  → resume step 2 (audit-verify)
   └── yes → has AUDIT_DIR/CORE-REVIEW.md ?
      ├── no  → resume step 3 (core-review)
      └── yes → has AUDIT_DIR/FIX-PLAN.md ?
         ├── no  → resume CHECKPOINT B (ask user what to fix)
         └── yes → git diff non-empty?
            ├── no  → resume step 4 (fixing)
            └── yes → has FIXVERIFY_DIR ?
               ├── no  → resume step 5 (rebuild + smoke)
               └── yes → has FIXVERIFY_DIR/SUMMARY.md ?
                  ├── no  → resume step 7 (audit-verify on fixverify)
                  └── yes → green gates ?
                     ├── no  → resume step 8 (gauntlet)
                     └── yes → resume CHECKPOINT D (commit draft)
```

Run `node scripts/closed-loop-status.mjs` to get this answer programmatically.

## Reference

- Audit dispatch: `.claude/skills/audit/SKILL.md`
- Citation verifier: `scripts/audit-verify.mjs`
- Presence audit: `scripts/completion.mjs`
- State detector: `scripts/closed-loop-status.mjs`
- Verification policy: `feedback-verify-agent-output-before-reporting`
- Trust chain rationale: `workflow-closed-loop-2026-05-23`
- Sonnet minimum: `feedback-parallel-agents-min-sonnet`
- Stage commit rules: `feedback-check-git-state-before-staging`

## Anti-patterns to refuse

If user tries to push for any of these, refuse and explain why:

- **"Skip core-review, just fix what the agent said"** — that's the exact
  failure mode this workflow exists to prevent. Sub-agent claims are
  unverified until step 3.
- **"Auto-commit without showing me the diff"** — CHECKPOINT C exists
  because fixes can look right in code but still subtly break behavior.
- **"Dispatch a fix agent for each finding"** — adds a new trust layer
  without a verifier. Main Claude is the implementer, by design.
- **"Run all 9 steps no checkpoints"** — checkpoints B/C/D exist for
  decision authority (which to fix / does the diff look right / is the
  commit message correct). Removing them gives Claude autonomy that
  isn't earned yet.
- **"Fix the warnings I just noticed while you're in there"** — scope
  creep. Each finding gets a minimal fix. Off-scope cleanup goes in a
  separate commit.

## What this skill does NOT cover

- **Day 11+ Stage 1 deliverables** (SQLite LOAD, EXPORT). That's the
  development workflow, not the audit workflow. Different skill (TBD).
- **Frontend / Phaser code review**. Audit topics are tuned for the dnf-
  extract C++ + dnf-native TS parser layer. Phaser code needs its own
  topics or a different reviewer (e.g. combat-kernel-reviewer subagent).
- **PR creation / pushing to remote**. Stop at local commit. The user
  decides when to push.
