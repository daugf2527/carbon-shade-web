# 全方位质检报告 — Carbon Shade / 碳影

| 项 | 值 |
|----|----|
| 日期 | 2026-06-03 |
| 分支 | `dnf-native`(ahead origin 15） |
| 工作树状态 | Stage 3 收尾改动 + baseline 重跑派生物(会话前既有，未在本次质检中改动） |
| 方法 | 8 维度并行：4× opus subagent(MCP 深度分析） + 主线 npm 门禁 + playwright 运行时 + web-search 上游核对 |
| 用到的 MCP/工具 | ast-grep · codegraph · serena · fast-context · playwright · web-search · sequential-thinking(隐式） + 内置 LSP/Grep |

---

---

> ## ⚠️ 重要更正（2026-06-04，用户澄清后）
> 本报告（及 6-Agent 质检）多处把 `src/engine/` 定性为「运行时孤岛 / 死代码 / 突击造后即弃 / cleanup candidate」（见 §二、P2-1、§七根因）——**这是错误的，方向完全反了**。
>
> **用户澄清**：`src/engine/` 是**新版本主线 = 目标架构**（真值系统自底向上反推），目的是**替换**旧的 `src/combat/`。
>
> 因此正确定性：
> - `src/engine/` = **新目标架构**（留，绝不删）；`src/combat/` = **待替换的旧实现**（当前仍在线服役）。
> - engine「0 运行时引用 / 仅 test 驱动」**不是"废弃"，而是迁移中间态**：骨架已成、test 守着，尚未 wire 进 `CombatScene`（卡在"最后一公里"）。
> - engine 与 combat「概念 1:1 平行」**是有意的迁移中间态**，不是"重复实现该去重"。
> - **下一步工作**：让运行时入口（CombatScene）改用 engine 替掉 combat。
> - 详见 memory `engine-is-new-target-architecture-not-orphan`。**下方 §二/P2-1/§七 的"孤岛/死代码"措辞作废，仅保留作为"AI 误判→用户纠正"的审计轨迹。**

---

## 一、总评：🟢 健康，无 P0/P1 阻塞

本次改动（Stage 3 收尾 + baseline 重跑）**质量合规**：类型/测试/内核确定性/真值 SOT/架构/运行时**九项门禁全绿**。
发现的问题全部是 **P2/P3 存量债**（非本次改动引入），可排期处理，不阻塞推进。

### 维度红绿灯

| # | 维度 | 工具 | 结论 |
|---|------|------|------|
| 1 | 类型检查 | `npm run typecheck` | 🟢 passed（status 0） |
| 2 | 静态测试 | `npm run static:test` | 🟢 exit 0（全绿） |
| 3 | 8-gate 静态分析 | `npm run analyze` | 🟢 exit 0；**circularDependencies: 0** |
| 4 | 4-way 一致性 | `npm run consistency` | 🟢 无 drift（横向+纵向 maturity 全 ✅） |
| 5 | 内核确定性 | ast-grep | 🟢 **零违规**（Math.random 全仓 0；内核无 Phaser 泄漏） |
| 6 | 架构依赖 | codegraph + 亲核 | 🟢 核心链路健康、0 循环、无跨层泄漏；ℹ️ engine 新架构待 wire（见顶部更正，非孤岛） |
| 7 | 真值 SOT | json.load 实测 | 🟢 **完全合规**，无置信度反转 |
| 8 | LSP 诊断 | serena | 🟢 5 个改动文件全干净 |
| 9 | 运行时冒烟 | playwright | 🟢 Phaser 1920×1080，0 崩溃（仅 favicon 404） |

---

## 二、关键亲核修正（质检严谨性记录）

> 按项目纪律「agent 输出写报告前必须亲核」，对 subagent 的关键 finding 逐一复核，**修正了一处误判**。

**Agent 原结论**：`src/engine/core/ReactionResolver.ts` 是 "zero importers" 死代码。
**亲核修正**：该文件**有 importer** — `tests/static/combat-pipeline.test.ts:9`（agent 只 grep 了 `src/`，漏看 `tests/`）。
**进一步发现**：整个 `src/engine/` 手写逻辑子树是「**测试供养的运行时孤岛**」，定性从"死代码"修正为"未接入运行时的平行实现"（见 P2-1，定性更准确，处置方式不同）。

---

## 三、Findings 分级

### 🟠 P2（存量架构债，建议排期）

#### P2-1 · `src/engine/` 手写逻辑子树是运行时孤岛
- **证据**：
  - `src/engine/` 共 **79 个 .ts**；其中 ~65 个是 FlatBuffers 生成的 `schema/**`（**活的**，`analyze` 显示 `engine/schema/.../provenance.js` 有 **26 dependents**，数据层在用）。
  - 剩余 **14 个手写引擎逻辑**（`core/` 11 个：Actor / ActorStateMachine / ReactionResolver / DamageFormula / HitDetection / GameLoop / ComboCorrection / StatusEffectSystem / AirbornePhysicsSystem / AnimationPlayer / SkillResource；`ai/EnemyAI`；`input/InputCommand`；`loader/ShardLoader`）。
  - 亲核 grep：从 `src/`（排除 schema）外部 import `engine/` 的引用 = **0 条**。即 `main.ts` / `CombatScene` 均不引用 → 无运行时入口。
  - 唯一外部消费者是 static tests（如 `combat-pipeline.test.ts`、`shard-loader-bin.test.mjs`）。
- **影响**：与 active 内核 `src/combat/` **功能重复**（两套 ReactionResolver/DamageFormula/AirbornePhysicsSystem/EnemyAI/HitDetection/ComboCorrection）；污染 codegraph 同名符号的 impact/callees 计数；维护者易混淆"哪套是真"。
- **处置选项**：
  1. 若是 Stage 2 早期引擎原型、已被 `src/combat/` 取代 → **删除** `engine/{core,ai,input,loader}` + 对应 test，或迁入 `legacy/`；
  2. 若仍计划接入 → 在目录加 `README` 标注"未接入运行时 / 计划态"，并补一条 consistency 成熟度断言防止静默腐化。
- **注**：knip **不报**它为死文件（因有 test importer），现有门禁抓不到这类"测试供养孤岛"漂移 → 建议补一条 consistency 检查。

#### P2-2 · audit findings 30/77 仍 UNFIXED
- **证据**：`consistency` 纵向 `maturity/audit-unfixed` → `30/77 UNFIXED`（verdict 来自 `verification/audit-2026-05-24-...-fixverify`）。
- **影响**：存量审计债近 4 成未闭环；info 提示 "F3 类 mirror-coded fix 也可能假阳性"。
- **建议**：拉出 30 条 UNFIXED 清单，按 P 级重新分诊，区分"真欠债 / 已失效 / 误判"。

#### P2-3 · 事件配对率仅 12%
- **证据**：`analyze` events → `totalEvents 77, paired 9, emitOnly 55, listenOnly 13, pairRate 12%`。
- **影响**：55 个事件「发了无人听」、13 个「听了无人发」。可能是设计如此（emit 供未来/外部监听）也可能是**断裂的事件链**。
- **建议**：跑 `node tools/event-trace.mjs` 出明细，确认 13 个 listenOnly 是否指向已删除/改名的 emitter（这类最危险——监听器永远静默）。

### 🟡 P3（清理/配置，低优先）

| ID | 问题 | 证据 | 修复 |
|----|------|------|------|
| P3-1 | knip 配置缺 entry 声明，27 unusedExports/55 unusedTypes 含大量误报 | knip `--include files` 报的全是 `.claude/hooks/*.mjs`(harness 引用) + `scripts/*.mjs`(CLI)；**web-search 核上游**确认 knip v6 报 `scripts/**` 为 unused 是已知 entry 检测 gap | 在 knip config 的 `entry` 加 `scripts/**/*.mjs`、`.claude/**/*.mjs`，让真信号浮出 |
| P3-2 | `scripts/` 目录熵增（50 个 .mjs） | 含 `reverify-stage3-v2/v3/v4.mjs` 迭代残留、多个一次性 `check-*`/`diagnose-*` | 归档一次性脚本到 `scripts/oneshot/` 或删除 v2/v3 旧版 |
| P3-3 | `favicon.ico` 404 | playwright 运行时唯一 console error | `public/` 放一个 favicon |

### ⚪ 信息（无需动作，记录在案）

- **测试覆盖盲点**：codegraph blast-radius 标记 4 个核心符号无覆盖测试 — `DamageResolver`(class)、`HitRejectionResolver.resolve`、`FixedStepSimulation.update`、`FrameDataAction.reaction`。本次改动的 `ReactionResolver`/`DamageResolver.apply` **有**覆盖。
- **Phase 3 未启动**：`sim-worker.ts` 仍是 skeleton（1/3 marker），属计划态，描述时写"接口 stub"而非"已落"。
- **存量 marker**：22 TODO + 37 stub（在 baseline ±5 范围内，正常）。

---

## 四、各维度详证

### 维度 5 · 内核确定性（ast-grep，零违规）
- `Math.random()`：`src/combat` + `src/dnf-native-combat` **全仓 0 命中**（ts/tsx 双语扫）。
- Phaser 泄漏：12 处 phaser 引用**全在白名单** `src/game/*`(10) + `main.ts` + `vendor/phaser-shim.d.ts`，**内核 0 泄漏**。
- `Date.now()`/`new Date()`：命中全在**构建期数据管线**（`exporter`/`importer`/`pipelineRunner` 计时戳）+ `InputRecorder` 元数据，**非战斗 tick** → 豁免。
- `velocity.x/y =` 直写：全在确定性 step 内部（reaction/hit/kernel），值来自 PVF 真值或常量，`Math.max` 是夹取非随机 → 豁免。

### 维度 6 · 架构（codegraph + 亲核）
- 核心链路：**命中→伤害→反应→HP** 单一确定路径，收敛在 `src/combat/hit/HitResolutionSystem.ts:44-129`（`applyHitDecision`）：`hitResolver.buildQuery → hitDecisionResolver.decide → damageResolver.apply`(L70，10-乘子 DNF 公式 `DamageFormula.ts:85`)`→ reactionResolver.resolve/apply`(L74/78，`velocityY = liftUp × launch × weightFactor`，D9=B stub weight 68000)`→ hpAfter≤0 → death.kill`(L123)。无断链。
- 依赖方向：`src/game → src/combat`（单向，正确）；内核**0** 反向依赖 game/phaser。circularDependencies **0**。

### 维度 7 · 真值 SOT（json.load 实测，完全合规）
- `truth/swordman.ts` 唯一改动 = import 语法修正（`with { type: "json" }`），**未触碰任何数值真值**，无铁律反转。
- `baseline-shards/*` 改动 = **baseline 重跑派生物**（同一 PVF `crc32:c0779278|size:205695984` 重导出；13 个 shard 仅 `extractTimestamp` 整齐盖戳；size 增长与 manifest NEW 值自洽，对应 Phase C 81 attacks）。**非手改**。
- 实测 `swordman.json`：`liftUp`（81 处 launch 核心真值）全带 `provenance.sourceRef: pvf:character/swordman/attackinfo/*.atk`（Tier-1）；`local_baseline` 出现 **0 次**；数值 `value` 缺 provenance **0 处**；157 处 `tier3 + requiresManualVerification`（单位歧义保守降级，与铁律同向）。
- 佐证：`scripts/compare-shard-vs-pvf.mjs` 从 PVF 直抽 `frame[4].dmg` 对比 shard（源方向正确）；`verification/stage3-pvf-reverify/` 有 5-31 实抽 `.ani/.atk/.chr` 实据。

### 维度 9 · 运行时（playwright）
- 页面加载：标题「碳影 Carbon Shade | Combat Lab」✓；渲染场景选择器入口（「进入明庭」按钮 + "Combat Lab v0.3 · Scene Selector"）。
- 运行时硬证据（evaluate）：`hasCanvas: true`、`canvasSize: 1920x1080`（符合 bootstrap）、`hasPhaserGlobal: true`、`domButtons: 0`（按钮为 Phaser canvas 内绘制）。
- console：4 条消息，唯一 error = `favicon.ico 404`（无害，见 P3-3）。

---

## 五、可执行修复清单（按性价比排序）

1. **【P3-3，5 分钟】** 加 `public/favicon.ico` → 清掉运行时唯一 error。
2. **【P3-1，15 分钟】** knip config `entry` 加 `scripts/**/*.mjs` + `.claude/**/*.mjs` → unusedExports 信号去噪。
3. **【P2-3，30 分钟】** 跑 `event-trace.mjs`，核 13 个 listenOnly 是否断链。
4. **【P2-1，需决策】** 确认 `src/engine/{core,ai,input,loader}` 去留：删除 / 归档 / 标注计划态 + 补 consistency 断言。
5. **【P2-2，需排期】** 重新分诊 30 条 UNFIXED audit findings。

---

## 六、范围声明

- 本次为**只读质检**，未修改任何源码/数据/配置。
- git 工作树里的删除/修改（`.claude/memory/*` 删除、`baseline-shards/*` 改动等）是**会话前既有状态**，按纪律未纳入本次改动评估，仅作为质检输入核对其真值合规性（结论：合规）。
- 后台 dev server（5173）为 playwright 冒烟而起，质检完成后**已停止**。

---

## 七、根因综合（sequential-thinking + git 时间线）

> 对 3 个 P2 是否同源做了根因推理，git 坐实后**修正了初始的"迁移综合症"假设**——避免把多个独立问题 frame 成一个漂亮叙事。

**P2-1 根因（git 已证，本次最尖锐发现）**：`engine/core` 并非"早期原型被渐进取代"，而是 **2026-05-30 单日突击造的平行确定性引擎**：
- `engine/core/ReactionResolver` 首/末提交均在 5-30（09:18→10:51，**存活约 2 小时**）；当天 Stage2 Phase3-4 落了 T3.1–T4.9 十余 task（FNV-1a PRNG + 60Hz tick + 9-state ActorStateMachine + full combat pipeline）。
- 对照：`src/combat/reaction/ReactionResolver` 首提交 **4-28**（项目基线），末次 **5-31**（Stage3 仍在改）→ **老牌主线，持续活跃**。
- 即：次日 5-31 Stage3 选择在老 `src/combat` 上继续，**这套新引擎当天即被绕过、从未 wire 进运行时**。
- **决策点**：engine/core 反而含更"正确"的确定性设计（FNV-1a PRNG）→ 不是无脑删，而是「**回收精华到 combat** vs **止损删除**」二选一。

**诚实修正**：仅 P2-1 被 git 坐实。**P2-2**（audit 债，5-24 快照，早于这次突击）与 **P2-3**（事件孤儿，需 `event-trace` 定位归属）与 P2-1 **未必同源**，按独立存量债处理，不并入单一根因叙事。

**制度盲点（增值建议）**：`consistency` 的 `maturity/phase0-deliverables` 只验 `engine/{loader,core}` **exists**、不验 **wired**，把"次日即弃"的孤岛钉成了绿灯。建议把该断言从"目录存在"升级为"**有运行时入口引用**"——exists ≠ wired ≠ 接入（与 memory `feedback-maturity-not-binary` 同源）。

---

## 八、Loop 修复进展（/loop 每 10 分钟自动推进）

> 用户启动 `/loop` 自动推进「可执行修复清单」：安全可逆项自动做完，不可逆/需决策项停下来商量。

### ✅ R1 · P2-3 event-trace 核查 → 降级（非 bug）
13 个 listenOnly 事件全是 `keydown-LEFT/RIGHT/SPACE/TAB/UP` 等 **Phaser 框架键盘事件**（emitter 在 Phaser 引擎内部，项目代码无对应 emit）。event-trace 工具不识别框架 emit 属已知盲区。**非断链，P2-3 降为信息级。**

### ✅ R2 · P3-3 favicon → 已修复（验证通过）
新增 `public/favicon.svg`（暗底橙色新月，呼应"碳影"主题）+ `index.html` 注入 `<link rel="icon" href="%BASE_URL%favicon.svg">`。build 验证：`dist/favicon.svg` 存在 + `dist/index.html` 正确解析为 `/carbon-shade-web/favicon.svg`。运行时 favicon 404 已消除。

### ✅ R3 · P3-1 knip config → 评估后放弃（默认更优，已回滚）
尝试加 `knip.json` 声明 entry 去噪，验证发现：显式 entry **收窄了 knip 的智能入口检测**，导致 unused exports 27→51、types 55→94 **暴涨**（runtime/ 等被误判为 unused）。**结论：knip 默认配置已是较优，自定义 entry 是净退步，已回滚。** scripts/.claude 的 files 误报是 knip 已知行为且 analyze 已强制 passed（纯信息性），不值得用退步配置换。

### 🔍 副产物 · knip 实验暴露的真 unused files 线索（已回滚配置，仅作线索）
实验配置曾排除 scripts/.claude 噪音，暴露出值得甄别的 unused files：
- **engine/ 孤岛**（佐证 P2-1）：`engine/ai/EnemyAI`、`engine/core/GameLoop`、`engine/loader/ShardLoader`、`engine/workers/sim-worker*`
- **berserker 数据残留（新）**：`data/actions/berserker.*`、`data/commands/berserker.commands`、`data/tuning/dnf-berserker-baseline`
- **迭代残留**：`verification/nut-samples/classify-v2/v3/v4.mjs`
- ⚠️ 含疑似动态加载误报（`RenderAdapter`/`sim-worker` 可能被 `new Worker()`/字符串引用）——**需人工甄别，勿直接删**

### ✅ R4 · P2-2 audit 30 UNFIXED 重分诊 → 完成（大多是有意 backlog，非漏修）
亲核 memory-safety / contract-symmetry 的 UNFIXED findings 实际内容，真相：**这 ~39 个 UNFIXED 绝大多数是 5-24 audit 时主动归类的 P2 backlog**，明确标注 `(P2 backlog, not in remediation scope)` / `n/a (backlog)`。verdict=UNFIXED 的语义是"因属 backlog 未在该次 fix pass 处理"，**不是"应修却漏修的 bug"**。集中在：
- **C++ extractor 防御性加固**：`PvfReader.cpp` 短读未校验 fread count、`PvfNode.cpp` 整数溢出夹取、`PvfDocument.cpp` splitNode 边界 —— robustness 改进，非功能 bug。
- **main.cpp contract 对称**（F5–F8，audit driver 显式标 backlog）。
- SUMMARY 里的 `[FORMAT_ERROR]` 是 audit-verify 工具对 backlog finding（citation=n/a）的解析产物，非新错误。

**判定**：PVF 提取管线已稳定（8808 文件 0 错误，refIntegrity 99.1%），这些 backlog 无当前功能风险，可继续 backlog；未来要硬化 extractor（处理超大/损坏 PVF）时再从这批取。**建议** consistency 的 `audit-unfixed` 断言区分"主动 backlog defer"vs"漏修"，避免把有意 defer 误读为质量债（与误读 maturity 同源）。

### ⏸️ 需用户决策（不可逆，已停下商量）
- **P2-1 `src/engine/core` 等 14 文件孤岛去留** + **berserker 数据残留去留**（见会话内提问）。

---

## 九、删除执行（用户授权 engine 删除 + berserker 删除后的实物修正）

> 用户授权「engine 直接删除止损 / berserker 删除数据+改测试」。执行前按纪律精确调查，**实物与描述出现两处矛盾，已修正并 surface**。

### ✅ R6a · berserker 真残留删除（5 文件，typecheck + static:test 全绿）
已删 0 引用的老数据格式残留：`data/actions/berserker.{frenzy,normal,skills}.ts`、`data/commands/berserker.commands.ts`、`data/tuning/dnf-berserker-baseline.ts`。验证：typecheck status 0 + static:test EXIT=0（含 shard-loader-bin 等全部 passed）。删除安全确认。

### ⚠️ R6b · berserkerSkillFacts.ts — 实物矛盾，保留不删
**调查发现 berserker 在 `src/combat` 内核是 first-class 活功能**，深度贯穿 9 个内核模块（CombatKernel / FrameDataAction / HitResolutionSystem / BuffLifecycleSystem / ReactionResolver / CooldownResourceKernel / PushBoxResolver / BrowserInputState / types）——RagingFury/Frenzy/Derange/Diehard/BloodyCross 等技能都活跃实现。
`berserkerSkillFacts.ts` 是 `official-api-alignment.test.ts` 验证这些**活技能官方数值**（RagingFury 3345% 等）的 **API 真值存档**。删它会丢失活功能的真值校验，且违背置信度铁律（API 存档是 Tier-2 真值）。**与"berserker 已被 swordman 取代、是残留"的前提矛盾 → 保留不删。**

### ⏸️ R5 · engine 删除 — 连锁影响超出"孤岛删除"，需你复核范围
精确调查后，删 engine/{core,ai,input,loader} 13 文件**不是干净孤岛删除**，有两处连锁：
1. **会破 consistency 门禁**：`consistency-check.mjs:322-331` 把 `engine/core/GameLoop.ts` + `engine/loader/ShardLoader.ts` 断言为 Phase0 T0.3/T0.4 交付物（exists 检查）。删文件 → `maturity/phase0-deliverables` 变红 → **连带必须改 consistency-check.mjs**（动质检基础设施本身）。
2. **牵连 6 个 static test**：actor-init / animation-player / combat-pipeline / hit-detection / phase4-systems / shard-loader-bin 全部专测 engine，需一并删。
3. **sim-worker 保留**：`engine/workers/sim-worker*` 是 Phase 3 活占位（consistency 在追踪），**不在删除范围**。

### ✅ 最终整体验证（berserker 删除 + favicon 改动后）
`npm run analyze` 8-gate **exit 0**，整体健康未退化：circularDependencies 仍 0、knip 仍 27/55（证明删的 berserker 残留本就不在 knip unused 计数内，纯净删除）、events 12% 不变。typecheck + static:test 全绿。**本 loop 的改动（5 berserker 残留删除 + favicon）零副作用。**

### engine 14 文件功能清单（供决策，2026-05-30 单日 Stage2 Phase3-4 产物，~1095 行，0 运行时引用）
| 文件 | 行 | 功能 | Phase |
|------|----|----|----|
| GameLoop | 127 | 固定步长帧循环（accumulator + 变帧渲染） | P0 T0.4 |
| ShardLoader | 152 | 运行时 JSON shard 加载器 | P0 T0.3 |
| InputCommand | 74 | SOCD 清洗 + 搓招检测 | P4 T4.1 |
| Actor | 97 | 从 shard 拆 stats 的实体初始化 | P3 T3.3 |
| ActorStateMachine | 136 | 9 状态 FSM | P3 T3.2 |
| AnimationPlayer | 111 | 按帧延迟推进动画游标 | P3 T3.4 |
| HitDetection | 61 | AABB 攻击盒/受击盒重叠判定 | P3 T3.6 |
| DamageFormula | 21 | 物理伤害公式（简版，非现役 10-乘子） | P3 T3.7 |
| ReactionResolver | 85 | 受击反应（击退/浮空/倒地） | P3 T3.8 |
| SkillResource | 40 | 冷却 + MP 消费追踪 | P4 T4.2 |
| EnemyAI | 81 | 阈值 AI：空闲→追击→攻击→撤退 | P4 T4.3 |
| StatusEffectSystem | 49 | 冰冻/中毒/减速 | P4 T4.4 |
| ComboCorrection | 28 | 命中位置吸附 | P4 T4.5 |
| AirbornePhysicsSystem | 33 | 浮空重力积分 | P4 T4.6 |

**与现役 `src/combat/` 概念 1:1 平行但更简约**；独有 FNV-1a 确定性 PRNG（现役无）。次日 5-31 即被 Stage3 绕过，从未驱动一帧。**留=零成本（无 import → tree-shake 不进 bundle）但继续漂移；删=去 1095 行 + 6 test + 改 consistency 门禁。等用户决策 A（删）/B（留+标注）。**
