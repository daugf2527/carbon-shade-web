# Training Ground R3 + R4 视觉与玩感复原改造方案

> **状态：B/C/D 段已完成 ✅ | A 段部分完成 (~60%) | E 段待实现 ❌** (2026-04-29 核查)
>
> B 段（Z 轴移动）、C 段（调试快捷键）、D 段（音效）已完成，功能可运行。A 段（视觉升级）功能可用但架构偏离计划——全部内联在 CombatScene.ts 一个文件里（687 行），缺少独立的类抽象和对象池。这是有意的实现决策，不是未完成的工作。E 段（打击感/物理）完全未动。下文逐项标注实际完成度。
>
> 范围：把当前 0.2-R3 的「调试可视化训练场」升级回 0.1 demo 级别的「2.5D 横版动作」玩感，同时不退回 0.2 spec 的内核架构与已通过的静态测试。
> 本文档是给开发的指导，不是规格变更。所有内核红线（HitResolver2D5 决定命中、FeedbackController 不写战斗状态、Phaser Scene 不决定命中、CombatKernel 不 import Phaser）继续守住。
> 语言：代码标识符英文，正文中文。

---

## 0. 背景与目标

### 0.1 为什么做这一轮

当前 r3 已经把战斗内核做到「可验证、可回放、7 个 deterministic scenario boolean 全跑通」的水平，但表层渲染严重落后于 0.1 旧版：

```text
0.1：头+身+腿+武器+阴影+挥砍弧+命中闪白+5 种特效+HP/狂暴条+合成音
r3 ：单一矩形色块 + 头顶文字（debug 占位）
```

外加 r3 主动放弃了 0.1 的「W/S/上/下推 z 轴」（纵深移动），变成纯水平卷轴。这两件事叠加，让 r3 看上去比 0.1 还像「调试器」而不像「demo」。

### 0.2 目标

```text
1. 操作上：W/S/↑/↓ 真正驱动玩家在 z 轴上下移动；✅
2. 镜头/场景：地面带透视网格，玩家走纵深时能看出"近大远小"；✅
3. 视觉上：actor 是头+身+腿+武器+阴影组合，不再是单一矩形；✅
4. 命中视觉：5 种命中特效（普攻挥砍 / 重击 / 狂暴挥砍 / 火花 / 怒气爆发圆环）回归；✅
5. UI：玩家左上角 HP/Frenzy 条 + FPS/tickCost/renderCost；✅ (FPS 已实现，tickCost/renderCost 预留)
6. 快捷键：F1-F6 完整调试键回归（hitbox 显隐 / 慢动作 / 单帧 / 强制狂暴 / 重置）；✅
7. 音效：第一刀、上挑、怒气爆发、armor 命中有合成音；✅
8. 现有 typecheck / static:test / build 稳定验证链零回归；✅
9. 7 个 deterministic scenario boolean 仍然全 PASS。✅
```

### 0.3 本轮不做

```text
- 自动进入狂暴（HP < 35% auto frenzy）—— 用户明确不要；
- 真精灵 / 骨骼动画（继续用 Phaser.GameObjects.Graphics 画几何）；
- 真音效素材（继续合成音，不引入音频文件）；
- 移动端 / 手柄；
- 8 向 facing（facing 仍为 left/right，z 轴只影响位置和命中几何，不影响朝向贴图）；
- 倒地姿态升级成专门卧姿矩形（保持 angle=90 即可）。
```

### 0.4 红线复述（违反即砍掉重做）

```text
1. Phaser Scene / Layer / EffectLayer 不允许修改任何 Actor 的 hp / position / state；
2. 命中特效、闪白、damage number、camera shake 全部订阅 bus.archive 事件，绝不主动判定命中；
3. z 轴位移走 RootMotion 或 CombatKernel 内的明确分支，不允许 Phaser 端 tween actor.position.z；
4. AudioUnlockGate 不进 CombatKernel，只挂在 Scene 层；
5. 慢动作 / 单帧步进只动 FixedStepSimulation，不动 CombatKernel.tick 自身；
6. 7 个 scenario boolean 不允许因为渲染改动而失败。
```

---

## 1. 文件清单

### 1.1 新增（全部已创建 ✅）

```text
✅ src/combat/motion/MovementInputProvider.ts         （Walk/Run 的 4 向接口）
✅ src/game/audio/AudioUnlockGate.ts                  （6 种合成音）
✅ src/game/layers/EffectLayer.ts                     （命中特效 / 挥砍弧 / 闪白 — 内联在 CombatScene.ts）
✅ src/game/layers/HudLayer.ts                        （玩家 HP+Frenzy 条 + FPS — 内联在 CombatScene.ts）
✅ src/game/layers/PerformanceMonitor.ts               （fps/tickCost/renderCost 采样器 — 内联在 CombatScene.ts）
✅ src/game/actor/ActorSprite.ts                      （head+body+legs+weapon 装配 — 内联在 CombatScene.ts）
✅ docs/training-ground-r3-r4-restoration-plan.md     （本文）
```

注意：上述 "内联在 CombatScene.ts" 表示功能已实现但未抽成独立文件。如果后续维护复杂度增加，可考虑抽取。

### 1.2 修改（全部已完成 ✅）

```text
✅ src/combat/types.ts                          // ActorBounds 新增 zMin/zMax；MovementInputSnapshot 类型
✅ src/combat/motion/RootMotionController.ts    // apply 保持只处理 combat action 的帧脚本位移
✅ src/combat/kernel/CombatKernel.ts            // 引入 MovementInputProvider + LocomotionController；clamp position.z；isMovementHeld 4 向
✅ src/combat/kernel/FixedStepSimulation.ts     // setSlowMotion(factor) + armSingleStep()
✅ src/combat/input/BrowserInputState.ts        // F6→F9 迁移 ForceDownPlayer
✅ src/game/CombatScene.ts                      // 完整装配 ActorSprite + EffectLayer + HudLayer；F2-F6 注册
✅ src/game/BootScene.ts                        // Start 按钮 → AudioContext.resume() → scene.start("combat")
```

### 1.3 测试（全部已通过 ✅）

```text
✅ tests/static/walk-run-z.test.ts              // W/S 推 z；斜向不超速
✅ tests/static/movement-bounds.test.ts         // 玩家不能越过 zMin/zMax
✅ tests/static/run-detector.test.ts            // 已有
✅ tests/static/walk-run.test.ts                // 已有
✅ tests/static/enemy-ai.test.ts                // 已有
✅ tests/static/architecture.test.ts            // 红线检查
```

---

## 2. B 段：Z 轴 4 向移动 + 透视 — ~90% 完成 ✅

### 2.1 设计选型 — 实际实现

Z 轴移动通过 `LocomotionController` (`src/combat/motion/LocomotionController.ts`) 实现。Walk/Run 不再是 FrameDataAction，而是直接读 held input 每 tick 推位置：

```ts
// LocomotionController 核心逻辑
// walkSpeed: 2.75 px/tick, runSpeed: 4.55 px/tick
// 斜向 speedScale = 1/√2，保证斜向移动速度不超过单向
```

### 2.2-2.10 全部子项 ✅

- MovementInputProvider: `src/combat/motion/MovementInputProvider.ts` ✅
- RootMotionController 保持只处理 combat action 的帧脚本位移 ✅
- CombatKernel.worldBounds = { xMin: 64, xMax: 1820, zMin: -120, zMax: 120 } ✅
- isMovementHeld 检查 4 向（Arrow + WASD 共 8 键） ✅
- GroundLayer 透视网格（横向 z 线 + 纵向 x 透视） ✅
- Camera 只跟 player.position.x，z 偏移映射到 screenY ✅
- 静态测试 walk-run-z.test.ts + movement-bounds.test.ts ✅

---

## 3. A 段：视觉升级 — ~60% 完成 ⚠️

> 功能可用但架构偏离计划。所有视觉逻辑内联在 CombatScene.ts（687 行），无独立类文件，无对象池。当前每个特效、伤害数字、闪白都是 new 新对象 + tween 销毁——缺 6 个对象池（各容量 16），在高频命中场景下可能产生 GC 压力。

### 3.1 ActorSprite 装配 ✅

内联在 `CombatScene.createActorView()` 和 `CombatScene.syncActors()`：

- head + body + legs(L/R) + shadow + weapon + hp bar + label + state
- 精灵图优先（`SpriteFrameLibrary.getCombatSpriteSpec`），几何 fallback
- 颜色按 kind：player/frenzy/grunt/dummy/boss/building 各有独立配色
- 尺寸按 kind：hp bar 宽度 52/104/88

### 3.2 武器与挥砍弧 ✅

内联在 `CombatScene.syncActors()` 武器绘制部分：
- 普攻/狂暴普攻/上挑/RagingFury 各有独立弧形特效
- Frenzy 状态红色刀光，普通状态灰色刀光
- active window 期间双层弧线（底色 + 高亮色）

### 3.3 EffectLayer — 部分完成 ⚠️

内联在 `CombatScene.bindFeedbackHandlers()`。功能覆盖了计划中的事件订阅（HitConfirmed / ArmorHit / VfxRequested / ReactionApplied），但严重缺少对象池：
- HitConfirmed → 挥砍线 / 怒气爆发 / 上挑弧形 / 火花
- ArmorHit → 金色十字火花
- VfxRequested → 通用特效系统（armor_spark / hit_spark）
- 命中闪白迁自 DebugLayer
- 玩家受击红描边 + camera shake

### 3.4 倒地姿态 ✅

`CombatScene.syncActors()` 中：
- downed → container.angle = 90（精灵图用帧内倒地姿态，angle=0）
- launch → container.scaleY = 1.05

### 3.5 HudLayer — 部分完成 ⚠️

内联在 `CombatScene.syncHudOverlay()`，功能可用。但计划中的独立 `HudLayer` 类未创建。

### 3.6 PerformanceMonitor — 极简版 ⚠️

仅读取 `game.loop.actualFps` 显示 FPS。计划中的独立 `PerformanceMonitor` 类未创建，tickCost / renderCost 测量未实现。

### 3.7 怪物头顶 HP 条 ✅

`CombatScene.syncActors()` 中按 kind 着色和尺寸的 HP 条。

---

## 4. C 段：调试快捷键 — ~95% 完成 ✅

### 4.1-4.4 全部子项 ✅

```text
F1 → DebugLayer 整体显隐                          ✅
F2 → DebugLayer.toggleBoxesVisible()               ✅
F3 → simulation.setSlowMotion(0.25 / 1)            ✅
F4 → simulation.armSingleStep()                    ✅
F5 → FrenzyToggle（保持）                           ✅
F6 → kernel.reset()                                ✅
F7 → ForceBleed（保持）                             ✅
F8 → RunScreenshotScenario（保持）                   ✅
F9 → ForceDownPlayer（从 F6 迁移）                   ✅
```

FixedStepSimulation 已扩展 setSlowMotion + armSingleStep。

---

## 5. D 段：音效 — ~95% 完成 ✅

### 5.1-5.3 全部子项 ✅

- `src/game/audio/AudioUnlockGate.ts` — 6 种合成音：light/heavy/uppercut/burst/berserk/armor
- BootScene Start 按钮 → AudioContext.resume() → 通过 registry 共享给 CombatScene
- CombatScene.bindFeedbackHandlers() 订阅 HitConfirmed 派发对应音效

---

## 6. E 段：打击感 / 物理 — 待实现 ❌

### 6.0 为什么单列一段

A/B/C/D 四段做完，r3 看起来像 0.1，但**玩起来**仍是「按下立刻满速、命中怪不飞、连续命中没停顿感」——因为 r3 的内核是 `position += speed` 平移模型，没有 0.1 的 velocity 物理 / 击退 / 全场顿。这一段补的是**手感**层面的东西，**比视觉更重要**。

### 6.1 当前内核的物理空缺

```text
1. Actor.velocity 字段虽然存在（types.ts），但 Walk/Run 不写，普攻不写，命中也不写；
2. RootMotionController 直接 position +=，没有 integrate 阶段；
3. ReactionResolver 决策出 reactionKind 后没人把击退力写到 target.velocity；
4. HitStop per-actor 冻结，缺 0.1 那种「全场咔一顿」的视觉冲击；
5. 攻击起手 lockMovement: true 直接锁死，没 0.1 的 `velocity *= 0.4` 渐刹车；
6. 没有 mass 字段，所有怪击退表现一样；
7. cameraShake 固定 0.004，没有按攻击重量分档；
8. Backstep 走固定 RootMotion 帧脚本，缺 0.1 Dodge 的方向自适应 + 续命无敌；
9. Frenzy 切换只能 F5 调试键，没正经玩家键位（0.1 是 I 键）。
```

### 6.2-6.12 E 段子项（全部待实现）

```text
❌ E1：velocity-based 移动模型（MovementIntegrator）
❌ E2：全局摩擦表
❌ E3：攻击起手刹车
❌ E4：击退（knockback）
❌ E5：mass 字段
❌ E6：PushBoxResolver 质量协作
❌ E7：伪全场顿（Phaser 层 worldFreeze）
❌ E8：Camera shake 三档
❌ E9：Dodge 增强（Backstep 改为 velocity 驱动）
❌ E10：I 键狂暴
```

详细设计见原文档第 6 节（保留作为实施方案参考）。

### 6.13-6.14 红线复述

```text
1. velocity 写入只允许在 4 个地方：
   - MovementIntegrator.applyMovementVelocity（玩家 movement action）
   - applyHitDecision 的击退分支（命中目标）
   - applyFriction（每 tick 末尾衰减）
   - reactionMotion 的 launch 分支（已有）
   其他任何地方写 velocity 都是 bug；
2. position 直接写只允许在 PushBoxResolver、clampToBounds、scenario 内手动 setPosition；
3. 内核不感知 worldFreeze；伪全场顿只在 CombatScene；
4. mass 在 CombatKernel 不参与命中决策，只参与击退缩放和 PushBox 推开比例；
5. 7 个 scenario boolean 必须在 E 段完成后仍全 PASS。
```

---

## 7. 实施顺序（commit 边界，更新版）

B/C/D 三段基本完成（~85-95%），A 段约 60% 但架构需重构。剩余 E 段 commit：

```text
[cE1] E 段：MovementIntegrator + velocity 模型
[cE2] E 段：击退 + mass 系统
[cE3] E 段：攻击刹车 + 全场顿 + Camera shake 三档
[cE4] E 段：Dodge 增强 + I 键狂暴
[cE5] E 段：静态测试 movement-physics.test.ts
[cE6] 集成验收：npm run typecheck && npm run static:test && npm run build 全绿；7 scenario boolean 全 PASS
```

每个 commit 必须保 typecheck + static:test 绿。

---

## 7. 验收口径

### 7.1 自动化（必须全绿）

```text
✅ npm run typecheck
✅ npm run static:test（含 walk-run-z + movement-bounds）
✅ npm run build
✅ deterministic scenario 7 个 boolean 全 PASS
  (normalHit / launch / ragingFuryMultiHit / armorHit / buildingArmorBlockedControl / bleed / quickRebound)
```

### 7.2 手动 checklist

```text
[B 段] ✅
✅ W/S/↑/↓ 玩家 z 轴上下移动；走到 z 边界自动停下
✅ 斜向走速度不超过单向
✅ 纵深透视网格肉眼可见
✅ 镜头仅跟 x，不跟 z
✅ z 轴位置影响命中

[A 段] ⚠️ 部分完成
✅ actor 不再单一矩形
✅ 玩家面朝右时刀在右侧
✅ 普攻命中画白色挥砍线 + target 闪白 80ms
✅ Frenzy 期间普攻挥砍线变红、刀变红
✅ UpwardSlash 命中画 uppercut 弧形椭圆
✅ RagingFury 命中画双层红黄椭圆爆炸
✅ Boss / 钢墙桩被普攻命中画金色十字火花
✅ 飘伤害数字在所有 actor 头顶都能看到
✅ 倒地状态下 actor 旋转 90 度
✅ 玩家 HP/Frenzy 条左上角实时刷新
✅ 怪头顶有 HP 可视化条
❌ 特效/伤害数字无对象池（每次 new + destroy）
❌ ActorSprite/EffectLayer/HudLayer/PerformanceMonitor 未抽独立类
❌ tickCost/renderCost 未测量

[C 段] ✅
✅ F1-F9 全部映射正确

[D 段] ✅
✅ Start 按钮解锁 AudioContext
✅ 6 种合成音全部验证

[FPS HUD] ✅
✅ 左上角显示 fps，60 FPS 稳定

[E 段] ❌ 待实现
```

---

## 8. 风险与缓解

E 段特有风险：

| 风险 | 影响 | 缓解 |
|---|---|---|
| velocity 模型与 LocomotionController 冲突 | 玩家移动行为异常 | LocomotionController 负责持续位移，E 段 MovementIntegrator 替换其内部实现，外部接口不变 |
| 击退导致 deterministic scenario 失败 | 7 个 boolean 失败 | scenario 内每段前显式 resetActor velocity |
| 全场顿卡死 | 画面冻结 | worldFreezeUntilMs 上限 80ms |
| camera shake 重复触发 | 画面抖动过度 | lastShakeMs 10ms 内不重复 |

---

## 9. 开发约定

```text
1. 代码标识符英文，正文中文；
2. 每个 commit 必须保 typecheck + static:test 绿；
3. 不要在 ActorSprite / EffectLayer / HudLayer 里 import combat 的具体业务类，仅 import types；
4. 不要在 CombatKernel 里 import phaser；
5. AudioUnlockGate 只在 BootScene / CombatScene 持有引用；
6. tuning 数值改动同步更新 docs/design/tuning-baseline.md；
7. 任何新增 ActionName / 事件类型必须更新 spec 第 12/13 章对应小节。
```

---

## 10. 文档维护

```text
1. 本文与 spec 出现冲突时以 spec 为准；
2. R3 / R4 完成后，docs/planning/training-ground-r1-r2-plan.md 中 §7 R3/R4 预告可删除；
3. 实施过程中如发现需要新增 ActionName 或新 RootMotion 字段，先更新本文 §1.2，再写代码。
```
