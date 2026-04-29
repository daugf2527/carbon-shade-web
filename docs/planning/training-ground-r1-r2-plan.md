# Training Ground R1 + R2 开发指导方案

> 范围：把 Combat Lab 0.2-R3 从"内核 + 静态截图验证"升级为"可手动操作的 2.5D 横版站桩验证场"。
> 本文档不是新规格，是 `combat-lab-0.2-r3-final-integrated-development-spec.md` 在**表现层**的落地指导。所有内核红线（HitResolver2D5 决定命中、FeedbackController 不写战斗状态、Phaser Scene 不决定命中等）继续守住。
> 本轮交付：R1（行走/奔跑/横版场景）+ R2（怪物 AI 反击）。R3（Debug HUD 升级）+ R4（视觉打磨）留下一轮。
> 语言：代码标识符英文，正文中文。

---

## 0. 目标与不做项

### 0.1 本轮目标

```text
1. 玩家在 2400×640 横版世界中可走、可跑（DNF 双击）；
2. 镜头跟随玩家，背景层视差，地面层带网格；
3. 4 个怪物按 x 散布：小怪 / 精英 / Boss / 钢墙桩；
4. 玩家可走过去用 X 普攻、↑Z 上挑、↓↑Z RagingFury 等命中怪物；
5. 小怪 / 精英 / Boss 三种怪具备最小 AI：靠近 → 出招 → 命中玩家 → 玩家进入硬直；
6. 钢墙桩不动不打人，仅作 BuildingArmor 验证；
7. 稳定验证链（typecheck / static:test / build）零回归；
8. Debug 入口至少保留 Reset / Run Scenario / Export Replay 三个按钮，HUD 升级留 R3。
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

新增：

```text
src/game/BootScene.ts
src/game/CombatScene.ts                 (重写为 Phaser.Scene 的子类，旧版改名 CombatScene.legacy.ts 临时保留参考)
src/game/CameraController.ts
src/game/layers/BackgroundLayer.ts
src/game/layers/GroundLayer.ts
src/game/layers/ActorLayer.ts
src/game/layers/DebugLayer.ts
src/game/layers/HudLayer.ts             (R1 仅放 3 个按钮 + scenario 7 灯，完整面板留 R3)
src/combat/input/RunCommandDetector.ts
src/combat/ai/EnemyAI.ts
src/combat/ai/EnemyAIState.ts
src/data/actions/movement.ts            (Walk / Run frame data)
src/data/actions/enemy.ts               (EnemyBasic frame data)
src/data/ai/enemyTuning.ts              (按怪种 tuning 表)
docs/training-ground-r1-r2-plan.md      (本文)
```

修改：

```text
src/main.ts                             (替换为 Phaser.Game 启动)
src/combat/types.ts                     (ActionName 扩展)
src/combat/actions/FrameDataAction.ts   (注册新 Action)
src/combat/kernel/CombatKernel.ts       (consumeInput 白名单 + AI tick + Run 状态字段)
src/combat/actors/ActorFactory.ts       (创建 enemy 时挂 ai 配置)
src/combat/input/BrowserInputState.ts   (暴露 release-edge 给 RunCommandDetector)
index.html                              (新增 #game-root div + Phaser canvas 容器)
vite.config.ts                          (确认无需改动；如必要加 phaser 别名)
package.json                            (无新增依赖，phaser 已存在)
```

删除/改名：

```text
src/game/RenderAdapter.ts → 弃用（功能拆到 layers/）；保留一份 .legacy.ts 直到 R3 截图链路验证完毕再删
```

---

## 2. R1 — 行走 / 奔跑 / 横版场景

### 2.1 ActionName 扩展

```ts
// src/combat/types.ts
export type ActionName =
  | "Idle"
  | "Walk"           // ← 新
  | "Run"            // ← 新
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
  | "EnemyBasic"     // ← 新（R2 用，但同一 PR 注册）
  | "ForceDownPlayer" | "ForceBleed" | "RunScreenshotScenario";
```

### 2.2 Walk 帧表

```ts
// src/data/actions/movement.ts
export const WalkAction: FrameDataAction = {
  actionName: "Walk",
  totalFrames: 1,                 // 持续动作：每 tick 视为新一帧
  startup: [],
  active: [],                     // 无 hitbox
  recovery: [],
  cancelPolicy: {
    whiffCancelFrom: 0,
    hitCancelFrom: 0,
    into: ["NormalBasic1","FrenzyBasic1","UpwardSlash","MountainousWheel",
           "RagingFury","Backstep","Run","Idle"]
  },
  hitStopProfile: { frames: 0 },
  recoilProfile: { frames: 0 },
  rootMotion: {
    kind: "continuous_directional",
    speedXPerTick: 2,             // 由 facing 决定方向
    appliesEveryFrame: true
  },
  feedbackProfile: { sfxOnEnter: null }
};

export const RunAction: FrameDataAction = {
  ...WalkAction,
  actionName: "Run",
  rootMotion: { ...WalkAction.rootMotion!, speedXPerTick: 4 },
  cancelPolicy: { ...WalkAction.cancelPolicy, into: [...WalkAction.cancelPolicy.into!, "Walk"] }
};
```

落地约束：

```text
1. Walk / Run 是"持续动作"——tick 中只要按键还 held，就让 currentAction 留在 Walk/Run；
2. 实现方式：localFrame 每 tick++ 但 totalFrames 检查改成"按键释放 → ended"，不靠帧表 totalFrames 自然终结；
3. RootMotionController 已支持 speedXPerTick × facing，无需新增逻辑，只需 FrameDataAction 提供新字段；
4. 进入 Walk/Run 不消耗 cooldown / resource；
5. Walk/Run 进入条件：currentAction 为空 / 当前为 Walk-itself / 当前为 cancelable recovery；
6. Walk/Run 在 hit stop 期间冻结位移（沿用 RootMotionController.apply 中的 hitStop guard）。
```

### 2.3 双击进 Run（DNF 街机原版）

```ts
// src/combat/input/RunCommandDetector.ts
export interface RunCommandDetectorState {
  // 每个方向（Left / Right）独立追踪
  lastReleaseTick: number | null;
  pendingDoubleTap: boolean;
  doubleTapWindowFrames: 10;     // 第一次释放后 10 帧内若再次 press 则进入 pending
  holdAfterPressFrames: 2;       // 第二次 press 持续 ≥ 2 帧才升级为 Run
}
```

判定算法（每 tick 调一次，紧跟 collectInput 之后）：

```text
对每个水平方向 d ∈ {Left, Right}：
  1. 检测 release edge：上一帧 held 且本帧 not held → lastReleaseTick = tick；
  2. 检测 press edge：上一帧 not held 且本帧 held：
       if lastReleaseTick != null && (tick - lastReleaseTick) ≤ 10:
         pendingDoubleTap = true
       else:
         pendingDoubleTap = false
  3. 若 pendingDoubleTap == true 且方向键已 held ≥ 2 帧：
       触发 ActionRequest("Run", source="command", facing=d)
       清 pendingDoubleTap
  4. 若方向键 release：
       若当前 currentAction == "Run"：currentAction = undefined（Run 退出）；
       不影响别的动作。
  5. 单纯 press 且没有进入 doubleTap：
       触发 ActionRequest("Walk")（仅当 currentAction 为空或为 Walk）。
```

实现位置二选一（推荐 A）：

```text
A. 单独 RunCommandDetector：放 src/combat/input/RunCommandDetector.ts
   - 不动 CommandInputParser；专注水平双击；
   - kernel.collectInput() 后调用一次；
   - 对外暴露：detect(tick, inputState, facing) → ActionName | null
B. 扩展 CommandInputParser：把 Walk/Run 也放进 SkillCommandRegistry
   - 一致性更好但 SkillCommand 现有结构是单次触发，需要扩"持续 hold"概念，改动面比 A 大
```

### 2.4 InputBuffer 白名单 + cancel 规则

`CombatKernel.consumeInput()` 的 allowed 集合：

```ts
const allowed = new Set<ActionName>([
  "Walk","Run",                     // ← 新增
  "NormalBasic1","UpwardSlash","MountainousWheel","RagingFury",
  "Backstep","QuickRebound","FrenzyToggle","Derange","Diehard",
  "ForceDownPlayer","ForceBleed","RunScreenshotScenario"
]);
```

cancel 矩阵补充：

| 当前动作 | 可被打断进入 |
|---|---|
| Idle / Walk | 任意攻击 / 技能 / Run / Walk |
| Run | 任意攻击 / 技能 / Walk（释放方向）|
| NormalBasic1 命中后 | NormalBasic2 / 任意技能 |
| 任意攻击的 cancel_window | Walk / Run（让连段后能立刻跑开）|
| 任意攻击的 startup / active | **禁止** Walk / Run cancel |

落地：在每个攻击 Action 的 `cancelPolicy.into` 末尾追加 `"Walk","Run"`，保证攻击后期可以接走/跑。startup/active 阶段由 `localFrame < hitCancelFrom` 自动屏蔽。

### 2.5 deterministic scenario 不动

```text
runDeterministicScenario() 仍然手动 setPosition + requestAction(NormalBasic1/UpwardSlash/...)
不调 Walk / Run。
原因：保 7 个 scenario boolean + screenshot 完全等价。
新加测试要单独写在 tests/static/walk-run.test.ts，不混入截图链路。
```

### 2.6 Phaser 启动入口

`index.html`：

```html
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Combat Lab 0.2-R3 Training Ground</title></head>
  <body style="margin:0;background:#0b1220;color:#e2e8f0;font-family:monospace">
    <div id="game-root"></div>
    <div id="hud-root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`：

```ts
import Phaser from "phaser";
import { BootScene } from "./game/BootScene.js";
import { CombatScene } from "./game/CombatScene.js";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-root",
  width: 1000,
  height: 640,
  backgroundColor: "#0b1220",
  pixelArt: true,
  scene: [BootScene, CombatScene],
  fps: { target: 60, forceSetTimeOut: false },
  render: { antialias: false, pixelArt: true }
});

(window as any).combatLab = game;
```

### 2.7 BootScene

职责：

```text
1. 加载占位资源（实际上本轮无外部资源，只是规范化 boot 流程）；
2. 等待用户点击"Start"按钮（满足 spec 9.3 AudioUnlockGate）；
3. scene.start("combat")。
```

最小实现伪代码：

```ts
// src/game/BootScene.ts (描述，不写实际代码)
class BootScene extends Phaser.Scene {
  constructor() { super("boot"); }
  create() {
    // 居中绘制 "Combat Lab 0.2-R3 Training Ground" 标题
    // 居中按钮 "Start"
    // 点击 → AudioContext.resume() → this.scene.start("combat")
  }
}
```

### 2.8 CombatScene

职责拆给 layers，scene 自己只做装配 + tick 驱动：

```text
class CombatScene extends Phaser.Scene {
  kernel: CombatKernel;
  simulation: FixedStepSimulation;

  layers: { background, ground, actor, debug, hud };
  cameraController: CameraController;
  runDetector: RunCommandDetector;

  create():
    1. new CombatKernel({ enableReplay:true });
    2. new FixedStepSimulation(kernel);
    3. instantiate layers, attach to scene.add;
    4. cameraController.bind(this.cameras.main, () => kernel.player.position.x);
    5. setup keyboard listeners → kernel.inputState.keyDown / keyUp
    6. setup HUD button events → kernel.reset() / runDeterministicScenario() / replay.export()

  update(time, delta):
    1. simulation.update(delta);
    2. layers.actor.sync(kernel.actors);
    3. layers.debug.sync(kernel.debugSnapshot());
    4. layers.background.parallax(camera.scrollX);
    5. layers.hud.refresh(kernel.scenario, kernel.replay.length);
    6. cameraController.tick();
}
```

### 2.9 世界 / 镜头 / 坐标

```text
worldWidth         = 2400
worldHeight        = 640
groundLineY        = 440        // 地平线在屏幕 y
playerSpawnX       = 200
cameraDeadzoneX    = 300        // 镜头死区半径
cameraLerp         = 0.08       // 平滑跟随系数
camera.bounds      = (0, 0, 2400, 640)
parallaxFar        = 0.2        // 远景滚动倍率
parallaxNear       = 0.6
```

坐标映射严格遵守 spec 第 793 行：

```text
screenX = actor.position.x      (世界坐标 = 屏幕坐标，相机做差)
screenY = groundLineY + actor.position.z - actor.position.y
sortDepth = screenY             (底下的盖上面)
```

### 2.10 BackgroundLayer

绘制方式（占位，纯几何）：

```text
1. 远景：3 段渐变色块矩形（深紫 → 深蓝 → 蓝灰），z 序最深，scrollFactor=0.2；
2. 中景：3-5 个倒三角形拼成的山影，scrollFactor=0.5，颜色 #1e293b；
3. 近景：地平线上 5-8 棵树（绿色三角 + 棕色矩形），scrollFactor=0.85；
4. 全部用 Phaser.GameObjects.Graphics 一次绘制，不用纹理。
```

### 2.11 GroundLayer

```text
1. 地平线：从 (0, 440) 到 (2400, 440) 横向直线，浅灰 #475569；
2. 地面网格：每 80px 画一道纵向虚线（颜色 #334155），从 y=440 到 y=520；
3. 地面阴影：在 y=440 下方 #0f172a 渐变 fill 到 y=640，做出地面厚度感；
4. 不参与战斗逻辑；scrollFactor=1.0。
```

### 2.12 ActorLayer

```text
按颜色编码（占位）：
  player    → #2563eb 蓝
  grunt     → #dc2626 红
  dummy     → #f59e0b 橙（精英）
  boss      → #7c3aed 紫
  building  → #475569 灰

每个 actor 渲染：
  body  : Phaser.GameObjects.Rectangle，宽 32 高 48，向上锚点为 actor.position
  shadow: 椭圆 #000000 alpha=0.4，以 (x, groundLineY+z) 为中心
  label : 顶部小文字 "玩家 / 小怪 / 精英 / Boss / 钢墙"
  hpBar : 顶上方 30px 处，红底绿前景，宽 32

actor.facing → body.scaleX = facing === "right" ? 1 : -1
actor.reactionState === "downed" → body.angle = 90
actor.reactionState === "launch" → body 跟随 actor.position.y 抬升

ActorLayer.sync(actors) 每 update 调一次，不缓存对象池（5 个 actor 量级无压力）。
```

### 2.13 DebugLayer

R1 必做：

```text
1. HitBox：当某 actor.currentAction 处于 active window 时，在世界坐标里画当前 hitbox 矩形（红色描边 alpha=0.6）；
2. HurtBox：始终画（蓝色描边 alpha=0.3）；
3. PushBox：始终画（绿色描边 alpha=0.3）；
4. 命中闪光：订阅 bus.archive 最新 HitConfirmed，在 target 上画 80ms 白色全身覆盖；
5. F1 切换 DebugLayer 可见性。
```

实际 hitbox 必须从 kernel 实时计算，不能从配置表硬画 —— 满足 spec 第 2467 行约束。

### 2.14 HudLayer（R1 极简版）

```text
顶部按钮条（DOM，不在 Phaser 里）：
  [Reset]  [Run Scenario]  [Export Replay]  [Toggle Hitboxes]
底部条幅（DOM）：
  Tick: 1234 | Replay frames: 567
  ● normalHitObserved   ● launchObserved   ...（7 灯）
LastHitTrace 卡片（DOM, 1 行）：
  attacker → target  damage=12  reaction=launch  source=NormalBasic1  tick=80
```

完整 EventTracePanel 留 R3。

### 2.15 R1 验收口径

手动验收（在 dev server 上）：

```text
□ 打开 http://localhost:5173 → 看到 Boot 页 → 点 Start → 进入 Combat 场景；
□ 看到天空、远山、树、地面网格、玩家、4 个怪物按 x 散布；
□ 按住 → 玩家面朝右走，速度约 120 px/s（2 px/tick × 60 tick/s）；
□ 双击 → → 玩家进入跑步，速度约 240 px/s；释放方向键停止；
□ 镜头跟随玩家在 deadzone 外移动；走到地图右边界停止；
□ 走到小怪面前按 X，X 普攻命中小怪（看到红方块缩短 HP 条 + 白闪）；
□ X→X→X 在 cancel window 内能接出 NormalBasic2/3；
□ 上挑 Z 把小怪挑飞，看到怪 y 抬升，落地变 90 度倒地姿态；
□ ↓↑Z 放 RagingFury，看到怪被多段命中（≥4 段）；
□ 走到 Boss 木桩按 X，看到 ArmorHit 反馈（金色火花 + 怪不进入硬直）；
□ 走到钢墙桩按 X，看到 BuildingArmor 反馈（控制被吃，伤害仍生效）；
□ 按 F1 → HitBox/HurtBox/PushBox 线框显隐切换；
□ 按 Reset → 所有 actor 回初始位置 / HP / 状态；
□ 按 Run Scenario → 自动播一遍 deterministic，7 灯全亮；
□ 按 Export Replay → 浏览器下载 replay.json。
```

自动化验收：

```text
□ npm run typecheck 通过；
□ npm run static:test 通过（含新加的 walk-run.test.ts，但不依赖浏览器）；
□ npm run build 通过。
```

---

## 3. R2 — 怪物 AI 反击

### 3.1 EnemyBasic 帧表

```ts
// src/data/actions/enemy.ts
export const EnemyBasicAction: FrameDataAction = {
  actionName: "EnemyBasic",
  totalFrames: 36,
  startup: [{ start: 1, end: 8 }],
  active: [{
    start: 9, end: 14,
    hitGroupId: "enemy_basic_swing",
    hitboxId: "enemy_basic",
    hitType: "normal",
    shapeType: "forward_only",
    localBox: { xMin: 10, xMax: 60, zMin: -3, zMax: 3, yMin: 0, yMax: 80 },
    sourcePolicy: {
      damageSourceKind: "enemy_normal",
      reactionPolicy: "normal_hit_reaction"
    },
    maxTargets: 1
  }],
  recovery: [{ start: 15, end: 36 }],
  cancelPolicy: {
    whiffCancelFrom: 30,         // 落空可早出，玩家可以反打
    hitCancelFrom: 24,
    into: []                      // 怪物不接连段
  },
  hitStopProfile: { frames: 4 },
  recoilProfile: { frames: 6 },
  feedbackProfile: { sfxOnEnter: null }
};
```

注：

```text
1. EnemyBasic 是怪物专用 Action，玩家请求会被 requestAction 中加守卫拦下：
   if (actor.id === "player" && actionName === "EnemyBasic") return false;
2. 伤害公式走 DamageResolver 既有路径，配置 baseDamage 由 enemyTuning 提供；
3. 命中玩家后玩家 reactionState 自动进 "hit" / "launch"（看 reactionPolicy 与 decision），
   走现有 ReactionResolver。
```

### 3.2 EnemyAI 状态机

```ts
// src/combat/ai/EnemyAIState.ts
export type EnemyAIPhase = "idle" | "approach" | "windup" | "attacking" | "recover" | "stunned";

export interface EnemyAIState {
  phase: EnemyAIPhase;
  phaseEnteredTick: number;
  windupRemaining: number;       // tick
  recoverRemaining: number;      // tick
  detectRange: number;
  attackRange: number;
  preAttackFrames: number;
  postCooldown: number;
  moveSpeedPerTick: number;
  loseAggroRange: number;
}
```

转移规则（每 tick 在 `EnemyAI.tick(actor, kernel)` 内执行）：

```text
入口守卫：
  if actor.flags.dead: phase = "stunned"; return;
  if actor.reactionState ∈ {hit, launch, downed, getting_up}:
    phase = "stunned"; phaseEnteredTick=tick; return;
  （phase === "stunned" 时 tick++ 后看 reactionState 是否恢复 normal/none，恢复则回 idle）

idle:
  dx = |player.x - actor.x|
  if dx < detectRange: → approach
  else: 不动

approach:
  if dx > loseAggroRange: → idle
  if dx < attackRange:    → windup, windupRemaining = preAttackFrames
  else:
    actor.facing = sign(player.x - actor.x)
    actor.position.x += facing * moveSpeedPerTick   // 直接位移；不走 RootMotion，因为没有 currentAction

windup:
  windupRemaining--
  if windupRemaining ≤ 0:
    success = kernel.requestAction(actor, "EnemyBasic", "ai")
    if success: → attacking
    else: → recover, recoverRemaining = postCooldown   // 被自身 cooldown 挡住

attacking:
  // 等 currentAction 自然结束（FrameDataAction 帧表推进 by tick）
  if actor.currentAction == undefined: → recover, recoverRemaining = postCooldown

recover:
  recoverRemaining--
  if recoverRemaining ≤ 0: → idle

stunned:
  // 被打中或倒地，等反应链恢复
  if actor.reactionState ∈ {none, normal}: → idle
```

约束：

```text
1. EnemyAI 不直接调用 reactionResolver / damageResolver；
2. 所有伤害仍走 HitResolver2D5 → HitDecisionResolver → DamageResolver；
3. EnemyAI 写 actor.position.x 是允许的，因为这等价于 enemy 在 idle 状态下的"巡逻位移"，
   战斗真相层不在乎 enemy 怎么挪到攻击位置，只在乎 active window 时的 hitbox 几何；
4. 钢墙桩（building）的 EnemyAI 直接禁用（detectRange=0），原地不动；
5. 玩家 hp <= 0 时所有 EnemyAI → idle，不补刀（spec 暂不做）。
```

### 3.3 怪物 tuning 表

```ts
// src/data/ai/enemyTuning.ts
export const EnemyTuning: Record<ActorId, EnemyAIState & { hp:number, damage:number, armor:BaseArmorType }> = {
  grunt: {
    phase:"idle", phaseEnteredTick:0, windupRemaining:0, recoverRemaining:0,
    detectRange: 220, loseAggroRange: 320, attackRange: 55,
    preAttackFrames: 12, postCooldown: 30, moveSpeedPerTick: 1.4,
    hp: 80, damage: 5, armor: "enemy_normal"
  },
  dummy: {        // 精英
    detectRange: 260, loseAggroRange: 360, attackRange: 60,
    preAttackFrames: 22, postCooldown: 45, moveSpeedPerTick: 1.0,
    hp: 200, damage: 12, armor: "super_armor"
  },
  boss: {
    detectRange: 360, loseAggroRange: 500, attackRange: 80,
    preAttackFrames: 36, postCooldown: 60, moveSpeedPerTick: 0.7,
    hp: 600, damage: 25, armor: "boss_super_armor"
  },
  building: {
    detectRange: 0, loseAggroRange: 0, attackRange: 0,
    preAttackFrames: 0, postCooldown: 0, moveSpeedPerTick: 0,
    hp: 9999, damage: 0, armor: "building_armor"
  }
};
```

ActorFactory 创建时把 tuning 注入：

```text
1. createActor("grunt", ...) 后立即 actor.ai = clone(EnemyTuning.grunt)；
2. actor.armorProfile.baseType = tuning.armor；
3. actor.resources.hp = actor.resources.hpMax = tuning.hp。
```

### 3.4 接入 tick pipeline

`CombatKernel.tick()` 在现有 12 步基础上**加一处**：

```text
01. beginTick
02. collectInput（含 RunCommandDetector）
03. parseCommand
04. bufferInput
05. updateHitStopAndFreezeState
05.5  >>> NEW: tickEnemyAI（在所有 enemy 上跑 EnemyAI.tick）
06. updateActions
07. applyRootMotion
08. resolvePushBoxes
09. buildHitQueries
10. resolveHitDecisions
11. publish HitConfirmed/...
12. flushEventBus
13. updateReactionMotion
14. tickStatusEffects
15. tickBuffs
16. tickCooldownsAndResources
17. updateFeedbackQueue
18. recordReplayFrame
19. updateDebugOverlaySnapshot
20. endTickCleanup
```

为什么 05.5 而不是 02.5：

```text
- AI 决策依赖玩家位置 / 自身 reactionState / 自身 hp，这些在上一 tick 末尾已稳定；
- AI 的输出是"调 requestAction 创建 currentAction"或"挪 position.x"，必须在 updateActions 之前完成，
  这样 updateActions 当 tick 就能开始推帧；
- 如果放到末尾，AI 触发的 EnemyBasic 会延迟 1 tick 起 startup，反应不及时。
```

### 3.5 玩家受击的可见反馈

R2 需要让玩家明显感觉"被打了"，靠现有事件 + DebugLayer 即可：

```text
1. ReactionApplied(player, hit) → DebugLayer 在玩家身上画 200ms 红色描边 + camera shake 100ms；
2. HitStopStarted(player) → ActorLayer 暂停玩家位置插值（已天然实现，因为 RootMotion 在 hit stop 内冻结）；
3. DamageNumberRequested → HudLayer 在玩家头顶飘红色伤害数字。
```

不需要新事件，订阅 `bus.archive` 即可。

### 3.6 R2 验收口径

手动：

```text
□ 玩家进入小怪 detectRange，看到小怪转向并接近玩家；
□ 小怪进入 attackRange，原地 windup（约 12 帧 = 0.2s），出招时画出 hitbox；
□ 玩家不躲 → 被命中 → 看到玩家身上红描边 + 飘伤害数字 + 玩家 HP 减少；
□ 玩家在小怪 windup 阶段抢攻 → 小怪进入 stunned，AI 暂停；
□ 精英 / Boss 同样可触发反击，preAttackFrames 与 damage 与 tuning 表一致；
□ 钢墙桩永远不动；
□ Backstep（↓C）能脱离怪物攻击范围；
□ 玩家 HP=0 时 reactionState→downed，AI 全部回 idle，不再出招。
```

自动化（新增）：

```text
□ tests/static/enemy-ai.test.ts：
  - 构造 player + grunt 距离 100；
  - kernel.runTicks(60)；
  - assert grunt.position.x 已向 player 接近；
  - assert 60 帧内出现至少一次 EnemyBasic 的 ActionEntered 事件；
  - assert 玩家收到至少一次 DamageApplied（来自 enemy_normal）。
□ tests/static/run-detector.test.ts：
  - press("ArrowRight"); kernel.tick(); release("ArrowRight"); kernel.tick();
    press("ArrowRight"); kernel.runTicks(5);
  - assert player.currentAction.actionName === "Run"。
```

---

## 4. 验证 / 回归矩阵

### 4.1 必须保持绿的现有项

```text
✓ scripts/static-test.mjs 全通过
✓ scripts/build.mjs 全通过
✓ deterministic scenario 7 个 boolean 全 PASS
✓ ReplayRecorder 导出 JSON 与现有结构兼容（schema 不变，仅新增 actor 数据可向后兼容）
```

### 4.2 新增测试

```text
+ tests/static/walk-run.test.ts        Walk/Run state transition + cancel
+ tests/static/enemy-ai.test.ts        AI state machine + EnemyBasic damage flow
+ tests/static/run-detector.test.ts    双击识别窗口与边界条件
```

### 4.3 性能预算

```text
- 60Hz tick 单帧逻辑 < 4ms（5 个 actor，AI 简单状态机不会突破）
- Phaser render 预计 60fps 稳定
- Hit Box 数量上限本轮 ≤ 3（玩家当前 active hitbox + 1 个怪 active + 占位）
- DebugLayer 每帧重画 ≤ 30 个 graphics primitive
```

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| Walk/Run 持续 Action 与现有 action 生命周期模型冲突 | currentAction 永不 ended，导致 buff/cooldown tick 异常 | 在 updateActions 中给 Walk/Run 单独分支：按键释放即清空 currentAction，不走 totalFrames 分支 |
| 双击识别在浏览器 keydown repeat 干扰下误触发 | 误进 Run | RunCommandDetector 显式忽略 keydown repeat（BrowserInputState 已支持 e.repeat 过滤）|
| EnemyAI 直接写 position.x 与 PushBoxResolver 冲突 | 怪物穿入玩家 / 互相穿模 | 写位置后让 PushBoxResolver 在同 tick 后续步骤里收敛；位移大小 ≤ 1.5 px/tick 远小于 PushBox 半径 |
| Boss 超霸体下永远 stunned 不进 → AI 卡死 | Boss 站着不打人 | EnemyAI 入口守卫只在 reactionState ∈ {hit, launch, downed} 进 stunned；boss 命中只触发 ArmorHit 不改 reactionState，AI 不会卡 |
| 玩家被连续打到锁死 | 玩家无法反击 | grunt postCooldown=30 已是 0.5s；多怪同时攻击下后续轮可加 hitstun decay，本轮先观察 |
| Phaser 接入后浏览器截图链不稳定 | 本地验证超时 | 不把截图脚本作为 npm 验证入口，保留 typecheck/static:test/build 作为稳定闸门 |
| 引入 phaser import 后 tree-shaking 失败导致 bundle 巨大 | dist 体积膨胀 | 使用 import Phaser from "phaser/dist/phaser-arcade-physics.min.js" 的最小子集；本轮先不优化，记录在 R3 |

---

## 6. 实施顺序（动手时的 commit 边界）

```text
[c1] 文档：本文进库
[c2] 类型：types.ts ActionName 扩展 + EnemyAIState 类型定义
[c3] 数据：data/actions/movement.ts + data/actions/enemy.ts + data/ai/enemyTuning.ts
[c4] kernel：FrameDataAction 注册 Walk/Run/EnemyBasic + consumeInput 白名单
[c5] kernel：updateActions 处理持续 Action 生命周期（Walk/Run release 即 ended）
[c6] input：RunCommandDetector + BrowserInputState 扩 release-edge
[c7] 静态测试：walk-run.test.ts + run-detector.test.ts → 全绿
[c8] kernel：EnemyAI + tickEnemyAI 接进 pipeline + ActorFactory 注 tuning
[c9] 静态测试：enemy-ai.test.ts → 全绿
[c10] 前端：index.html + main.ts 替换为 Phaser 启动
[c11] 前端：BootScene + 极简 CombatScene 装配（黑屏 + tick 跑起来即可）
[c12] 前端：BackgroundLayer + GroundLayer + CameraController
[c13] 前端：ActorLayer + DebugLayer
[c14] 前端：HudLayer 极简（3 按钮 + 7 灯 + LastHitTrace 1 行）
[c15] 前端：玩家受击红描边 + 伤害数字 + camera shake
[c16] 集成：run npm run typecheck && npm run static:test && npm run build → 全绿，手动 checklist 跑一遍
[c17] 清理：移除 RenderAdapter.legacy.ts（如果截图链已迁移）或保留并标注
```

每个 commit 必须保 typecheck + static:test 绿。

---

## 7. R3 / R4 预告（不做，仅记录）

```text
R3 Debug HUD 升级
  - 完整 EventTracePanel（最近 30 条事件，按 priority 分色）
  - LastHitTrace 详情卡片
  - Slow-Mo / Single Step / Toggle Hitboxes 按钮
  - F2-F8 完整 Debug 快捷键
  - Scenario PASS/FAIL 7 灯改为面板
  
R4 视觉打磨
  - 命中白闪 + armor 金色火花动画
  - 飘伤害数字带渐变 + 弧线
  - 玩家受击 camera shake 调到位
  - 跑步起步扬尘（粒子）
  - 第一刀 / 上挑 / RagingFury 第一段命中音效（spec 9.3）
  - BootScene Start 按钮美化
  - 倒地姿态从"旋转 90 度"换成"专门的卧姿矩形"
```

---

## 8. 文档维护

```text
1. 本文与 spec 出现冲突时以 spec 为准；
2. 任何 tuning 数值改动必须同步更新 docs/tuning-baseline.md；
3. 任何新增 ActionName / 事件类型必须更新 spec 第 12 / 13 章对应小节（或在 docs/architecture.md 备注，待该文件创建）；
4. R2 完成后，本文 §7 R3/R4 预告搬到独立文档 docs/training-ground-r3-r4-plan.md。
```
