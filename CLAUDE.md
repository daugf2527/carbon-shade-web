# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project identity

**Carbon Shade / 碳影** — a Phaser 3 + TypeScript 2.5D combat prototype served by Vite. The current engineering name is **Combat Lab**. The canonical repository path is `carbon-shade-web`. This prototype validates DNF-style 2.5D combat feel: skill execution, monster feedback, boss behavior, normalized sprite assets, and deterministic behavior tests.

## Current state (2026-05-09)

**Phase**: Combat Lab 0.3 — handfeel tuning + evidence freeze. The `dnf-pve-1to1-replication-plan.md` Phase 1–5 implementation is substantially complete.

**Target version**: `70-85-classic-pre-metastasis` — Level 70 cap (2012, pre-Metastasis/大转移) is preferred; 80-85 data used as fallback. Modern DNF systems (Neutralize/Ignite/restructured AI) are explicitly excluded.

**Combat kernel — Input → Hit → Reaction → Replay chain**

| Module | File | Status |
|--------|------|--------|
| Frame data | `FrameDataAction.ts` + `actions/default.json` | 38 actions, manifest priority loading, hash parity gate |
| Hit detection | `HitResolver2D5.ts` | 4 shapes (rect/circle/sweep/grab_attach), multi-hurtbox, 6-int snapshot → replay |
| Damage formula | `DamageFormula.ts` + `classic-profile.json` | 10-multiplier chain: 4 damage paths, elem ÷220, def reduction, crit 1.5×, counter 1.25× |
| Status system | `StatusEffectSystem.ts` + `status/default.json` | 14 status types, hard control mutex, tolerance accumulation/decay, splash |
| Monster AI | `EnemyAI.ts` + `ai/enemy-default.json` | FSM 9-state (idle/approach/windup/attacking/recover + flinched/launched/knocked_down/getting_up) + behavior tree + boss phase transitions, deterministic hash for replay |
| Replay | `ReplayRecorder.ts` | action/status/AI manifest hash in metadata |
| Actor stats | `types.ts` | STR/INT/physAtk/magAtk/independentAtk/elem/elemResist/defense/level |

**Data layer — versioned manifests**

```
src/data/manifest/
├── actions/default.json      ← 38 actions (sourceProvenance metadata attached)
├── damage/classic-profile.json ← formula constants (8/8 community-audit verified)
├── status/default.json       ← 14 status profiles (Rupture fixed: 3-stack 5/7/8% per Batch B)
├── ai/enemy-default.json     ← 5 enemy types + DNF AI params + CRT-004 hit-reaction timers
├── ai/boss-patterns.json     ← boss phase/pattern config
├── schema.ts / hash.ts / loader.ts ← validation + sourceProvenance, FNV-1a hashing (strips metadata), async loading
```

**Evidence source layers**

| Layer | Coverage | Status |
|-------|----------|--------|
| Neople Open API | 11 skills level-1 facts (CD/MP/hit count) | `berserkerSkillFacts.ts`, `official-api-alignment.test.ts` |
| Wiki (DFO World Wiki + NamuWiki) | Damage formula multipliers, status effect durations, boss move lists | Documented in research but not wired to runtime |
| PVF/ANI/NPK | Frame windows, hitbox geometry, monster AI data, monster stats | Not yet researched (Batch C pending) |

**CRT tickets**: CRT-001 (version freeze) resolved; CRT-002–006 remain open for frame/hitbox/AI/armor/replay evidence.

**Verification gates (all passing)**

```
npm run typecheck   → passed
npm run static:test → 34/34 passed
npm run build       → passed
```

**Remaining gaps**: Batch A (level 1–10 API expansion), Batch B (Wiki semantic calibration), Batch C (PVF/ANI toolchain research), CRT-002–006 evidence tickets.

## Commands

- `npm install` — install dependencies (Node >= 20).
- `npm run dev` — start Vite dev server on `0.0.0.0:5173`.
- `npm run typecheck` — run `tsc --noEmit` on `src/` via `scripts/typecheck.mjs`.
- `npm run build` — compile TypeScript and emit `dist/index.html` + browser ESM via `scripts/build.mjs`.
- `npm run static:test` — compile and run `tests/static/*.test.ts` via `scripts/static-test.mjs`, outputting `.tmp/static-test-results.json`.
- `docker compose up --build` — run the app container on port 5173.

Browser screenshot verification scripts are intentionally excluded from npm commands — they can hang on Windows. Use the three stable checks above (`typecheck`, `static:test`, `build`) for code validation.

## Documentation module

All design, planning, and research decisions are stored in `docs/`. This is the project's long-term knowledge base — consult it before making architectural changes. Documents are organized into five functional directories. See `docs/README.md` for a navigable index categorized by status (current, historical, aspirational, research).

## DNF/DFO reference truth rule

Neople official API verification is the first golden standard for any DNF/DFO field it exposes. DFO-specific wiki references such as DFO World are the second golden standard for fields that official API/pages do not expose, after checking freshness and conflicts. Before changing DNF-aligned skill numbers, cooldowns, level tables, hit counts, job/skill IDs, MP costs, option values, or official skill text, verify against the official API or an archived official-API snapshot with provenance first; then use DFO-specific wiki data only where official sources are silent. Local tuning in `docs/design/tuning-baseline.md` is fallback baseline, not official truth.

Do not overclaim API or wiki coverage: startup/active/recovery frames, hitbox/hurtbox geometry, launch/gravity curves, combo-protection thresholds, server authority, and network sync are not provided by the Open API or ordinary wiki pages unless another official source explicitly backs them. Wikipedia/general encyclopedias are background-only; do not use them for combat numbers, frame data, hitboxes, damage formulas, skill scaling, AI behavior, or live balance values. Never commit `NEOPLE_API_KEY`; use environment variables or a backend proxy only.

### design/ — Project design & identity

- `docs/design/00-project-mainline-v0.1.md` — mainline world/theme draft with dual-layer narrative (bright surface + AI-era dark line).
- `docs/design/01-core-concept-document-v0.1.md` — CCD: target audience, core gameplay loops, unique selling points, competitive landscape, and concept-level risks.
- `docs/design/02-project-identity-v0.2.md` — naming baseline: 碳影 / Carbon Shade, canonical repo `carbon-shade-web`, core terminology (外智, 代役, 回响/灵债, 自明, 明庭).
- `docs/design/source-policy.md` — original code and placeholder rendering only; no DNF/DFO client assets, leaked code, or official assets.
- `docs/design/tuning-baseline.md` — tuning baseline values.

### engineering/ — Technical architecture

- `docs/engineering/combat-lab-0.2-r3-final-integrated-development-spec.md` — master engineering specification for Combat Lab 0.2-R3.
- `docs/engineering/02-technical-design-document-v0.1.md` — TDD: architecture vision, module breakdown, tech stack, performance targets, security, and deployment roadmap.
- `docs/engineering/03-development-workflow-v0.1.md` — GitHub-based development loop: roles (user, ChatGPT, sandbox, GitHub, GitHub Actions), branching strategy, CI targets, and acceptance criteria.
- `docs/engineering/combat-attack-hit-reaction-chain.md` — attack → hit → reaction chain documentation.

### changelog/ — Handfeel iteration history

Sequential record of handfeel improvement passes:
- `docs/changelog/handfeel-pass-notes.md` — initial handfeel pass.
- `docs/changelog/handfeel-fix1-notes.md` through `docs/changelog/handfeel-fix3-notes.md` — early fixes.
- `docs/changelog/handfeel-fix4-asset-update-notes.md` — integrated updated player/enemy/boss sprite sheets.
- `docs/changelog/handfeel-fix5-anchor-notes.md` — fixed `setCrop()` display origin anchoring for bottom-center foot positions.
- `docs/changelog/fix6-normalized-sprite-pipeline.md` — current pass: normalized fixed-cell spritesheets, frame-index rendering, clamp instead of modulo, disabled container rotation for sprite actors, light tint hit flash.

### planning/ — Roadmaps & implementation plans

- `docs/planning/04-gap-and-roadmap-v0.1.md` — gap analysis and phased roadmap (Phase 0 through Phase 5) tracking what's done and what's next.
- `docs/planning/training-ground-r1-r2-plan.md`, `docs/planning/training-ground-r3-r4-restoration-plan.md` — training ground phase planning.
- `docs/planning/dfo-action-handfeel-replication-plan.md` — action and handfeel replication plan.
- `docs/planning/dfo-combat-implementation-backlog.md` — P0/P1/P2 implementation batches for the combat kernel.

### research/ — DNF/DFO research & reference

Research material organized into four subdirectories:
- `docs/research/combat/` — DNF combat kernel research (21 files: reconstruction, replication, data models, extraction, AI, frame data, mechanics gap analysis)
- `docs/research/art/` — Art pipeline & asset research (7 files: NPK/IMG specs, paper doll compositor, UI/atlas/font, performance budgets)
- `docs/research/systems/` — Game systems research (7 files: core subsystems, hell/economy/guild, account/login, character, town/hub)
- `docs/research/reference/` — API & wiki reference docs (16 files: Neople Open API, DFO World Wiki system references)
- `docs/research/source-links-appendix.md` — cross-cutting source links appendix

## Architecture


The combat kernel (`src/combat/`) is pure TypeScript with **no Phaser imports** — it can run deterministically in Node for tests. Rendering lives in `src/game/` and translates kernel state into Phaser display objects. Data modules (`src/data/`) are pure data — no logic.

## Coding conventions

- ES modules with `.js` extension in import specifiers (for NodeNext module resolution).
- PascalCase for classes and scenes (`CombatKernel`, `BootScene`); lowercase domain-qualified names for data files (`berserker.normal.ts`).
- Compact TypeScript style — follow existing code when editing nearby.
- Two-space indentation in JSON.
- Runtime asset paths in `public/assets/` are stable — tests and loaders reference them by string path.

## Performance boundaries

This is a demo-grade project. Prioritize fixes for:
- Runtime FPS drops during active combat.
- Heap or replay/event memory growth over time.
- Input latency degradation over long sessions.
- Per-frame cloning, allocation, texture creation, or unbounded archive growth.

Acceptable as backlog:
- First-load texture decode/upload spikes (image decode, texImage2D, shader init).
- Initial scene-construction spikes from Phaser Text/Graphics creation.
- Large normalized spritesheet decode cost (unless it blocks basic usability).

Known constraints:
- Commit `c4d3b22` fixed replay history blowup — replay frames must only store that frame's newly flushed events, never clone the full archive.
- For future optimization, consider dirty-checking values that are set every frame: `setTexture`, `setText`, `setSize`, `setColor` in `CombatScene.ts` are currently called unconditionally — adding guards when values haven't changed would reduce repeated GPU calls; similarly, debug HUD text and FPS display could be throttled or guarded behind visibility checks.

## Git workflow

- Concise imperative commit subjects: `Fix normalized sprite frame clamp`.
- PRs should include: change scope, commands run, verification artifacts touched, and screenshots or replay JSON when visual behavior changes.
- Before claiming completion: run the relevant verification command and summarize the result. Do not edit generated outputs in `dist/`, `.tmp/`, or `verification/` unless the task explicitly concerns those artifacts.

## Automation test infrastructure

The test suite runs via `scripts/static-test.mjs`: TypeScript is compiled with `tsconfig.test.json` into `.tmp/test-js/`, then each `.test.js` file under `tests/static/` is executed as a standalone Node child process. Tests pass by exiting 0 and fail by exiting non-zero or throwing. There is no test framework (no Vitest, Jest, Mocha). Assertions use `node:assert/strict` via `tests/static/test-utils.ts`, which re-exports `ok`, `equal`, and `deepEqual` only. All 29 test files live in `tests/static/*.test.ts`.

Key test files added by the automation plan:
- `tests/static/fuzz-combat.test.ts` — 50-sequence no-crash fuzz, 40-sequence determinism check, 30-sequence replay JSON validity
- `tests/static/schema-hash-freshness.test.ts` — computes content hash of 6 data modules, compares against `combatSchemaHash`
- `tests/static/config-validate.test.ts` — 27 action frame data validation, 14 status type completeness, tuning baseline consistency, cross-file action reference

## Tool call mistakes to avoid

These mistakes were made during the automation plan implementation and wasted significant time. Do not repeat them.

### TaskList takes no parameters
`TaskList` accepts zero arguments. Calling `TaskList(content="{}")` or `TaskList(content="")` triggers `InputValidationError`. Just call `TaskList()` with no parameters.

### Edit uses snake_case parameter names
The Edit tool uses `file_path`, `old_string`, `new_string`, `replace_all` — NOT camelCase (`filePath`, `newString`, `oldString`, `replaceAll`). Using camelCase causes `InputValidationError`.

### test-utils.ts only exports ok / equal / deepEqual
`tests/static/test-utils.ts` re-exports from `node:assert/strict` and only provides `ok`, `equal`, `deepEqual`. There is no `assert.fail()`. Use `throw new Error("message")` instead, or `assert.ok(false, "message")`.

### TypeScript double-cast needed for FrameDataAction
The `FrameDataAction` type lacks an index signature, so `action as Record<string, unknown>` fails type checking. Use `action as unknown as Record<string, unknown>` (double-cast through `unknown`).

### Node.js built-in modules not available in test tsconfig
`node:fs`, `node:path`, `node:crypto`, `node:url` are not available in test files because `tsconfig.json` does not include `"types": ["node"]`. Tests that need file-system access should import data modules directly (e.g., `import { ACTIONS } from "../../src/combat/actions/FrameDataAction.js"`) rather than reading files from disk.

### Do not re-read files that haven't changed
When the system returns "File unchanged since last read — refer to that instead", stop re-reading. Use the content you already have. Repeated re-reads waste conversation turns.

### Negative whiffCancelFrom is intentional
Actions with `totalFrames=1` (like `Idle`) have `whiffCancelFrom = totalFrames - 4 = -3`. Negative values mean "can never whiff cancel" and are valid. Do not assert `whiffCancelFrom >= 0`. Instead check `whiffCancelFrom <= totalFrames`.

### RagingFury has 10 pillars, not 8
The tuning baseline file (`dnf-berserker-baseline.ts`) documents 8 pillars, but the actual `FrameDataAction.ts` code has 10 (`[15,17,19,21,23,25,27,29,31,33]`). The baseline is stale — trust the code.
