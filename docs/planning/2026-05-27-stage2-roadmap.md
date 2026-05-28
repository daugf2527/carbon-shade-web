# Carbon Shade Stage 2 实施路线图

**日期**: 2026-05-27  
**状态**: Stage 1 / 1.5 完成，Stage 2 开工  
**参考文档**: game-engine-architecture / task-breakdown / stage1.5-revised-plan / resolved-decisions / audit-2026-05-27  
**决策前提**: Q1(B) 22-system 已验证（classify-v4: 22 classified + 1 unclassified bucket）/ Q2(C) 先扩数据再做 schema / Q4(A) 剑魂起步 / Q21(B) .nut 反推事件回调时序 / Q31(B) 最小闭环 = 命中→伤害→受击→HP

---

## 〇、全局约束

| 约束 | 内容 |
|------|------|
| 范围 | **PvE 打怪战斗 1:1 还原 DNF**。PvP/城镇/副本非战斗环节 OOS |
| 信源 | dnf-extract (C++) 唯一提取入口，三级置信度铁律 |
| 平台 | Web（Vite + TypeScript），Web Worker 分离仿真/渲染 |
| 帧率 | 仿真 60Hz 固定步长，渲染可变帧率 |
| 确定性 | 确定性 PRNG + ordered iteration，Replay 可复现 |
| 数据格式 | 运行时 FlatBuffers .bin（零拷贝），构建时 JSON shards（可 diff） |

---

## 一、技术难点与风险矩阵

### 🔴 游戏工程核心难点

| # | 难点 | 为什么难 | 影响范围 | 优先级 |
|---|------|---------|---------|--------|
| **G1** | **22-system 引擎→脚本回调时序** | DNF C++ tick 顺序不可达，.nut 只能反推事件 lifecycle。unclassified 28% unique / 仅 2.9% calls（long-tail）。顺序错 → 状态机竞争 → 行为诡异 | 全部战斗逻辑 | P0 |
| **G2** | **Fixed Timestep Accumulator** | 浏览器 RAF 不稳定（~16.67ms 但抖动大），需要 Gaffer on Games 累加器模式 + 渲染插值。做错 → 物理漂移 / 快慢不一致 | Simulation Core | P0 |
| **G3** | **逐帧碰撞事件时间线** | .ani 每帧有独立 atk[]/dmg[] box，要在帧边界精确发射/关闭碰撞事件。普通 .atk 没有 atk box → 需从攻击属性反推 | Hit Detection | P0 |
| **G4** | **Hitstun 硬编码缺失** | DNF 真实 hitstun/recoil/launch 曲线在 C++ 二进制里，PVF 拿不到。全部标 `local_baseline` + 手动调参 | Reaction System | P1 |
| **G5** | **FlatBuffers 零拷贝管线** | JSON → .fbs schema → flatc 编译 → .bin → Worker mmap。整条链没见过 — 任何一个环节出问题，运行时就要回退到 JSON.parse（GC 爆炸） | 离线编译器 | P0 |
| **G6** | **Web Worker 消息序列化** | 每 16.67ms 主线程↔Worker 交换 Input snapshot / State snapshot。结构化克隆开销必须 < 1ms，否则掉帧 | Simulation Core | P1 |
| **G7** | **49.8% 副本 mapId 过时** | jungle.dgn 75% 引用不存在的地图。Stage 2 必须切换 0% stale 副本，否则 Camera/地图渲染拿不到数据 | Dungeon/Map | P1 |

### 🟡 Web 平台特有难点

| # | 难点 | 影响 |
|---|------|------|
| **W1** | **IndexedDB 缓存策略** | COLD 数据（.bin）懒加载 → 缓存失效 → 离线可用性。做错 → 每次打开游戏加载 2.2MB swordman 数据 |
| **W2** | **GC 压力管理** | FlatBuffers 零拷贝读避免了 GC，但 Worker 中创建 JS 对象（state snapshot 每帧）仍会产生 GC。需要对象池 |
| **W3** | **Termux/Android 开发环境** | TypeScript LSP 和 ast-grep 都不支持 aarch64 Android。纯 grep + node 验证，迭代速度受影响 |

---

## 二、Phase 分解（6 个 Phase，预估 20-25 个工作日）

```
Phase 0: 基础设施 (1d)
    ↓
Phase 1: Runtime Schema (3-4d) ★ 最关键 — 决定后面一切
    ↓
Phase 2: 离线编译器 (2-3d)
    ↓
Phase 3: 最小闭环 (5-7d)  ← Q31/B 范围
    ↓
Phase 4: 扩展系统 (5-7d)  ← 剩余 8 个 system
    ↓
Phase 5: 打磨交付 (3d)
```

---

## Phase 0：基础设施补齐（1 天）

**目标**: 开发环境就绪，打通 LFS + flatc 工具链

| 任务 | 内容 | 验收 | 估时 |
|------|------|------|------|
| **T0.1** flatc CLI | 从 GitHub Release 下载 flatc 二进制到 `tools/` | `flatc --version` 输出正常 | 30min |
| **T0.2** LFS push | `git lfs push origin --all`（含 Script.pvf + baseline.db） | Termux 侧 `git lfs pull` 成功 | 30min |
| **T0.3** runtime shard loader | 写 `src/engine/loader/ShardLoader.ts`，从 dist/data/ 异步加载 JSON shards 给 Phase 3 用（FlatBuffers 就绪前 fallback） | `loadShard("players/swordman")` 返回 typed data | 2h |
| **T0.4** GameLoop 骨架 | 写 `src/engine/core/GameLoop.ts` — 固定步长累加器 + 渲染插值 | 60Hz tick loop 跑起来（空循环） | 2h |

**阻塞解除**: T0.1 + T0.3 是 Phase 1+2 的前置

---

## Phase 1：Runtime Schema Design（3-4 天） ★ 最关键

**目标**: 基于 classify-v4 的 22 system buckets，把每个系统从"聚类标签"变成精确的字段清单 + .fbs schema

### Phase 1a — 字段盘点（1 天）

| 任务 | 内容 | 验收 | 估时 |
|------|------|------|------|
| **T1.1** 22 system × 字段矩阵 | 把 classify-v4 的 22 个 bucket 每个的每帧 tick 需要读/写哪些字段列成表格 | 一张包含 22 行 × N 列的字段需求矩阵，含来源（chr/skl/atk/mob/ani） | 3h |
| **T1.2** 字段引用链建模 | 画 skl→atk→ani→img 和 chr→motion→ani→img 两条引用链的精确路径 | DAG 图 + JSON Pointer 路径表 | 2h |
| **T1.3** HOT/WARM/COLD 分层 | 按 game-engine-architecture.md 的分层标准，给每个字段标注层级 | 每个 .fbs table 的字段带层级注释 | 1h |

### Phase 1b — .fbs 补全（2-3 天）

| 任务 | 内容 | 验收 | 估时 |
|------|------|------|------|
| **T1.4** mob.fbs | 怪物运行时格式：abilityCategory / level / moveSpeed / hitRecovery / sightRange / animationRefs / attackInfo | 从 goblin.json 手工编译 + 验证通过 | 1h |
| **T1.5** ani.fbs | 逐帧动画格式：frame[] (sprite/delay/atkBox[]/dmgBox[]) + loop + anchor | 从 swordman .ani 手工编译 | 2h |
| **T1.6** dgn.fbs | 副本格式：roomGraph / mapRefs / monsterRefs / eventMonsters | 从 jungle.json 手工编译 | 1h |
| **T1.7** manifest.fbs | 内容清单：shard[] (path/hash/version) | 从 dist-manifest 手工编译 | 30min |
| **T1.8** flatc 代码生成 | 跑 `flatc --ts -o src/engine/schema/ src/engine/schema/*.fbs` 生成 TS 类型 | 所有 .fbs 都有对应的 `_generated.ts`，typecheck 通过 | 30min |

**阻塞解除**: Phase 1 完成 → Phase 2 可以开始

---

## Phase 2：离线编译器（2-3 天）

**目标**: JSON shards → FlatBuffers .bin 的编译链跑通

| 任务 | 内容 | 验收 | 估时 |
|------|------|------|------|
| **T2.1** compile-runtime-assets.mjs | 读 dist/data/ 的 JSON shards → flatc 序列化 → .bin 输出到 `public/assets/` | 所有 15 个 shard 都有对应的 .bin | 3h |
| **T2.2** ShardLoader 切到 FlatBuffers | 改 T0.3 的 ShardLoader，优先读 .bin（fallback JSON） | `.bin` 路径正确返回 FlatBuffer 对象 | 2h |
| **T2.3** Content manifest 生成 | 编译时生成 `manifest.bin`，含每个 shard 的 hash + version | manifest 含 15 个 entry，hash 与源 JSON 一致 | 1h |
| **T2.4** Vite 配置静态资源 | `vite.config.ts` 把 `public/assets/` 的 .bin 文件纳入构建 | `npm run build` 产出含 .bin 的 dist/ | 1h |

**里程碑 M1**: `npm run build` → 浏览器加载 swordman.bin → 零拷贝读 `chr.hpMax` → 控制台输出 `80` 🎯

---

## Phase 3：最小闭环 — 剑魂打哥布林（5-7 天）

**目标**: Q31/B 定义的闭环跑通：命中→伤害→受击→HP 扣减

### 3.1 Simulation Core（2 天）

| 任务 | 内容 | 验收 | 估时 |
|------|------|------|------|
| **T3.1** GameLoop 实装 | 补全 T0.4 的空循环：fixed-timestep accumulator + deterministic PRNG (FNV-1a seeded) + tick counter | console 输出 `tick=0,1,2...` 稳定 60Hz | 2h |
| **T3.2** StateMachine 骨架 | 9-state FSM：IDLE→READY→ATTACK→HIT→DOWN→DEAD + 转换条件接口 | 状态转换 log 输出 | 3h |
| **T3.3** Actor 实体管理 | swordman + goblin 各一个 Actor 实例，从 shard 读 chr/mob 数据初始化 | console 输出 actor stats | 2h |

### 3.2 Animation + Hit（2 天）

| 任务 | 内容 | 验收 | 估时 |
|------|------|------|------|
| **T3.4** AnimationPlayer | 从 swordman.animations 读取逐帧数据，按 delay 推进帧游标 | 按键盘 attack1 → swordman 走 attack1 .ani 帧序列 | 4h |
| **T3.5** FrameEventBus | 在 .ani 帧边界发射 atkBox/dmgBox 事件 | 攻击帧开始/结束有 log | 2h |
| **T3.6** AABB Hit Detection | port master 的 HitResolver2D5，接上 shard 的 atk[]/dmg[] box | 剑魂 attack1 .ani 的 atk box 与哥布林 dmg box 重叠 → 命中 log | 3h |

### 3.3 Damage + Reaction（2 天）

| 任务 | 内容 | 验收 | 估时 |
|------|------|------|------|
| **T3.7** DamageFormula | 从 AtkDef.damageBonus + ChrDef.growth.physicalAttack 计算伤害。元素/暴击/防御先用常量 | 打中哥布林 → 输出 damage 数字 | 3h |
| **T3.8** ReactionResolver | 命中后根据 AtkDef.liftUp/pushAside 推进 ReactionStateMachine。hitstun 用 local_baseline 值 | 伤害 → 击退 → 硬直 → 恢复 → 回到 IDLE | 4h |
| **T3.9** HP Resource | 伤害公式结果扣减 mob.hp，HP=0 进 DEAD | goblin HP 从 100% 被连续攻击扣到 0 | 1h |

**里程碑 M2**: 浏览器中按 attack1 → 剑魂播放攻击动画 → 命中哥布林 → 哥布林受击+击退+硬直+HP 扣减 🎯

---

## Phase 4：扩展系统（5-7 天）

**目标**: 剩余 8 个 system + 更多数据

### 4.1 战斗系统（3-4 天）

| 任务 | 内容 | 对接的 master 代码 |
|------|------|-------------------|
| **T4.1** Input Command | .skl `[command]` 按键序列解析（↓↘→ + Z → 上挑） | `SOCDCleaner` / `RunCommandDetector` |
| **T4.2** Skill Resource (CD/MP) | .skl coolTime / consumeMp / castingTime | `CooldownResourceKernel.ts` |
| **T4.3** Monster AI | threshold 检测 (sightRange/warlike) → FSM 转换（CHASE→ATTACK→RETREAT） | `EnemyAI.ts` |
| **T4.4** Status Effect | 冻伤/中毒/减速状态系统 | `StatusEffectSystem.ts` |
| **T4.5** Combo Correction | 连击位置修正（打击点→目标吸附） | `ComboCorrection.ts` |
| **T4.6** Airborne Physics | 重力积分 + launch velocity + landing | `AirbornePhysicsSystem.ts` |

### 4.2 数据扩展（2-3 天）

| 任务 | 内容 | 验收 |
|------|------|------|
| **T4.7** 3-5 怪物全量 | goblin + 投掷哥布林 + 牛头兵 + 1 boss + 1 精英 | 每种怪都有完整的 abilityCategory + animations + attacks |
| **T4.8** 切换 0% stale dgn | 从 stale mapId 扫描中选 mapId 全部存活的副本 | jungle → 新副本，Camera 有有效地图数据 |
| **T4.9** character/common/ 动画 | death/getup/quickstanding 11 职业共享动画提取 | 所有职业受伤倒地动画就绪 |

---

## Phase 5：打磨 + Replay + 性能（3 天）

| 任务 | 内容 | 验收 |
|------|------|------|
| **T5.1** Deterministic Replay | 录制 input sequence → 重放 → 相同 state hash | 10 次 replay 全部 hash 一致 |
| **T5.2** 帧预算管理 | console 输出每帧 tick/render 耗时 | combat tick < 10ms 持续稳定 |
| **T5.3** 最小可玩版本 | swordman 3 个 attack + 2 个 skill + 对上 3 种哥布林 + HP bar UI | 可以在浏览器里"打一场" |

**里程碑 M3**: 最小可玩版本 🎮

---

## 三、依赖关系总图

```
Phase 0 (1d)
├── T0.1 flatc ← 网络阻塞风险
├── T0.2 LFS
├── T0.3 ShardLoader
└── T0.4 GameLoop 骨架
     │
Phase 1 (3-4d) ★ 关键路径
├── T1.1 字段矩阵
│   └── T1.2 引用链 → T1.3 分层
│       └── T1.4 mob.fbs
│       └── T1.5 ani.fbs
│       └── T1.6 dgn.fbs
│       └── T1.7 manifest.fbs
│           └── T1.8 flatc codegen
│
Phase 2 (2-3d)
├── T2.1 JSON→.bin ← 依赖 T1.8 + T0.1
├── T2.2 ShardLoader 切 FlatBuffers
├── T2.3 manifest
└── T2.4 Vite config
     │
Phase 3 (5-7d) ← Q31/B 最小闭环
├── T3.1 GameLoop + PRNG
├── T3.2 StateMachine
├── T3.3 Actor → T3.4 Animation → T3.5 FrameEvent → T3.6 AABB
│                                           └── T3.7 Damage → T3.8 Reaction → T3.9 HP
│
Phase 4 (5-7d)
├── T4.1 Command → T4.2 CD/MP → T4.3 AI → T4.4 Status → T4.5 Combo → T4.6 Physics
├── T4.7 怪物 → T4.8 dgn → T4.9 common anims  (可并行 P1 data)
│
Phase 5 (3d)
├── T5.1 Replay → T5.2 帧预算 → T5.3 最小可玩版本
```

---

## 四、里程碑与时间线

| 里程碑 | 日期预估 | 验收标准 |
|--------|---------|---------|
| **M0** Phase 0 完成 | Day 1 | flatc 可用 + LFS 同步 + GameLoop 空循环 |
| **M1** Phase 1+2 完成 | Day 5-7 | .bin 在浏览器加载，零拷贝读 swordman.chr |
| **M2** 最小闭环 | Day 10-14 | 剑魂 attack1 → 命中 → 哥布林 HP 扣减 |
| **M3** 最小可玩版 | Day 20-25 | 多攻击+多怪物+HP bar UI，浏览器可打一场 |

---

## 五、本周可立即行动的（Day 1-3）

这 3 件事不依赖任何阻塞，现在就可以做：

1. **T0.4 GameLoop 骨架**（2h）— 固定步长累加器 + 空 tick 循环。验证 60Hz 在浏览器里的稳定性
2. **T1.1 22 system × 字段矩阵**（3h）— 把 classify-v4 的 22 个 bucket 翻译成精确的字段清单。这是所有后续 .fbs 设计的前提
3. **T0.1 flatc CLI**（30min 如果能下载）— 解决网络问题安装 flatc。如果仍然阻塞，Phase 2+3 的 ShardLoader 先走 JSON fallback 不卡进度

---

## 六、已知风险与缓解

| 风险 | 概率 | 缓解 |
|------|------|------|
| flatc 无法安装 | 中 | T0.3 ShardLoader 先走 JSON fallback，Phase 2 不需要 flatc 也能跑最小闭环 |
| 22-system 回调时序 .nut 推导不够（28% unique unclassified，仅 2.9% calls） | 中 | Phase 3 先用游戏引擎通用顺序（input→animation→hit→damage→reaction→resource→ai→status），Phase 4 再根据测试调整 |
| hitstun local_baseline 体验差 | 高 | 预留 Phase 4.5 调参窗口（1-2 天），对比 DFO 视频逐帧校准 |
| Termux 环境缺少 LSP/ast-grep | 中 | grep + node 手动验证可替代，但影响迭代速度。Windows 上做重活，Termux 做轻量编辑 |
| 多 agent 并行产出又出数字漂移 | 中 | 审计报告 P2-1~P2-3 → 建议以后数字要求标注测量方法 |

---

## 七、版本交付节奏

```
v0.4.0-dnf-alpha1  (M0) — 基础设施就绪，空循环
v0.4.0-dnf-alpha2  (M1) — .bin 加载，零拷贝验证
v0.4.0-dnf-alpha3  (M2) — 最小闭环，剑魂打哥布林
v0.5.0-dnf-beta1   (M3) — 最小可玩版本，3 攻击 + 2 技能 + 3 怪物
```
