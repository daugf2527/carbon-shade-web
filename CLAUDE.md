# CLAUDE.md

## Project identity

**Carbon Shade / 碳影** — DNF-style 2.5D combat prototype. Engineering name: **Combat Lab**.
Active branch: `dnf-native` (master frozen 2026-05-21).

## Current state (2026-05-25)

**DNF alignment pivot** — 停止新功能，全力对齐 DNF 真值。详见 [`docs/planning/2026-05-21-dnf-alignment-pivot.md`](docs/planning/2026-05-21-dnf-alignment-pivot.md)。

| Stage | 内容 | 状态 |
|-------|------|------|
| Stage 1 | PVF 数据提取管线 (EXTRACT→PARSE→VALIDATE→LOAD→EXPORT) | ✅ 完成 (2026-05-24), [changelog](docs/changelog/2026-05-24-stage1-complete.md) |
| Stage 2 | 13 系统 DNF 原生引擎层 | 🧠 规划中, [brainstorm](docs/planning/2026-05-24-stage2-brainstorm.md), **未实施** |

**Stage 1 管线**:
```
PVF --pipe--> dnf-extract (C++) --> PvfDocument[] --> 9 parsers (TS) --> Zod validator
  --> SQLite (node:sqlite) --> JSON shards (dist/data/players/*.json etc.)
```
**静态审计**: 2026-05-25 完成 6-Agent 全链路审计，48 个发现 (P0×8 / P1×20 / P2×20)，[报告](docs/engineering/audit-2026-05-25-full-pipeline-static.md)。待 Windows 动态验证。

**Target version**: `70-85-classic-pre-metastasis` (Level 70 cap, 2012 pre-Metastasis). Modern DNF systems excluded.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server on `0.0.0.0:5173` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run static:test` | Compile + run `tests/static/*.test.ts` (Node, no framework) |
| `npm run build` | Production build → `dist/` |
| `npm run smoke:pipeline` | Real-PVF smoke test (gated by `DNF_PVF_PATH` env) |
| `npm run analyze` | 8-gate static analysis (depcruise + knip + event-trace + ...) |
| `npm run completion` | Stage 1 deliverable presence audit |
| `npm run audit:verify` | Re-check agent audit claims against cited file:line |
| `npm run closed-loop:status` | Closed-loop workflow state machine status |
| `npm run browser:smoke` | Playwright browser test (CI only, needs dev server + display) |
| `npm run baseline` | Stage 1 sample baseline (19 curated files, ~4s) |
| `npm run baseline:pve` | Stage 1 PVE-full baseline (8794 character + skill files, ~10min) |
| `docker compose up --build` | Container on port 5173 |

### Stage 1 baseline rerun

`DNF_PVF_PATH=<path-to-Script.pvf> npm run baseline[:pve]` regenerates everything Stage 1 produces:
- `.tmp/stage1-baseline.db` (SQLite mirror DB — derivable, gitignored, **do not commit**: binary is not deterministic across runs)
- `dist/data/*.json` (entity-centric runtime shards — gitignored)
- `verification/baseline-shards/**` (mirror of `dist/data/` for reviewer inspection — committed)
- `verification/{extraction-report,provenance-audit,dist-manifest}-stage1-baseline.json` (committed)

The SQLite DB is intentionally not persisted. It is a Mirror table layer for cross-domain queries; `verification/baseline-shards/` is the ground truth. To query the DB, rerun the baseline (~4s sample / ~10min PVE-full) — the DB regenerates from the same input.

## Tools

### dnf-extract (C++ CLI)

Source: `tools/dnf-porting-src/`. Binary: `tools/dnf-extract` (Linux aarch64/Android) / `tools/dnf-extract.exe` (Windows).
CI: `.github/workflows/build-dnf-extract.yml` builds all three platforms.

```bash
dnf-extract --pvf Script.pvf --file <internal-path>       # single file → JSON
dnf-extract --pvf Script.pvf --pipe                       # stdin paths, stdout JSON
dnf-extract --pvf Script.pvf --batch <p1> <p2> ...        # batch
dnf-extract --pvf Script.pvf --list [--filter <pattern>]  # list PVF
dnf-extract --npk <file.NPK> --list | --img <n> --frames | --frame <i>
dnf-extract --pvf Script.pvf --npk-dir ImagePacks2/ --resolve <sprite> --frame <i>
```

I/O contract: stdout = one JSON line per result (`type` field: `document`/`animation`/`text`/`binary`/`error`/...). stderr = `[LOG]`/`[READY]`/`[DONE]`/`[ERROR]`. `--pipe`/`--batch` delimit results with `---`.

### Pipeline (Node CLI)

```bash
# Full pipeline
DNF_PVF_PATH=/path/to/Script.pvf node scripts/pipeline.mjs --full

# Targeted extract + parse + validate + load + export
node scripts/pipeline.mjs --pvf Script.pvf --file <path> [--file <path> ...] \
  [--stop-at extract|parse|validate|load|export] [--full|--incremental]

# Stage 1 baseline (curated 18-file cross-section)
DNF_PVF_PATH=... node scripts/stage1-baseline.mjs
```

## Architecture

```
dnf-native branch (ACTIVE):
src/dnf-native-combat/data/
├── parsers/        Chr/Mob/Atk/Skl/Ani/Dgn/Etc/Map/Nut/Img (9 + 3 standalone)
├── types/          ChrDef/MobDef/AtkDef/SklDef/... + Provenance + PvfDocument
├── pipeline/       parseStage.ts + pipelineRunner.ts (EXTRACT→PARSE→VALIDATE→LOAD→EXPORT)
├── validator.ts    Zod schemas + provenance audit + ref integrity + PvP scope
├── importer/       SqliteImporter.ts (node:sqlite, mirror tables + 10 domain VIEWs)
├── exporter/       RuntimeExporter.ts (entity-centric JSON shards + manifest)
src/data/official/  dnfPhysicsConstants.ts + dnfEnumTables.ts (shared shard sources)
tools/dnf-porting-src/  C++ extractor (~2600 lines, 38 audit fixes applied)

master branch (FROZEN):
src/combat/         Pure TS combat kernel (FrameDataAction, HitResolver2D5, DamageFormula, ...)
src/game/           Phaser 3 rendering layer (scenes, render adapter, camera, audio)
src/data/manifest/  actions/default.json (38 actions), damage/, status/, ai/
src/main.ts         Phaser bootstrap (1920×1080, Scale.FIT)
```

## Coding conventions

- ES modules, `.js` extension in import specifiers (NodeNext resolution)
- PascalCase classes; lowercase domain-qualified data files
- Two-space indent in JSON. Compact TypeScript style
- PVF path convention: internal PVF paths use `/` on all platforms

## DNF/DFO reference truth rule

**置信度铁律**（涉及战斗数值/帧数据/判定/物理参数的结论，按此优先级）：

1. **dnf-extract 提取** — `Script.pvf` / `ImagePacks2/*.NPK` 提取的 `.ani`/`.skl`/`.atk`/`.mob`/`.chr` — 第一证据
2. **Neople Open API + DFO Wiki** — CD/MP/hit count 等 API 覆盖的字段。API 不覆盖帧/碰撞/重力/AI
3. **本地 md 文档 + 代码实现** — 最低优先级。未经验证的数值标记为 `local_baseline`

**禁止反转**: 用代码现状/md 推断/截图观感/口述经验覆盖高优先级证据。

**已知缺口**: launch/gravity 曲线、hitstun 表硬编码在 DNF.exe C++ 二进制里，PVF 拿不到。必须标注 `sourceType: "local_baseline"` + `requiresManualVerification: true`。

Never commit `NEOPLE_API_KEY`.

## DNF 原始数据推导规则

逐帧表现/动作还原/受击反馈/碰撞盒的结论必须以 DNF 原始客户端数据提取为准，禁止根据动作名、截图观感、口述经验臆测。原始数据不足时标记"未验证"或"待提取"，不能自补"看起来合理"的实现。

## Analysis tools

| Tool | What it does | Run |
|------|-------------|-----|
| **dependency-cruiser** | Module dependency graph, circular dep detection | `depcruise src` |
| **knip** | Unused exports, types, files | `knip` |
| **event-trace.mjs** | Event emitter ↔ listener pairs | `node tools/event-trace.mjs` |
| **pipeline-dump.mjs** | Pipeline stages and execution order | `node tools/pipeline-dump.mjs` |
| **manifest-consumers.mjs** | Which TS files import which JSON manifests | `node tools/manifest-consumers.mjs` |
| **completion.mjs** | Stage 1 deliverable presence audit (PRESENCE only) | `npm run completion` |
| **audit-verify.mjs** | Re-reads agent findings against cited file:line | `npm run audit:verify` |
| **closed-loop** | 9-step audit→fix→commit pipeline (skill-driven) | `/closed-loop` |

The split: `analyze` = static gates, `completion` = presence, `audit` = semantic depth.

## LSP tools — prefer over Grep/Read

| Scenario | Use | Instead of |
|----------|-----|------------|
| "Where is X defined?" | `goToDefinition` | Grep + Read |
| "What calls this function?" | `findReferences` | Grep |
| "What's this type/interface?" | `hover` | Read whole file |
| "What's in this file?" | `documentSymbol` | Read full file |
| "Call chain?" | `incomingCalls` / `outgoingCalls` | Manual trace |

Before editing a function, run `findReferences`. Before reading a new file, run `documentSymbol`.

## Test infrastructure

`scripts/static-test.mjs`: TS compiled with `tsconfig.test.json` → `.tmp/test-js/`, each `.test.js` executed as standalone Node child process. Assertions: `node:assert/strict` via `tests/static/test-utils.ts` (exports `ok`, `equal`, `deepEqual` only). No test framework.

Smoke tests in `tests/smoke/` are gated by `DNF_PVF_PATH` env var — skipped when unset.

## Equipment layer rendering (for Stage 2)

Costume sprites at `equipment/character/<job>/avatar/{coat,hair,pants,shoes}/{layer}_<style>/<action>.ani` — NOT direct `.img`.
Alignment: `feet = -body.aniOffset`; `sprite.position = layer.imgAnchor - feet`. Z-order: body → shoes → pants → coat → hair.
Weapons at `equipment/character/<job>/weapon/<type>/<id>/<action>.ani`.

## Documentation

`docs/` organized into: `design/`, `engineering/`, `changelog/`, `planning/`, `research/`. See `docs/README.md` for index.

## Git workflow

- Concise imperative commit subjects
- Run verification before claiming completion
- Don't edit generated outputs in `dist/`, `.tmp/`, `verification/`

## Status reporting (statusline)

`.claude/status.json` — 多步任务开工后写入 `progress` + `confidence`，每步更新，完成时标终态。一次性琐碎操作不必更新。

## Known pitfalls

- `test-utils.ts` only exports `ok`/`equal`/`deepEqual`. No `assert.fail()` — use `throw new Error()`
- FrameDataAction needs double-cast: `action as unknown as Record<string, unknown>`
- Node built-ins unavailable in test tsconfig — import data modules directly
- Negative `whiffCancelFrom` is intentional ("can never whiff cancel")
- Replay frames must only store that frame's newly flushed events — never clone full archive
- dnf-extract `--pipe` mode requires `quit` sentinel on stdin; missing it causes hang
- Pipeline smoke tests require `DNF_PVF_PATH` env — absent on Termux/Android
- `tools/dnf-extract` is aarch64 Android binary; `tools/dnf-extract.exe` is Windows
