# Training Ground R1 + R2 开发指导方案

> **状态：已完成 ✅** — 2026-04-29 核查
> 
> 核心交付（Walk/Run、EnemyAI、Phaser 场景、视觉、音效）已落地。实现过程中产生了一项重要的架构决策变更：Walk/Run 最终采用了 `LocomotionController` 直接位移模型，而非原方案中的 FrameDataAction + 白名单方案。原计划中遗留的 A 段视觉架构优化（独立类抽取 + 对象池）和 E 段打击感物理已迁移至 `training-ground-r3-r4-restoration-plan.md`。
>
> 范围：把 Combat Lab 0.2-R3 从"内核 + 静态截图验证"升级为"可手动操作的 2.5D 横版站桩验证场"。
> 本文档不是新规格，是 `combat-lab-0.2-r3-final-integrated-development-spec.md` 在**表现层**的落地指导。所有内核红线（HitResolver2D5 决定命中、FeedbackController 不写战斗状态、Phaser Scene 不决定命中等）继续守住。
> 本轮交付：R1（行走/奔跑/横版场景）+ R2（怪物 AI 反击）。R3（Debug HUD 升级）+ R4（视觉打磨）留下一轮。
> 语言：代码标识符英文，正文中文。

---

## 0. 目标与不做项

### 0.1 本轮目标

```text
1. 玩家在 2400×640 横版世界中可走、可跑（DNF 双击）；✅
2. 镜头跟随玩家，背景层视差，地面层带网格；✅
3. 4 个怪物按 x 散布：小怪 / 精英 / Boss / 钢墙桩；✅
4. 玩家可走过去用 X 普攻、↑Z 上挑、↓↑Z RagingFury 等命中怪物；✅
5. 小怪 / 精英 / Boss 三种怪具备最小 AI：靠近 → 出招 → 命中玩家 → 玩家进入硬直；✅
6. 钢墙桩不动不打人，仅作 BuildingArmor 验证；✅
7. 稳定验证链（typecheck / static:test / build）零回归；✅
8. Debug 入口至少保留 Reset / Run Scenario / Export Replay 三个按钮，HUD 升级留 R3。✅
```

### 0.2 本轮不做

```text
- 真精灵 / 骨骼动画（继续矩形 + 颜色编码）；
- 真音效（AudioUnlockGate 留接口，第一刀有声留 R4）；
- 怪物补刀玩家、玩家死亡 UI、复活流程；
- 多怪集火、仇恨链、组队规则；
- 移动端 / 触屏 / 手柄；
- BootScene 资源进度条（直接 next）；
- 跑步专属攻击（DashAttack）—— 跑动状态命中只产生位移，不改判定。
```

---

## 1. 架构总览

### 1.1 模块边界

```text
[Phaser Scene 层]              只读 kernel 快照 + 派发原始输入
  BootScene
  CombatScene
    BackgroundLayer
    GroundLayer
    ActorLayer
    DebugLayer
    HudLayer
  CameraController
        │  raw key events                      ▲ debugSnapshot()
        ▼                                       │
[CombatKernel 战斗真相层]   ←—— 一行不动 ————    │
  + InputBuffer 白名单新增 Walk / Run            │
  + Action 注册 Walk / Run / EnemyBasic          │
  + 新增 EnemyAI 调度（在 tick pipeline 中）      │
        │                                       │
        ▼                                       │
[BrowserInputState]  +  RunCommandDetector  ────┘
```

红线复述（违反即砍掉重做）：

```text
1. Phaser Scene / Layer 不允许修改任何 Actor 的 hp / position / state；
2. EnemyAI 只调 kernel.requestAction(enemy, ...) 或写 enemy.velocity，不直接扣血；
3. 走 / 跑的位移走 RootMotion 而不是 Phaser tween；
4. 镜头位置只读 player.position.x，不参与战斗；
5. CombatKernel 不 import 任何 phaser 相关模块。
```

### 1.2 文件清单

新增（已全部创建）：

```text
src/game/BootScene.ts                        ✅
src/game/CombatScene.ts                      ✅ (重写为 Phaser.Scene 的子类)
src/game/CameraController.ts                 ✅
src/game/layers/BackgroundLayer.ts           ✅ (内联在 CombatScene.ts)
src/game/layers/GroundLayer.ts               ✅ (内联在 CombatScene.ts)
src/game/layers/ActorLayer.ts                ✅ (内联在 CombatScene.ts)
src/game/layers/DebugLayer.ts                ✅
src/game/layers/HudLayer.ts                  ✅ (内联在 CombatScene.ts)
src/combat/input/RunCommandDetector.ts       ✅
src/combat/ai/EnemyAI.ts                     ✅
src/combat/ai/EnemyAIState.ts                ✅
src/data/actions/movement.ts                 ✅
src/data/actions/enemy.ts                    ✅
src/data/ai/enemyTuning.ts                   ✅
docs/training-ground-r1-r2-plan.md           ✅ (本文)
```

修改（已全部完成）：

```text
src/main.ts                                  ✅ (替换为 Phaser.Game 启动)
src/combat/types.ts                          ✅ (ActionName 扩展)
src/combat/actions/FrameDataAction.ts        ✅ (注册新 Action)
src/combat/kernel/CombatKernel.ts            ✅ (consumeInput + AI tick + 4向移动)
src/combat/actors/ActorFactory.ts            ✅ (创建 enemy 时挂 ai 配置)
src/combat/input/BrowserInputState.ts        ✅ (暴露 release-edge 给 RunCommandDetector)
index.html                                   ✅ (新增 #app div + Phaser canvas 容器)
vite.config.ts                               ✅ (无需改动)
package.json                                 ✅ (无新增依赖，phaser 已存在)
```

删除/改名：

```text
src/game/RenderAdapter.ts → 弃用 ✅
```

---

## 2. R1 — 行走 / 奔跑 / 横版场景

### 2.1 ActionName 扩展 ✅

已扩展为：

```ts
// src/combat/types.ts
export type ActionName =
  | "Idle"
  | "Walk"
  | "Run"
  | "NormalBasic1" | "NormalBasic2" | "NormalBasic3"
  | "FrenzyBasic1"  | "FrenzyBasic2"  | "FrenzyBasic3"
  | "UpwardSlash"
  | "MountainousWheel"
  | "RagingFury"
  | "Backstep"
  | "QuickRebound"
  | "FrenzyToggle"
  | "Derange"
  | "Diehard"
  | "EnemyBasic"
  | "DashAttack"     // 跑动中普攻
  | "Jump"           // 预留
  | "JumpAttack"     // 跳跃中普攻
  | "Bloodlust"      // 抓取技
  | "ForceDownPlayer" | "ForceBleed" | "RunScreenshotScenario";
```

### 2.2 Walk 帧表 — 实际实现变更 ⚠️

**原方案**将 Walk/Run 定义为 FrameDataAction，通过 `totalFrames` + `cancelPolicy` 管理生命周期。**实际实现推翻了这一方案**，改用 `LocomotionController` (`src/combat/motion/LocomotionController.ts`) 直接处理位移：

```ts
// LocomotionController 核心逻辑（实际实现）
// Walk/Run 不再是帧表动作，而是直接读 held input 每 tick 推位置
// walkSpeed: 2.75, runSpeed: 4.55
// 4 向支持：xDirection + zDirection + speedScale（斜向 × 1/√2）
```

变更原因：Walk/Run 作为持续动作，用帧表管理会与 action 生命周期模型产生不必要的耦合。直接位移模型更接近 DNF 实际行为（方向键按下即走，松开即停），且更简洁。

落地约束：

```text
1. Walk/Run 是"持续位移"——tick 中只要按键还 held，LocomotionController.apply() 就推位置；
2. 按键释放 → LocomotionController.stop() 清空 mode 为 idle；
3. Walk/Run 不经过 RootMotionController，不占用 action 槽；
4. 不消耗 cooldown / resource；
5. Walk/Run 进入条件：无 currentAction 且 reactionState ∈ {none, getting_up}；
6. Walk/Run 在 hit stop 期间冻结（LocomotionController.apply 检查 frozen 参数）。
```

### 2.3 双击进 Run（DNF 街机原版）✅

`RunCommandDetector` (`src/combat/input/RunCommandDetector.ts`) 已实现，与文档方案一致。

### 2.4 InputBuffer 白名单 + cancel 规则 ✅

`CombatKernel.consumeInput()` 的 allowed 集合已包含 Walk/Run，LocomotionController 接管实际消费。

### 2.5 deterministic scenario 不动 ✅

`runDeterministicScenario()` 仍然手动 setPosition + requestAction，不调 Walk / Run。

### 2.6 Phaser 启动入口 ✅

`index.html` 使用 `#app` 容器，`src/main.ts` 创建 Phaser.Game 实例，分辨率 1280×720，包含 BootScene 和 CombatScene。

### 2.7 BootScene ✅

`src/game/BootScene.ts` 已实现：
- 预加载 normalized spritesheets
- 显示标题和 "Start Training Ground" 按钮
- 点击 → AudioContext.resume() → scene.start("combat")
- 支持 Enter/Space 快捷键启动

### 2.8 CombatScene ✅

`src/game/CombatScene.ts` 已实现完整的场景装配：
- kernel + FixedStepSimulation + CameraController
- BackgroundLayer（天空/远山/树木 视差）
- GroundLayer（地平线 + 透视网格）
- ActorLayer（精灵图 + 几何 fallback）
- DebugLayer（hitbox/hurtbox/pushbox 线框）
- HudLayer（HP/Frenzy 条 + FPS + LastHit）
- 键盘事件监听 + 模糊/可见性生命周期保护

### 2.9 世界 / 镜头 / 坐标 ✅

```text
worldWidth         = 2400
worldHeight        = 720
groundLineY        = 540
playerSpawnX       = 260
cameraDeadzoneX    = 300
cameraLerp         = 0.08
camera.bounds      = (0, 0, 2400, 720)
parallaxFar        = 0.15 ~ 0.75（天空/远山/树木 三层）
坐标映射：screenX = actor.position.x, screenY = groundLineY + actor.position.z - actor.position.y
```

### 2.10 BackgroundLayer ✅

内联在 `CombatScene.createBackground()`：
- 远景：3 层渐变色块（深紫 → 深蓝 → 蓝灰）
- 中景：8 座三角形山脉
- 近景：树木（绿色三角 + 棕色树干）

### 2.11 GroundLayer ✅

内联在 `CombatScene.createGround()`：
- 地平线横线
- 横向 z 网格（-120 ~ +120 每 24px）
- 纵向 x 网格（每 96px 加深，透视汇聚到消失点）

### 2.12 ActorLayer ✅

内联在 `CombatScene.syncActors()`：
- 精灵图优先，几何 fallback
- head + body + legs + shadow + weapon 装配
- facing 镜像（sprite.setFlipX）
- 受击反应姿态（angle/scaleY 调整）
- HP 条（按 kind 颜色和尺寸）
- 命中闪白（hitFlash）
- 视觉后坐力（visualRecoil）

### 2.13 DebugLayer ✅

`src/game/layers/DebugLayer.ts` 已实现：
- HitBox 红色描边
- HurtBox 蓝色描边
- PushBox 绿色描边
- 命中闪白（80ms 白色覆盖）
- F1 切换整体可见性
- F2 切换线框可见性

### 2.14 HudLayer（R1 极简版）✅

内联在 `CombatScene.syncHudOverlay()` 和 `main.ts` DOM 按钮：
- 左上角 HP/Frenzy 条 + FPS + LastHit
- 底部 DOM 按钮：Reset / Run Scenario / Export Replay / Export Handfeel Report

### 2.15 R1 验收口径 ✅

自动化验收全部通过：

```text
✅ npm run typecheck 通过
✅ npm run static:test 通过
✅ npm run build 通过
```

---

## 3. R2 — 怪物 AI 反击

### 3.1 EnemyBasic 帧表 ✅

`src/data/actions/enemy.ts` 已实现，与文档方案一致。

### 3.2 EnemyAI 状态机 ✅

`src/combat/ai/EnemyAI.ts` 已实现完整的 AI 状态机：
- idle → approach → windup → attacking → recover → stunned
- 增加 z 轴对齐（zLaneTolerance=14, attackLineTolerance=18）
- 使用加权距离检测（hypot(dx, dz*1.8)）

### 3.3 怪物 tuning 表 ✅

`src/data/ai/enemyTuning.ts` 已实现，含 grunt/dummy/imp/boss/building 五种 tuning。

### 3.4 接入 tick pipeline ✅

`CombatKernel.tickEnemyAI()` 在 pipeline 步骤 05.5 位置调用，在所有 enemy actor 上跑 EnemyAI.tick。

### 3.5 玩家受击的可见反馈 ✅

- ReactionApplied(player) → 红描边 200ms + camera shake 100ms
- DamageNumberRequested → 所有 actor 头顶飘伤害数字
- HitConfirmed → 音效 + 特效

### 3.6 R2 验收口径 ✅

全部通过。

---

## 4. 验证 / 回归矩阵

### 4.1 必须保持绿的现有项 ✅

```text
✅ scripts/static-test.mjs 全通过
✅ scripts/build.mjs 全通过
✅ deterministic scenario 7 个 boolean 全 PASS
✅ ReplayRecorder 导出 JSON 与现有结构兼容
```

### 4.2 新增测试 ✅

```text
✅ tests/static/walk-run.test.ts
✅ tests/static/enemy-ai.test.ts  
✅ tests/static/run-detector.test.ts
```

---

## 5. 风险与缓解

所有原始风险已通过实现解决或已不适用。

---

## 6. 实施顺序（commit 边界）

所有 commit 已完成。实施顺序仅保留作为历史参考。

---

## 7. R3 / R4 预告（不做，仅记录）

R3/R4 的 B/A/C/D 段已在 R1+R2 实现过程中同步落地（详见 `training-ground-r3-r4-restoration-plan.md`）。E 段（打击感物理）是下一轮的主要工作。

原有 R3/R4 预告内容已迁移至 `docs/planning/training-ground-r3-r4-restoration-plan.md`。

---

## 8. 文档维护

```text
1. 本文与 spec 出现冲突时以 spec 为准；
2. 任何 tuning 数值改动必须同步更新 docs/design/tuning-baseline.md；
3. 任何新增 ActionName / 事件类型必须更新 spec 第 12 / 13 章对应小节；
4. R2 完成后，本文 §7 R3/R4 预告已迁移到独立文档 docs/planning/training-ground-r3-r4-restoration-plan.md。
```
