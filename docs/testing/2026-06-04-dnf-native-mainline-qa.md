# dnf-native 新主线质检报告

> **质检视角**：以 dnf-native 为**新主线**审查三大支柱 —— 真值系统 + 新引擎（`src/engine/`）+ 自底向上反推架构。
> 旧报告 `2026-06-03-full-qa-report.md` 用"src/combat 现役 / engine 孤岛"的错误框架，已置顶更正；**本报告是修正后的正确视角**。

| 项 | 值 |
|----|----|
| 日期 | 2026-06-04 |
| 分支 | `dnf-native`（新主线） |
| 三大支柱 | ① 真值系统（PVF→shard→engine） ② 新引擎 `src/engine/`（目标架构） ③ 自底向上反推 |
| 定位 | `src/engine/` = 新目标架构（骨架成、待 wire）；`src/combat/` = 待替换旧实现（4733 行，运行时在用） |
| 方法 | 3× opus subagent 并行（引擎健康/真值贯通/迁移完成度）+ 主线交叉核查 |

---

## 〇、总评 —— 新主线真实画像

**一句话**：新主线的**地基扎实、方向正确，但主体未建**。三支柱里「真值系统」已满血贯通到 shard 层、「新引擎」确定性纯净且 14 系统纯逻辑核基本就位，但两者之间 + 引擎到运行时的**最后连接全断**——engine 是一套 test-only 的目标态骨架，离"能跑游戏"还有约 75% 的路（主要是 orchestrator/事件总线/运行时 Actor/手感/replay 全缺）。

**这不是坏消息**：新架构的「难且对」的部分（真值提取链、确定性内核、干净 FSM、shard 加载器）已经做对了；缺的是「多但已知」的编排与适配层。**当前最该做的不是修 bug，是建 EngineKernel orchestrator 把零件串起来**——在那之前 engine 连"被 CombatScene new 出来 tick 一帧不报错"都做不到。

**🔴 但有 1 个该立刻修的真 bug**：engine 重力 `-1800` 写错了（真值 `-1500`，差 20%，真值就在同仓库 `dnfPhysicsConstants.ts` 没接）——见支柱 2 R1。这是新引擎里唯一确凿的数值错误，且修复成本极低。

| 支柱 | 状态 | 一句话 |
|------|------|--------|
| ① 新引擎内核 | 🟢 健康（确定性纯净 + 14 系统纯逻辑就位） | Math.random/Date.now **0 命中**；细节见支柱 1 |
| ② 真值系统 | 🟡 PVF→shard 满血，shard→engine 写对但孤儿，运行时跑硬编码 | 含 R1 重力 bug + sha256 校验未接 |
| ③ 迁移完成度 | 🟠 ~25%，orchestrator/总线/手感全缺 | 不是"最后一公里"，是"主体未建" |

---

## 一、主线交叉核查（已确认硬结论）

- ✅ **engine 确定性纯净**：`Math.random` / `Date.now` / `performance.now` 在 `src/engine/` 内 **0 命中** —— 确定性铁律守得干净，靠纯函数 + 固定步长，不引入随机源。
- ℹ️ **FNV-1a PRNG 现状**：`Fnv1aPrng`（offset basis 2166136261，实现正确）**仅在 `sim-worker.ts`**，为未来 replay 预留；14 个核心系统是纯确定性逻辑、本就不需随机。所以"FNV-1a 替代随机"应精确表述为"engine 未引入随机，PRNG 是 worker 化的预留"。
- ✅ **14 系统规模合理**：21~152 行，无 0 行空文件（DamageFormula 21 行最短=简版公式，ShardLoader 152 行最长=数据入口）。
- ✅ **typecheck status 0**。
- ⚠️ **唯一未完成标记**：`sim-worker.ts` 2 个 TODO（T3.2 feed input into StateMachine / T3.3 init Actor from shard）—— worker 化未接完。

---

## 二、三支柱深度质检（opus agent 进行中）

### 支柱 1 · 新引擎内核健康度 ✅ 已完成（与支柱 3 互证）

**结论：系统层 ~90% 完整且真值校验过，组装层 ~20%（仅核心伤害链通过测试成链）。** 两个独立 opus agent（支柱 1+3）从不同角度得出一致结论：engine 系统做得扎实，缺的是中央编排。

**✅ 确定性地基健康**：`Math.random`/`Date.now`/`performance.now`/`new Date` 在 engine 内全 0 命中；时间一律由调用方传 `deltaMs`/`nowMs`。GameLoop 累加器模式干净。
- ⚠️ 精确化：`Fnv1aPrng`（sim-worker.ts:30）seed 用 FNV offset basis（2166136261）混入，但 `next()` 主体是 xorshift-multiply finalizer，**不是严格逐字节 FNV-1a**——命名略宽松，但确是确定性整数哈希 PRNG，无随机源。
- ⚠️ 确定性"整机"未拼：GameLoop（累加器）、Fnv1aPrng、14 系统**三者尚未接线**；sim-worker 的 tick 由 `setInterval`（**墙钟**，非 GameLoop 累加器）推进且是占位。

**✅ 14/14 系统全真实现，0 空 stub**（agent 逐个 Read 确认）：
| 系统 | 完整度 | | 系统 | 完整度 |
|------|--------|--|------|--------|
| ActorStateMachine（9 态+优先级 guard） | 完整 | | AirbornePhysicsSystem | 完整 |
| HitDetection（2.5D AABB+facing） | 完整 | | ComboCorrection（60px 吸附） | 完整 |
| ReactionResolver | 完整（简化系数） | | SkillResource | 完整 |
| DamageFormula | 完整（标量，crit/element 暂常量） | | StatusEffectSystem | 完整 |
| Actor（shard→stat→FSM 装配） | 完整 | | EnemyAI（阈值 AI） | 完整 |
| AnimationPlayer（帧游标+FrameEvent） | 完整 | | InputCommand（SOCD+指令序列） | 完整 |
| | | | ShardLoader | 完整 |

多数系统测试直接打 `verification/baseline-shards/` 真值数据（swordman/goblin），非合成 fixture。"简化"（crit/element/hitstun 用常量或 local_baseline）是刻意的 Stage 2 scope 取舍，非未实现。

**接线现状：核心伤害链成链，外围全孤岛**（与支柱 3 互证）：
- ✅ **已成链**（`combat-pipeline.test.ts`，真共享状态）：`shard → Actor → calcPhysicalDamage → applyHitReaction(改 hp+驱动 fsm) → tickReaction(FSM 回 IDLE/DEAD)`，打到 goblin 死亡。EnemyAI→fsm、Reaction→fsm 也是真链接。
- 🚩 **断裂的接线**（各自 isolated 测试）：AnimationPlayer→HitDetection（帧 box 没喂判定）/ HitDetection→ReactionResolver（HitResult 没接 reaction）/ InputCommand→Actor（skillId 无人消费）/ AirbornePhysics→FSM（落地不触发）/ ComboCorrection→HitDetection（吸附坐标不回灌）/ sim-worker→14 系统（worker 空壳）。

### 卫生问题（已亲核，低优先但应清理）
- 🟡 **ShardLoader.js + .ts 双双入库**：`git ls-files` 确认 `src/engine/loader/` 下 `.js`（编译产物）和 `.ts` 都被追踪（其余 engine 文件只有 `.ts`），`.gitignore` 无对应规则 → 编译产物污染源码树，建议 gitignore `src/engine/**/*.js` 并 `git rm --cached` 该 .js。
- 🟡 **Actor.ts:90 内嵌 console.log**：`[Actor:${id}] tick=... from→to` 状态转换调试钩，每次转换刷日志。engine 内仅此 1 处。

### 支柱 2 · 真值系统贯通度 ✅ 已完成（含 1 个真 bug，已亲核）

**结论：PVF→shard 满血贯通且溯源完整；shard→engine 取数逻辑写对了但是孤儿（仅 test 覆盖）；engine 运行时实际跑的是硬编码常量，其中重力值错误。**

**🔴 R1（已亲核确认）· engine 重力硬编码错误 + 绕过真值**
- `src/engine/core/AirbornePhysicsSystem.ts:8` 写死 `GRAVITY = -1800`，但真值 `src/data/official/dnfPhysicsConstants.ts:9` `defaultGravityAccel: -1500`（PVF `/sqr/dnf_enum_header.nut` 提取）。
- **比真值大 20%，且真值就在同仓库未接**。这是新引擎里确凿的数值错误。修复=改用 `defaultGravityAccel` 常量。

**🟠 R2 · goblin 怪物基底 HP 硬编码（真值缺口，但标注不合规）**
- `Actor.ts:45-51` `GOBLIN_BASE` hp70/atk10/def5 写死为基底，shard 只提供乘数。根因是 DNF .mob 不存绝对 HP（真值缺口，PVF 拿不到），但**只有代码注释、未走铁律要求的结构化 `sourceType:"local_baseline"` + `requiresManualVerification:true`**。

**🟡 R3/R4 · 其余硬编码常量**
- ReactionResolver.ts:17 `DEFAULT_HITSTUN_MS=600` ✅ 合规（标 local_baseline + 留 override 入口）
- DamageFormula.ts:15 `MITIGATION_K=200` ⚠️ 无显式 local_baseline 标记，来源含糊

**🟠 ShardLoader 两个加固缺口（已亲核）**
- **声明 sha256 校验，实际从不比对**：line 11 注释「Manifest 提供 sha256 校验」+ line 22 `sha256` 字段，但全文件**无 createHash/digest/verify** —— 溯源完整性最后一道闸门没接（成熟度 echo 漂移）。
- 不校验 sourceType/tier3：加载期对未验证字段无告警，置信度分级透明穿透。

**真值链分段结论**：
| 段 | 状态 | 证据 |
|----|------|------|
| PVF → shard | ✅ 满血贯通 | swordman.json 3644 provenance 块 / 157 tier3 标记；goblin abilityCategory 带 sourceRef |
| shard → engine（逻辑） | ✅ 取数正确 | `statsFromPlayerShard` 按 key 路径精确取，无硬编码兜底 |
| engine → 运行时 | 🚩 断裂 | ShardLoader/calcPhysicalDamage/tickAirborne 调用方**全是 test**；运行时实际跑硬编码常量 |

**额外语义注记**：player `moveSpeed.value=850` 单位是 `%xSPEED_VALUE_DEFAULT`，engine 直接塞进 `ActorStats.moveSpeed` 未经 `xNormalMoveVelocity=143` 换算（值真但语义未转换，850≠px/s）。

### 支柱 3 · 迁移完成度 ✅ 已完成（修正"最后一公里"判断，已亲核）

**核心结论（修正）：迁移完成度约 25%，不是"最后一公里"，更像"地基已浇、主体未建"。** engine 复刻了若干"是什么"层纯逻辑核（FSM/物理/伤害/命中），但 combat 的"怎么编排 + 怎么喂运行时"层覆盖 ≈0%。

**🔴 最大缺口（已亲核）· engine 没有 orchestrator**
- `GameLoop.ts` 有 `tick()` 但它只是**调用 `this.kernel.tick()` 的循环外壳**，`kernel` 是它依赖的接口——engine 里**没有任何 class 实现这个 kernel** 来串联 14 系统。combat 侧对应物是 `CombatKernel`（688 行、编排 25 子系统、6 阶段 pipeline INPUT→LOGIC→DETECTION→RESOLVE→RECORD→FLUSH）。**14 系统现在是散装零件，没有心脏把它们按确定性顺序串成一帧。**

**能力对齐概览**（engine 14 文件 vs combat 47 文件）：
| 层 | engine 覆盖 combat |
|----|----|
| "是什么"纯逻辑核（FSM/物理/命中/伤害公式） | ~25-30% |
| Orchestrator（EngineKernel） | **0%** |
| 事件总线（CombatScene 全部音效/VFX/震屏/伤害数字挂 bus.on） | **0%** |
| 运行时 Actor（engine 7 字段 vs combat 36 字段：缺 velocity/z 轴/handfeel/buffs/action） | ~20% |
| 手感/Replay/Buff（HitStop/Recoil/ReplayRecorder/BuffLifecycle） | **0%** |
| worker 仿真 | ~20% |

**engine 局部领先 combat 的件**：`ShardLoader`（combat 用静态 default.json，engine 有真正的 shard 加载器）、`AnimationPlayer`（独立帧逻辑）。

**🟠 sim-worker worker 化 ≈20%**：host 层接口完整可用；worker 本体有消息协议 + FNV-1a PRNG + tick 循环，但 `tick()` 里 2 个 TODO（T3.2 输入丢弃不喂状态机 / T3.3 不创建 Actor），snapshot 永远发空 `entities:[]`。有专门守护测试 `four-way-consistency-sim-worker-stubs.test.ts` 断言 TODO≥2 防偷删。**worker 没 import 任何 kernel（engine 或 combat），是骨架+协议、零仿真。**

**🔴 CombatScene 切换难度高（已亲核）**：`CombatScene.ts:125-126` `new CombatKernel({enableReplay:true})` + `new FixedStepSimulation(kernel)`，且 6+ 处 `kernel.bus.on(...)` 订阅 7 类事件（ReactionApplied/HitConfirmed/DamageNumberRequested/GrabAttached/VfxRequested/...）。深字段宽接口耦合。

**切换前置清单（按依赖顺序，供路线图）**：
| 优先级 | 前置项 | engine 现状 |
|--------|--------|------------|
| P0-1 | 建 **EngineKernel orchestrator**（tick + actors + 子系统编排） | 缺（最大工作量） |
| P0-2 | engine **事件总线** + 7 类事件 | 缺 |
| P0-3 | 扩 engine **Actor**（+position:Vec3 含 z / velocity / handfeel / buffs / reactionState / currentAction，约 +29 字段） | 缺 |
| P0-4 | `debugSnapshot()` 等价物（驱动每帧渲染同步） | 缺 |
| P1 | 输入运行时壳 / requestAction+FrameDataAction / reaction 手感件 / scenario | 部分~缺 |
| P2 | Replay 接口 / buffs+status 运行时 / TouchControls·DebugLayer·Camera 适配 | 缺 |

**路线建议（供决策，非任务范围）**：当前 engine 与 combat 是两套不兼容架构（不同 Actor / 有无总线）。最现实路径不是"原地替换"，而是先建 P0-1/P0-2/P0-3 让 engine 能产出 combat 形状的 debugSnapshot，再写 CombatScene 适配层并行验证，最后切 `main.ts`。

---

## 三、行动优先级清单（收敛三支柱 findings）

### 🔴 立即可做（低成本高价值，纯修复）
| # | 事项 | 证据 | 成本 |
|---|------|------|------|
| A1 | engine 重力 -1800 改用真值 -1500（接 `dnfPhysicsConstants.defaultGravityAccel`） | 支柱2 R1，AirbornePhysicsSystem.ts:8 | 1 行 |
| A2 | 删 Actor.ts:90 console.log 调试钩 | 支柱1 卫生 | 1 行 |
| A3 | gitignore `src/engine/**/*.js` + `git rm --cached ShardLoader.js` | 支柱1 卫生 | 2 步 |
| A4 | goblin GOBLIN_BASE 补结构化 `sourceType:local_baseline`+`requiresManualVerification` 标注 | 支柱2 R2 | 标注 |

### 🟠 迁移主线（建主体，需规划，建议 /plan）
| # | 事项 | 为什么是它 |
|---|------|------------|
| B1 | **建 EngineKernel orchestrator**（per-tick 串 Input→AI→FSM→Anim→HitDetect→Damage→Reaction→Physics） | 最大缺口；14 系统现在只在 test 里临时拼。这是从"骨架"到"能 tick 一帧"的关键 |
| B2 | **建 engine 事件总线** + CombatScene 依赖的 7 类事件 | 所有渲染/音效/VFX 反馈的接口 |
| B3 | **扩 engine Actor**（+velocity/z/handfeel/buffs/reactionState/currentAction，约 +29 字段） | CombatScene syncActors 逐字段读 |
| B4 | 接断裂的 6 处系统接线（Anim→HitDetect→Reaction 等） | 让单元系统真正成战斗链 |
| B5 | sim-worker 实装（T3.2/T3.3 + 改用 GameLoop 累加器替 setInterval） | worker 化从 20% 推进 |

### 🟡 加固（迁移中后期）
- ShardLoader 接 sha256 校验（当前声明未实现）+ tier3 加载期告警
- DamageFormula MITIGATION_K 补 local_baseline 标注
- moveSpeed 语义换算（850%xSPEED → px/s，过 xNormalMoveVelocity=143）

**核心判断**：A 组今天就能清；真正的主线是 B1-B3（orchestrator+总线+Actor），这三件落地后 engine 才能被 CombatScene new 出来 tick。建议 B 组走 /plan 正式规划。
