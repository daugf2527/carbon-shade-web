# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project identity

**Carbon Shade / 碳影** — a Phaser 3 + TypeScript 2.5D combat prototype served by Vite. The current engineering name is **Combat Lab**. The canonical repository path is `carbon-shade-web`. This prototype validates DNF-style 2.5D combat feel: skill execution, monster feedback, boss behavior, normalized sprite assets, and deterministic behavior tests.

## Commands

- `npm install` — install dependencies (Node >= 20).
- `npm run dev` — start Vite dev server on `0.0.0.0:5173`.
- `npm run typecheck` — run `tsc --noEmit` on `src/` via `scripts/typecheck.mjs`.
- `npm run build` — compile TypeScript and emit `dist/index.html` + browser ESM via `scripts/build.mjs`.
- `npm run static:test` — compile and run `tests/static/*.test.ts` via `scripts/static-test.mjs`, outputting `.tmp/static-test-results.json`.
- `docker compose up --build` — run the app container on port 5173.

Browser screenshot verification scripts are intentionally excluded from npm commands — they can hang on Windows. Use the three stable checks above (`typecheck`, `static:test`, `build`) for code validation.

## Documentation module

All design, planning, and research decisions are stored in `docs/`. This is the project's long-term knowledge base — consult it before making architectural changes. Documents are organized into five functional directories.

### design/ — Project design & identity

- `docs/design/00-project-mainline-v0.1.md` — mainline world/theme draft with dual-layer narrative (bright surface + AI-era dark line).
- `docs/design/01-core-concept-document-v0.1.md` — CCD: target audience, core gameplay loops, unique selling points, competitive landscape, and concept-level risks.
- `docs/design/01-project-identity.md` — naming baseline: 碳影 / Carbon Shade, canonical repo `carbon-shade-web`, core terminology (外智, 代役, 回响/灵债, 自明, 明庭).
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
- `docs/changelog/asset-update-fix4-notes.md` — integrated updated player/enemy/boss sprite sheets.
- `docs/changelog/handfeel-fix5-anchor-notes.md` — fixed `setCrop()` display origin anchoring for bottom-center foot positions.
- `docs/changelog/fix6-normalized-sprite-pipeline.md` — current pass: normalized fixed-cell spritesheets, frame-index rendering, clamp instead of modulo, disabled container rotation for sprite actors, light tint hit flash.

### planning/ — Roadmaps & implementation plans

- `docs/planning/04-gap-and-roadmap-v0.1.md` — gap analysis and phased roadmap (Phase 0 through Phase 5) tracking what's done and what's next.
- `docs/planning/training-ground-r1-r2-plan.md`, `docs/planning/training-ground-r3-r4-restoration-plan.md` — training ground phase planning.
- `docs/planning/dfo-action-handfeel-replication-plan.md` — action and handfeel replication plan.
- `docs/planning/dfo-combat-implementation-backlog.md` — P0/P1/P2 implementation batches for the combat kernel.

### research/ — DNF/DFO combat research

Reference material documenting the research behind the combat kernel:
- `docs/research/dnf-combat-system-reconstruction-engineering-report.md`, `docs/research/dnf-combat-replica-implementation-technical-report.md` — architecture and technical route.
- `docs/research/dnf-dfo-mechanics-gap-analysis.md` — gap analysis between current implementation and reference material.
- `docs/research/dnf-dfo-combat-data-model-and-damage-report.md`, `docs/research/dnf-dfo-combat-extraction-runtime-pipeline-report.md`, `docs/research/dnf-dfo-combat-frame-ai-implementation-report.md` — detailed technical reports.
- `docs/research/dnf-dfo-research-vs-current-system-technical-report.md` — research vs. current system gap analysis.
- `docs/research/dnf-dfo-combat-replication-implementation-report.md` — overall replication implementation report.
- `docs/research/dnf-dfo-combat-kernel-development-report.md`, `docs/research/dnf-dfo-client-data-extraction-report.md`, `docs/research/dnf-dfo-combat-technical-pipeline-report.md` — supplementary implementation reports.
- `docs/research/02-neople-dnf-open-api-auxiliary-material.md` — Neople DNF Open API reference material.

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
- For runtime optimization, prefer small dirty-check changes: avoid repeated `setTexture`/`setText`/`setSize`/`setColor` when values haven't changed; lower debug HUD update frequency; guard debug text work behind visibility checks.

## Git workflow

- Concise imperative commit subjects: `Fix normalized sprite frame clamp`.
- PRs should include: change scope, commands run, verification artifacts touched, and screenshots or replay JSON when visual behavior changes.
- Before claiming completion: run the relevant verification command and summarize the result. Do not edit generated outputs in `dist/`, `.tmp/`, or `verification/` unless the task explicitly concerns those artifacts.