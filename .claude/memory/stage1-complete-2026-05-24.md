---
name: stage1-complete-2026-05-24
description: Stage 1 (DNF data pipeline) finished 2026-05-24 — 5-stage pipeline EXTRACT→PARSE→VALIDATE→LOAD→EXPORT wired end-to-end
metadata: 
  node_type: memory
  type: project
  originSessionId: 83055fea-2418-4fa3-ac85-d607bc288eae
---

Stage 1 of the DNF native-data pipeline closed out 2026-05-24 across
commits e80ada3 / 942b91f / 53d52a5 / 5798ab0 / b10f3ee + Day 17
documentation (this commit).

**Why:** [[combat-lab-dnf-alignment-pivot-2026-05-21]] pivoted Combat Lab
from new features to PVF-truth alignment. Stage 1's job was the data
pipeline that emits entity-centric runtime JSON shards for Stage 2 (the
13-system engine layer). All 5 design stages (EXTRACT→PARSE→VALIDATE
→LOAD→EXPORT) now wired and tested end-to-end.

**How to apply:** Stage 2 implementation NOT started — waiting for
explicit user sign-off on the changelog
[`docs/changelog/2026-05-24-stage1-complete.md`](../../../docs/changelog/2026-05-24-stage1-complete.md). Brainstorm prompts in
[`docs/planning/2026-05-24-stage2-brainstorm.md`](../../../docs/planning/2026-05-24-stage2-brainstorm.md). When work resumes,
start from the 6 "open questions" in §6 of that doc — they gate
the first concrete Stage 2 commit.

Key Stage 1 numbers (baseline run, real PVF, 18 curated files):
- 18/18 parsed, 0 errors, 0 warnings
- 44 Tier-3 fields surfaced (~4 per player .chr × 11 chrs)
- `dist/data/players/swordman.json` = 244 KB (target ≥ 200 KB)
- Pipeline wall-clock: 2.8 s
- npm run completion: 30/31 (97%)
- npm run analyze: 8/8 gates pass
- DNF_PVF_PATH smoke:pipeline: PASS in 4.2 s

Known debt (won't block Stage 2 but worth remembering):
- `--list` warm-cache regression (2.5s → 10s, root cause un-isolated)
- Incremental EXPORT timestamp noise (sha256 includes
  `provenance.extractTimestamp` so PVF re-extracts always miss)
- AniDef inlining still standalone (not in parseStage dispatch)
- `.aic` parser doesn't exist (Stage 2 question whether to build it)
- CUSTOM_ATTACKINFO enum only first 84 values mapped

Tooling carryover into Stage 2:
- `scripts/pipeline.mjs` / `scripts/stage1-baseline.mjs` /
  `scripts/smoke-test.mjs` / `scripts/completion.mjs` /
  `scripts/audit-verify.mjs` / `.claude/skills/closed-loop/`
