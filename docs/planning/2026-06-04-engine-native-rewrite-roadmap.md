# dnf-native 新主线：engine 原生重写中长期路线图

> 本文档是 dnf-native 新主线的正式路线图，由 2026-06-04 全方位质检（`docs/testing/2026-06-04-dnf-native-mainline-qa.md`）驱动。与 `2026-05-27-stage2-roadmap.md` / `2026-05-30-stage3-truth-driven-refactor.md` 并列。

## Context（为什么做这件事）

**问题**：dnf-native 是新主线，三大支柱 = 真值系统 + 新引擎 `src/engine/` + 自底向上反推架构。2026-06-04 的全方位质检（3 个 opus agent + 逐条亲核）揭示真实状态：

- **engine 系统层 ~90% 完整**：14 个系统纯逻辑核全是真实现、对真值 shard 验证过、确定性纯净（`Math.random`/`Date.now` 0 命中）。
- **但组装层 ~20%，迁移完成度 ~25%**：engine **没有 orchestrator**（14 系统是散装零件，`GameLoop` 依赖的 `kernel` 接口无任何 class 实现），6 处系统接线断裂，**0 运行时引用**（CombatScene 当前 100% 跑旧的 `src/combat/`，4733 行）。

**目标**：让 `src/engine/` 从"测试驱动的目标态骨架"演进为**运行时主线**，最终替换 `src/combat/`，对齐完整 22-system 架构。

**已定方向（用户决策）**：
1. **原生重写** —— engine 按自己干净的架构走，`CombatScene` + 5 个外围组件改去适配 engine，不为 combat 旧契约妥协。
2. **全 22-system 蓝图** —— 完整目标态，不止 P3 核心闭环。
3. **本文档只到高层路线图** —— 阶段 + 里程碑 + 依赖，不下钻任务级；每阶段开工前再细化。

**两条贯穿全程的铁律**：
- **确定性优先**：每阶段交付物必须能在 `tests/static` 风格 standalone Node test 里跑出可复现结果。engine 比 combat 多 FNV-1a PRNG + stateHash，这是"原生重写"的核心增益，从地基阶段内建、不后补。
- **Tickable 是唯一硬契约**：`src/engine/core/GameLoop.ts:19` 的 `Tickable`（`tick()` + 可选 `onLargeDelta`/`emitLongFrameWarning`）是 engine 对外唯一稳定面。`EngineKernel implements Tickable` → `GameLoop` 与 combat 的 `FixedStepSimulation`（只依赖 Tickable 三方法）都能零改驱动它。

---

## 阶段总览

| Phase | 一句话目标 | 退出里程碑（可验证） | 状态 |
|---|---|---|---|
| **P0 地基速修** | 清杂物 + 修真 bug，让 14 系统核可信 | A 组全清；14 系统单测全绿 | ✅ 完成 2026-06-04 |
| **P1 EngineKernel** | 建真 System-class 编排器，engine 内部能 tick 完整一帧 | test 里 `kernel.tick()` 跑通 P3 闭环，同输入产出相同 stateHash | ⬜ 待开工 |
| **P2 真值解封 + 横切支撑层** | 先解封 22×API 真值表，再按真值建 13/17/18/20/21 | 真值表入库；5 个 HOT 横切系统接入编排器；多帧 hash 可复现 | ⬜ |
| **P3 运行时切换 + 外围适配** | EngineKernel 上线，CombatScene + 5 组件改吃 engine | CombatScene 跑 engine 不报错，手感闭环可玩 | ⬜ |
| **P4 表现层 6 系统** | 补 10/11/12/14/15/16 | VFX/CameraFX/挂点在场景可见；池化生效 | ⬜ |
| **P5 收尾 / combat 退役** | DamageFormula 真值化 + 删 `src/combat/` | 真公式 + truth 测试全绿；combat 移除；`npm run analyze` 通过 | ⬜ |

---

## 各阶段详述

### Phase 0 — 地基速修（warm-up，低风险机械动作）✅ 完成 2026-06-04
动架构前先让 14 系统核"可信"，清掉污染后续判断的噪声。**不碰任何 combat 文件。**
- ✅ **重力真 bug**：`src/engine/core/AirbornePhysicsSystem.ts` 原写死 `-1800`，改为 `import { DNF_PHYSICS_CONSTANTS }` 并用 `defaultGravityAccel`（PVF 真值 -1500）。**不再硬编码 -1500，而是引用真值常量**，未来真值变了自动同步。
- ✅ **`Actor.ts` console.log 清理**：删除每帧状态转换的 `console.log` 调试钩（`ActorStateMachine` onTransition 可选，安全删）。
- ⏸️ **`ShardLoader.js` 退库 = 放弃**（实物核查修正计划假设）：原以为是死编译产物，实测发现 `tests/static-js/shard-loader-bin.test.mjs:20` 直接 `import(...ShardLoader.js)`——`.mjs` 测试不经 tsc 编译只能 import 已编译 `.js`。它是 `static:test` 套件的运行时依赖，退库会破测试。**保留追踪。**
- ⏸️ **`ShardLoader.ts` console.warn 保留**：`.bin fetch 失败 fallback .json` 是正当运行时降级提示，非调试残留，移除反而丢信息。
- 📋 **立档两个 combat 既有 bug**（P0 不改，留给 P3）：CombatScene 听 `ActorDead` 但枚举是 `ActorDied`（死亡统计静默失效）；`StatusApplied` payload `kind` vs `type` 不符。

**验收结果**：typecheck status 0；engine 14 系统 static:test 全绿（actor-init `swordman hp=180 goblin hp=46` 正常，airborne 改重力后 `landed`/`ticks>10` 定性断言仍成立）。
> ⚠️ **已知 pre-existing 失败（非本阶段引入）**：`tests/static/combo-correction.test.ts:29`（combat 的 attack3 heavy 修正 standGauge 420≠1020）。`git stash` 验证确认：移除 P0 改动后该测试仍失败，与 engine/P0 无关，是 combat 树会话前既有债，P5 真值化时处理。

### Phase 1 — EngineKernel orchestrator（整条路线的关键路径起点）
把 14 个散落系统用**真 System class**（非 combat 的 closure 半成品）组装成能自洽 tick 一帧的 `EngineKernel`。
- `EngineKernel implements Tickable`：`tick()` 内单 for 循环遍历 `System[]`，**强制 phase 排序**（combat 声明了 7-phase `SYSTEM_PHASE_ORDER` 但未强制——engine 借形补实）。
- `System` 接口 `{name, phase, tick(ctx, bus)}` + `EngineContext`（只读 façade，注入子系统句柄；范式参照 `src/combat/kernel/SystemContext.ts`，从头用 class 实现）。
- 补齐现有 6 处断裂接线（Anim→HitDetect→Reaction / Input→Actor / Airborne→FSM / Combo→HitDetect），纳入编排器。
- **内建确定性底座**：每帧末 `stateHash` + 注入式 FNV-1a PRNG（复用 `src/engine/workers/sim-worker.ts:31` 的 `Fnv1aPrng`，以 tickCounter 播种）。这是 17-Math 的前身，PRNG 句柄此刻就进 context。

**里程碑**：test 里 `new EngineKernel()` → 喂固定输入 → `tick()` 跑通 P3 核心闭环（01/03/04/05/07/08/09/19）一帧，连续两次同输入产出**相同 stateHash**。
**决策点**：建议直接落 combat 的 7-phase 枚举作为 engine phase，降低 combat→engine 行为对照成本。

### Phase 2 — 22×API 真值解封 + P3 横切支撑层
> **进度 (2026-06-04)**：**P2a 真值表解封 ✅ 完成** — `src/data/manifest/truth/system-api-map.ts`(5 HOT 系统 × 标志 API 经 `.nut` 第一证据确认 extracted-grade)+ `tests/truth/system-api-map.test.ts`(T1-T5 绿,T3 锚定 all-193.jsonl 可复现)+ consistency 守护点 `maturity/p2a-system-api-map`。**范围收敛**:聚焦 5 HOT 系统标志/高频 API,126 个长尾 unclassified(call share 2.9%,多属表现层/OOS)留 future——里程碑要求"5 HOT 系统 API 归属经真值表确认",非全 478 分类。**副产物**:21-Predicate 桶剥离 5 个 OOS UI/创作模式谓词(`sq_IsVisibleCursor` 等)。**P2b 横切支撑层 ✅ 完成** — `src/engine/kernel/systems/` 下 5 个 System class(Math/DataStore/Timer/Time/Predicate),接入 `EngineKernel`(`provides` 服务路由 → `ctx.<service>` + `snapshot()` 折进 stateHash + `reset()` 场景切换传播);`tests/static/engine-crosscutting-systems.test.ts` C1-C5 绿,**10 帧 stateHash 双跑可复现**(P2 里程碑达成)。**P2 完整,下一步 P3 运行时切换 + 外围适配**。

补齐 P3 闭环依赖的 5 个 HOT 横切系统，但**先解封真值表再建系统**。
- **（前置）解封"22×API 真值分类表"**：当前 22-system 边界是 `counts_verified_clustering_inferred`——哪些 API 归哪个 system 是**推断**（28% unique 未分类）。先产出真值表（落点 `tests/truth/`），钉死 13-DataStore / 18-Timer / 21-Predicate 等的 API 归属。
- 据真值表建 5 个 HOT 横切系统接入编排器：**13-DataStore**（sq_var，最高频）/ **17-Math**（PRNG 正式收编）/ **18-Timer** / **20-Time**（查询层）/ **21-Predicate**（条件判定）。

**里程碑**：5 横切系统按 phase 跑，**多帧** stateHash 可复现；真值表入库且 P3 闭环系统 API 归属经真值表确认。
**硬排序**：真值表 → 建系统，**不可倒置**。放在运行时切换前，把"聚类推断若错需返工"锁在 engine 内部、未触及外围时。

### Phase 3 — 运行时切换 + 外围适配（原生重写代价集中兑现）
> **进度 (2026-06-04)**：**P3.0 攻击闭环 ✅**（P1 接线补课）— 发现 P1 的"闭环"是 mock system 验证、14 个核心领域系统未真接入。已建 3 个真实领域 EngineSystem（`AnimationSystem`/`CombatResolutionSystem`/`HitstunSystem`，放 `src/engine/kernel/systems/`）+ Actor 加 per-actor 组件（`animationPlayer`/`reaction`，与 fsm 一致）。`tests/static/engine-combat-loop.test.ts`：真实 Animation→HitDetect→Reaction→Hitstun 闭环 19 tick 杀 goblin + 确定性 + FSM 到 DEAD（D1-D3 绿）。**剩余 P3.0**：**07-Airborne ✅**（liftUp 攻击→浮空→重力落地端到端，`engine-airborne-loop.test.ts` E1-E3 绿，actor.y 入 stateHash）。**01-Input + 03-AI + Action 桥 ✅**：建 `ActionSystem`（actionName→animation 注册表 + per-actor 请求队列，解卡 AI/Input）+ `InputSystem`（Actor.intent→action 请求）+ `EnemyAISystem`（AI→Action 同桥）+ AnimationSystem 补 ATTACK→IDLE 接线。`engine-input-action-loop.test.ts`（F1-F4：intent 链杀 goblin + 确定性 + facing）+ `engine-two-way-fight.test.ts`（G1-G3：**玩家↔哥布林双向互砍** + 确定性）全绿。**7 个领域系统 + 4 条端到端能力**。待接 08-Resource / 09-Status（增强项，非闭环必需，可 P4）。P3.0 核心已足够支撑 **P3.1 运行时切换**。**简化决策**：hitGroup dedup 用 per-attacker 占位（真值 .atk hitGroup id 待接）；DEFAULT_BODY_BOX 占位受击盒。

让 `EngineKernel` 真正驱动 `CombatScene`，engine 从 0 运行时引用变主线。
- `CombatScene.create()` 改 `new EngineKernel(...)`；`FixedStepSimulation` **原样复用**（P1 已满足 Tickable）。
- **5 个外围组件适配 engine 接口**（代价集中于此）：
  1. **CombatScene**（1259 行）——kernel 字段裸读（`player/actors/tickCount` + Actor 字段 position/velocity/facing/resources/buffs/handfeel/currentAction）、7 类事件订阅、方法（`debugSnapshot/runDeterministicScenario/requestAction/inputState/socd`）全对齐。
  2. **DebugLayer**——深耦合 `bus.archive` / `hitResolver.buildQuery`，适配成本最高，需 engine 暴露等价调试面。
  3. **TouchControls / CameraController / InputRecorder**——较轻（只写输入 / 只读 `player.position.x` / 读写 player+actors）。
- 顺手修 P0 立档的 `ActorDied` 命名 + `StatusApplied` payload，避免把旧 bug 带进新主线。

**里程碑**：CombatScene 跑 EngineKernel **不报错**，手感闭环（输入→动作→命中→反应→伤害数字）浏览器可玩；`runDeterministicScenario` 在 engine 下稳定。
**硬排序**：适配层**必须在 engine 内部自洽（P1+P2）之后**——不在 engine 未稳时改 5 组件，否则两边同时动无法定位回归。
**中间里程碑缓解**：先切核心三件（scene/touch/camera）跑通可玩，DebugLayer 适配作为 P3 收尾子里程碑，不阻塞"可玩"信号。

### Phase 4 — 表现层 6 系统
补表现/扩展层，让 engine 不止"逻辑正确"还"看得见"。据 P2 真值表精确建：
- **15-VFX / 16-CameraFX**——消费 P3 已通的 `VfxRequested`/`CameraShakeRequested`/`Flash` 事件。
- **14-Appendage**（武器/挂点）/ **11-Pool**（对象池，止 VFX/伤害数字 GC 抖动）/ **10-PassiveObj**（投射物）/ **12-ScriptRT**（脚本运行时，对接 nut-script-shard）。

**里程碑**：VFX/震屏/挂点场景可见且不掉帧；池化生效（tick cost 不因表现层上升）。
**注**：**02-Net 标记 OOS**，本路线图不含。

### Phase 5 — 收尾 / combat 退役
吃满 Stage3 真值，删 `src/combat/`，新主线唯一化。
- **DamageFormula 真值化**：engine `DamageFormula.ts`（简化系数版，crit/element 常量）升级为真公式，据 `tests/truth/swordman-reaction-formulas`、`swordman-attack1-truth` 等。engine **没吃到 Stage3 成果**（Stage3 真值落在 `src/combat/` 树），这是必须补的隐性回归源。同期处理 P0 立档的 `combo-correction` pre-existing 失败。
- **删除 `src/combat/`**：确认 engine 22 系统全覆盖 combat 行为后退役。注：`src/dnf-native-combat/` 当前 29 文件全是**数据管线**（Stage 1 PVF 提取栈：parsers/pipeline/exporter），战斗运行时层仍需在 `src/engine/` 建——命名空间归属在 P5 厘清。
- 全量 `tests/truth/`（6 个：reaction-routing/reaction-velocity/hit-resolution-weapon-timeline/swordman-attack1-truth/swordman-full-actions/swordman-reaction-formulas）对 engine 跑绿。

**里程碑**：真公式 + truth 全绿；`src/combat/` 移除；CI 8-gate / `npm run analyze` 通过。
**硬排序**：删 combat **必须等 Stage3 真值吃满（truth 全绿）**——否则 DamageFormula 简化系数是隐性回归。

---

## 依赖图（关键路径）

```
P0 速修 ──► P1 EngineKernel（地基）──► P2a 真值表解封 ──► P2b 横切5系统
  ✅                                                          │
                                              ┌───────────────┘
                                              ▼
                                  P3 运行时切换 + 外围5组件适配
                                              │
                                              ▼
                                       P4 表现层6系统
                                              │
                                              ▼
                              P5 DamageFormula真值化 + 删combat
```

**三条不可倒置的硬约束**：
1. **P1 EngineKernel 必须最先**（除 P0）——它是 Tickable 契约实现体，P2/P3 全挂其后。
2. **P2a 真值表解封 先于 P2b 建系统、先于 P3 切换**——决定 22-system 边界，在触及外围前把返工锁在 engine 内部。
3. **P5 删 combat 等 Stage3 真值吃满（truth 全绿）**——否则 DamageFormula 简化系数是隐性回归。

---

## 关键决策点小结

| 决策点 | 状态 | 影响 |
|---|---|---|
| 原生重写 vs 适配 | **已定：原生重写** | 代价 = 外围 5 组件全改（DebugLayer 最重）；收益 = engine 干净 + 确定性底座内建。P3 兑现 |
| 22-system 聚类边界 | **待核**（P2a 解封） | 推断聚类若错，P1 的 System[] 拆分与 P2b 建系统需微调；放切换前隔离返工 |
| DamageFormula 真值 | **待补**（P5） | engine 现为简化系数；删 combat 前必须吃满 Stage3，以 truth 全绿为闸门 |
| phase 粒度 | 建议沿用 combat 7-phase | 降低 combat→engine 行为对照成本（P1 决定） |
| 02-Net | **OOS** | 不含；若做需建在 P1 确定性底座之上 |

---

## 验证方式

每阶段以**新鲜运行的命令输出**为验收证据，不靠声明：
- **P0**：`npm run typecheck` + `npm run static:test` 全绿；`git status` 确认删除范围。
- **P1**：新增 `tests/static/engine-kernel-*.test.ts`——`EngineKernel.tick()` 跑通 P3 闭环 + 同输入双跑 stateHash 相等（确定性铁证）。
- **P2**：多帧 stateHash 复现测试；真值表入 `tests/truth/`。
- **P3**：`npm run dev` + playwright 导航 5173，截图 + console 0 error，手动验手感闭环可玩；`npm run browser:smoke`。
- **P4**：playwright 截图确认 VFX/震屏可见；`F2` tick cost overlay 不升。
- **P5**：`tests/truth/` 6 个全绿 + `npm run analyze` 8-gate 通过 + `src/combat/` 已移除（`git status`）。

**贯穿**：每阶段末 `npm run consistency`（4-way drift 扫描）——新加系统/文档 claim 时同步加 truth 实测点，防 maturity drift（exists≠wired≠接入）。

---

## 不在本路线图范围
- 任务级拆解（用户明确只要高层；每阶段开工前用 `/plan` 或 writing-plans 细化）。
- 02-Net/RPC（PvE 单机 OOS）。
- 多职业 / 副本 / 技能树扩展（Stage 4 候选，engine 主线稳定后另议）。
- berserker 5 个残留文件去留 / 已删项恢复（独立小决策，与本路线图解耦）。
