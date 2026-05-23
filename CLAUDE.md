# CLAUDE.md

## Project identity

**Carbon Shade / 碳影** — Phaser 3 + TypeScript 2.5D combat prototype (Vite). Engineering name: **Combat Lab**. Validates DNF-style combat feel: skill execution, monster feedback, boss behavior, normalized sprites, deterministic tests.

## Current state (2026-05-21)

**Phase**: Combat Lab 1.0 prep — **DNF alignment pivot**. 停止新功能开发，全力把底层物理/数据/行为对齐 DNF 真值。详见 [`docs/planning/2026-05-21-dnf-alignment-pivot.md`](docs/planning/2026-05-21-dnf-alignment-pivot.md)。Phase 1（PVF 真值提取 + skill 沉淀）已完成，进入 Phase 3-5（数据层 + 物理引擎 + 受击对齐）。
**Target version**: `70-85-classic-pre-metastasis` (Level 70 cap, 2012 pre-Metastasis). Modern DNF systems excluded.

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
├── status/pve-profile.json   ← PvE-specific status tuning
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
npm run static:test → 41/41 passed
npm run build       → passed
```

**Phase A-D completed (2026-05-12)**: See `docs/planning/pvf-extraction-a-e-summary.md` for full status. Key outcomes:

- **EUC-KR / stringtable** (Phase A): `PvfScriptParser.parseStringTable` rewritten with dual-offset mode, iconv-lite decoding. 230K+ entries decoded from stringtable.bin, 26K+ with Korean text.
- **.ani format** (Phase B): `AniAnalyzer` now version-aware (v1-v15), frame indices and hitbox coordinates extracted. 209K .ani files indexed.
- **Cancel window data** (Gap #5 — partial 2026-05-12, regressed 2026-05-19, verified 2026-05-22): `cancel*.skl` section IDs (371543/241483/371546/371547/371549) are **stringtable indices with dual semantics in cancel files** (e.g. `[purchase cost]` = cancelWindowStart, `[skill class]` = cancelGroup, `[growtype maximum level]` = cancelWeaponMask). C++ `dnf-extract` correctly emits these sections; **Node-side `SklAnalyzer.ts` interpreter was deleted in commit `e1f3e0f`** so dual-semantics decoding is currently missing. ~1h restoration needed in `src/data/official/dnf/swordman/cancels.ts`.
- **Physics constants** (Gap #4 partially): `src/data/official/dnfPhysicsConstants.ts` created with DEFAULT_GRAVITY_ACCEL=-1500, FORCE_TO_VELOCITY_CONST=4000, etc. from `dnf_enum_header.nut`.
- **Enums extracted** (Phase C): `dnf_enum_header.nut` collision/physics enums (ATTACKTYPE, CUSTOM_ATTACKINFO, ELEMENT) identified.
- **ActionName mapping** (Gap #6): 7 stale skillIds fixed in `berserkerSkillFacts.ts`. Full mapping table ready from Neople API _skill_list.json (55 Neo Berserker skills, 21+ matched).
- **Verification**: typecheck, static:test, build all passing. All extraction tests green.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server on `0.0.0.0:5173` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run static:test` | Compile + run `tests/static/*.test.ts` (Node, no framework) |
| `npm run build` | Production build → `dist/` |
| `npm run browser:smoke` | Playwright smoke test (needs dev server + display) |
| `docker compose up --build` | Container on port 5173 |

## Tools

### dnf-extract (C++ CLI)

Source: `tools/dnf-porting-src/` — builds via CMake + MinGW/GCC.
Binary: `tools/dnf-extract` (Linux) / `tools/dnf-extract.exe` (Windows). Build locally with `cmake -S tools/dnf-porting-src -B tools/dnf-porting-src/build && cmake --build tools/dnf-porting-src/build`.
CI: `.github/workflows/build-dnf-extract.yml` builds Windows/Linux-x64/Linux-arm64.

**PVF modes** (Script.pvf extraction):
```bash
dnf-extract --pvf Script.pvf --file <internal-path>       # single file → JSON
dnf-extract --pvf Script.pvf --pipe                       # stdin paths, stdout JSON (fast)
dnf-extract --pvf Script.pvf --batch <p1> <p2> ...        # batch extraction
dnf-extract --pvf Script.pvf --workflow                   # stdin JSON commands
dnf-extract --pvf Script.pvf --list [--filter <pattern>]  # list PVF contents
```

**NPK modes** (sprite archive):
```bash
dnf-extract --npk <file.NPK> --list                      # list IMG files
dnf-extract --npk <file.NPK> --img <name> --frame <idx>  # extract single frame
dnf-extract --npk <file.NPK> --img <name> --frames       # all frames metadata (no pixels)
```

**Sprite resolve** (PVF → NPK cross-reference):
```bash
dnf-extract --pvf Script.pvf --npk-dir ImagePacks2/ --resolve <sprite-path> --frame <idx>
```
Resolve auto-tries known PVF↔NPK directory renames (e.g. `equipment/` → `atequipment/`).
On lookup failure: prints `{"type":"error","sprite":"…","error":"sprite not found in any NPK: …"}` and exits 1.

Options: `--with-data` (include base64 pixel data; default off — frame modes return metadata only), `--help`.

I/O contract:
- stdout — one JSON line per result. Top-level `type` field is one of: `animation` (.ani), `document` (.skl / .mob / .atk / .act), `text` (.str), `pvf_list` (--list), `npk` (--npk --list), `img` (--img --frames), `frame` (--frame), `resolved_frame` (--resolve), `error`.
- stderr — `[LOG]` / `[READY]` / `[DONE]` / `[ERROR]` progress lines. Never mixed into stdout.
- `--pipe` / `--workflow` / `--batch` emit `---` between results.

### generate-actions (Node CLI)

`node scripts/generate-actions.mjs --pvf <path> [--skl-filter <pattern>] [--list]`
Parses .skl + .ani from PVF → FrameDataAction JSON. Requires `npm run static:test` first (uses `.tmp/test-js/` compiled modules).

### extract-assets (Node CLI)

`node tools/extract-assets.mjs --pvf <path> [--npk-dir <dir>] [--output <dir>]`
High-level asset extraction pipeline using TypeScript extraction module.

## Architecture

```
src/combat/    — Pure TS combat kernel (no Phaser). Runs in Node for deterministic tests.
src/game/      — Phaser rendering layer (scenes, render adapter, camera, audio, touch).
src/data/      — Versioned JSON manifests (actions, damage, status, AI) + official data.
src/extraction/— DNF client data extraction (PVF/NPK/IMG/ANI/SKL parsers). Node-only.
src/runtime/   — Deterministic combat runtime for scenario verification.
src/vendor/    — Type shims for browser APIs in Node test env.
src/main.ts    — Phaser bootstrap (1920×1080, Scale.FIT).
```

## Coding conventions

- ES modules, `.js` extension in import specifiers (NodeNext resolution).
- PascalCase classes; lowercase domain-qualified data files.
- Two-space indent in JSON. Compact TypeScript style.
- Runtime assets in `public/assets/` referenced by string path.

## LSP tools — prefer over Grep/Read for code understanding

Two LSP plugins are active: `typescript-lsp` (TypeScript/TSX) and `pyright-lsp` (Python). Use LSP as the **first choice** for code exploration — it is faster and more precise than Grep/Read for these tasks:

| Scenario | Use | Instead of |
|----------|-----|------------|
| "Where is X defined?" | `goToDefinition` | Grep + Read |
| "What calls this function?" | `findReferences` | Grep |
| "What's this type/interface?" | `hover` | Read whole file |
| "What's in this file?" | `documentSymbol` | Read full file |
| "Who implements this interface?" | `findImplementations` | Grep |
| "Call chain of this method?" | `incomingCalls` / `outgoingCalls` | Manual trace |

**Key rule**: before editing a function, run `findReferences` to see all call sites. Before reading a new file, run `documentSymbol` for the symbol map — then only Read the parts you need.

## Analysis tools — automated codebase diagnostics

The project has a full static + dynamic analysis toolchain. Reports auto-generate in CI (every push/PR) and can be run locally via `npm run analyze`.

**Closed-loop note (2026-05-23)**: `npm run analyze` (8 gates) catches surface
issues but misses semantic bugs (iconv UB, NutExtractor sentinel lies, 6-int
hitbox confusion). Two new tools complement it:

- **`npm run completion`** — Day 1-17 deliverable presence audit (PRESENCE, not
  correctness). Answers "Day N 实际完成没". Driven by `scripts/completion.mjs`
  + hardcoded deliverable map. Output → `.tmp/completion.json`.
- **`/audit` skill + `npm run audit:verify`** — Agent-driven semantic audit
  with MANDATORY claim verification. The skill dispatches parallel Sonnet
  agents per `.claude/skills/audit/topics.json`; `scripts/audit-verify.mjs`
  re-reads each cited file:line and stamps findings VERIFIED /
  CITATION_DRIFT / FILE_MISSING. Agent claims are NEVER reported as facts
  until verify passes. See `.claude/skills/audit/SKILL.md`.
- **`/closed-loop` skill + `npm run closed-loop:status`** — Full
  audit → core-review → fix → fix-verify → gate → commit pipeline. Drives
  the 9-step trust chain end-to-end with mandatory human checkpoints at
  decision-critical steps (which findings to fix / diff approval / commit
  message). State-machine resumable via artifact detection. See
  `.claude/skills/closed-loop/SKILL.md`.

The split: analyze = static gates, completion = presence gate, audit = semantic depth.

### Tool inventory

| Tool | Type | What it does | Run |
|------|------|-------------|-----|
| **dependency-cruiser** | Open-source | Module dependency graph, circular dep detection, change impact ("who depends on X?") | `depcruise --no-config --output-type json src` |
| **knip** | Open-source | Finds unused exports, types, files | `knip` |
| **event-trace.mjs** | Project | Pairs event emitters ↔ listeners by scanning `bus.emit/on` strings | `node tools/event-trace.mjs` |
| **pipeline-dump.mjs** | Project | Extracts pipeline stages, phases, and execution order from buildPipeline() | `node tools/pipeline-dump.mjs` |
| **manifest-consumers.mjs** | Project | Traces which TS files import/consume which JSON manifests | `node tools/manifest-consumers.mjs` |
| **tick-benchmark** | Built-in test | 600-tick throughput test (target: < 500µs/tick) | `npm run static:test` includes it |
| **fuzz-combat** | Built-in test | 50 random-sequence no-crash, 40 determinism check, 30 replay validity | `npm run static:test` includes it |
| **typecheck** | Built-in | `tsc --noEmit` | `npm run typecheck` |
| **static:test** | Built-in | 45 test files, compiled + run as Node processes | `npm run static:test` |
| **build** | Built-in | Vite production build | `npm run build` |
| **browser:smoke** | Built-in | Playwright browser test (CI only, not on Termux/Android) | `npm run browser:smoke` |

### When tools run

```
Local pre-push  →  npm run analyze  →  全工具报告 → verification/pre-push-{ts}.json
CI (push/PR)    →  GitHub Actions  →  全工具报告 → uploaded as artifact
Claude session  →  读已有报告，不重复跑。若 stale (>1 day) 或不存在 → npm run analyze
Debugging       →  LSP (goToDef/findRefs/documentSymbol) 优先, 再按需跑单项工具
```

### Quick reference: which tool answers which question

| Question | Tool |
|----------|------|
| "改 X.ts 会影响谁？" | `depcruise` → look for dependents of X |
| "有没有循环依赖？" | `depcruise` — violations section |
| "哪些导出没被用过？" | `knip` |
| "事件 X 谁 emit 谁监听？" | `node tools/event-trace.mjs --output json` |
| "管线各阶段执行顺序？" | `node tools/pipeline-dump.mjs --output json` |
| "JSON 配置谁在用？" | `node tools/manifest-consumers.mjs --output json` |
| "Ticking 够不够快？" | tick-benchmark (465µs/tick = 2151 ticks/s) |
| "改了代码会破坏确定性吗？" | fuzz-combat determinism check (40/40) |
| "内存/CPU 有问题？" | `node --prof` + `node --prof-process` |

## Performance boundaries

Prioritize fixes for: runtime FPS drops during active combat, heap/replay/event memory growth, input latency degradation, per-frame allocation/cloning/texture creation/unbounded archive growth.

Acceptable as backlog: first-load texture decode/upload spikes (image decode, texImage2D, shader init), initial scene-construction spikes from Phaser Text/Graphics, normalized spritesheet decode cost (unless it blocks basic usability).

## DNF/DFO reference truth rule

**置信度铁律**（凡是涉及战斗数值、帧数据、判定、物理参数的结论，必须按此优先级取证）：

1. **本地 dnf-extract 提取** — `tools/dnf-extract.exe` 从 `Script.pvf` / `ImagePacks2/*.NPK` 提取的 `.ani` / `.skl` / `.atk` / `.mob` / `.act` / `.str` / IMG 帧。第一证据。
2. **Neople 官方 API + DFO-specific wiki**（DFO World Wiki / NamuWiki / Arad.GG 等） — 当 dnf-extract 拿不到时退到这一档。API 不覆盖帧/碰撞/重力曲线/AI，但能拿到技能 CD/MP/命中次数等。
3. **本地 md 文档 + 当前代码实现** — 最低优先级。`docs/` / `src/` 里的数值在没被 (1)(2) 验证前都视为 "local_baseline"，不能反过来当真值。

**禁止反转**：用代码现状 / md 推断 / 截图观感 / 动作名 / 口述经验，去覆盖或污染高优先级证据。Wikipedia/百科类背景资料绝对不进证据链。

**已知缺口**：真实战斗 launch/gravity 曲线、hitstun 表硬编码在 DNF.exe C++ 二进制里，PVF 拿不到，dnf-extract 也提不到（`.nut` segfault 2026-05-21 验证）。这部分用 (2) 的间接证据或 (3) 的 baseline，**必须标注 `sourceType: "local_baseline"` + `requiresManualVerification: true`**，不能伪装 1:1 还原。

Never commit `NEOPLE_API_KEY`. Frames/hitboxes/gravity/AI are NOT covered by API — use PVF extraction data.

Open API and ordinary wiki pages do NOT cover: startup/active/recovery frames, hitbox/hurtbox geometry, launch/gravity curves, combo-protection thresholds, server authority, network sync.

## DNF 原始数据推导规则

凡是涉及逐帧表现、动作还原、受击反馈、装备对齐、碰撞盒的结论，必须以 DNF 原始客户端数据提取结果为准，禁止根据动作名、截图观感、当前前端表现、口述经验或二手资料直接臆测。

必须从原始 `.ani` / PVF / NPK / IMG / 已提取样本推导的内容包括：

- 动作到动画的映射关系（例如 `damage1`/`hitback`/`down`/`overturn`/`quick rebound` 对应哪条原始动作）
- 帧数、帧顺序、是否循环、每帧 delay、关键帧切换点
- 跳跃分段（起跳、上升、滞空、下落、落地）与对应帧区间
- 受击、击退、倒地、起身、翻倒等视觉反馈究竟使用哪条原始 `.ani`
- `aniOffset`、`imgAnchor`、pivot、角色脚底基准、装备层对齐关系
- hitbox / hurtbox / damage box / 判定范围几何
- 装备、时装、武器等附加层的 z-order、挂点、相对位移与帧同步关系

允许使用 API、wiki、策划文档补充语义命名、职业背景、技能说明，但这些资料不能替代原始帧真值，也不能单独作为逐帧实现依据。

若原始数据尚未提取、样本不足或证据冲突，结论必须明确标记为“未验证”或“待提取”；此时应优先补提取脚本、抽样数据或验证记录，不能自行补完“看起来合理”的实现。

## Test infrastructure

Tests run via `scripts/static-test.mjs`: TS compiled with `tsconfig.test.json` → `.tmp/test-js/`, each `.test.js` executed as standalone Node child process. Assertions: `node:assert/strict` via `tests/static/test-utils.ts` (exports `ok`, `equal`, `deepEqual` only). No test framework.

## Documentation

`docs/` organized into: `design/`, `engineering/`, `changelog/`, `planning/`, `research/`. See `docs/README.md` for index.

## Git workflow

- Concise imperative commit subjects.
- Run verification before claiming completion.
- Don't edit generated outputs in `dist/`, `.tmp/`, `verification/`.

## Status reporting (statusline)

`.claude/status.json` 驱动 statusline 的 `task` / `conf` 字段。每个新 prompt 由 hook 重置为 `{"progress":"0/?","confidence":"评估中"}`。我应在任务过程中主动写入以反映真实状态：

- **开工后立即** — 拆解步骤数, 写入 `{"progress":"0/N","confidence":"XX%"}` (N=总步数, 信心值是当前对完成方式的把握)
- **每完成一步** — 更新 `progress` 为 `M/N`, 根据进展调整 `confidence`
- **遇到障碍 / 改变方案** — 立刻下调 `confidence` 并在 progress 中体现 (例如 `2/N?`)
- **任务完成** — 写入 `{"progress":"N/N","confidence":"完成"}` 或类似终态

只在多步、有不确定性的任务里维护; 一次性琐碎操作 (单文件编辑、回答问题) 不必更新。

## DNF costume / equipment layer rendering (verified 2026-05-20)

**Don't direct-extract `.img` files for clothing.** Costume sprites live in a separate animation tree at `equipment/character/<job>/avatar/{coat,hair,pants,shoes}/{layer}_<style>/<action>.ani`. Direct `.img` paths under `character/<job>/equipment/avatar/` are item icons/effects, **not** what's worn on the body.

**Symptom of the wrong path**: extracted PNGs are ARGB_1555 needing forceOpaque, `imgAnchor.y` differs from body by 100+px. If you see this, the path is wrong, not the alignment formula.

**Correct flow** (`scripts/extract-equipment-layer.mjs` is .ani-driven):

```bash
node scripts/extract-equipment-layer.mjs <action> \
  equipment/character/swordman/avatar/coat/coat_a/stay.ani [--style 0000]
```

The .ani gives per-frame `sprite` (template with `%02d%02d` for style) + `imgParam` (atlas frame). All four layers' `aniOffset (-232, -333)` and `imgParam` (90-95 for stay) match body exactly — that's the design contract.

**Alignment formula (500×500 shared canvas, single source of truth — `DnfLayeredSprite` Mode 2)**:

```
feetX = -body.aniOffset.x
feetY = -body.aniOffset.y
sprite.setOrigin(0, 0)
sprite.setPosition(layer.imgAnchor.x - feetX, layer.imgAnchor.y - feetY)
```

`imgAnchor` is the sprite's top-left corner in a 500×500 canvas; all layers (body + equipment) use **body's aniOffset** to compute the feet position.

**Z-order** (back to front): `body → shoes_a → pants_a → coat_a → hair_a`.

**Sanity check** (stay frame 0, body imgAnchor=(200,233), 64×106): hair_a Δy=-3 (头顶), coat_a Δy=+5 (肩), pants_a Δy=+36 (腰), shoes_a Δy=+88 (脚). If the deltas don't form a head→foot stack, something is wrong.

**Weapons** are NOT under `avatar/` — they're at `equipment/character/<job>/weapon/<weapon-type>/<weapon-id>/<action>.ani`, organized by weapon class (beamsword/cainusswdb1/...). Each weapon has its own animation curve.

## Known pitfalls

- `test-utils.ts` only exports `ok`/`equal`/`deepEqual`. No `assert.fail()` — use `throw new Error()`.
- FrameDataAction needs double-cast: `action as unknown as Record<string, unknown>`.
- Node built-ins (`node:fs` etc.) unavailable in test tsconfig — import data modules directly.
- Negative `whiffCancelFrom` is intentional (means "can never whiff cancel").
- RagingFury has 10 pillars in code (baseline doc says 8 — trust code).
- Replay frames must only store that frame's newly flushed events — never clone the full archive (commit `c4d3b22` fixed an OOM caused by per-frame full-archive copies).
