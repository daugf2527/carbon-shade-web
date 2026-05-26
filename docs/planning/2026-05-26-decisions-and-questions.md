# 2026-05-26 决策记录 + 待定问题

> 今天全天讨论的产出。分为两部分：已达成共识需落盘的，和讨论过但未决定的。

---

## 一、已定论，需落盘

### 1. 明日 Windows 行动清单

```
□ .gitignore 加 !.claude/memory/ → commit → push
□ notify.mjs 加 process.platform === 'android' 分支（termux-notification）
□ git lfs push origin --all（Script.pvf + stage1-baseline.db）
□ 验证 13-system 结论：
    - dnf-extract --pvf Script.pvf --file dnf_enum_header.nut
    - dnf-extract --pvf Script.pvf --list --filter ".nut"
    - 抽样 grep 10-20 个 .nut 统计 sq_* 调用频次
    - 原始数据存 verification/
□ 扩 CURATED_FILES + 重跑 baseline（至少把 swordman 的 87+ atk、203 skl、14 ani 补全）
```

### 2. 方法论转换

- **自底向上代替自顶向下**：不依赖 13 system 框架去"设计"字段。直接从 baseline JSON 数据反推需要什么。数据本身比 agent 结论靠谱。
- **"数据库建模"概念纠正**：不是 SQLite 表结构设计，是 Runtime Data Format Design——仿真循环里每帧读什么、多大、什么布局。
- **游戏工程师双系统视角**：离线构建管线（Build Time）= 给仿真循环提供参数；在线仿真循环（Runtime, 60Hz）= 产品本身。
- **FlatBuffers 作为运行时格式**：JSON 是源格式（git diff 友好），编译成 FlatBuffers .bin 上线（零拷贝、零 GC）。

### 3. 已知但不可怕的缺口

- swordman 以外的 9 个职业 animation/attack/skill 为空 → **扩 CURATED_FILES 即可，零工作量**
- goblin 只有 1 种 → **同上**
- jungle 副本 maps/monsterRefs 为空 → **跨文件引用解析，小工作量**
- .nut/.img/.wav 有 parser 但未接入主管线 → **小工作量**

### 4. 需要真写代码的缺口

- .equ parser（67777 文件）— 装备系统数据
- .stk parser（10402 文件）— 技能树数据
- .ai/.aic parser — 怪物 AI 数据

---

## 二、讨论过但未决定

### Q1. 13-system 框架：用还是不用？

**现状**：源头 agent 原始报告丢失，"478 sq_* API → 13 system"结论无法验证。标注为 `agent_claim_unverified`。

**选项**：
- A：当工作假设用——13 system 作为 Phase 2 的组织框架，但不当真理
- B：完全搁置——等 Windows 上验证完 .nut 文件再决定
- C：自底向上重推导——从 swordman.json + goblin.json 的字段聚类重新分组

### Q2. Runtime Schema Design 什么时候做？

**现状**：task-breakdown.md 列 T1.1-T1.5 为最优先。但今天盘点完数据后，发现 swordman.json 已经够跑最小闭环。

**选项**：
- A：现在就做完整的 Runtime Schema Design（T1.1→T1.5 全套），做完再写引擎
- B：先用 swordman 现有 JSON 直接写 Simulation Core（T3.1），Schema 边做边迭代
- C：先扩 CURATED_FILES 拿到完整 swordman 数据，再做 Schema Design

### Q3. FlatBuffers 什么时候切？

**现状**：决定了用 FlatBuffers 作为运行时格式，但 Phase 2 首批代码可以用 JSON 快速验证。

**选项**：
- A：Phase 2 第一天就用 FlatBuffers（需先做 T1.4 .fbs schema + T2.1 编译器）
- B：Phase 2 前两周用 JSON 跑通闭环，验证没问题后再切 FlatBuffers
- C：JSON 一直用到性能瓶颈出现再切

### Q4. 参考角色：swordman 还是 berserker？

**现状**：swordman 数据最全（10 motion inline + 3 attack + 2 skill），berserker 更接近当前 master 分支的 actions/default.json。

**选项**：
- A：swordman — 数据完整，先跑通再扩展
- B：berserker — 保持与 master 分支的连贯性

### Q5. manifest 版本化策略

**现状**：dist/data/manifest.json 记录 path+sha256+size。没有 schema version。

**选项**：
- A：manifest 当唯一入口，不加额外的 schema-version.json
- B：每个 .bin 自带 version 字段，引擎启动时校验
- C：manifest 自身带 version + 每个 .bin 也带 version（双重保险）

### Q6. .aic 解析做到哪个阶段？

**现状**：怪物 AI 目前 FSM 9-state（EnemyAI.ts），不依赖 .aic。.aic 文件在 PVF 中存在但未被解析。

**选项**：
- A：Stage 2 就做 .aic parser + AI 迁移到数据驱动
- B：Stage 2 沿用 FSM 9-state，.aic 推到 Stage 3
- C：Stage 2 做 .aic parser 但不改 AI 逻辑（数据先入库）

### Q7. Web Worker 架构：Day 1 就分？

**现状**：game-engine-architecture.md 设计了 Logic Worker + Render Worker 分离。但实际开发可以先在一个线程里跑。

**选项**：
- A：Phase 2 第一天就建 Worker 骨架（T0.5 + T3.1 同步做）
- B：先单线程跑通 combat 闭环，性能不够再拆 Worker
- C：先单线程，但代码预留 Worker 边界（postMessage 接口提前定义）

### Q8. 确定性回放：Phase 2 就做？

**现状**：Deterministic Replay 需要 seeded PRNG + ordered iteration + state hash。会影响引擎架构设计。

**选项**：
- A：Phase 2 从第一天就要求确定性（所有 system 设计时考虑 determinism）
- B：Phase 2 先不做，Phase 3 加（但可能要大改）
- C：Phase 2 做"软确定性"——PRNG seeded 但不强制 state hash 验证

### Q9. CURATED_FILES 扩多大？

**现状**：当前 19 个文件。可以扩到全量（100K+）。

**选项**：
- A：最小扩展 — 先把 swordman 的数据补全（87 atk + 203 skl + 14 ani），够跑闭环
- B：中等扩展 — swordman 全量 + 3-5 怪物 + 2-3 副本 + 其余职业的 chr 引用
- C：全量 — 所有已支持类型的文件全提取（耗时但一劳永逸）

### Q10. equ/stk parser 优先级

**现状**：两个都没 parser。.equ 67777 个文件（最大量），.stk 10402 个。

**选项**：
- A：先 .equ（装备系统数据量最大，建模最复杂）
- B：先 .stk（技能树结构可能更简单，先练手）
- C：都不急，Phase 2 核心引擎跑通后再做

### Q11. Phase 1d P1 审计修复何时做？

**现状**：静态审计 14 个 P1 CONFIRMED 项只加了注释标注位置（commit `d0e8d30`），行为未改变。包括 spawn 无 timeout、manifest 非原子写、finishedAt 过早、增量 N+1 SELECT、成功/失败输出格式不一致等。

**选项**：
- A：Phase 2 开工前先修（阻断性——管线可靠性影响引擎开发）
- B：Phase 2 边做边修（不阻断，但可能踩坑）
- C：全部推到 backlog，Phase 3 再清理

### Q12. 跨文件引用解析何时做？

**现状**：dgn→map、dgn→monster、chr→atk→ani 引用链已识别但未展开。jungle 的 8 个 mapId 和怪物 ID 61727 留在原始字段，maps/monsterRefs 为空。

**选项**：
- A：Phase 2 前做完（副本系统数据就绪）
- B：先手动写死（jungle 配 goblin），引用解析 Phase 3 再做
- C：扩 CURATED_FILES 时顺手做 exporter 改造

### Q13. 文本/二进制类型何时接入主管线？

**现状**：NutExtractor（.nut 脚本）、ImgParser（.img 图片）已实现但未接入 parseStage 主管线。C++ 端输出 type="text"/"binary"，PvfDocumentLoader 没有对应的加载函数。

**选项**：
- A：Phase 2 前接入（.nut 脚本数据可能包含战斗逻辑洞见）
- B：Phase 3 再接入（当前不需要 .nut/.img 数据跑引擎核心）
- C：只接 .img（纹理管线需要），.nut 推迟

### Q14. 怪物 hpMax 计算修复何时做？

**现状**：goblin 的 abilityCategory 有百分比（hp max: 70%），但 hpMax 字段为 null。绝对 HP = baseHpReference × 70/100，baseHpReference 要么从 .chr 的 growth.hpMax 推，要么从 manifest 注入。

**选项**：
- A：Phase 2 前修（怪物 HP 是战斗核心数据）
- B：引擎运行时计算（Runtime 阶段读 abilityCategory + 查 baseHP 表）
- C：暂时手动设一个硬编码 HP 值

### Q15. 渲染层(Phaser 3)对接时机？

**现状**：当前渲染层在 master 分支（Phaser 3 + WebGL），dnf-native 分支目前只有数据管线。Phase 2 仿真循环跑在 Web Worker 里，需要渲染层消费仿真快照。

**选项**：
- A：Phase 2 同时搭渲染骨架（引擎 tick → 快照 → Phaser 画 sprite）
- B：Phase 2 先纯数据（console 输出 state），Phase 3 再接 Phaser
- C：Phase 2 用最小 Canvas 2D 验证视觉效果，Phase 3 换 Phaser

### Q16. Phase 2 引擎测试策略？

**现状**：Stage 1 有 static test（72 个，node:assert/strict）。Phase 2 的仿真循环怎么测——没有"正确答案"可以 assert。

**选项**：
- A：确定性回放作为测试框架（录 input + seed → replay → 逐帧 state hash 对比）
- B：集成测试（固定场景，手动验证数值范围）
- C：先不做自动化测试，console 输出 + 肉眼验证

### Q17. master 分支合并时机？

**现状**：master 已冻结（2026-05-21），dnf-native 分支领先 60+ 个 commit。两个分支差距越来越大。

**选项**：
- A：Phase 2 核心闭环跑通后合并（swordman 能出招打 goblin）
- B：Stage 3 完成后合并（完整游戏可玩）
- C：不合并，dnf-native 成为新的 master

### Q18. 已落盘的多个 MD 文件，谁来维护？

**现状**：今天产出了 5 个新 MD 文件（p1-p2-backlog、game-engine-architecture、task-breakdown、data-inventory、decisions-and-questions）。加上之前的规划文档，docs/planning/ 下有 15+ 个文件。

**选项**：
- A：定期清理合并——每周把过时文档归档，保留 3-5 个活跃文件
- B：只增不减——每个文件都是历史记录，不删
- C：设一个"当前活跃"索引（类似 MEMORY.md），过时文档不删但标记

---

## 三、补充：按讨论视角分组的遗漏问题

### Web 开发视角

### Q19. Phase 2 引擎代码的 TypeScript 编译模型？

**现状**：Stage 1 用一个 tsconfig.json + tsc --noEmit。引擎代码可能需要更严格（strictNullChecks/noUncheckedIndexedAccess/exactOptionalPropertyTypes），而且 Worker 代码需要独立的 tsconfig。

**选项**：
- A：跟 Stage 1 共用一个 tsconfig，不加额外限制
- B：引擎代码单独 tsconfig，全 strict 开启
- C：先不纠结，等代码量大了再分

### Q20. 如何桥接 dnf-native 引擎和 master 分支的 Phaser 渲染层？

**现状**：master 分支有完整的 Phaser 3 渲染（SpriteRenderer/Camera/Audio/UI），dnf-native 分支准备写仿真循环。两者还没对接。

**选项**：
- A：仿真 state snapshot → Phaser 消费。主线程读 Worker snapshot，调 Phaser API 画帧
- B：Phase 2 暂时脱离 Phaser，自己搭最小渲染（Canvas 2D 画方块），Phase 3 再接 Phaser
- C：直接从 dnf-native 分支引用 master 的 src/game/ 渲染代码

### 游戏工程师视角

### Q21. 仿真循环中 13 个 system 的执行顺序？

**现状**：game-engine-architecture.md 写了一个顺序（Input→StateMachine→Physics→HitDetect→Damage→Reaction→Resource→AI→Status→FrameEvent→Snapshot→Render），但这个顺序是拍脑袋的。DNF 有 STATE_PRIORITY 5 级仲裁，实际顺序可能不同。

**选项**：
- A：先用当前顺序实现，踩坑再调
- B：从 dnf_enum_header.nut 反推（.nut 调用顺序暗示了 system 依赖）
- C：参考已有格斗游戏引擎（GGPO/MUGEN 等）的标准顺序

### Q22. 数学精度策略？

**现状**：浏览器 JavaScript 只有 IEEE 754 float64，没有 fixed-point。确定性回放要求同一计算在不同 run 得到相同结果。

**选项**：
- A：依赖 JS float64 确定性（V8 下 Math 是确定的），用 epsilon 比较
- B：手写 fixed-point（所有战斗数值存为整数，除到最后一刻才转浮点）
- C：先用 float，Phase 3 replay 时再处理

### Q23. 动画时钟独立还是绑定物理 tick？

**现状**：DNF 有独立动画时钟（sq_SetAnimationSpeedRate），不与物理 tick 1:1 绑定。攻速影响动画播放速度（frame skip/加速）。

**选项**：
- A：1:1 绑定物理 tick（简单，每 tick 推进一帧 delay）
- B：独立动画时钟（DNF 做法，更复杂但更还原）
- C：先用 A 实现，后续切换 B

### Q24. Cancel 系统如何对接 State Machine？

**现状**：SklParser 已解析 cancelWindow（start/duration）+ cancelGroup + cancelWeaponMask。Stage 2 State Machine 需要消费这些数据来做优先级仲裁。

**选项**：
- A：State Machine 内置 cancel 规则引擎（cancel 作为状态转移的特例）
- B：Cancel 独立成一个子系统（类似 DNF 的 cancel passive skill 机制）
- C：先不做 cancel 系统，只做基本状态转移

### 数据提取视角

### Q25. C++ kRefExts 表要不要加 .equ/.stk？

**现状**：`main.cpp:332-334` 的 kRefExts 表只包含 9 种扩展名（.atk/.ani/.skl/.img/.mob/.chr/.dgn/.map/.etc），没有 .equ 和 .stk。即使写了 TS 端 parser，C++ 端也不会自动解析 .equ/.stk 的引用关系。

**选项**：
- A：写 parser 时同步加（C++ 和 TS 两边一起改）
- B：不加——.equ/.stk 不需要跨文件引用解析（它们是叶子数据）
- C：先在 Windows 上实测 .equ/.stk 文件内容，再决定

### Q26. .equ/.stk 文件在 PVF 里的实际类型是什么？

**现状**：C++ 提取器根据 PVF 内部二进制结构判断类型（Document/Animation/Text/Binary），不是根据扩展名。.equ/.stk 可能不是 type:"document"，甚至可能跟 .skl/.mob 的格式不同。

**选项**：
- A：明天 Windows 上 `dnf-extract --file <一个.equ路径>` 实测输出类型
- B：假设是 type:"document"（与 .skl/.mob 同类），先写 parser

### Q27. Exporter inline 机制要不要改成自动？

**现状**：当前 exporter 需要手动传入 aniDefs/atkDefs 才会 inline 到 shard。swordman 之外的 9 个职业全空就是因为没传。

**选项**：
- A：改成自动——exporter 自动追踪 chr.attackInfo/motionRefs 引用的文件并展开
- B：保持手动——baseline 脚本负责收集引用并传入
- C：半自动——exporter 自动追踪，但通过 option 控制深度

### 管线/流程视角

### Q28. /closed-loop 工作流在 Phase 2 还适用吗？

**现状**：/closed-loop 是 9 步 audit→core-review→fix→fix-verify→gate→commit 闭环，为 Stage 1 数据管线设计。Phase 2 是引擎代码，同样的流程是否有效？

**选项**：
- A：延续使用——引擎代码更需要 audit
- B：简化——Phase 2 快速迭代，不需要全套 9 步
- C：改造——针对引擎代码定制新的 closed-loop 流程

### Q29. Verification gates 需要为引擎代码加什么？

**现状**：当前 gates：typecheck → static:test（72 tests）→ build → analyze（8 gates）。引擎代码没有对应的 gate。

**选项**：
- A：加 simulation test gate（确定性的仿真快照对比测试）
- B：加 frame budget gate（性能回归检测——tick 不能超过 xx ms）
- C：先用现有 gates，不加新 gate

### Q30. Agent 驱动的开发流程在 Phase 2 继续吗？

**现状**：Stage 1 大量使用 Agent 做 audit/parse/verify。Phase 2 的核心工作是写仿真循环代码，Agent 适配性不同。

**选项**：
- A：继续——Agent 做 code review / system audit / integration test
- B：减少——引擎核心逻辑复杂，主要由人写，Agent 只做辅助检查
- C：暂停——Phase 2 先人写，Phase 3 再引入 Agent 审计

### 系统划分视角

### Q31. "最小闭环"的精确定义？

**现状**：多次提到"swordman 出招打 goblin 的完整闭环"，但没有精确定义哪些 system 算"闭环完成"。

**选项**：
- A：Animation + HitDetection + DamageFormula → 一个 atk 命中，算出一个伤害数字
- B：上述 + Reaction + Resource → 被打了有受击动画，HP/MP 扣减
- C：上述 + MonsterAI + Physics → 怪物会追人，角色能跳，能打到移动中的怪物

### Q32. 哪些 Phase 2 系统必须集成测试，哪些可以独立开发？

**现状**：task-breakdown.md 说 12 个系统"可以并行开发"，但实际上有些系统之间有紧密的数据耦合。

**选项**：
- A：Animation+HitDetection+FrameEventBus 捆绑测试（帧事件驱动命中判定）
- B：Damage+Reaction 捆绑测试（伤害值决定受击反应类型）
- C：所有系统独立单元测试，集成测试最后做

---

*2026-05-26 全天讨论，从 5 个视角逐条回忆。共 32 个待定问题。*
