# Training Ground R3 + R4 视觉与玩感复原改造方案

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
1. 操作上：W/S/↑/↓ 真正驱动玩家在 z 轴上下移动；
2. 镜头/场景：地面带透视网格，玩家走纵深时能看出"近大远小"；
3. 视觉上：actor 是头+身+腿+武器+阴影组合，不再是单一矩形；
4. 命中视觉：5 种命中特效（普攻挥砍 / 重击 / 狂暴挥砍 / 火花 / 怒气爆发圆环）回归；
5. UI：玩家左上角 HP/Frenzy 条 + FPS/tickCost/renderCost；
6. 快捷键：F1-F6 完整调试键回归（hitbox 显隐 / 慢动作 / 单帧 / 强制狂暴 / 重置）；
7. 音效：第一刀、上挑、怒气爆发、armor 命中有合成音；
8. 现有 typecheck / static:test / build 稳定验证链零回归；
9. 7 个 deterministic scenario boolean 仍然全 PASS。
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

### 1.1 新增

```text
src/combat/motion/MovementInputProvider.ts         （Walk/Run 的 4 向接口）
src/game/audio/AudioUnlockGate.ts                  （6 种合成音）
src/game/layers/EffectLayer.ts                     （命中特效 / 挥砍弧 / 闪白）
src/game/layers/HudLayer.ts                        （玩家 HP+Frenzy 条 + FPS）
src/game/layers/PerformanceMonitor.ts              （fps/tickCost/renderCost 采样器）
src/game/actor/ActorSprite.ts                      （head+body+legs+weapon 装配）
docs/training-ground-r3-r4-restoration-plan.md     （本文）
```

### 1.2 修改

```text
src/combat/types.ts                          // ActorBounds 新增 zMin/zMax；MovementInputSnapshot 类型
src/combat/motion/RootMotionController.ts    // apply 增加可选 movementInput 参数，推 z
src/combat/kernel/CombatKernel.ts            // 引入 MovementInputProvider；clamp position.z；isMovementHeld 4 向
src/combat/kernel/FixedStepSimulation.ts     // setSlowMotion(factor) + armSingleStep()
src/combat/input/CommandInputParser.ts(同BrowserInputState.ts) // F6→F9 迁移 ForceDownPlayer
src/game/CombatScene.ts                      // 拆掉内联 ActorView，改用 ActorSprite + EffectLayer + HudLayer；F2-F6 注册
src/game/BootScene.ts                        // Start 按钮 → AudioContext.resume() → scene.start("combat")
```

### 1.3 测试

```text
新增 tests/static/walk-run-z.test.ts          // W/S 推 z；斜向不超速
新增 tests/static/movement-bounds.test.ts     // 玩家不能越过 zMin/zMax
保持 tests/static/run-detector.test.ts        // 已有
保持 tests/static/walk-run.test.ts            // 已有
保持 tests/static/enemy-ai.test.ts            // 已有
保持 tests/static/architecture.test.ts        // 红线检查
```

---

## 2. B 段：Z 轴 4 向移动 + 透视（最先做）

### 2.1 设计选型

**问题**：当前 `RootMotionTrack.appliesEveryFrame + speedXPerTick` 只推 X，玩家按 W 不动 z。

**选型**：在 CombatKernel.applyRootMotion 内为 movement action 加专属分支，从 inputState 读 W/S 计算 zDirection（方案 B）。比单纯加 `speedZPerTick` 更灵活，因为 z 方向取决于实时输入，不是常数。

### 2.2 类型扩展

```ts
// src/combat/types.ts
export interface ActorBounds { xMin: number; xMax: number; zMin: number; zMax: number; }

export interface MovementInputSnapshot {
  xDirection: -1 | 0 | 1;   // A/D / Left/Right
  zDirection: -1 | 0 | 1;   // W/S / Up/Down，z 增大 = 远离镜头
  speedScale: number;       // 斜向 = 1/√2，单向 = 1
}
```

### 2.3 MovementInputProvider

```ts
// src/combat/motion/MovementInputProvider.ts
export class MovementInputProvider {
  snapshot(input: BrowserInputState): MovementInputSnapshot {
    const left  = input.isHeld("ArrowLeft")  || input.isHeld("KeyA");
    const right = input.isHeld("ArrowRight") || input.isHeld("KeyD");
    const up    = input.isHeld("ArrowUp")    || input.isHeld("KeyW");
    const down  = input.isHeld("ArrowDown")  || input.isHeld("KeyS");
    const xDir = left && !right ? -1 : right && !left ? 1 : 0;
    const zDir = up && !down ? -1 : down && !up ? 1 : 0;
    const diagonal = xDir !== 0 && zDir !== 0;
    return { xDirection: xDir, zDirection: zDir, speedScale: diagonal ? Math.SQRT1_2 : 1 };
  }
}
```

### 2.4 RootMotionController 改动

```ts
// src/combat/motion/RootMotionController.ts
apply(actor: Actor, action: FrameDataAction, movementInput?: MovementInputSnapshot): void {
  const inst = actor.currentAction;
  if (!inst || !action.rootMotion) return;

  if (action.rootMotion.appliesEveryFrame && typeof action.rootMotion.speedXPerTick === "number") {
    const speed = action.rootMotion.speedXPerTick;
    if (movementInput && (action.actionName === "Walk" || action.actionName === "Run")) {
      const scale = movementInput.speedScale;
      actor.position.x += speed * movementInput.xDirection * scale;
      actor.position.z += speed * movementInput.zDirection * scale;
    } else {
      actor.position.x += speed * signedFacingScale(actor.facing);
    }
  }

  for (const step of action.rootMotion.frames.filter(s => s.frame === inst.localFrame)) {
    actor.position.x += step.dx * signedFacingScale(actor.facing);
    actor.position.z += step.dz;
    actor.position.y += step.dy ?? 0;
  }
}
```

注：参数 movementInput 必须是可选的，敌人 AI 触发的 EnemyBasic 不传，行为完全不变。

### 2.5 CombatKernel 接入

```ts
// src/combat/kernel/CombatKernel.ts
readonly movementInput = new MovementInputProvider();
readonly worldBounds: ActorBounds = { xMin: 0, xMax: 2400, zMin: -120, zMax: 120 };

private applyRootMotion(): void {
  const movementSnapshot = this.movementInput.snapshot(this.inputState);
  for (const actor of this.actors) {
    if (!actor.currentAction || actor.flags.dead || this.hitStop.isFrozen(actor.id)) continue;
    actor.previousPosition = cloneVec3(actor.position);
    this.rootMotion.apply(
      actor,
      getAction(actor.currentAction.actionName),
      actor.id === "player" ? movementSnapshot : undefined
    );
    this.clampToBounds(actor);
  }
}

private clampToBounds(actor: Actor): void {
  const b = this.worldBounds;
  if (actor.position.x < b.xMin) actor.position.x = b.xMin;
  if (actor.position.x > b.xMax) actor.position.x = b.xMax;
  if (actor.position.z < b.zMin) actor.position.z = b.zMin;
  if (actor.position.z > b.zMax) actor.position.z = b.zMax;
}
```

### 2.6 RunCommandDetector 不动

只判水平双击 Run，z 轴单按即走（不需要双击）。这个语义和 0.1 一致：纵深「永远只走，不跑」。

### 2.7 isMovementHeld 4 向

`CombatKernel.isMovementHeld()` 当前只看左右，改成 4 向有任意按下即视为 movement 持续：

```ts
private isMovementHeld(): boolean {
  const i = this.inputState;
  return i.isHeld("ArrowLeft")||i.isHeld("ArrowRight")||i.isHeld("ArrowUp")||i.isHeld("ArrowDown")
      || i.isHeld("KeyA")||i.isHeld("KeyD")||i.isHeld("KeyW")||i.isHeld("KeyS");
}
```

`updateActions()` 中 movement action 终止条件走这个 4 向版本。这样玩家按 D 起 Walk 后，转按 W 时不会被错误终止。

注意：`consumeInput` 里 `(item.actionName === "Walk" || item.actionName === "Run") && !this.isMovementHeld(item.facing)` 这一句要去掉对 facing 的耦合，调用无参版本即可。

### 2.8 GroundLayer 透视网格

扩 `CombatScene.createGround()`（在文件 `src/game/CombatScene.ts` 第 136 行附近），加横向 z 网格线：

```text
1. 沿 z = -120 ~ 120 每 24px 画一条横线，y = groundLineY + z
2. 颜色 #475569，alpha 0.18
3. 中心线 (z=0) 加深到 #94a3b8 alpha 0.32
4. 纵向 x 网格保留（每 96px 加深，每 48px 浅色）
```

### 2.9 Camera / Depth Sort

镜头继续只跟 player.position.x，不跟 z。原因：z 偏移已经体现为 screenY = groundLineY + z - y，玩家走纵深时在画面里上下移动是符合预期的。

ActorLayer depth sort 当前已经按 baseY 排序，z 启用后自动正确。

### 2.10 静态测试

```ts
// tests/static/walk-run-z.test.ts
test("W 键让玩家 z 减小", () => {
  const k = new CombatKernel({enableReplay:false});
  const z0 = k.player.position.z;
  k.press("KeyD"); k.tick();
  k.press("KeyW"); k.runTicks(10);
  expect(k.player.position.z).toBeLessThan(z0);
});

test("斜向走不超速", () => {
  const k = new CombatKernel({enableReplay:false});
  const p0 = {x:k.player.position.x, z:k.player.position.z};
  k.press("KeyD"); k.press("KeyS"); k.runTicks(10);
  const dx = k.player.position.x - p0.x;
  const dz = k.player.position.z - p0.z;
  expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(10 * 2 + 0.5);
});

// tests/static/movement-bounds.test.ts
test("z 边界 clamp", () => {
  const k = new CombatKernel({enableReplay:false});
  k.press("KeyD"); k.press("KeyS"); k.runTicks(500);
  expect(k.player.position.z).toBeLessThanOrEqual(k.worldBounds.zMax);
});
```

---

## 3. A 段：视觉升级

### 3.1 ActorSprite 装配（A1）

新文件 `src/game/actor/ActorSprite.ts`，用 Phaser.GameObjects.Container 装配子节点：

```ts
export interface ActorSpriteParts {
  shadow:   Phaser.GameObjects.Ellipse;     // 椭圆阴影，地面 (groundLineY + z)
  legsL:    Phaser.GameObjects.Rectangle;
  legsR:    Phaser.GameObjects.Rectangle;
  body:     Phaser.GameObjects.Rectangle;
  head:     Phaser.GameObjects.Rectangle;
  weapon:   Phaser.GameObjects.Graphics;    // 仅玩家
  hpBack:   Phaser.GameObjects.Rectangle;
  hpFill:   Phaser.GameObjects.Rectangle;
  label:    Phaser.GameObjects.Text;
  state:    Phaser.GameObjects.Text;        // 仅 debug，可隐藏
}
```

尺寸（参考 0.1）：

```text
普通     body 28×48  head 20×18  legs 10×10×2  scale 1
boss     body 38×65  head 27×24  legs 14×14×2  scale 1.35
building body 44×72  head 24×20  legs 12×12×2  immobile=true
shadow   普通 r=21×8  boss r=41×14
hp bar   普通 w=42 h=5  boss w=78 h=5  位置距头顶 86×scale
```

颜色（参考 0.1）：

```text
player normal   body #334155 head #fca5a5 legs #111827
player frenzy   body #991b1b head #fca5a5 legs #450a0a
grunt           body #365314 head #a3e635 legs #1a2e05
dummy (精英)    body #92400e head #f59e0b legs #451a03
boss            body #7c1d1d head #fda4af legs #450a0a
building        body #475569 head #94a3b8 legs #1f2937
flash (闪白)    全部 #ffffff
```

```ts
class ActorSprite {
  constructor(scene: Phaser.Scene, kind: ActorKind, isPlayer: boolean);
  setPositionScreen(worldX: number, screenY: number): void;
  setFacing(facing: "left"|"right"): void;     // setScaleX(facing === "right" ? 1 : -1)
  setHp(current: number, max: number): void;
  setReactionPose(reaction: ReactionKind): void;
  flashWhite(durationMs: number): void;
  setFrenzy(active: boolean): void;
  setDead(dead: boolean): void;
  setAttackPose(actionName: ActionName, localFrame: number, isActive: boolean): void;
  destroy(): void;
}
```

约束：ActorSprite 不允许 import 任何 combat 模块，参数全是原始 number/字符串/枚举。

### 3.2 武器与挥砍弧（A2）

仅玩家挂武器：

```ts
// 普通态：长 62px，浅灰 #d1d5db；狂暴态：长 45px，红 #ef4444
// Uppercut：弧线起点抬到 sy-60；其它攻击 sy-38
// active window 期间额外画一道弧形

drawWeapon(actionName, localFrame, isActive, isFrenzy) {
  weapon.clear();
  if (!isAttackAction(actionName)) return;

  const bladeY = actionName === "UpwardSlash" ? -60 : -38;
  const bladeLen = isFrenzy ? 45 : 62;
  const color = isFrenzy ? 0xef4444 : 0xd1d5db;
  weapon.lineStyle(isFrenzy ? 4 : 6, color, 1);
  weapon.beginPath();
  weapon.moveTo(26, bladeY);
  weapon.lineTo(26 + bladeLen, actionName === "UpwardSlash" ? bladeY - 36 : bladeY + 8);
  weapon.strokePath();

  if (isActive) {
    weapon.lineStyle(2, isFrenzy ? 0xfca5a5 : 0xfef3c7, 0.72);
    weapon.beginPath();
    weapon.arc(38, -35, actionName === "RagingFury" ? 78 : 42, -0.65, 0.75, false);
    weapon.strokePath();
  }
}
```

`isAttackAction` 判断 = NormalBasic1/2/3、FrenzyBasic1/2/3、UpwardSlash、MountainousWheel、RagingFury。
方向通过 setScaleX 镜像，不需要在 graphics 内反 facing。

### 3.3 EffectLayer（A3、A4）

新文件 `src/game/layers/EffectLayer.ts`，订阅 bus 事件画特效：

```text
事件                                 视觉
HitConfirmed (普通)                 白色挥砍线 28×54，120ms 渐淡
HitConfirmed (RagingFury 柱)        双层椭圆爆炸（红 + 黄）半径渐扩
HitConfirmed (frenzy buff 期普攻)   红色挥砍线，更粗
HitConfirmed (UpwardSlash)          uppercut 弧形 70×37 椭圆
ArmorHit                            金色十字火花（两条交叉粗线）
HitConfirmed → target               target 闪白 80ms（迁自 DebugLayer）
ReactionApplied (target=player)     player 红描边 200ms + camera shake 100ms（迁自 CombatScene）
DamageNumberRequested               所有 actor 头顶飘伤害数字（当前只飘玩家，扩到所有）
```

EffectLayer 必须提供 6 个对象池：slashPool / burstPool / armorSparkPool / flashPool / dmgPool / aoePool。每池上限 16，超出复用最旧。

### 3.4 倒地姿态（A7）

```ts
ActorSprite.setReactionPose(reaction) {
  if (reaction === "downed") {
    this.container.angle = 90;
    // 重心修正：身体倒下后视觉上偏离地面，container 偏移 +8
  } else if (reaction === "launch") {
    // y 由 actor.position.y 直接驱动
    this.container.angle = -15;
  } else {
    this.container.angle = 0;
  }
}
```

### 3.5 HudLayer（A5）

DOM 实现（推荐），在 `index.html` 已有的 `#hud-root` 内：

```text
左上角面板（半透明深底）：
  ┌──────────────────────────────────┐
  │ Combat Lab 0.2-R3                │
  │ HP    ████████░░  72 / 100        │
  │ Frenzy ████░░░░░░ 8.0s            │
  │ FPS 60 | tick 1.2ms | render 0.8ms│
  └──────────────────────────────────┘

右下角按钮组（保留 r3 已有）：
  [Reset] [Run Scenario] [Export Replay] [Toggle Hitboxes]

中下：保留 r3 已有的 scenario 7 灯 + LastHitTrace 1 行
```

数据来源：
- HP / max → kernel.player.resources.hp / maxHp
- Frenzy 剩余 → kernel.player.buffs.find(b => b.type === "frenzy")?.expiresAtTick - kernel.tickCount
- FPS / tickCost / renderCost → PerformanceMonitor

### 3.6 PerformanceMonitor（D4）

新文件 `src/game/layers/PerformanceMonitor.ts`：

```ts
export class PerformanceMonitor {
  private fpsWindow: number[] = [];
  private tickCostMs = 0;
  private renderCostMs = 0;

  beginTick(): number { return performance.now(); }
  endTick(start: number): void { this.tickCostMs = performance.now() - start; }
  beginRender(): number { return performance.now(); }
  endRender(start: number): void { this.renderCostMs = performance.now() - start; }
  frame(deltaMs: number): void {
    this.fpsWindow.push(deltaMs);
    if (this.fpsWindow.length > 60) this.fpsWindow.shift();
  }
  snapshot() {
    const avg = this.fpsWindow.length
      ? this.fpsWindow.reduce((a, b) => a + b, 0) / this.fpsWindow.length
      : 16.67;
    return { fps: Math.round(1000 / avg), tickCostMs: this.tickCostMs, renderCostMs: this.renderCostMs };
  }
}
```

CombatScene.update 改：

```ts
update(time, delta) {
  const tickStart = this.perf.beginTick();
  this.simulation.update(delta);
  this.perf.endTick(tickStart);

  const renderStart = this.perf.beginRender();
  this.cameraController.tick();
  this.refresh();
  this.perf.endRender(renderStart);

  this.perf.frame(delta);
  this.hudLayer.refresh(this.perf.snapshot());
}
```

### 3.7 怪物头顶 HP 条（A6）

当前 `@d:\combat-lab-webdemo-0.2-r3\src\game\CombatScene.ts:255-260` 已有 hpBack/hpFill。从 ActorView 迁到 ActorSprite，保留逻辑，调整：
1. 宽度按 kind：普通 42、boss 78、building 88
2. 颜色按 kind：普通绿 #84cc16、boss 橙 #f59e0b、building 灰蓝 #94a3b8
3. 死亡变灰 #334155

---

## 4. C 段：调试快捷键

### 4.1 当前键位 vs 0.1 键位

```
当前 r3：                          0.1：
F1 → DebugLayer 整体显隐            F1 debug panel 切换
（无）                              F2 hitbox/hurtbox/pushbox 切换
（无）                              F3 慢动作
（无）                              F4 单帧步进
F5 → FrenzyToggle                  F5 强制狂暴
F6 → ForceDownPlayer (debug skill) F6 重置
F7 → ForceBleed
F8 → RunScreenshotScenario
```

冲突点：r3 用 F6 触发 ForceDownPlayer（spec 0.2 的 debug skill），0.1 用 F6 重置。

### 4.2 新键位映射

```text
F1 → DebugLayer 整体显隐（保持）
F2 → DebugLayer.toggleHitboxes()（新增）—— 只切线框，HUD 文字仍显示
F3 → simulation.setSlowMotion(0.25)（再按一次复原 1.0）
F4 → simulation.armSingleStep()（pause + 单 tick）
F5 → FrenzyToggle（保持）
F6 → kernel.reset()（新增；改回 0.1 含义）
F7 → ForceBleed（保持）
F8 → RunScreenshotScenario（保持）
F9 → ForceDownPlayer（从 F6 迁移；CommandInputParser 同步改）
```

> 静态测试和 deterministic scenario 不调用 F6/F9 这两个键（只调 `requestAction("ForceDownPlayer")`），所以重新映射不影响 `npm run static:test`。

### 4.3 FixedStepSimulation 扩展

```ts
// src/combat/kernel/FixedStepSimulation.ts
export class FixedStepSimulation {
  readonly tickRate = 1/60;
  readonly maxCatchUpTicks = 4;
  readonly pauseThresholdMs = 250;
  private accumulatorSeconds = 0;
  private paused = false;
  private slowMotionFactor = 1.0;
  private singleStepArmed = false;
  constructor(private readonly kernel: TickableKernel) {}

  setSlowMotion(factor: number): void { this.slowMotionFactor = factor; }
  armSingleStep(): void { this.singleStepArmed = true; }

  update(deltaMs: number): void {
    if (this.paused) {
      if (this.singleStepArmed) {
        this.kernel.tick();
        this.singleStepArmed = false;
      }
      return;
    }
    if (deltaMs > this.pauseThresholdMs) {
      this.accumulatorSeconds = 0;
      this.kernel.onLargeDelta(deltaMs);
      return;
    }
    this.accumulatorSeconds += (deltaMs * this.slowMotionFactor) / 1000;
    let ticks = 0;
    while (this.accumulatorSeconds >= this.tickRate && ticks < this.maxCatchUpTicks) {
      this.kernel.tick();
      this.accumulatorSeconds -= this.tickRate;
      ticks++;
    }
    if (ticks >= this.maxCatchUpTicks) {
      this.accumulatorSeconds = 0;
      this.kernel.emitLongFrameWarning(deltaMs);
    }
  }
  pause(): void { this.paused = true; this.accumulatorSeconds = 0; }
  resume(): void { this.paused = false; this.accumulatorSeconds = 0; }
}
```

### 4.4 CombatScene 注册

```ts
private slowMotionActive = false;

private handleKeyDown = (event) => {
  switch (event.code) {
    case "F1":
      this.debugLayer.toggleVisible(); event.preventDefault(); return;
    case "F2":
      this.debugLayer.toggleHitboxes(); event.preventDefault(); return;
    case "F3":
      this.slowMotionActive = !this.slowMotionActive;
      this.simulation.setSlowMotion(this.slowMotionActive ? 0.25 : 1.0);
      event.preventDefault(); return;
    case "F4":
      this.simulation.pause();
      this.simulation.armSingleStep();
      event.preventDefault(); return;
    case "F6":
      this.reset(); event.preventDefault(); return;
  }
  this.kernel.inputState.keyDown(event.code, event.repeat);
};
```

CommandInputParser 中把 `frame.pressed.has("F6") → ForceDownPlayer` 改成 `frame.pressed.has("F9")`。

---

## 5. D 段：音效

### 5.1 AudioUnlockGate

新文件 `src/game/audio/AudioUnlockGate.ts`：

```ts
export type SfxKind = "light" | "heavy" | "uppercut" | "burst" | "berserk" | "armor";

export class AudioUnlockGate {
  private ctx: AudioContext | null = null;
  private unlocked = false;

  unlock(): Promise<void> {
    if (this.unlocked) return Promise.resolve();
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctor();
    return this.ctx!.resume().then(() => { this.unlocked = true; });
  }

  playHit(kind: SfxKind): void {
    if (!this.unlocked || !this.ctx) return;
    const { frequency, duration, type, gain } = this.tone(kind);
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    env.gain.setValueAtTime(gain, this.ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(env).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private tone(kind: SfxKind) {
    switch (kind) {
      case "light":    return { frequency: 520,  duration: 0.08, type: "square"   as const, gain: 0.18 };
      case "heavy":    return { frequency: 240,  duration: 0.16, type: "sawtooth" as const, gain: 0.22 };
      case "uppercut": return { frequency: 380,  duration: 0.18, type: "triangle" as const, gain: 0.20 };
      case "burst":    return { frequency: 120,  duration: 0.32, type: "sawtooth" as const, gain: 0.26 };
      case "berserk":  return { frequency: 680,  duration: 0.10, type: "square"   as const, gain: 0.20 };
      case "armor":    return { frequency: 1040, duration: 0.06, type: "square"   as const, gain: 0.16 };
    }
  }
}
```

### 5.2 BootScene 解锁

```ts
// src/game/BootScene.ts
private audioGate = new AudioUnlockGate();

private startCombat = async () => {
  await this.audioGate.unlock();
  // 通过 registry 共享给 CombatScene
  this.game.registry.set("audioGate", this.audioGate);
  this.scene.start("combat");
};
```

CombatScene 取出来：

```ts
const audioGate = this.game.registry.get("audioGate") as AudioUnlockGate | undefined;
this.effectLayer = new EffectLayer(this, this.kernel.bus, audioGate);
```

### 5.3 EffectLayer 派发音效

```ts
this.bus.on("HitConfirmed", e => {
  const decision = e.payload as HitDecision;
  const hitboxId = decision.hitbox.id;
  const isFrenzy = this.isFrenzyActive();   // 通过 kernel 查 buff，或在事件 metadata 中带

  if (decision.armorDecision?.controlBlocked) audioGate?.playHit("armor");
  else if (hitboxId.startsWith("upslash"))    audioGate?.playHit("uppercut");
  else if (hitboxId.startsWith("rf_"))        audioGate?.playHit("burst");
  else if (isFrenzy)                           audioGate?.playHit("berserk");
  else if (decision.hitbox.baseDamage >= 30)  audioGate?.playHit("heavy");
  else                                         audioGate?.playHit("light");
});
```

注：EffectLayer 通过 kernel 引用查询 frenzy buff（kernel.player.buffs.some(b => b.type === "frenzy")）。这违反「Phaser 不读 kernel 状态」？不违反——这是只读引用，不写。

---

## 6. E 段：打击感 / 物理（最关键，0.1 vs r3 的真正差距）

### 6.0 为什么单列一段

A/B/C/D 四段做完，r3 看起来像 0.1，但**玩起来**仍是「按下立刻满速、命中怪不飞、连续命中没停顿感」——因为 r3 的内核是 `position += speed` 平移模型，没有 0.1 的 velocity 物理 / 击退 / 全场顿。这一段补的是**手感**层面的东西，**比视觉更重要**。

### 6.1 当前内核的物理空缺

```text
1. Actor.velocity 字段虽然存在（types.ts:54），但 Walk/Run 不写，普攻不写，命中也不写；
2. RootMotionController 直接 position +=，没有 integrate 阶段；
3. ReactionResolver 决策出 reactionKind 后没人把击退力写到 target.velocity；
4. HitStop per-actor 冻结，缺 0.1 那种「全场咔一顿」的视觉冲击；
5. 攻击起手 lockMovement: true 直接锁死，没 0.1 的 `velocity *= 0.4` 渐刹车；
6. 没有 mass 字段，所有怪击退表现一样；
7. cameraShake 固定 0.004，没有按攻击重量分档；
8. Backstep 走固定 RootMotion 帧脚本，缺 0.1 Dodge 的方向自适应 + 续命无敌；
9. Frenzy 切换只能 F5 调试键，没正经玩家键位（0.1 是 I 键）。
```

### 6.2 E1：velocity-based 移动模型

在 `RootMotionController` 之外新增一个 `MovementIntegrator`，承担 0.1 `applyMoveIntent + integrateActor` 的职责：

```ts
// src/combat/motion/MovementIntegrator.ts
export class MovementIntegrator {
  readonly playerSpeed = 3.0;          // 0.1: PLAYER_SPEED = 3.0
  readonly walkMultiplier = 0.7;       // Walk = 2.1 px/tick (≈ 0.1 walk)
  readonly runMultiplier = 1.4;        // Run  = 4.2 px/tick

  applyMovementVelocity(actor: Actor, action: FrameDataAction, movement: MovementInputSnapshot): void {
    const isWalk = action.actionName === "Walk";
    const isRun  = action.actionName === "Run";
    if (!isWalk && !isRun) return;

    const mult = isRun ? this.runMultiplier : this.walkMultiplier;
    if (movement.xDirection !== 0 || movement.zDirection !== 0) {
      actor.velocity.x = movement.xDirection * this.playerSpeed * mult * movement.speedScale;
      actor.velocity.z = movement.zDirection * this.playerSpeed * mult * movement.speedScale;
    } else {
      // 没方向键，松手收速（不是瞬停）
      actor.velocity.x *= 0.65;
      actor.velocity.z *= 0.65;
    }
  }

  integrate(actor: Actor): void {
    actor.position.x += actor.velocity.x;
    actor.position.z += actor.velocity.z;
    actor.position.y += actor.velocity.y;
  }
}
```

**CombatKernel.applyRootMotion 改造为两阶段**：

```ts
private applyRootMotion(): void {
  const movement = this.movementInput.snapshot(this.inputState);
  for (const actor of this.actors) {
    if (!actor.currentAction || actor.flags.dead || this.hitStop.isFrozen(actor.id)) continue;
    actor.previousPosition = cloneVec3(actor.position);

    // 1. 让 movement action 写 velocity
    if (actor.id === "player") {
      this.movementIntegrator.applyMovementVelocity(actor, getAction(actor.currentAction.actionName), movement);
    }

    // 2. RootMotion 帧脚本仍然直接位移（Backstep 之类）
    this.rootMotion.apply(actor, getAction(actor.currentAction.actionName));

    // 3. 积分 velocity 到 position
    this.movementIntegrator.integrate(actor);

    // 4. clamp
    this.clampToBounds(actor);
  }
}
```

**摩擦在 tick 末尾全局 apply**：

```ts
private applyFriction(): void {
  for (const actor of this.actors) {
    if (this.hitStop.isFrozen(actor.id)) continue;
    actor.velocity.x *= 0.78;          // 0.1: FRICTION = 0.78
    actor.velocity.z *= 0.78;
    if (Math.abs(actor.velocity.x) < 0.05) actor.velocity.x = 0;
    if (Math.abs(actor.velocity.z) < 0.05) actor.velocity.z = 0;
    // y 走重力，不受这里摩擦影响
  }
}
```

放在 `tick()` 流水线的 **endTickCleanup 之前**（status / buff / cooldown 之后）。

### 6.3 E2：全局摩擦 / 数值表

```text
PLAYER_SPEED       = 3.0
WALK_MULTIPLIER    = 0.7    # 实际 walk 速度 ≈ 2.1 px/tick
RUN_MULTIPLIER     = 1.4    # 实际 run 速度 ≈ 4.2 px/tick
FRICTION           = 0.78   # 攻击 / Idle / 击退之后的衰减
RELEASE_DAMPENING  = 0.65   # 方向键松开瞬时（movement action 内）
ATTACK_BRAKE       = 0.4    # 攻击起手 velocity 立即打 4 折
DODGE_AUTO_SPEED   = 3.4    # Dodge 无方向键时自动突进倍率
GRAVITY            = 0.6    # 已有，保持
```

数值同步更新到 `docs/tuning-baseline.md`。

### 6.4 E3：攻击起手刹车

`CombatKernel.requestAction` 在成功设置 `actor.currentAction` 之后立即：

```ts
if (this.isAttackAction(resolvedActionName)) {
  actor.velocity.x *= 0.4;
  actor.velocity.z *= 0.4;
}
```

`isAttackAction` 枚举 = NormalBasic1/2/3、FrenzyBasic1/2/3、UpwardSlash、MountainousWheel、RagingFury、Backstep（Backstep 也算，跑动转闪避要刹车）。

不要把 EnemyBasic 算进去——敌人一直 lockMovement，没 velocity 可刹。

### 6.5 E4：击退（knockback）

#### 6.5.1 HitBox 配置加 knockback 字段

```ts
// src/combat/types.ts
export interface HitBoxFrameWindow extends FrameWindow {
  // 已有字段不动...
  knockbackX: number;     // 沿 attacker.facing 推开的力
  knockbackZ: number;     // 横向推开的力（一般 0）
  launchY?: number;       // 仅 Uppercut 设值
}
```

#### 6.5.2 hit 工厂注入

```ts
// src/combat/actions/FrameDataAction.ts
function hit(id, start, end, group, baseDamage, opts={}): HitBoxFrameWindow {
  return { ...defaults, knockbackX: 16, knockbackZ: 0, launchY: 0, ...opts };
}

// 然后逐个 action 配（参考 0.1 HitResolver2D5.ts:117-127）：
NormalBasic1   knockbackX: 16
NormalBasic2   knockbackX: 24
NormalBasic3   knockbackX: 46
UpwardSlash    knockbackX: 10  launchY: 8.5
MountainousWheel slash knockbackX: 32  shock knockbackX: 22
RagingFury shock knockbackX: 54 knockbackZ: 10
RagingFury pillar knockbackX: 14
FrenzyBasic1   knockbackX: 8
FrenzyBasic2   knockbackX: 12
FrenzyBasic3   knockbackX: 20
EnemyBasic     knockbackX: 6
```

#### 6.5.3 命中后写入 velocity

`CombatKernel.applyHitDecision` 中，在 `damageResolver.apply` 之后、`reactionResolver.apply` 之前插入：

```ts
const isAirArmor = decision.armorDecision?.controlBlocked;
if (!isAirArmor) {
  const facing = signedFacingScale(attacker.facing);
  const massDivisor = Math.max(1, target.mass);   // boss=4 推不动，grunt=1 飞远
  target.velocity.x += (decision.hitbox.knockbackX ?? 0) * facing / massDivisor;
  target.velocity.z += (decision.hitbox.knockbackZ ?? 0) / massDivisor;
  if ((decision.hitbox.launchY ?? 0) > 0 && target.armorProfile.canBeLaunched) {
    target.velocity.y = decision.hitbox.launchY;
  }
}
```

#### 6.5.4 ReactionResolver 不动

reactionState 仍按 0.2 spec 的 ReactionKind 枚举决策，velocity 是物理层独立写入的，不耦合。

### 6.6 E5：mass 字段 + KnockbackProfile

```ts
// src/combat/types.ts
export interface Actor {
  // 已有字段...
  mass: number;
}

// src/combat/actors/ActorFactory.ts
const massByType: Record<ActorType, number> = {
  player:   1,
  enemy:    1,    // grunt
  dummy:    2,    // 精英
  boss:     4,
  building: 999,  // 推不动
};
```

效果：
- 普攻打 grunt：knockbackX=16/1=16，飞 16px 后摩擦减速
- 普攻打 boss：knockbackX=16/4=4，几乎不动
- 普攻打 building：knockbackX=16/999≈0，纹丝不动（数值上零，视觉上稳如柱）

### 6.7 E6：mass 与 PushBoxResolver 协作

PushBoxResolver 当前不知道 mass。改造：

```ts
// src/combat/motion/PushBoxResolver.ts
resolve(actors: Actor[]): void {
  for (let i = 0; i < actors.length; i++) {
    for (let j = i + 1; j < actors.length; j++) {
      const a = actors[i], b = actors[j];
      // 计算 overlap
      // ...
      if (overlap > 0) {
        const totalMass = a.mass + b.mass;
        const aShare = b.mass / totalMass;   // 质量大的少动
        const bShare = a.mass / totalMass;
        a.position.x += pushDir * overlap * aShare;
        b.position.x -= pushDir * overlap * bShare;
      }
    }
  }
}
```

building mass=999 时基本不动；玩家撞 building 全部 push 量给玩家自己。

### 6.8 E7：伪全场顿（Phaser 层）

**完全不动内核**。在 CombatScene 加一个 worldFreeze 计时：

```ts
// src/game/CombatScene.ts
private worldFreezeUntilMs = 0;

create() {
  // ...已有
  this.kernel.bus.on("HitStopStarted", e => {
    const frames = (e.payload as {frames: number}).frames ?? 0;
    if (frames <= 0) return;
    this.worldFreezeUntilMs = this.time.now + frames * (1000 / 60);
  });
}

update(time, delta) {
  if (this.time.now < this.worldFreezeUntilMs) {
    // 全场顿期间：不喂 simulation，不更新 actor 位置
    // 但允许 EffectLayer 自驱（飘字、特效继续动）
    this.effectLayer.tickStandalone(delta);
    return;
  }
  // 正常 tick
  this.simulation.update(delta);
  // ...
}
```

注意 `worldFreezeUntilMs` 上限 80ms（防止极端情况下卡死）。HitStopController 内核侧仍正常 per-actor 冻结，渲染层这个冻结只是「让玩家眼睛感受到那一顿」，不改变战斗真相。

### 6.9 E8：Camera shake 三档

EffectLayer 订阅 HitStopStarted，按 frames 选档：

```ts
this.bus.on("HitStopStarted", e => {
  const frames = (e.payload as {frames:number}).frames;
  if (frames <= 2)      this.cameras.main.shake(80,  0.002);  // tiny
  else if (frames <= 4) this.cameras.main.shake(100, 0.005);  // light
  else                  this.cameras.main.shake(120, 0.009);  // medium
});
```

如果 ReactionApplied(player) 已经 shake 过，避免重复。简单方案：标记 `lastShakeMs`，10ms 内不重复触发。

### 6.10 E9：Dodge 增强（改 Backstep）

Backstep 当前是 9 帧固定 dx=-48/9 的纯后退。改成 0.1 Dodge 风格：

```ts
// CombatKernel.requestAction 中处理 Backstep 入口
if (resolvedActionName === "Backstep") {
  const movement = this.movementInput.snapshot(this.inputState);
  if (movement.xDirection !== 0 || movement.zDirection !== 0) {
    // 按方向键的方向突进
    actor.velocity.x = movement.xDirection * 3.0 * 2.8 * movement.speedScale;
    actor.velocity.z = movement.zDirection * 3.0 * 2.8 * movement.speedScale;
  } else {
    // 没方向键，按 facing 反向后退（保留 0.1 风格）
    actor.velocity.x = -signedFacingScale(actor.facing) * 3.0 * 3.4;
  }
  actor.armorProfile.temporaryFlags.invulnerableUntilTick = this.tickCount + 8;
}
```

Backstep 的 RootMotion 帧脚本删除（在 FrameDataAction.ts），改成纯 velocity 驱动 + integrator。这样：
- 按 ↓C 没方向键 → 按 facing 后退（0.1 默认）
- 按 →C 朝右突进
- 按 ↑C 朝远处突进（z 减小）
- 8 帧无敌（保留 0.1 行为）

加 cooldownProfile：

```ts
Backstep cooldownProfile: { independentCooldownFrames: 48, ... }   // 0.8 秒
```

### 6.11 E10：I 键狂暴

`CommandInputParser.parse` 增加：

```ts
if (frame.pressed.has("KeyI")) {
  out.push(this.make("FrenzyToggle", "hotkey", frame.tick, 90));
}
```

F5 仍保留为 debug 键。allowed 集合不用改（FrenzyToggle 已经在白名单）。

### 6.12 E 段静态测试

```ts
// tests/static/movement-physics.test.ts
test("松开方向键后玩家继续滑行", () => {
  const k = new CombatKernel({enableReplay:false});
  k.press("KeyD"); k.runTicks(10);
  const x1 = k.player.position.x;
  k.release("KeyD"); k.runTicks(5);
  expect(k.player.position.x).toBeGreaterThan(x1);  // 仍向前滑了
  expect(k.player.velocity.x).toBeLessThan(0.1);    // 但已接近停下
});

test("攻击起手刹车", () => {
  const k = new CombatKernel({enableReplay:false});
  k.press("KeyD"); k.runTicks(10);
  const v0 = k.player.velocity.x;
  k.press("KeyJ"); k.tick();         // 起 NormalBasic1
  expect(k.player.velocity.x).toBeLessThan(v0 * 0.5);  // 至少打 5 折以下
});

test("命中击退把怪推开", () => {
  const k = new CombatKernel({enableReplay:false});
  const grunt = k.actors.find(a => a.id === "grunt")!;
  grunt.position.x = 110;             // 进入玩家 NormalBasic1 hitbox
  const x0 = grunt.position.x;
  k.requestAction(k.player, "NormalBasic1");
  k.runTicks(15);
  expect(grunt.position.x).toBeGreaterThan(x0 + 5);   // 至少推开 5px
});

test("boss mass 推不动", () => {
  const k = new CombatKernel({enableReplay:false});
  const boss = k.actors.find(a => a.id === "boss")!;
  boss.position.x = 110;
  const x0 = boss.position.x;
  k.requestAction(k.player, "NormalBasic1");
  k.runTicks(15);
  expect(boss.position.x - x0).toBeLessThan(5);       // boss mass=4 几乎不动
});
```

### 6.13 E 段对 deterministic scenario 的影响

`runDeterministicScenario` 内每段都 `setPosition` + `requestAction` + `runTicks`。引入 velocity / 击退后，第 N 段命中会让怪 velocity ≠ 0，第 N+1 段开始之前如果只 `setPosition` 不 `setVelocity`，怪会因为残留 velocity 漂走。

**修复**：

```ts
runDeterministicScenario(): ScenarioBooleans {
  this.reset();
  // ...
  const resetActor = (a: Actor, x: number) => {
    a.position.x = x;
    a.velocity.x = 0; a.velocity.z = 0; a.velocity.y = 0;
    a.reactionState = "none";
  };

  resetActor(grunt, 130);
  this.requestAction(player, "NormalBasic1");
  this.runTicks(9);
  this.hitStop.clear(); this.recoil.clear();

  resetActor(grunt, 130);    // 而不是只 grunt.position.x = 130
  // ...
}
```

7 个 boolean 需要重跑确认。预计风险是 `ragingFuryMultiHitObserved`——RagingFury 有 8 个柱命中，每次都击退，第 5-8 段如果柱位置打不到就会失败。**对策**：每柱命中后 scenario 内显式重置 grunt.position 回 130，或者把 RagingFury 的 knockbackX 在 pillar hitbox 上设小（≤ 8），让 grunt 不会被推出 hitbox。

### 6.14 E 段红线复述

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

```text
[c1]  docs：本文进库
[c2]  B 段：types 扩展 + MovementInputProvider + RootMotionController + CombatKernel.applyRootMotion
[c3]  B 段：CombatKernel.worldBounds + clampToBounds + isMovementHeld 4 向版
[c4]  B 段：tests/static/walk-run-z.test.ts + movement-bounds.test.ts → 全绿
[c5]  B 段：CombatScene.createGround 加横向 z 网格
        手动验证：W/S 推 z 有效、走到边界停下、纵深网格肉眼可见
[c6]  A 段：ActorSprite 装配（head/body/legs/shadow）+ kind 调色 + 死亡 alpha
[c7]  A 段：ActorSprite.setReactionPose（downed angle=90）
[c8]  A 段：ActorSprite 武器 + 攻击挥砍弧（仅玩家）
[c9]  A 段：CombatScene 替换 createActorView → ActorSprite，静态验证不动作
[c10] A 段：EffectLayer 骨架 + 6 个对象池
[c11] A 段：EffectLayer 订阅 HitConfirmed/ArmorHit/ReactionApplied 画特效；闪白逻辑迁自 DebugLayer
[c12] A 段：DamageNumberRequested 扩到所有 actor（不止玩家）
[c13] A 段：HudLayer + PerformanceMonitor + DOM 玩家信息条
[c14] C 段：FixedStepSimulation.setSlowMotion + armSingleStep
[c15] C 段：F2-F6 注册到 CombatScene；F6 reset；CommandInputParser ForceDownPlayer 从 F6 → F9
[c16] D 段：AudioUnlockGate + BootScene 解锁 + EffectLayer playHit 派发
[c17] 集成验收：npm run typecheck && npm run static:test && npm run build 全绿；7 scenario boolean 全 PASS；手动 checklist
[c18] 清理：删除 RenderAdapter.ts（如果不再被引用）
```

每个 commit 必须保 typecheck + static:test 绿。c5 之后玩家就能 4 向走，可以先合并；c9 之后视觉立刻像样。c17 之前不要合 main。

---

## 7. 验收口径

### 7.1 自动化（必须全绿）

```text
□ npm run typecheck
□ npm run static:test（含新增 walk-run-z + movement-bounds 两个测试）
□ npm run build
□ deterministic scenario 7 个 boolean 全 PASS
  (normalHit / launch / ragingFuryMultiHit / armorHit / buildingArmorBlockedControl / bleed / quickRebound)
```

### 7.2 手动 checklist

```text
[B 段]
□ W/S/↑/↓ 玩家 z 轴上下移动；走到 z 边界自动停下
□ 斜向走（D+S 或 A+W）速度不超过单向（≤ speed × √2）
□ 纵深透视网格肉眼可见
□ 镜头仅跟 x，不跟 z（玩家走纵深时镜头不水平偏移）
□ z 轴位置影响命中：玩家从 z=120 普攻，z=0 怪不应被命中（按 hitbox.d 决定）

[A 段]
□ actor 不再单一矩形：玩家有头/身/双腿/武器，怪也有头/身/腿
□ 玩家面朝右时刀在右侧，按 A 转向左侧时刀镜像
□ 普攻命中画白色挥砍线 + target 闪白 80ms
□ Frenzy 期间普攻挥砍线变红、刀变红
□ UpwardSlash 命中画 uppercut 弧形椭圆
□ RagingFury 命中画双层红黄椭圆爆炸
□ Boss / 钢墙桩被普攻命中画金色十字火花（armorSpark）
□ 飘伤害数字在所有 actor 头顶都能看到
□ 倒地状态下 actor 旋转 90 度
□ 玩家 HP/Frenzy 条左上角实时刷新
□ 怪头顶有 HP 可视化条，颜色按 kind 区分

[C 段]
□ F1 切 DebugLayer 整体显隐
□ F2 切 hitbox/hurtbox 线框
□ F3 进入慢动作（0.25 倍速），再按一次回正常
□ F4 单帧步进（pause → tick 一次）
□ F5 切换 Frenzy buff
□ F6 重置所有 actor 回初始位置 / HP / 状态
□ F9 ForceDownPlayer（迁自 F6）

[D 段]
□ 第一次进 CombatScene 之前点 Boot 的 Start 按钮，AudioContext 解锁
□ 普攻命中有 light 合成音
□ Boss/钢墙桩 armor 命中有 armor 短促合成音
□ UpwardSlash 命中有 uppercut 合成音
□ RagingFury 命中有 burst 合成音
□ Frenzy 期间普攻有 berserk 合成音

[FPS HUD]
□ 左上角显示 fps / tick cost / render cost，60 FPS 稳定
```

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| RootMotionController 加 movementInput 参数破坏现有签名 | 静态测试报红 | 把参数做成可选；老调用点（敌人 EnemyAI 临时位移、Backstep 帧脚本）不传，行为完全不变 |
| z 轴位移与 PushBoxResolver 冲突 | 玩家穿入怪 / 抖动 | PushBoxResolver 已处理 x/z 两轴；速度上限 4px/tick 远小于 PushBox 半径，不会越过 |
| ActorSprite 子节点性能 | 5 actor × 8 子节点 = 40 GameObject，5 个 actor 量级无压力 | 不缓存对象池；5 actor 量级 Phaser 性能预算够 |
| EffectLayer 订阅事件后命中刷新过多 | 短时间多段命中累积 graphics 卡顿 | 6 个池 each ≤ 16 容量；用 ttl 复用；销毁批量 destroy(true) |
| Walk/Run 期间 isMovementHeld 4 向放宽，导致按方向键起 Walk 后释放方向却仍在 Walk | currentAction 不结束 | RunCommandDetector.detect 仍处理"释放即终止" mode；CombatKernel 在 movement action 结束分支（updateActions）通过 isMovementHeld 双重保险 |
| 慢动作期间 RAF deltaMs 仍按真实时间走，accumulator 缩放 0.25 后 catch-up 永远不到，看起来卡 | 玩家以为 hang | 把 maxCatchUpTicks 在 slowMotion 下不变；正常 60FPS 一帧 16ms × 0.25 = 4ms 喂 accumulator，每秒积累 240ms = 14 tick，仍能稳态运行 |
| 玩家 z 轴自由后，0.2 deterministic scenario（玩家初始位置 x=80 z=0）受影响 | 7 个 boolean 失败 | runDeterministicScenario 内部仍手动 setPosition，不通过 inputState；MovementInputSnapshot 在 inputState 全空时 xDir/zDir 都为 0，不会推位 |
| AudioUnlockGate 在 Safari/iOS 失败 | 无声 | 静默 fallback：unlock 抛错时记录 console.warn，不阻塞 startCombat |
| Phaser bundle 体积膨胀（继承自上一轮） | dist 大 | 不改，留给 R5 |

---

## 9. 开发约定

```text
1. 代码标识符英文，正文中文；
2. 每个 commit 必须保 typecheck + static:test 绿；
3. 每个 commit 信息以 `[c2] B 段：MovementInputProvider 落地` 这种格式写；
4. 不要在 ActorSprite / EffectLayer / HudLayer 里 import combat 的具体业务类，仅 import types；
5. 不要在 CombatKernel 里 import phaser；
6. AudioUnlockGate 只在 BootScene / CombatScene 持有引用；
7. tuning 数值改动同步更新 docs/tuning-baseline.md；
8. 任何新增 ActionName / 事件类型必须更新 spec 第 12/13 章对应小节，或在 docs/architecture.md 备注。
```

---

## 10. 文档维护

```text
1. 本文与 spec 出现冲突时以 spec 为准；
2. R3 / R4 完成后，docs/training-ground-r1-r2-plan.md 中 §7 R3/R4 预告可删除；
3. 实施过程中如发现需要新增 ActionName 或新 RootMotion 字段，先更新本文 §1.2，再写代码。
```
