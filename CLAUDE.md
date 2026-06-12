# CLAUDE.md

@C:/Users/newwo/.cc-switch/agent-policy/COMMON.md

## Project identity

**Carbon Shade / 碳影** — DNF-style 2.5D combat prototype. Engineering name: **Combat Lab**.
Active branch: `dnf-native` (master frozen 2026-05-21).

## Current state (2026-06-08)

**DNF alignment pivot** — 停止新功能，全力对齐 DNF 真值。详见 [`docs/planning/2026-05-21-dnf-alignment-pivot.md`](docs/planning/2026-05-21-dnf-alignment-pivot.md)。

| Stage | 内容 | 状态 |
|-------|------|------|
| Stage 1 | PVF 数据提取管线 (EXTRACT→PARSE→VALIDATE→LOAD→EXPORT) | ✅ **完成** (2026-05-30) — 8808 文件 0 错误，refIntegrity 99.1%，17 shards。T1.9 (Ani/Nut/Img dispatch) + T1.10 (full-PVF 压测) 全部通过 |
| Stage 2 | 22-system DNF 原生引擎层（[field-matrix](docs/engineering/22-system-field-matrix.md), [roadmap](docs/planning/2026-05-27-stage2-roadmap.md)） | ✅ **完成** (2026-05-30) — Phase 0-5 全部完成。CombatKernel 命中→伤害→受击→HP 闭环，ReplayRecorder stateHash 确定性验证，CombatScene 最小可玩版本（HP bar + swordman + 3 种哥布林）。76 静态测试全绿，M3 里程碑达成 |
| Stage 3 | 真值驱动重构（[roadmap](docs/planning/2026-05-30-stage3-truth-driven-refactor.md), [changelog](docs/changelog/2026-05-31-stage3-phase-bcd.md)） | ✅ **完成** (2026-05-31) — Phase A-D 完成。**Phase A**: 武器 ani 入 shard + TS truth SOT + 砍 default.json + ActorFactory PVF 真值 + DamageFormula 修正。**Phase B**: 11 个 beamsword 等级提取 + DualTimelineAction 双 timeline 类型 + HitResolutionSystem 从 weapon timeline 读取 attackBoxes（覆盖率 16.2%，BLOCKED）。**Phase C**: Reaction 文档补全（H2.1 slot 路由 + H3.1 weight factor）+ 81 个 attacks 提取 + ReactionResolver 真值驱动（resolve() 从 atk.hitReaction 路由 + apply() 接入 PVF 公式，D9=B stub 系数）。**Phase D**: Bundle 决策（接受 2.0MB）+ 文档更新。**核心成果：Reaction 真值驱动**（velocityY = liftUp × launch × weightFactor）。19 个新 truth 测试，M7 里程碑达成 ⚠️ **后续更正**: weightFactor 于 Stage 4 Batch 6 撤除——违背 Tier-1(weight 仅音效,非 launch 物理),真值为 vy=liftUp(peak 30px)|
| Stage 4 | DNF 原生引擎层补全（[changelog](docs/changelog/2026-06-07-stage4ab-changelog.md), [roadmap](docs/planning/2026-06-07-stage4-6-roadmap.md), [truth-matrix](docs/testing/engine-truth-coverage-matrix.md)） | ✅ **引擎层完成** (2026-06-08) — **4A 移动** (M8): Movement/Jump/Z 轴/Dash。**4B 战斗完善**: Down/QuickRebound + 命中真值批次 — hit-stop / armor 四档(含 building-block) / i-frame 统一 / combo pressure / slot 评估 / **launch 真值**(撤 weightFactor 违背 Tier-1,peak 30px)。**4C 缩放**: Level/MonsterScaling + **B4 多怪物**(4 PVF 真值怪 incl. spider) + B3 hitGroup 精化 + C2 装备框架(值 local_baseline)。**引擎自验 scenario 6/7**(3 自然涌现 normalHit/launch/bleed + 3 靠自验脚本注入状态 armorHit/quickRebound/buildingArmorBlock——真实战斗无怪带 armor，armor 值 local_baseline、DNF.exe 不可得；仅 ragingFury 多段超必杀诚实 gap)。121 静态测试全绿，EngineKernel 确定性保持(x/y/z + mp/status/cooldown/knockback 入 stateHash)。Stage 5 精灵渲染待启 |

**Stage 1 管线**:
```
PVF --pipe--> dnf-extract (C++) --> PvfDocument[] --> 7 parsers in dispatch + 3 standalone (TS) --> Zod validator
  --> SQLite (node:sqlite) --> JSON shards (dist/data/players/*.json etc.)
```
**审计累积**: 5-25 6-Agent 全链路 (48 finding) + 5-27 10-commit audit (1 P1 / 11 P2)，全部 Windows 动态已验证。22-system 状态：`counts_verified_clustering_inferred`（478 API / 193 .nut / 22+1 buckets，详见 [nut-validation](docs/engineering/nut-validation-2026-05-27.md)）。

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
| `npm run browser:qa` | Playwright combat QA suite (`tests/browser/combat-qa.spec.ts`, needs dev server) |
| `npm run legacy:test` | Legacy test placeholder (disabled, 0 cases) |
| `npm run test:loop` | Watch-mode test loop (`scripts/test-loop.mjs`) |
| `npm run baseline` | Stage 1 sample baseline (98 curated files, ~6s) |
| `npm run baseline:pve` | Stage 1 PVE-full baseline (8794 character + skill files, ~10min) |
| `npm run validate:sprites` | Validate sprite manifest integrity |
| `npm run validate:assets` | Validate asset paths against manifest |
| `npm run validate:combat` | Validate combat boundary config |
| `npm run consistency` | 4-way drift scan (memory/docs/code/git) — see [Consistency](#4-way-consistency) |
| `npm run compile:schema` | flatc → TS types from `src/engine/schema/*.fbs` |
| `npm run compile:assets` | JSON shards → FlatBuffers `.bin` in `public/assets/` |
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

Source: `tools/dnf-porting-src/`. Binary in repo: `tools/dnf-extract.exe` (Windows only).
CI: `.github/workflows/build-dnf-extract.yml` builds Linux/aarch64/Windows — Linux/aarch64 ELF NOT committed to repo, fetch from CI artifact if needed.

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

# Stage 1 baseline (curated 98-file cross-section)
DNF_PVF_PATH=... node scripts/stage1-baseline.mjs

# Frame PoC: extract single .ani → PNG frames + meta.json (no npm script)
DNF_PVF_PATH=... node scripts/extract-berserker-action.mjs <pvf-ani-path>

# F-class research: probe PVF defensive thresholds for C++ extractor hardening
DNF_PVF_PATH=... node scripts/research-pvf-thresholds.mjs
```

## Architecture

```
dnf-native branch (ACTIVE):
src/dnf-native-combat/data/
├── parsers/        Chr/Mob/Atk/Skl/Ani/Dgn/Etc/Map/Nut/Img (10 total: 7 via parseStage + 3 standalone Ani/Nut/Img)
├── types/          ChrDef/MobDef/AtkDef/SklDef/... + Provenance + PvfDocument
├── pipeline/       parseStage.ts + pipelineRunner.ts (EXTRACT→PARSE→VALIDATE→LOAD→EXPORT)
├── validator.ts    Zod schemas + provenance audit + ref integrity + PvP scope
├── importer/       SqliteImporter.ts (node:sqlite, mirror tables + 10 domain VIEWs)
├── exporter/       RuntimeExporter.ts (entity-centric JSON shards + manifest)
src/data/official/  dnfPhysicsConstants.ts + dnfEnumTables.ts (shared shard sources)
tools/dnf-porting-src/  C++ extractor (~3500 lines .cpp, 48 audit findings tracked)

src/engine/  (ACTIVE 运行时主线 — P3.1 后 CombatScene 跑 EngineKernel,替换 FROZEN src/combat):
├── kernel/         EngineKernel (确定性 tick 编排 + per-tick stateHash) + SystemPhase/Fnv1aPrng
│   └── systems/    16 EngineSystem: 领域 Animation/CombatResolution/Hitstun/Airborne/Knockback/Status/EnemyAI
│                    + 桥接 Action/Input/SkillInput + 横切 Math/DataStore/Timer/Time/Predicate/Resource
├── core/           Actor + 纯逻辑: DamageFormula/ReactionResolver/AirbornePhysics/KnockbackPhysics/
│                    StatusEffects/ResourcePool/CancelWindow/MonsterAIConfig/weaponTimelineFlattener/...
├── input/          InputCommand (SOCD) + CommandMatcher (skill 指令序列, tick-based)
└── 真值化: 04/05/07/08/09/03 + hitstun + 水平击退 运行时 PVF 真值驱动; skill-action infra
     (command+cancelWindow) 接活。真值覆盖详见 docs/testing/engine-truth-coverage-matrix.md

master branch (FROZEN):
src/combat/         Pure TS combat kernel (FrameDataAction, HitResolver2D5, DamageFormula, ...) — engine 蓝本,只读
src/game/           Phaser 3 rendering layer (scenes, render adapter, camera, audio) — CombatScene 现跑 EngineKernel
src/data/manifest/  actions/default.json (38 actions), damage/, status/, ai/, truth/(swordman.ts/swordman-attacks.json)
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

The split: `analyze` = static gates, `completion` = presence, `audit` = semantic depth, `consistency` = 4-way drift scan.

## 4-way consistency

`npm run consistency` 扫 memory/docs/code/git 四方一致性，分两组：
- **横向 10 项**（数量/索引）：parsers count / npm scripts coverage / active branch / curated count / nut API 478 / memory index / wiki links / doc refs / static test count / git tree state
- **纵向 6 项 maturity**（成熟度竖切）：`.fbs vs _generated.ts` 编译闭环 / ani.fbs 缺口 / sim-worker skeleton 标记 / Phase 0 T0.3+T0.4 存在性 / flatc 工具链就绪 / audit fixverify UNFIXED 计数

`--strict` 让任何 drift exit 1；不带 flag 时只报告。pre-push hook 已自动跑（信息性）。

成熟度维度防的是"声明已落 / 代码是 echo stub"这种二元措辞漂移——见 [memory/feedback-maturity-not-binary](C:\Users\newwo\.claude\projects\D--carbon-shade-web\memory\feedback-maturity-not-binary.md)。新加文档/memory/code claim 时，对应 truth 实测点应同步加进 `scripts/consistency-check.mjs` CHECKS 数组。

## MCP / Skill 工具决策树

### LSP tools — prefer over Grep/Read

| Scenario | Use | Instead of |
|----------|-----|------------|
| "Where is X defined?" | `goToDefinition` (内置) | Grep + Read |
| "What calls this function?" | `findReferences` (内置) | Grep |
| "What's this type/interface?" | `hover` (内置) | Read whole file |
| "What's in this file?" | `documentSymbol` (内置) | Read full file |
| "Call chain?" | `incomingCalls` / `outgoingCalls` (内置) | Manual trace |

> ECP0=D: 当前无 LSP MCP server — 上表用内置 LSP 能力，非 `mcp__cclsp__*`。

### ast-grep — pattern 搜索（当前唯一 MCP）

| Scenario | Tool |
|----------|------|
| 扫所有 `phaser` import 违规 | `mcp__ast-grep__find_code` |
| `Math.random()` 不确定性全局排查 | `mcp__ast-grep__find_code` |
| `velocity.x =` 写入位置 | `mcp__ast-grep__find_code` |
| 复杂跨文件 YAML 规则（inside/has） | `mcp__ast-grep__find_code_by_rule` |

**何时选 ast-grep 而非 Grep**：pattern 含 AST 结构（`$NAME`/`$_`/`$$$`）或需 inside/has 关系时；单纯字面量用 Grep 更快。

### sequential-thinking — 推理链

发现多个互相牵连的 finding → `mcp__sequential-thinking__sequentialthinking` 推理根因，而不是线性堆结论。

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
- `tools/dnf-extract.exe` is the only binary checked into the repo (Windows). Linux/aarch64 ELF is built by CI but NOT committed
- **DNF motion 命名约定（韩语习惯）**：idle 叫 `stay` 不是 `stand`；walk 叫 `move` 不是 `walk`；rest 是 `rest`/`simple_rest`；damage 有 `damage1`/`damage2`；down 有 `down`/`overturn`。其他常见：`getitem`/`throw1`/`throw2`/`guard`/`sit`/`ghost`。引用 .ani 前先 `dnf-extract --list --filter "<job>/animation"` 核名，别用英文意译

## Windows 注意事项速查

| # | 坑 | 一句话应对 |
|---|---|---|
| W1 | `cmd /c` 包装 stdio MCP | MCP JSON `"command":"cmd","args":["/c","npx","-y","<pkg>"]` |
| W2 | Git Bash 不在 PATH 时 Claude Code 起不来 | `CLAUDE_CODE_GIT_BASH_PATH=C:\Program Files\Git\bin\bash.exe` |
| W3 | PowerShell `claude` not recognized | 加 `$env:USERPROFILE\.local\bin` 到 User PATH |
| W4 | `%USERPROFILE%` vs `~` | PowerShell + Git Bash 用 `~`；CMD 用 `%USERPROFILE%` |
| W5 | PowerShell 中文 / emoji 乱码 | `chcp 65001; [Console]::OutputEncoding=[Text.Encoding]::UTF8` |
| W6 | Plan mode Shift+Tab 某些终端 skip | 改按 **Alt+M** 进入 plan mode |
| W7 | MCP server OAuth 后启动超时 | 启动前 `$env:MCP_TIMEOUT=10000` |
| W9 | 不知 Claude Code 健康状态 | `/doctor` 或 `claude doctor` |

## When to use plan mode

复杂任务**先 /plan**，触发条件：
- 跨 ≥3 文件改动 / schema 变更 / src/combat/ 或 src/dnf-native-combat/ 内核改动 / replay 哈希影响
- 重构、重命名跨模块导出
- security-sensitive（npm scripts / Phaser asset 加载链 / dnf-extract 二进制更新）

不需要 /plan：单文件修复 / typo / 单个 frame data 条目调整。

**Windows 用户**：Shift+Tab 在部分终端 skip plan mode，改用 **Alt+M**（与 WIN1 速查表 W6 一致）。

## 代码搜索工具策略

**优先 `mcp__fast-context__fast_context_search`**（本仓三轮实测：Q1 kernel tick 主循环 / Q2 damage 链路 fast-context 都比 Grep 更聚焦——Grep 在 `combat/` 下散到 ai/reaction/hit/resources 多个目录，fast-context 直击 `combat/kernel/{CombatKernel,FixedStepSimulation,CombatSystem}.ts` 和 `combat/damage/{DamageResolver,DamageFormula}.ts` 核心）。

例外：
- **已知精确符号名**（如 `CombatKernel` / `DamageResolver` / `HitResolutionSystem`）→ 直接 Grep
- **跨多目录链路追踪**（input → action → kernel → damage）→ 第一次 Grep 容易猜错命名（本仓 input 实际是 `BrowserInputState` / `RunCommandDetector` / `FrameDataAction`，不是常规的 `enqueueAction`）→ 先 fast-context 探路或 `ls src/combat/input/`

详细决策树和归因见 user memory `[[reference-fast-context-mcp]]`。
