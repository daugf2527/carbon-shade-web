---
name: combat-lab-0-3-state
description: Combat Lab 0.3 快照（2026-05-08）— 已被 5-19 工具修复 + 5-21 DNF 对齐 pivot superseded
metadata: 
  node_type: memory
  type: project
  originSessionId: a7230054-2ed9-4909-bc39-1a466f33595a
---

# Combat Lab 0.3 — Project State (2026-05-08 snapshot — STALE)

> ⚠️ **STALE 警告（2026-05-23 加注）**：本 memory 是 0.3 阶段快照，已被两次重大转向 superseded：
>
> 1. **2026-05-19** dnf-extract 工具栈修复 + `src/extraction/` TS 栈废弃（见 [[feedback-dnf-extract-mandatory]]、[[session-2026-05-19-dnf-extract-fixes]]）—— 下文 "Evidence Source Layers / Batch C pending" 已落地：Layer 3 PVF 提取通过 dnf-extract.exe 全量打通。
> 2. **2026-05-21** Combat Lab 项目 pivot 到 DNF 真值对齐（见 [[combat-lab-dnf-alignment-pivot-2026-05-21]]）—— 下文 "Frame data 36 actions / FSM 6-state / static:test 34/34" 数字已过期，当前是 38 actions / FSM 9-state / static:test 66/66。
> 3. **2026-05-22 ~ 23** Stage 1 管线 Day 1-10 闭环（dnf-native-combat 子树），9/9 parser，6 wired + 3 standalone。
>
> 当前项目实际状态以 CLAUDE.md "Current state" 段为准。本 memory 仅作历史参考；不要按下方数字做决策。

## Phase

Combat Lab 0.3 — handfeel tuning + evidence freeze.
The `dnf-pve-1to1-replication-plan.md` Phase 1–5 implementation is substantially complete.

## Target Version

`70-85-classic-pre-metastasis` — Level 70 cap (2012, pre-Metastasis/大转移) preferred; 80-85 data used as fallback.
Modern DNF systems (Neutralize/Ignite/restructured AI) explicitly excluded.

## Completed Systems

| Module | File | Status |
|--------|------|--------|
| Frame data | `FrameDataAction.ts` + `actions/default.json` | 36 actions, manifest priority loading, hash parity gate |
| Hit detection | `HitResolver2D5.ts` | 4 shapes (rect/circle/sweep/grab_attach), multi-hurtbox, 6-int snapshot → replay |
| Damage formula | `DamageFormula.ts` + `classic-profile.json` | 10-multiplier chain: 4 damage paths, elem ÷220, def, crit 1.5×, counter 1.25× |
| Status system | `StatusEffectSystem.ts` + `status/default.json` | 14 status types, hard control mutex, tolerance accumulation/decay, splash |
| Monster AI | `EnemyAI.ts` + `ai/enemy-default.json` | FSM 6-state + behavior tree (chase/hold/retreat weights) + boss phase transitions, deterministic hash |
| Replay | `ReplayRecorder.ts` | action/status/AI manifest hash in metadata |
| Actor stats | `types.ts` | STR/INT/physAtk/magAtk/independentAtk/elem/elemResist/defense/level |

## Data Layer (all manifests exist)

```
src/data/manifest/
├── actions/default.json
├── damage/classic-profile.json
├── status/default.json + pve-profile.json
├── ai/enemy-default.json + boss-patterns.json
├── schema.ts / hash.ts / loader.ts
```

## Evidence Source Layers

- **Layer 1 (Neople API)**: 11 skills level-1 facts, `official-api-alignment.test.ts`
- **Layer 2 (Wiki)**: Damage formula, status durations — documented, not wired to runtime
- **Layer 3 (PVF/ANI)**: Not yet researched (Batch C pending)

## CRT Tickets

- CRT-001: **resolved** — version freeze `70-85-classic-pre-metastasis`
- CRT-002–006: **open** — frame/hitbox/AI/armor/replay evidence

## Verification Gates (all passing)

```
npm run typecheck   → passed
npm run static:test → 34/34 passed
npm run build       → passed
```

## Remaining Gaps

- Batch A: Expand `berserkerSkillFacts.ts` from level-1 to level 1–10
- Batch B: Wiki semantic calibration (NamuWiki translation, status tuning)
- Batch C: PVF/ANI toolchain research
- CRT-002–006: Versioned frame/hitbox/AI evidence

## Key Files Modified This Session

- `tests/static/manifest-provenance.test.ts` — `profileToTuning` 13→18 fields
- `docs/planning/dnf-pve-1to1-replication-plan.md` — version freeze
- `src/combat/ai/EnemyAI.ts` — DNF FSM+BT hybrid, deterministic hash
- `CLAUDE.md` — Current state section added

## Tool Call Failures (This Session)

### 1. firecrawl_search — MCP parameter validation failed (x2)
- **Error**: `MCP error -32602: Tool 'firecrawl_search' parameter validation failed: sources: Invalid input: expected array, received object`
- **Cause**: `sources` field passed as `{ type: "web" }` (single object) instead of `[{ type: "web" }]` (array of objects)
- **Fix**: MEMORY.md already had this documented as `sources must be array of objects` — failure was from not checking memory first
- **Prevention**: Before calling any MCP tool, check MEMORY.md for format notes

### 2. WebSearch — empty results (x3)
- **Error**: 3 WebSearch calls returned no visible search results (DNF 70 cap search, monster AI search, DFO wiki search)
- **Cause**: Unnecessary web search — project `docs/research/` already has 32 research documents covering all these topics
- **User feedback**: "哥们 我们本地有检索完毕的资料哦" (we have locally indexed research)
- **Prevention**: Search `docs/` with Grep BEFORE hitting WebSearch or firecrawl_search

### 3. Math.random() broke determinism — 3 tests failed
- **Error**: `auto-combat.test.js` hash mismatch, `fuzz-combat.test.js` 39/40 determinism failures, `replay-hash.test.js` state hash mismatch
- **Cause**: Used `Math.random()` in `behaviorTreeBranch()` and `selectBossPattern()` — combat kernel requires deterministic replay
- **Fix**: Replaced all `Math.random()` with deterministic FNV-1a hash of `tick:actorId`
- **Prevention**: Combat kernel = no `Math.random()`. Always use deterministic seeded RNG.

### 4. TS2554 — Expected 3 arguments, but got 1
- **Error**: `src/combat/ai/EnemyAI.ts(184,26): error TS2554: Expected 3 arguments, but got 1`
- **Cause**: Changed `behaviorTreeBranch(state)` signature to `behaviorTreeBranch(state, tick, actorId)` but missed updating the call site at line 184
- **Fix**: `const branch = behaviorTreeBranch(state, kernel.tickCount, actor.id);`
- **Prevention**: After changing function signatures, immediately run `npm run typecheck` — don't wait for full `static:test`

### 5. TS2663 — Cannot find name 'tick'
- **Error**: `src/combat/ai/EnemyAI.ts(280,34): error TS2663: Cannot find name 'tick'. Did you mean the instance member 'this.tick'?`
- **Cause**: Used `tick` variable in `selectBossPattern()` body but method signature didn't have a `tick` parameter
- **Fix**: Added `tick: number = 0` parameter to `selectBossPattern(state, tick)`
- **Prevention**: When adding new variable references in a method, verify the method's parameter list

### 6. Agent reports underestimated code completion
- **Error**: Agents reported Phase 2 (~30%), Phase 3 (~5%), Phase 4 (~40%), Phase 5 (~20%) — actual was ~90-100% for all
- **Cause**: Agents read summaries rather than actual source files; code had already been heavily updated
- **Fix**: Read source files directly with `Read` tool to verify claims
- **Prevention**: Never trust agent completion estimates without direct file verification

## Lessons Learned

- **Don't use Math.random() in combat kernel** — breaks determinism. Use deterministic hash of `tick:actorId` instead.
- **Read project local docs first** — Grep `docs/` before WebSearch or firecrawl_search.
- **Check memory before MCP tool calls** — MEMORY.md has parameter format notes that prevent errors.
- **After changing function signatures, run typecheck immediately** — catches call-site mismatches before full test suite.
- **Don't trust agent reports without direct file verification** — agents underestimated completion from ~5-40% to actual ~90-100%.
- **firecrawl_search sources is `[{type:"web"}]` not `{type:"web"}`** — array of objects, not single object.
