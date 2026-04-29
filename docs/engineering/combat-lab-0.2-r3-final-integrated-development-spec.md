# Combat Lab 0.2-R3 最终整合开发规格书

> 版本：Combat Lab 0.2-R3 Final Integrated Development Specification  
> 规格基线：Combat Lab 0.2 Kernel Foundation  
> 目标：在 Web 单机环境中，用 Phaser 3 + TypeScript + Vite 实现 DNF-style 狂战士核心战斗语义的工程化战斗内核。  
> 交付类型：完整工程，可 `docker compose up` 一键运行，可构建、可静态测试、可截图验证、可调试、可记录并导出 Replay 数据。  
> 适用对象：开发 Agent、Claude Code、Codex CLI、静态审查 Agent、验收人员。  
> 语言约定：代码、文件名、内部标识统一英文；规格正文使用中文；必要术语保留中文 / 韩文 / 英文对照。  

---

## 0. 整合说明

> R3 修订说明：本版在 R1 基础上继续执行 Implementation Consistency Pass，完整修复 Buff/Status 事件类型、Damage source/reaction policy、QuickRebound hold 语义、Docker 产物写回、HitResult 残留、temporaryFlags Tick 口径、Backstep RootMotion、HitBox 方向语义、Death cleanup barrier、截图确定性场景、Resource/Cooldown gate、Verification report 命令字段、Debug actions 等问题；不新增 0.3 范围。

本规格书以 `Combat Lab 0.2 开发规格书` 为最终工程基线，吸收 `Combat Lab 0.1-R3` 的手感闭环、`Combat Lab 0.1-DNF-1to1` 的机制纠偏，以及缺失模块清单中的底层战斗内核、异常状态、Buff、抓取、死亡、推挤、逆硬直、Replay、性能监控等补充项。

本规格书不是简单拼接资料，而是做了以下统一处理：

```text
1. 以 0.2 作为最终版本号和最终开发目标；
2. 保留 0.1-R3 中“输入稳定、命中可信、受击有质量、Debug 可解释”的验收口径；
3. 采用 DNF-1to1 文件中对 Frenzy、RagingFury、Backstep、QuickRebound、ArmorProfile 的强制纠偏；
4. 把“缺失模块清单”中真正影响扩展性的内容纳入 0.2 必做范围；
5. 把高风险或未核验内容降级为 baseline_tuning / community_estimate，不作为官方精确帧；
6. 所有泄漏源码、私服代码、客户端反编译代码、官方素材均排除在实现依据之外。
```

最终判断标准：

```text
Combat Lab 0.2 不是 DNF 皮肤 Demo。
它是一个 DNF 风格狂战士基础战斗机制的 Web 验证台。
必须先机制正确，再谈手感。
必须先解释得清，再谈像不像。
```

---

## 1. 项目定位

### 1.1 核心目标

Combat Lab 0.2 的核心目标是：

```text
把当前 Demo 从“技能能跑”升级为“战斗规则可扩展、可追踪、可验证的事件驱动 Combat Kernel”。
```

0.2 不以堆技能为目标，而以补齐底层内核为目标。必须完成：

```text
1. CombatEventBus 完整事件流；
2. FixedStepSimulation 固定 60Hz 逻辑帧；
3. BrowserInputState + CommandInputParser + InputBuffer；
4. ActionInstance + FrameDataAction + CancelPolicy；
5. HitQuery → HitDecision → ArmorDecision → DamageApplied → ReactionApplied 全链路；
6. CooldownResourceKernel；
7. StatusEffectSystem；
8. BuffLifecycleSystem；
9. ArmorProfile：BaseArmorType + immunity flags + temporary flags；
10. GrabResolver baseline；
11. PushBoxResolver；
12. DeathLoop / Interrupt / Cleanup；
13. HitStop + Recoil；
14. DebugOverlay / LastHitTrace / EventTracePanel；
15. ReplayRecorder：记录、导出、Debug 显示；ReplayPlayer 仅接口预留；
16. PerformanceMonitor / ObjectPool；
17. Static tests / screenshot verification / verification report。
```

### 1.2 本版本的 DNF-style 对齐定义

本项目中的“DNF-style / DFO-style 对齐”只针对已纳入范围的机制。文档中出现“1:1”时，只表示机制语义和操作语义对齐，不表示官方客户端精确复刻：

```text
1. 战斗语义 1:1：
   已纳入的动作、Buff、异常、霸体、倒地、受身、命中链路，按 DNF PC / DFO 公开机制语义实现。

2. 操作语义 1:1：
   方向指令、普通攻击、技能键、后跳、倒地受身、指令优先级等，按 DNF PC 操作语义实现。

3. 职业语义 1:1：
   狂战士由 Frenzy、BloodyCross、VimAndVigor、Derange、Diehard、RagingFury、MountainousWheel 等系统共同构成。
   禁止把 Frenzy 写成“低血自动双刀 12 秒”。

4. 工程解释 1:1：
   每一次命中、未命中、霸体改写、倒地命中、异常触发、Buff 刷新、死亡中断，都必须能从 DebugOverlay / EventArchive / ReplayFrame 中追溯。

5. 不承诺商业客户端内部帧表 1:1：
   公开资料没有完整逐帧表时，帧数只作为 baseline_tuning。
   任何 community_estimate 参数不得写成 official_exact。
```

---

## 2. 合规边界与资料等级

### 2.1 允许

```text
1. 使用公开资料理解机制；
2. 使用原创代码实现类似机制；
3. 使用自制占位素材；
4. 使用许可证明确的开源代码片段；
5. 使用社区实测数据作为 baseline_tuning 参数；
6. 用抽象的矩形、颜色块、占位音效、占位特效验证手感。
```

### 2.2 禁止

```text
1. 禁止使用 DNF 原版美术、音效、动画、地图、UI、字体资源；
2. 禁止使用非 ASCII 文件名作为代码文件名或导入路径。
```

### 2.3 资料可信等级

| 等级 | 类型 | 使用方式 |
|---|---|---|
| A | 官方公开资料、公开 Wiki、公开公告、正式文档 | 可作为机制语义依据 |
| B | 社区录屏、逐帧实测、玩家逆向分析 | 可作为 baseline_tuning；必须标注 `community_estimate` |
| C | 未核验 GitHub 项目、文章、二手整理 | 只作待人工核验参考 |
| D | 泄漏源码、私服代码、客户端反编译代码 | 进入项目，作为实现依据 |

### 2.4 对上传资料中的高风险描述处理

若资料中出现“与泄漏源码一致”“台服泄漏源码”等表述，本规格书不采纳该证据链。相应数值若仍被采用，只能作为：

```text
sourceType: "community_estimate"
confidence: "medium"
requiresManualVerification: true
```

---

## 3. 项目范围

### 3.1 必须做

#### 基础运行

```text
- Phaser 3 + TypeScript + Vite；
- Docker Compose 一键启动；
- docker-compose.yml 显式暴露端口；
- npm scripts：typecheck / build / static:test / screenshot:test / verify；
- 生成 dist/；
- 生成 verification/report.json；
- 生成 verification/screenshot.png；若浏览器不可用，可生成 fallback screenshot 作为诊断文件，但该项不得计为截图验收通过；
- README 必须包含 How to Run、Services List、Verification。
```

#### 测试房间

```text
- 一个玩家角色：Berserker；
- 一个普通小怪；
- 一个普通木桩；
- 一个 SuperArmor Boss 木桩；
- 一个 BuildingArmor 木桩；
- Debug 模式可生成多目标克隆体；
- 支持一键 Reset：位置、HP/MP、Frenzy、Buff、Status、Cooldown、LastHitTrace、Replay、hit stop、reaction motion 全部复位。
```

#### 核心内核

```text
- FixedStepSimulation；
- BrowserInputState；
- PageLifecycleGuard；
- CommandInputParser；
- InputBuffer；
- CombatEventBus；
- ActorCore；
- ActionInstance；
- FrameDataAction；
- HitQueryBuilder；
- HitResolver2D5；
- HitDecisionResolver；
- DamageResolver；
- DamageSourceKind / DamageReactionPolicy；
- ReactionResolver；
- ArmorProfileResolver；
- DownedHitResolver；
- GrabResolver baseline；
- PushBoxResolver；
- StatusEffectSystem；
- BuffLifecycleSystem；
- CooldownResourceKernel；
- DeathLoop；
- DebugOverlay；
- LastHitTrace；
- EventTracePanel；
- ReplayRecorder；
- PerformanceMonitor；
- ObjectPool。
```

#### 动作与技能

```text
- NormalBasicAttack 1/2/3；
- FrenzyToggle；
- FrenzyBasicAttack 1/2/3；
- UpwardSlash；
- MountainousWheel；
- RagingFury；
- Backstep；
- QuickRebound；
- DerangeBuff；
- BloodyCrossPassive；
- VimAndVigorPassive；
- DiehardSkill 接口预留；
- BleedStatus baseline；
- Debug-only DebugReset / ForceDownPlayer / ForceBleed / SpawnTargets / RunScreenshotScenario / SlowMotion / SingleStep。
```

#### 规则链路

```text
- RawInput → CommandInputParser → InputBuffer → ActionRequest；
- ActionEnter → Startup → Active → HitQuery；
- HitQuery → GeometryOverlap → HitDecision；
- HitDecision → ArmorDecision / DownedHitDecision / GrabDecision；
- HitConfirmed → DamageRequested → DamageApplied；
- DamageApplied → ReactionRequested → ReactionApplied（仅 reactionPolicy = normal_hit_reaction）；
- DamageApplied → DamageNumberRequested / VfxRequested（status_tick_feedback_only）；
- ReactionApplied → HitStop / Recoil / Feedback；
- Buff / Status 由事件触发，不直接挂在技能 if-else；
- Death blocks action；
- Feedback 不得修改规则状态。
```

### 3.2 本阶段不做

```text
不做完整副本；
不做多房间推进；
不做装备系统；
不做附魔系统；
不做完整 PVP；
不做全部职业；
不做觉醒技能；
不做联网同步；
不做账号；
不做商城；
不做疲劳、任务、NPC；
不做正式素材；
不做官方 UI；
不做所有 Boss 机制；
不做完整怪物生态；
不做移动端触屏适配；
不做手柄验收；
不使用原版资源。
```

### 3.3 预留但不作为 0.2 验收范围

```text
- 完整怪物 AI；
- 完整空中普攻 / 空中技能；
- 完整组队规则；
- 完整评分系统；
- 地图陷阱 / 可破坏物；
- PVP 保护系统；
- 装备词条系统；
- 多职业扩展。
```

---

## 4. 强制纠偏清单

从旧版本合并到 0.2 时，必须执行以下替换：

| 旧机制 / 错误实现 | 0.2 最终规则 |
|---|---|
| 低血自动双刀 12 秒 | 删除，不得称为 Frenzy |
| Frenzy 自动结束 | 删除，Frenzy 是主动开关 |
| 通用 Dodge / Roll | 不得替代 Backstep / QuickRebound；Debug 可保留 LabDodge 但默认禁用 |
| RageBurst 单次椭圆震开 | 删除，改为 RagingFury：冲击波 + 血柱多段 + 浮空 |
| bossArmor 布尔值 | 删除，改为 ArmorProfile 类型系统 |
| 所有技能默认不能打倒地 | 修正，RagingFury Shockwave 等可通过 DownedHitPolicy 命中倒地 |
| Phaser Arcade Physics 决定命中 | 禁止，战斗真相层必须由自研 HitResolver2D5 决定 |
| 动画事件决定命中 | 禁止，动画只做表现，帧表和 Combat Kernel 决定命中 |
| Scene 内直接扣血 / 设置受击 | 禁止，必须通过 CombatEventBus 和 Resolver 链路 |

---

## 5. 技术栈与工程交付

### 5.1 固定技术栈

```text
Language: TypeScript
Runtime: Browser
Game Framework: Phaser 3
Build Tool: Vite
Rendering: HTML5 Canvas / WebGL
Package Manager: npm
Container: Docker + Docker Compose
Testing: TypeScript typecheck + static tests + headless screenshot verification
```

### 5.2 Phaser 职责边界

Phaser 只负责：

```text
资源加载；
Sprite / Shape 渲染；
底层键盘事件采集；
Scene 生命周期；
音效播放；
Canvas/WebGL 初始化；
简单 UI 绘制；
Debug 图形绘制。
```

Phaser 不负责：

```text
动作状态机；
指令识别；
攻击帧逻辑；
输入缓存消费；
命中真相层；
伤害结算；
霸体判定；
受击反应；
HitStop；
浮空；
倒地；
受身；
Buff；
异常状态；
死亡清理。
```

### 5.3 必须提供的 npm scripts

```json
{
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit && vite build",
    "static:test": "node scripts/static-test.mjs",
    "screenshot:test": "node scripts/screenshot-test.mjs",
    "verify": "node scripts/verify.mjs"
  }
}
```

### 5.4 Docker Compose 要求

```yaml
services:
  combat-lab:
    build: .
    working_dir: /app
    volumes:
      - .:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    command: npm run dev
```

规则：

```text
1. 必须通过 docker compose up --build 一键启动；
2. 不依赖宿主机全局 node/npm；
3. 不依赖私有仓库、内网服务、本地数据库；
4. 服务端口必须在 docker-compose.yml 显式暴露；
5. README 必须写清访问地址；
6. 容器内执行 build/static/screenshot/verify 时，dist/ 与 verification/ 必须写回宿主机项目目录；
7. 推荐使用 bind mount：.:/app 与 /app/node_modules anonymous volume，避免 node_modules 覆盖；
8. 若不使用 bind mount，必须提供 artifact copy-back 机制，确保 dist/、verification/report.json、verification/screenshot.png、verification/replay.json 可从宿主机直接取得。
```

---

## 6. 推荐工程结构

```text
combat-lab-0.2/
  docker-compose.yml
  Dockerfile
  README.md
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  public/
    assets/
      placeholder/
        README.md
  docs/
    source-policy.md
    architecture.md
    verification.md
    tuning-baseline.md
  src/
    main.ts
    game/
      BootScene.ts
      CombatScene.ts
      RenderAdapter.ts
      DebugRenderAdapter.ts
    combat/
      kernel/
        CombatKernel.ts
        FixedStepSimulation.ts
        CombatContext.ts
        TickPipeline.ts
      actors/
        Actor.ts
        ActorRegistry.ts
        ActorSnapshot.ts
        ActorFactory.ts
      input/
        BrowserInputState.ts
        InputCollector.ts
        CommandInputParser.ts
        InputBuffer.ts
        SkillCommandRegistry.ts
        Keymap.ts
      events/
        CombatEvent.ts
        CombatEventType.ts
        CombatEventPriority.ts
        CombatEventStatus.ts
        CombatEventBus.ts
        CombatEventFactory.ts
        CombatEventHandler.ts
        CombatEventArchive.ts
        CombatEventBlockPolicy.ts
        CombatEventCorrelation.ts
      events/handlers/
        ActionEventHandlers.ts
        HitEventHandlers.ts
        DamageEventHandlers.ts
        ReactionEventHandlers.ts
        BuffEventHandlers.ts
        StatusEventHandlers.ts
        ResourceCooldownEventHandlers.ts
        DeathEventHandlers.ts
        FeedbackEventHandlers.ts
        DebugEventHandlers.ts
      actions/
        ActionInstance.ts
        ActionPhase.ts
        FrameDataAction.ts
        ActionStateMachine.ts
        CancelPolicy.ts
        RootMotion.ts
      hit/
        HitQuery.ts
        HitBox.ts
        HurtBox.ts
        PushBox.ts
        HitResolver2D5.ts
        HitDecisionResolver.ts
        DownedHitResolver.ts
      damage/
        DamageResolver.ts
        DamageFormula.ts
        DamageMultiplierResolver.ts
      reaction/
        ReactionState.ts
        ReactionResolver.ts
        ReactionMotionController.ts
        HitStopController.ts
        RecoilController.ts
      armor/
        ArmorProfile.ts
        ArmorResolver.ts
        GrabResolver.ts
      status/
        StatusEffect.ts
        StatusEffectSystem.ts
        StatusResistance.ts
      buffs/
        Buff.ts
        BuffLifecycleSystem.ts
        FrenzyController.ts
        BloodyCrossController.ts
        VimAndVigorController.ts
        DerangeController.ts
        DiehardController.ts
      resources/
        ResourceState.ts
        CooldownState.ts
        CooldownResourceKernel.ts
      motion/
        PushBoxResolver.ts
        RootMotionController.ts
      death/
        DeathLoop.ts
        RespawnController.ts
      feedback/
        FeedbackController.ts
        SoundRequest.ts
        CameraShakeRequest.ts
        DamageNumberRequest.ts
      debug/
        DebugOverlay.ts
        LastHitTrace.ts
        EventTracePanel.ts
        BoxDebugDraw.ts
        PerformanceMonitor.ts
      replay/
        ReplayFrame.ts
        ReplayRecorder.ts
        ReplayPlayer.ts              # optional interface stub, not required for 0.2 acceptance
      web/
        PageLifecycleGuard.ts
        AudioUnlockGate.ts
        PixelPerfectRenderer.ts
        WebGLContextGuard.ts
        BrowserSupportPolicy.ts
      util/
        Vec3.ts
        Rect2D5.ts
        ObjectPool.ts
        RingBuffer.ts
        StableSort.ts
    data/
      actions/
        berserker.normal.ts
        berserker.frenzy.ts
        berserker.skills.ts
      commands/
        berserker.commands.ts
      actors/
        enemyProfiles.ts
        resistanceProfiles.ts
      tuning/
        dnf-berserker-baseline.ts
        source-policy.ts
  tests/
    static/
      architecture.test.ts
      event-bus.test.ts
      input-buffer.test.ts
      armor.test.ts
      status-buff.test.ts
      death-loop.test.ts
      replay.test.ts
  scripts/
    static-test.mjs
    screenshot-test.mjs
    verify.mjs
  verification/
    report.json
    screenshot.png
```

---

## 7. Tick Pipeline

每个 combat tick 顺序必须固定。R3 统一 HitStop / Death 的执行口径：本 tick 产生的 HitStopStarted 从下一 combat tick 开始冻结动作推进；Death / Interrupt 类事件在同一 flush 内立即插队处理。

```text
CombatKernel.tick()
  01. beginTick()
  02. collectInput()
  03. parseCommand()
  04. bufferInput()
  05. updateHitStopAndFreezeState()
  06. updateActionStateMachines()
  07. applyRootMotion()
  08. resolvePushBoxes()
  09. buildHitQueries()
  10. resolveHitDecisions()
  11. publish HitConfirmed / HitRejected / ArmorHit / DownedHit / Grab events
  12. flushEventBus()
  13. updateReactionMotion()
  14. tickStatusEffects()
  15. tickBuffs()
  16. tickCooldownsAndResources()
  17. updateFeedbackQueue()
  18. recordReplayFrame()
  19. updateDebugOverlaySnapshot()
  20. endTickCleanup()
```

红线：

```text
1. 状态机不直接监听 keydown / keyup；
2. HitDecision 不直接扣血；
3. DamageResolver 不直接播放特效；
4. FeedbackController 不修改战斗状态；
5. DebugOverlay 不修改战斗状态；
6. Phaser Scene 不决定命中、伤害、霸体、受击；
7. Death / Interrupt 事件必须能在同一 flush 内插队并中断死亡 Actor 的后续动作链；
8. HitStop 冻结动作帧，但不冻结 UI、Debug、Replay 记录和输入收集；
9. ReplayRecorder 只记录 immutable snapshot，不保存对象池可复用对象引用。
```

---

## 8. FixedStepSimulation

### 8.1 规则

```text
1. combat tick = 1 / 60 秒；
2. 所有动作帧、active window、hit stop、hit stun、cooldown、Buff duration、Status duration 都按 combat tick 计数；
3. 浏览器 render frame 只推动 accumulator；
4. 单帧最多补 4 个 combat tick；
5. delta > 250ms 视为暂停 / 恢复，不追帧；
6. 页面 hidden 时暂停 Combat Kernel；
7. 页面 visible 后重置 accumulator；
8. slow motion 只改变 tick 推进频率，不改变动作帧表；
9. single step 只推进 1 个 combat tick。
```

### 8.2 TypeScript 接口

```ts
export class FixedStepSimulation {
  readonly tickRate = 1 / 60;
  readonly maxCatchUpTicks = 4;
  readonly pauseThresholdMs = 250;

  private accumulatorSeconds = 0;
  private paused = false;

  constructor(private readonly kernel: CombatKernel) {}

  update(deltaMs: number): void {
    if (this.paused) return;

    if (deltaMs > this.pauseThresholdMs) {
      this.accumulatorSeconds = 0;
      this.kernel.onLargeDelta(deltaMs);
      return;
    }

    this.accumulatorSeconds += deltaMs / 1000;

    let ticks = 0;
    while (this.accumulatorSeconds >= this.tickRate && ticks < this.maxCatchUpTicks) {
      this.kernel.tick();
      this.accumulatorSeconds -= this.tickRate;
      ticks += 1;
    }

    if (ticks >= this.maxCatchUpTicks) {
      this.accumulatorSeconds = 0;
      this.kernel.emitLongFrameWarning(deltaMs);
    }
  }

  pause(): void {
    this.paused = true;
    this.accumulatorSeconds = 0;
  }

  resume(): void {
    this.paused = false;
    this.accumulatorSeconds = 0;
  }
}
```

---

## 9. Web 生命周期保护

### 9.1 BrowserInputState

浏览器键盘事件只是原始输入事实，不是游戏帧输入。

```text
keydown / keyup：只记录原始按键状态；
combat tick：把 held / pressed edge 转成 ActionIntent；
keydown repeat 不能触发重复攻击；
blur / hidden 时清空所有 held key；
状态机不允许直接监听 keydown / keyup；
hit stop 期间允许收集输入，但不消费输入。
```

### 9.2 PageLifecycleGuard

```ts
export interface PageLifecycleGuard {
  onHidden(): void;
  onVisible(): void;
  onBlur(): void;
  onFocus(): void;
}
```

规则：

```text
visibility hidden：
- 暂停 Combat Kernel；
- 清空 BrowserInputState held keys；
- 记录 LifecyclePaused 事件。

visibility visible：
- 重置 accumulator；
- 等待至少 1 个稳定 render frame；
- 允许重新生成 pressed edge。

blur：
- 清空 held keys；
- 清空 edge states；
- 不保留移动输入。

focus：
- 不立即生成 pressed edge；
- 等待一帧后重新采集。
```

### 9.3 AudioUnlockGate

```text
1. 进入 Demo 前必须有 Start 按钮；
2. Start 后恢复 AudioContext；
3. 预热 swing / hit / armor / raging fury / rebound 音效；
4. 第一刀命中、上挑命中、RagingFury 第一次命中不得无声。
```

### 9.4 PixelPerfectRenderer

```text
1. 固定内部逻辑分辨率；
2. 禁用 image smoothing；
3. 优先整数倍缩放；
4. Debug Box 线条必须清晰；
5. Canvas/WebGL 缩放不得导致判定框错位。
```

### 9.5 WebGLContextGuard

```text
1. 监听 webglcontextlost / webglcontextrestored；
2. context lost 时暂停 Combat Kernel；
3. 显示错误提示或重载提示；
4. 战斗中不允许每帧创建新纹理；
5. 刀光、命中特效、伤害数字贴图必须预创建或复用。
```

### 9.6 BrowserSupportPolicy

正式验收环境：

```text
桌面 Chrome / Edge；
前台运行；
键盘输入；
60Hz 逻辑 tick；
非移动端。
```

暂不验收：

```text
Safari；
移动端浏览器；
触屏；
手柄；
后台运行；
低端手机性能。
```

---

## 10. 坐标系统与空间判定

### 10.1 逻辑坐标

```text
x = 左右；
z = 地面纵深 / 屏幕上下走位；
y = 高度 / 浮空高度。
```

渲染映射：

```text
screenX = x；
screenY = groundBase + z - y；
depthSort = screenY。
```

注意：

```text
z 不是 Phaser depth；
y 不是屏幕 y；
Phaser depth 只用于显示排序；
战斗空间必须自己维护 x / z / y。
```

### 10.2 Actor 必须字段

```ts
export interface Actor {
  id: ActorId;
  type: ActorType;
  faction: Faction;

  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3;
  facing: Facing;

  pushBox: PushBox;
  hurtBoxes: HurtBoxSet;

  actionState: ActionStateMachine;
  reactionState: ReactionStateMachine;

  resources: ResourceState;
  cooldowns: CooldownState;
  buffs: BuffContainer;
  statusEffects: StatusEffectContainer;

  armorProfile: ArmorProfile;
  resistanceProfile: ResistanceProfile;

  currentAction?: ActionInstance;
  currentReaction?: ReactionState;

  flags: ActorFlags;
}
```

### 10.3 PushBoxResolver

必须实现：

```text
1. PushBox 重叠检测；
2. 静态障碍物阻挡；
3. 角色 / 怪物之间基础推挤；
4. BuildingArmor 完全不可推动；
5. SuperArmor / BossSuperArmor 推挤优先级高于普通目标；
6. RootMotion 遇到不可穿透 PushBox 时停止或滑边；
7. DebugOverlay 显示 pushBox 和推挤修正向量。
```

推挤优先级：

```text
BuildingArmor > BossSuperArmor > SuperArmor > Player > Enemy > LightObject
```

---

## 11. 输入与指令系统

### 11.1 默认按键

```text
方向：Arrow / WASD；
普通攻击：X / J；
技能键：Z / K；
跳跃预留 / 受身：C / L；
Buff / 特殊：Space；
Debug：F1-F8。
```

### 11.2 指令优先级

```text
1. Debug 输入最高，但不参与战斗互斥；
2. Command 输入优先于 Hotkey 输入；
3. 同一 pressed edge 只能触发一个互斥技能；
4. 指令匹配失败不应吞掉普通攻击；
5. hit stop 期间记录输入，不消费；
6. Action interrupted 时清空攻击 / 技能输入，保留 Debug 输入；
7. Recovery 默认不消费输入，除非动作配置有 recovery cancel；
8. Whiff cancel 比 hit cancel 更晚、更窄。
```

### 11.3 SkillCommand

```ts
export interface SkillCommand {
  actionName: ActionName;
  sequence: DirectionToken[];
  button: InputButton;
  maxGapFrames: number;
  holdFrames?: number;
  mirrorByFacing: boolean;
  priority: number;
  canTrigger(ctx: CommandContext): boolean;
}
```

### 11.4 最小指令集

```text
NormalAttack：X；
UpwardSlash：Z；
QuickRebound：Downed 状态下 C，优先级高于 Backstep；
Backstep：非 Downed 状态下 Down + C；
MountainousWheel：Forward + Down + Z；
RagingFury：Down + Up + Z；
Derange：Forward + Forward + Space；
FrenzyToggle：技能栏触发 / F5 Debug；
Diehard：低血条件满足时技能栏触发 / F6 Debug。
```

C 键边界：

```text
0.2 不实现完整 Jump combat。
C 在非 Downed 状态下可保留为 JumpIntent / ReservedJump，但不进入验收。
C 在 Downed 状态下必须优先解析为 QuickRebound。
Down + C 在非 Downed 状态下解析为 Backstep。
同一 pressed edge 不得同时触发 QuickRebound 与 Backstep。
```

### 11.5 InputBuffer

```ts
export interface BufferedInput {
  actionName: ActionName;
  source: "command" | "hotkey" | "debug";
  createdFrame: number;
  expiresAtFrame: number;
  priority: number;
  consumed: boolean;
}

export class InputBuffer {
  push(input: BufferedInput): void;
  consumeAllowed(ctx: CancelContext): BufferedInput | null;
  clearCombatInputs(): void;
  clearAll(): void;
}
```

缓存帧：

| 输入 | 缓存 |
|---|---:|
| NormalAttack | 10F |
| UpwardSlash | 8F |
| MountainousWheel | 8F |
| RagingFury | 8F |
| Backstep | 6F |
| QuickRebound | 8F，仅 Downed 可用 |
| FrenzyToggle | 6F |
| Derange | 6F |

消费规则：

```text
1. 只在 cancel window 或 Idle/Move 可行动状态消费；
2. Recovery 默认不消费，除非 Action 配置有 recovery cancel；
3. HitStop 期间不消费；
4. Whiff cancel 比 hit cancel 更晚、更窄；
5. Command 输入优先于 hotkey 输入；
6. 已消费 input 不得二次触发；
7. 被 hit interrupt 后清空 combat inputs；
8. Debug inputs 不受清空影响。
```

---

## 12. ActionInstance 与动作生命周期

### 12.1 ActionInstance

```ts
export interface ActionInstance {
  id: ActionInstanceId;
  actionName: ActionName;
  ownerId: ActorId;

  startTick: number;
  localFrame: number;
  phase: ActionPhase;

  comboStep?: number;
  commandSource: "command" | "hotkey" | "debug";

  facingLocked: boolean;
  movementLocked: boolean;

  superArmorWindow?: FrameWindow[];
  invulnerableWindow?: FrameWindow[];

  activeHitboxIds: HitBoxId[];

  // key = hitGroupId. 同一 hitGroupId 内同一 target 只能命中一次；
  // 不同 hitGroupId 可重复命中同一 target，用于 FrenzyBasic / RagingFury 多段。
  alreadyHitByGroup: Map<HitGroupId, Set<ActorId>>;
  multiHitSchedule?: MultiHitSchedule;

  hitConfirmed: boolean;
  armorHitConfirmed: boolean;
  downedHitConfirmed: boolean;
  whiffed: boolean;

  cancelTokens: CancelToken[];
  interrupted: boolean;
  hitStopFrozen: boolean;
}
```

### 12.2 ActionPhase

```text
request；
enter；
startup；
active；
hitstop_freeze；
cancel_window；
recovery；
exit；
interrupted；
ended。
```

### 12.3 生命周期链路

```text
Idle / Move / FrenzyIdle
→ RawInput
→ CommandInputParser
→ InputBuffer
→ ActionRequest
→ ActionEnter
→ Startup
→ ActiveWindow
→ HitQuery
→ HitDecision
→ ArmorDecision / DownedHitDecision / GrabDecision
→ DamageRequested
→ DamageApplied
→ HitReaction
→ HitStop / Recoil
→ CancelWindow
→ Recovery
→ ActionExit
→ Idle / Move / NextAction
```

红线：

```text
startup 期间不能产生攻击 hitbox；
active 期间按帧表产生 hitbox；
active 结束后 hitbox 必须消失；
recovery 期间不能乱接动作，除非进入允许取消窗口；
hit stop 期间动作帧冻结；
hit stop 期间输入可以进入 buffer；
hit stop 结束后状态机才能消费 buffer；
被打断时当前 ActionInstance 必须退出并标记 interrupted；
Death 触发时当前动作强制进入 interrupted / ended；
Action 结束、interrupted、death cleanup 时必须清理 alreadyHitByGroup；
R3 删除旧版未定义的 HitResult 中间对象，命中结果必须通过 HitDecision → DamageRequested → DamageApplied → ReactionRequested / Feedback events 表达。
```

### 12.4 FrameDataAction

```ts
export interface FrameDataAction {
  actionName: ActionName;
  totalFrames: number;

  startup: FrameWindow[];
  active: HitBoxFrameWindow[];
  recovery: FrameWindow[];

  cancelPolicy: CancelPolicy;
  hitStopProfile: HitStopProfile;
  recoilProfile: RecoilProfile;
  rootMotion?: RootMotionTrack;

  armorWindows?: ArmorWindow[];
  invulnerableWindows?: FrameWindow[];

  costProfile?: CostProfile;
  cooldownProfile?: CooldownProfile;

  feedbackProfile: FeedbackProfile;
  sourcePolicy: SourcePolicy;
}
```

---

## 13. CombatEventBus

### 13.1 目标

CombatEventBus 必须把战斗系统从 if-else 变成可追踪事件链。

必须支持：

```text
1. Event envelope；
2. priority stable sort；
3. currentQueue / nextQueue；
4. correlationId；
5. parentEventId；
6. causationId；
7. event status；
8. block policy；
9. archive；
10. LastHitTrace 和 ReplayRecorder 订阅。
```

### 13.2 Event Priority

```ts
export enum CombatEventPriority {
  Death = 1000,
  Interrupt = 900,
  Invulnerable = 850,
  Grab = 820,
  HitDecision = 700,
  Damage = 650,
  Reaction = 600,
  Status = 500,
  Buff = 450,
  ResourceCooldown = 400,
  Feedback = 100,
  Debug = 0
}
```

### 13.3 Event Status

```ts
export type CombatEventStatus =
  | "created"
  | "queued"
  | "dispatching"
  | "consumed"
  | "blocked"
  | "cancelled"
  | "archived";
```

### 13.4 Event Envelope

```ts
export interface CombatEvent<TPayload = unknown> {
  id: CombatEventId;
  type: CombatEventType;
  priority: CombatEventPriority;
  status: CombatEventStatus;

  tick: number;
  sourceActorId?: ActorId;
  targetActorId?: ActorId;

  correlationId: string;
  parentEventId?: CombatEventId;
  causationId?: CombatEventId;

  payload: TPayload;
  tags: string[];
}
```

### 13.5 Immediate Event 规则

Death / Interrupt 类事件是 immediate high-priority event。

```text
1. 当 handler 在 flushEventBus() 内生成 ActorDied / ActionInterrupted / ActiveHitboxesCleared：
   - 必须插入 currentQueue；
   - 立即按 priority stable sort 重排；
   - 在当前 tick 当前 flush 内优先处理。
2. ActorDied 处理完成前，与死亡 actor 相关的低优先级 Action / HitQuery / Reaction / Buff trigger 事件必须被 block 或 cancelled。
3. ActorDied 不得进入 nextQueue 等到下一 tick 才执行。
4. DeathLoop 必须在 EventArchive 中记录 block/cancel 原因。
```

### 13.6 Event Types

必须至少包含：

```text
Lifecycle：
- TickStarted
- TickEnded
- LifecyclePaused
- LifecycleResumed

Input：
- RawInputCollected
- CommandMatched
- InputBuffered
- InputConsumed
- InputExpired

Action：
- ActionRequested
- ActionEntered
- ActionPhaseChanged
- ActionInterrupted
- ActionEnded
- ActiveHitboxesCleared

Hit：
- HitQueryBuilt
- HitConfirmed
- HitRejected
- ArmorHit
- DownedHit
- GrabAttempted
- GrabSucceeded
- GrabFailed

Damage：
- DamageRequested
- DamageApplied
- DamagePrevented

Reaction：
- ReactionRequested
- ReactionApplied
- HitStopStarted
- HitStopEnded
- RecoilStarted
- RecoilEnded

Resource / Cooldown：
- ResourceCostRequested
- ResourceCostPaid
- ResourceCostRejected
- CooldownCheckRequested
- CooldownReady
- CooldownRejected
- CooldownStarted
- CooldownTicked
- CooldownEnded

Buff / Status：
- BuffApplyRequested
- BuffApplied
- BuffRefreshed
- BuffStacked
- BuffReplaced
- BuffTicked
- BuffExpired
- BuffDispelled
- BuffDeathCleanup
- StatusApplyRequested
- StatusApplied
- StatusTickRequested
- StatusTicked
- StatusExpired
- StatusResisted
- StatusDispelled
- StatusDeathCleanup

Death：
- ActorDied
- DeathCleanupCompleted
- ActorRespawned

Feedback：
- SoundRequested
- CameraShakeRequested
- DamageNumberRequested
- VfxRequested

Debug：
- LastHitTraceUpdated
- ReplayFrameRecorded
- DebugOverlayUpdated
```

### 13.7 Requested / Result Event 规则

```text
1. Requested 事件表示规则请求或意图，不代表已经生效；
2. Applied / Paid / Ready / Succeeded 表示规则已生效或检查通过；
3. Rejected / Resisted / Failed 表示规则被拒绝，必须带 reason；
4. TickRequested 表示周期性效果准备触发；
5. Ticked 表示该 tick 的周期效果已实际生效；
6. DebugOverlay / EventTracePanel 必须能区分 request 与 result；
7. ReplayFrame 必须记录最终 result，不得只记录 request。
```

### 13.8 Blocking Rules

#### Death blocks actor actions

```text
ActorDied 之后：
- 阻塞该 actor 的 ActionRequested；
- 中断 currentAction；
- 清除 activeHitboxIds；
- 清除可驱散 Buff / Status；
- 锁定 combat inputs；
- 触发 DeathCleanupCompleted。
```

#### Invulnerable blocks effective hit

```text
Invulnerable：
- 可几何重叠；
- HitDecision result = rejected；
- reason = target_invulnerable；
- 不触发 DamageApplied；
- 可触发 Debug / Feedback。
```

#### BuildingArmor blocks control

```text
BuildingArmor：
- 允许 DamageApplied；
- 阻止 launch / knockdown / grab / heavy control；
- finalReaction = armor_feedback_only；
- 必须显示 armor hit。
```

#### Grab lock

```text
GrabSucceeded：
- 锁定 attacker 与 target；
- 目标不可移动；
- 双方进入 grab sequence；
- 期间按 GrabAction 配置结算多段伤害；
- BuildingArmor / GrabImmune 目标必须 GrabFailed。
```

### 13.9 事件链

基础命中链：

```text
HitQueryBuilt
→ HitConfirmed
→ DamageRequested
→ DamageApplied
→ ReactionRequested
→ ReactionApplied
→ HitStopStarted
→ SoundRequested / DamageNumberRequested / CameraShakeRequested / VfxRequested
→ LastHitTraceUpdated
→ ReplayFrameRecorded
```

霸体命中链：

```text
HitConfirmed
→ ArmorHit
→ DamageApplied
→ ReactionApplied(finalReaction = armor_feedback_only / minor_shake)
→ VfxRequested(armor spark) / SoundRequested(armor hit)
```

倒地命中链：

```text
HitConfirmed
→ DownedHit
→ DamageApplied
→ ReactionApplied(downed hit / relaunch / no reaction)
```

死亡链：

```text
DamageApplied(hp <= 0)
→ ActorDied
→ ActionInterrupted
→ ActiveHitboxesCleared
→ BuffDeathCleanup
→ StatusDeathCleanup
→ DeathCleanupCompleted
```

---

## 14. Hit System

### 14.1 HitQuery

```ts
export interface HitQuery {
  id: HitQueryId;
  tick: number;
  attackerId: ActorId;
  actionInstanceId: ActionInstanceId;
  actionName: ActionName;
  hitboxId: HitBoxId;

  box: Rect2D5;
  facing: Facing;

  hitType: HitType;
  damageType: DamageType;
  attackLevel: number;
  controlPower: number;

  canHitDowned: boolean;
  canLaunch: boolean;
  canKnockdown: boolean;
  canGrab: boolean;

  maxTargets: number;
  multiHitGroupId?: string;
  hitIndex?: number;
}
```

### 14.2 HitDecision

```ts
export interface HitDecision {
  queryId: HitQueryId;
  attackerId: ActorId;
  targetId: ActorId;

  geometryOverlapped: boolean;
  accepted: boolean;

  rejectedReason?:
    | "same_faction"
    | "target_dead"
    | "target_invulnerable"
    | "damage_immune"
    | "z_mismatch"
    | "y_mismatch"
    | "already_hit_in_group"
    | "target_limit_reached"
    | "downed_not_allowed"
    | "grab_immune"
    | "out_of_active_frame";

  armorDecision?: ArmorDecision;
  downedDecision?: DownedHitDecision;
  grabDecision?: GrabDecision;

  isCounter: boolean;
  isBackAttack: boolean;
  isCritical: boolean;
}
```

### 14.3 HitResolver2D5

几何重叠只判断空间，不判断规则：

```text
1. X 轴必须重叠；
2. Z 轴必须在 depth tolerance 内；
3. Y 轴必须与 target hurtbox 高度重叠；
4. facing 可影响 hitbox 偏移；
5. 不得在几何层判断霸体、死亡、倒地、阵营、无敌；
6. 几何层返回候选 target 列表。
```

### 14.4 未命中原因必须可解释

DebugOverlay 必须显示：

```text
no_geometry_overlap；
z_mismatch；
y_mismatch；
target_invulnerable；
target_dead；
same_faction；
already_hit_in_group；
target_limit_reached；
downed_not_allowed；
grab_immune；
inactive_frame；
hitbox_expired。
```

---

## 15. Damage System

### 15.1 Damage source 与 reaction policy

R3 明确区分直接命中、DOT、自损、环境伤害和 Debug 伤害，避免 Bleed tick 被错误实现成普通受击命中。

```ts
export type DamageSourceKind =
  | "direct_hit"
  | "status_dot"
  | "environment"
  | "self_cost"
  | "debug";

export type DamageReactionPolicy =
  | "normal_hit_reaction"
  | "no_reaction"
  | "status_tick_feedback_only";

export interface DamageRequested {
  attackerId?: ActorId;
  targetId: ActorId;
  actionName?: ActionName;
  sourceStatusId?: StatusEffectId;

  sourceKind: DamageSourceKind;
  reactionPolicy: DamageReactionPolicy;

  baseDamage: number;

  canTriggerCounter: boolean;
  canTriggerBackAttack: boolean;
  canTriggerCritical: boolean;
  canTriggerDeath: boolean;

  sourceHitDecisionId?: string;
  correlationId: string;
}
```

Damage source 规则：

```text
1. direct_hit 默认 reactionPolicy = normal_hit_reaction；
2. status_dot 默认 reactionPolicy = status_tick_feedback_only；
3. self_cost 默认 reactionPolicy = no_reaction；
4. environment 按具体配置决定是否触发 reaction；
5. debug 必须在 DebugOverlay / EventTracePanel 中标记为 debug source；
6. 只有 reactionPolicy = normal_hit_reaction 时，默认生成 ReactionRequested / HitStopStarted / RecoilStarted；
7. status_tick_feedback_only 可以生成 DamageNumberRequested / VfxRequested，但不得生成普通 hitstun / launch / knockback / recoil / hit stop；
8. canTriggerDeath = true 时，即使 reactionPolicy = no_reaction 或 status_tick_feedback_only，也必须允许 ActorDied。
```

### 15.2 DamageApplied

```ts
export interface DamageApplied {
  attackerId?: ActorId;
  targetId: ActorId;
  actionName?: ActionName;

  sourceKind: DamageSourceKind;
  reactionPolicy: DamageReactionPolicy;

  baseDamage: number;
  finalDamage: number;

  hpBefore: number;
  hpAfter: number;

  isCounter: boolean;
  isBackAttack: boolean;
  isCritical: boolean;

  multipliers: DamageMultiplierTrace[];
  sourceHitDecisionId?: string;
  sourceStatusId?: StatusEffectId;
}
```

### 15.3 基础公式

0.2 采用可验证简化公式，不做完整 DNF 装备 / 独立攻击 / 属强 / 防御穿透系统。

```text
finalDamage =
  baseDamage
  × skillMultiplier
  × counterMultiplier
  × backAttackMultiplier
  × criticalMultiplier
  × armorDamageMultiplier
  × statusDamageMultiplier
```

默认参数：

```text
counterMultiplier = 1.25；
backAttackMultiplier = 1.0 baseline，预留配置；
criticalMultiplier = 1.5 baseline，预留配置；
armorDamageMultiplier = 1.0 baseline。
```

### 15.4 Counter / BackAttack / Crit

#### Counter

```text
目标处于 startup / active / recovery / casting / attacking 状态时可判定 counter；
目标处于 idle / downed / dead / invulnerable 不触发 counter；
BuildingArmor 目标仍可触发 counter；
DebugOverlay 必须显示 counterWindowSource。
```

#### BackAttack

```text
目标背向攻击来源时判定；
baseline：攻击者位于目标面朝反方向半平面；
后续可升级为角度阈值；
DebugOverlay 必须显示 facingRelation。
```

#### Critical

```text
0.2 可以使用固定 critChance baseline；
必须由 DamageResolver 决定；
不得由 FeedbackController 决定；
ReplayFrame 必须记录随机种子或最终结果。
```

---

## 16. Reaction System

### 16.1 ReactionState

```ts
export type ReactionKind =
  | "none"
  | "micro_stagger"
  | "light_stagger"
  | "heavy_stagger"
  | "knockback"
  | "launch"
  | "air_hitstun"
  | "falling"
  | "downed"
  | "getting_up"
  | "quick_rebound"
  | "grabbed"
  | "dead"
  | "armor_feedback_only";
```

### 16.2 反应优先级

```text
dead > grabbed > launch > knockdown > knockback > heavy_stagger > light_stagger > micro_stagger > armor_feedback_only > none
```

### 16.3 普通小怪受击链

```text
Idle / Move
→ light_stagger / heavy_stagger
→ knockback
→ launch
→ air_hitstun
→ falling
→ downed
→ getting_up
→ Idle / Move
```

红线：

```text
1. 普通小怪不能只扣血不动；
2. UpwardSlash 必须挑飞普通小怪；
3. UpwardSlash 后必须存在追击窗口；
4. RagingFury 必须对普通小怪形成冲击波 + 血柱多段反应；
5. 空中小怪必须下落；
6. 落地后必须进入倒地或落地恢复；
7. 倒地后必须能起身。
```

### 16.4 Boss / Armor 受击链

BossSuperArmor：

```text
- 可扣血；
- 不进入普通浮空；
- 不进入普通倒地；
- 可有 minor_shake / armor_feedback_only；
- hit stop 必须封顶；
- Debug 必须显示 rawReaction 与 finalReaction。
```

BuildingArmor：

```text
- 可扣血；
- 不浮空；
- 不倒地；
- 不击退；
- 不被抓取；
- 不进入普通受击动画；
- 必须显示 armor spark / armor hit。
```

---

## 17. Armor System

R3 修订：ArmorProfile 不能把 `grab_immune`、`invulnerable` 当成和 `building_armor` 同级的基础 armor。它们是免疫或临时状态标记，可以叠加在基础 armor 上。

### 17.1 BaseArmorType

```ts
export type BaseArmorType =
  | "none"
  | "super_armor"
  | "boss_super_armor"
  | "building_armor";
```

### 17.2 ArmorProfile

```ts
export interface ArmorProfile {
  baseType: BaseArmorType;

  canTakeDamage: boolean;
  canBeLaunched: boolean;
  canBeKnockedDown: boolean;
  canBeKnockedBack: boolean;
  canReceiveHitStop: boolean;

  immunities: {
    grab: boolean;
    control: boolean;
    damage: boolean;
    hitStop?: boolean;
  };

  temporaryFlags?: {
    invulnerableUntilTick?: number;
    getUpArmorUntilTick?: number;
    superArmorUntilTick?: number;
  };

  hitStopCapFrames?: number;
  reactionOverride?: ReactionKind;
}
```

### 17.3 规则矩阵

| BaseArmorType | 受伤 | 硬直 | 浮空 | 倒地 | 击退 | 抓取 | 反馈 |
|---|---|---|---|---|---|---|---|
| none | 是 | 是 | 是 | 是 | 是 | 取决于 immunities.grab | 普通 |
| super_armor | 是 | 否/弱 | 通常否 | 通常否 | 弱 | 可被特定抓取，除非 immunities.grab=true | armor spark |
| boss_super_armor | 是 | 弱反馈 | 否 | 否 | 否 | 通常 immunities.grab=true | boss armor |
| building_armor | 是 | 否 | 否 | 否 | 否 | 否 | building armor |

免疫标记规则：

```text
1. immunities.damage = true 时，DamageApplied 不得产生 HP 变化，HitDecision reason = target_invulnerable 或 damage_immune；
2. immunities.grab = true 时，GrabDecision 必须失败，failedReason = target_grab_immune；
3. immunities.control = true 时，launch / knockdown / heavy stagger 必须被 ReactionResolver 改写；
4. temporaryFlags.invulnerableUntilTick 用于 QuickRebound、起身保护、技能无敌窗口；字段必须使用 global combat tick，不得使用 action localFrame；
5. temporaryFlags 结束后恢复基础 ArmorProfile；
6. LastHitTrace 必须同时显示 baseType、immunities、temporaryFlags、rawReaction、finalReaction。
```

## 18. DownedHitResolver 与 QuickRebound

### 18.1 Downed 规则

```text
1. Downed 目标默认不能被普通普攻命中；
2. 具有 canHitDowned 的技能可命中；
3. RagingFury Shockwave 对 Downed 有特殊规则；
4. DownedHit 必须有独立 event；
5. DownedHit 不等于普通 standing hit。
```

### 18.2 QuickRebound

```text
触发条件：
- actor 处于 Downed；
- 输入 C pressed edge；
- input 在 QuickRebound buffer 内；
- actor 未死亡；
- actor 未被 grab lock。

输入维持规则：
- C pressed edge 只用于进入 quick_rebound；
- 进入 quick_rebound 后，QuickReboundController 每 tick 读取 BrowserInputState.isHeld(C)；
- C held 且 elapsedFrames < maxHoldFrames 时维持蹲伏无敌；
- C released 或 elapsedFrames >= maxHoldFrames 时进入 getting_up；
- InputBuffer 不负责维持 QuickRebound hold duration；
- blur / hidden 清空 held key 时，QuickRebound 必须立即进入 release / getting_up 路径。

效果：
- 进入 quick_rebound；
- 按住期间获得蹲伏无敌，最长 baseline 180F；
- 松开 C 后进入 getting_up；
- getting_up 前段获得短暂起身霸体；
- QuickRebound 期间不允许攻击；
- DebugOverlay 显示 rebound frames / invulnerable remaining / isHeld(C)。
```

---

## 19. HitStop 与 Recoil

### 19.1 HitStop

```text
1. HitStopStarted 与命中确认在同一 tick 生成；
2. HitStopStarted 生成后立即写入 HitStopController；
3. 从下一个 combat tick 开始，updateHitStopAndFreezeState() 必须先于 action/reaction/rootMotion 推进执行；
4. HitStop 冻结 attacker / target 的动作 localFrame；
5. HitStop 冻结 rootMotion frame 与 reaction motion frame；
6. HitStop 不冻结 UI / DebugOverlay / PerformanceMonitor / input collection / ReplayRecorder；
7. HitStop 不减少 cooldown、Buff duration、Status duration、Frenzy HP drain timer；
8. HitStop 期间可收集输入，但不可消费；
9. HitStop 结束后再检查 cancel window；
10. BossSuperArmor / BuildingArmor hit stop 必须封顶。
```

HitStop 期间 actor tick 行为：

```text
if actor.hitStopFrozen:
  - do not advance action.localFrame；
  - do not consume InputBuffer；
  - do not advance rootMotion frame；
  - do not advance reaction motion frame；
  - do not reduce cooldown / buff / status / hp-drain timers；
  - still allow DebugOverlay, PerformanceMonitor, BrowserInputState, ReplayRecorder to update。
```

### 19.2 Recoil

Recoil 是攻击者命中后的逆硬直，是打击重量感核心。R3 统一 Recoil 与 HitStop 关系：

```text
1. Recoil 默认在 HitStop 结束后开始计时；
2. HitStop 期间 recoilFramesRemaining 不减少；
3. whiff 不触发 recoil；
4. armor hit 可触发较短 recoil；
5. 技能取消只有在 CancelPolicy 明确允许时，才可清空剩余 Recoil；
6. 多段命中默认不叠加 Recoil，只刷新为 max(current, newRecoil)；
7. RagingFury blood pillar 每段 recoil 必须 cap，避免多段导致攻击者长期卡死；
8. DebugOverlay 必须显示 recoilFramesRemaining、sourceHitGroupId、canCancelRecoil。
```

默认 baseline：

| 动作 | Recoil |
|---|---:|
| NormalBasic1 | 2F |
| NormalBasic2 | 3F |
| NormalBasic3 | 4F |
| FrenzyBasic hit | 1F |
| UpwardSlash | 3F |
| MountainousWheel slash | 3F |
| RagingFury shockwave | 2F |
| RagingFury blood pillar | 0F / 1F cap |

---

## 20. Cooldown + Resource Kernel

### 20.1 ResourceState

```ts
export interface ResourceState {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  cube: number;
}
```

### 20.2 CostProfile

```ts
export interface CostProfile {
  hpCost?: number;
  hpPercentCost?: number;
  mpCost?: number;
  cubeCost?: number;
  costTiming: "on_request" | "on_startup" | "on_active";
  cannotReduceHpBelow?: number;
}
```

### 20.3 CooldownProfile

```ts
export interface CooldownProfile {
  actionName: ActionName;
  independentCooldownFrames: number;
  globalCooldownFrames: number;
  sharedCooldownGroup?: string;
  cooldownStartsAt: "on_request" | "on_action_enter" | "on_active";
  freezesDuringHitStop: boolean;
  canBeReducedByFrenzy?: boolean;
}
```

### 20.4 Gate check 与 tick update 分工

CooldownResourceKernel 有两类职责，必须分开实现：

```text
1. Gate check：ActionRequest 进入 ActionEntered 前，同步检查资源和冷却；
2. Tick update：每 tick 末尾减少 cooldown/resource timers。
```

Gate check 规则：

```text
1. 技能释放前必须检查资源和 cooldown；
2. 资源不足时 ActionRequest 被拒绝，记录 ResourceCostRejected；
3. cooldown 未就绪时 ActionRequest 被拒绝，记录 CooldownRejected；
4. gate check 失败时不得进入 ActionEntered；
5. gate check 失败时不得生成 startup / hitbox / rootMotion；
6. gate check 通过时可发布 CooldownReady；
7. 成功释放后按 costTiming 扣资源；
8. CD 启动时发布 CooldownStarted。
```

Tick update 规则：

```text
1. GCD 默认 30F baseline，可按技能配置为 0；
2. 普通攻击不触发 GCD；
3. DebugReset 必须清空 cooldown；
4. HitStop 期间 cooldown 默认不减少；
5. Frenzy HP 周期消耗不能把玩家扣到 0，最低保留 1 HP；
6. HitStop 期间 Frenzy HP drain timer 不减少；
7. DebugReset 必须清空 Frenzy HP drain timer。
```

### 20.5 Frenzy HP Drain baseline

```text
hpDrainIntervalFrames = 60F baseline；
hpDrainAmount = max(1, floor(maxHp * 0.005)) baseline；
hpFloor = 1；
Frenzy 关闭或 DebugReset 时清空 hpDrain timer；
DebugOverlay 显示 nextHpDrainFrame / hpDrainAmount / hpFloor。
```

---

## 21. BuffLifecycleSystem

### 21.1 Buff

```ts
export interface Buff {
  id: BuffId;
  type: BuffType;
  ownerId: ActorId;

  sourceAction?: ActionName;
  appliedAtTick: number;
  expiresAtTick?: number;

  stacks: number;
  maxStacks: number;

  refreshPolicy: "refresh_duration" | "add_stack" | "replace" | "ignore" | "highest_value";
  dispelPolicy: "dispellable" | "not_dispellable" | "death_clear" | "death_keep";

  modifiers: BuffModifier[];
}
```

### 21.2 生命周期

```text
BuffApplyRequested
→ BuffApplied / BuffRefreshed / BuffStacked / BuffReplaced
→ BuffTicked
→ BuffExpired / BuffDispelled / BuffDeathCleanup
```

事件口径：

```text
1. BuffApplyRequested 表示尝试施加 Buff；
2. BuffApplied / BuffRefreshed / BuffStacked / BuffReplaced 表示最终结果；
3. BuffTicked 表示周期性 Buff 已经在本 tick 生效；
4. BuffExpired / BuffDispelled / BuffDeathCleanup 表示结束原因；
5. 所有结果事件必须保留 source event correlationId。
```

规则：

```text
1. Buff 不直接修改 Actor 基础字段，必须通过 modifier resolver 生效；
2. 同类 Buff 叠加规则必须写在 refreshPolicy；
3. 死亡时清除 death_clear 和 dispellable；
4. Reset 时清除全部非系统 Buff；
5. DebugOverlay 必须显示 Buff 名称、层数、剩余帧、来源。
```

### 21.3 核心 Buff

#### FrenzyToggle

```text
类型：主动开关；
开启后按 hpDrainIntervalFrames 周期性消耗 HP；
HP 消耗不能低于 1；
改写普通攻击链为 FrenzyBasicAttack；
降低部分血气技能冷却字段预留；
不是低血自动触发；
不是 12 秒临时 Buff；
不因回血自动取消。
```

#### Derange

```text
类型：主动 Buff；
瞬发；
不产生攻击判定；
提供 attack/move/cast 相关 modifier baseline；
持续时间、冷却、资源消耗走 BuffLifecycleSystem + CooldownResourceKernel。
```

#### BloodyCross

```text
类型：低 HP 被动；
按 HP 阈值进入阶段；
提供血气风格增强 modifier；
不能替代 Frenzy；
必须能在 DebugOverlay 显示当前阶段。
```

#### VimAndVigor

```text
类型：被动；
与 Bleed / HP 消耗 / 狂战士技能形成联动 baseline；
0.2 只实现最小可解释字段。
```

#### Diehard

```text
类型：接口预留；
低血条件触发；
可恢复 HP；
0.2 不要求完整正式数值。
```

---

## 22. StatusEffectSystem

### 22.1 StatusEffect

```ts
export interface StatusEffect {
  id: StatusEffectId;
  type: StatusEffectType;
  ownerId: ActorId;
  sourceActorId?: ActorId;
  sourceAction?: ActionName;

  appliedAtTick: number;
  expiresAtTick: number;
  tickIntervalFrames?: number;
  nextTickFrame?: number;

  stacks: number;
  maxStacks: number;

  resistanceCheck: ResistanceTrace;
  dispelPolicy: "dispellable" | "not_dispellable" | "death_clear" | "death_keep";
}
```

### 22.2 StatusEffectType

0.2 必做：

```text
Bleed。
```

0.2 可预留但不强制完整数值：

```text
Poison；
Shock；
Burn；
Stun；
Freeze；
Stone；
Bind；
Sleep；
Slow；
DefenseDown；
AttackDown；
Curse。
```

### 22.3 通用规则

```text
1. StatusApplyRequested 必须经过 resistance check；
2. 失败发布 StatusResisted；
3. 成功发布 StatusApplied；
4. DOT 类按 tickIntervalFrames 先发布 StatusTickRequested，再产生 DamageRequested；
5. DamageApplied 后发布 StatusTicked；
6. 控制类必须经过 ArmorProfile / ResistanceProfile；
7. BuildingArmor 对多数控制类免疫；
8. 死亡清理按 dispelPolicy；
9. StatusDispelled 表示被外部驱散；
10. DebugOverlay 必须显示状态来源、层数、剩余帧、下一次 tick。
```

Status event 口径：

```text
1. StatusApplyRequested = 尝试施加状态；
2. StatusApplied = 状态已实际进入 owner status container；
3. StatusTickRequested = 周期 tick 准备执行；
4. StatusTicked = 本 tick 效果已生效；
5. StatusResisted = resistance check 拒绝；
6. StatusExpired = 自然到期；
7. StatusDispelled = 外部驱散；
8. StatusDeathCleanup = 死亡清理。
```

### 22.4 BleedStatus baseline

```text
0.2 必须有真实可触发来源，不能只做空壳字段。
触发来源 baseline：
- Debug action：ForceBleed，用于静态/截图/手工验证；
- RagingFury BloodPillar：test mode bleedApplyChance = 100%，normal baseline = 30%；
- VimAndVigor：可修正 bleed duration / stack / chance；
- Frenzy 本身不直接造成 Bleed，但 FrenzyBasic 可预留 bleedApplyChance 字段。
类型：damage_over_time；
tick：每 30F baseline；
duration：180F baseline；
stack：可叠加 baseline，最大层数可配置；
death：death_clear；
DamageRequested：sourceKind = status_dot，reactionPolicy = status_tick_feedback_only；
Bleed tick 不触发 HitStop / Recoil / launch / knockback / stagger；
Bleed tick 可以触发 DamageNumberRequested / VfxRequested / ActorDied；
Debug：必须显示 bleed stacks / next tick / sourceAction / applyChance / sourceKind / reactionPolicy。
```

---

## 23. GrabResolver baseline

0.2 不要求实现完整抓取技能，但必须具备规则接口，避免后续霸体系统重写。

### 23.1 GrabDecision

```ts
export interface GrabDecision {
  attempted: boolean;
  success: boolean;
  failedReason?:
    | "not_grab_action"
    | "target_out_of_range"
    | "target_dead"
    | "target_invulnerable"
    | "target_grab_immune"
    | "building_armor"
    | "already_grabbed";
}
```

### 23.2 规则

```text
1. Grab 只在 action 配置 canGrab 时判定；
2. BuildingArmor 目标必定失败；
3. GrabImmune 目标必定失败；
4. SuperArmor 可被 baseline grab 破除，具体由 skill config 决定；
5. 成功后 attacker / target 进入 grab lock；
6. 失败时必须记录 GrabFailed 和 failedReason；
7. DebugOverlay 必须显示 grab attempt result。
```

---

## 24. RootMotionSystem

RootMotion 解决动作和位移脱节问题。

### 24.1 RootMotionTrack

```ts
export interface RootMotionTrack {
  frames: Array<{
    frame: number;
    dx: number;
    dz: number;
    dy?: number;
    collisionPolicy: "block" | "slide" | "ignore";
  }>;
}
```

### 24.2 规则

```text
1. 普攻步进、上挑前冲、崩山击起跳/下落必须用 RootMotionTrack；
2. RootMotion 在 applyRootMotion 阶段执行；
3. PushBoxResolver 可截断 root motion；
4. 被 interrupt 后停止后续 root motion；
5. hit stop 冻结 root motion frame；
6. DebugOverlay 显示本帧 rootMotion delta。
```

---

## 25. 狂战士技能规格

### 25.1 NormalBasicAttack 1/2/3

定位：

```text
普通状态重剑三连；
第一刀有重量但不能拖；
可取消进入后续普攻或部分技能；
HitStop / Recoil 必须明显；
不能无限循环 Attack1。
```

帧定义约定：

```text
本规格采用 1-based inclusive frame index。
Startup = 1 到 Active 开始前一帧。
Active = 表格中列出的闭区间。
Recovery/Total = 动作总帧数，Active 结束后一帧进入 recovery。
例如 NormalBasic1 Active 5-8F，表示 1-4F 为 startup，5-8F 为 active，9-20F 为 recovery。
```

baseline frame：

| 动作 | Startup | Active | Recovery/Total | Cancel | HitStop | Recoil |
|---|---:|---|---|---|---:|---:|
| NormalBasic1 | 5F | 5-8F | 20F | 命中 7F 起；空挥 12-15F | 3F | 2F |
| NormalBasic2 | 6F | 6-9F | 22F | 命中 8F 起 | 4F | 3F |
| NormalBasic3 | 8F | 8-13F | 31F | 命中 11F 起 | 5F | 4F |

允许取消：

```text
Attack1 → Attack2 / UpwardSlash / MountainousWheel / RagingFury；
Attack2 → Attack3 / UpwardSlash / MountainousWheel / RagingFury；
Attack3 → UpwardSlash / MountainousWheel / RagingFury / Backstep 条件取消；
Attack3 不能接 Attack1 形成无限循环。
```

### 25.2 FrenzyToggle

```text
actionName: FrenzyToggle
type: toggle
attackHitbox: none
cost: periodic HP drain
hpFloor: 1
effect:
  - NormalBasicAttack chain 替换为 FrenzyBasicAttack chain；
  - 部分血气技能 cooldown modifier 字段预留；
  - 普攻多段化；
  - hit stop 单段降低；
  - recoil 降低；
  - 不直接造成出血。
```

### 25.3 FrenzyBasicAttack 1/2/3

| 动作 | Startup | Active | Recovery/Total | Hit 数 | HitStop | 备注 |
|---|---:|---|---|---:|---:|---|
| FrenzyBasic1 | 4F | 4-6F / 7-9F | 18F | 2 | 2F/段 | 第一段命中后可进入取消 |
| FrenzyBasic2 | 5F | 5-7F / 8-10F | 20F | 2 | 2F/段 | 命中硬直更密集 |
| FrenzyBasic3 | 6F | 6-8F / 9-11F / 12-14F | 28F | 3 | 2F/段 | 多段压制 |

规则：

```text
1. 每 hit 必须有独立 hitbox window；
2. 每段间隔 >= 2F；
3. 每个 active window 使用独立 hitGroupId，并写入 alreadyHitByGroup；
4. 不得每帧重复命中同一目标；
5. 不允许只是单纯加伤害。
```

### 25.4 UpwardSlash

```text
Startup: 7F
Active: 7-11F
Total: 27F baseline
Armor: 施放过程可配置 super_armor window
HitStop: 5F
Reaction:
  - 普通小怪：launch；
  - BossSuperArmor：armor_feedback_only；
  - BuildingArmor：damage only + armor spark。
```

红线：

```text
1. 必须挑飞普通小怪；
2. 必须存在追击窗口；
3. Boss 不得浮空；
4. BuildingArmor 不得浮空。
```

### 25.5 MountainousWheel

```text
Startup: 6F 起跳 baseline
Active:
  - FallingSlash: 16-21F
  - Shockwave: 21-27F
Total: 45F baseline
Armor: 下落阶段 super_armor baseline
Reaction:
  - slash 可击退 / 击倒；
  - shockwave 可形成地面冲击；
  - 对 BuildingArmor 只造成伤害和 armor feedback。
```

### 25.6 RagingFury

绝不能实现为单次向外震开。

```text
Startup: 10F baseline
Active:
  - Shockwave: 10-13F
  - BloodPillar: 15-33F，8 段 baseline
  - BloodPillar hit frames baseline：15F, 17F, 19F, 21F, 23F, 25F, 29F, 33F
Recovery/Total: 53F baseline
Cancel:
  - 前摇不可取消；
  - 血柱阶段可 Backstep 条件取消 baseline。
```

规则：

```text
1. Shockwave 可命中 Downed；
2. BloodPillar 是多段命中；
3. 每段必须有独立 multiHitSchedule / hitGroupId；
4. 普通小怪进入浮空 / air hitstun；
5. BossSuperArmor 不震飞；
6. BuildingArmor 不浮空、不击退；
7. DebugOverlay 显示 shockwave 与 bloodPillar 分段命中。
```

### 25.7 Backstep

```text
Startup: 3F
Attack: none
Total: 21F baseline
Cancel: Backstep action itself 默认不可被其他动作取消
用途：DNF 风格后跳，不是通用翻滚。
说明：其他动作可以在 CancelPolicy 明确允许时 cancel into Backstep，例如 Attack3 / RagingFury 血柱阶段条件取消。
```

Backstep RootMotion baseline：

```text
frame 1-3：prepare，dx = 0；
frame 4-12：向 facing 反方向移动，total dx = 48px baseline；
frame 13-21：减速落地 / 恢复；
dz = 0；
collisionPolicy = slide；
Backstep 无攻击命中，因此自身不触发 HitStop；
若从其他动作 cancel into Backstep，则从 Backstep enter 后按 Backstep 自身 rootMotion 推进。
```

### 25.8 QuickRebound

```text
Trigger: Downed + C
Startup: 0F
Invulnerable: 1-180F baseline，按住 C 维持
Release: 松开 C 后 10F getting_up armor baseline
Attack: none
Cancel: 蹲伏期间不可取消
```

### 25.9 Derange

```text
类型：主动 Buff；
Startup: 0F baseline；
Attack: none；
Cancel: 不作为攻击取消；
Effect: attack/move/cast modifier baseline；
由 BuffLifecycleSystem 管理。
```

### 25.10 BloodyCross

```text
类型：低血被动；
按 HP 百分比进入阶段；
阶段变更发布 BuffRefreshed；
DebugOverlay 显示当前阶段；
不等同 Frenzy。
```

### 25.11 VimAndVigor

```text
类型：被动；
0.2 实现 Bleed / HP 消耗 / 血气技能联动字段；
不要求完整正式数值。
```

### 25.12 Diehard

```text
类型：低血恢复技能接口预留；
0.2 必须定义 canTrigger / cost / cooldown / effect 接口；
可用 Debug 强制触发；
不要求正式数值。
```

---

## 26. 2.5D HitBox baseline

所有数值为 `baseline_tuning`，不是官方精确数据。

| 技能 | X 轴范围 | Z 轴容差 | Y 轴高度 | 最大目标 |
|---|---:|---:|---:|---:|
| NormalBasic1 | ±50px | ±3px | 0-80px | 5 |
| UpwardSlash | ±60px | ±2px | 0-120px | 8 |
| MountainousWheel Shockwave | ±120px | ±40px | 0-20px | 10 |
| RagingFury Shockwave | ±150px | ±60px | 0-30px | 8 |
| RagingFury BloodPillar | ±80px | ±30px | 0-200px | 8 |

规则：

```text
1. baseline 可调；
2. 所有改动必须记录在 docs/tuning-baseline.md；
3. screenshot test 至少覆盖 Z mismatch、Y mismatch、Downed hit、Armor hit；
4. DebugOverlay 必须渲染实际 hitbox，而不是配置表原始矩形；
5. 表中的 X 轴范围表示 hitbox local width，不默认表示以 attacker 中心左右对称；
6. 除 radial / shockwave / area 技能外，普通攻击与上挑必须按 facing 生成 forward-only hitbox；
7. radial / shockwave 技能可使用 centered/radial hitbox，并必须在 hitbox config 中标记 shapeType。
```

forward-only 示例：

```ts
// NormalBasic1 facing right
xMin = attacker.x + 10;
xMax = attacker.x + 60;

// NormalBasic1 facing left
xMin = attacker.x - 60;
xMax = attacker.x - 10;
```

HitBox shapeType baseline：

```text
NormalBasic / FrenzyBasic / UpwardSlash：forward_only；
MountainousWheel FallingSlash：forward_only；
MountainousWheel Shockwave：radial_or_centered_area；
RagingFury Shockwave：radial_or_centered_area；
RagingFury BloodPillar：centered_area。
```

---

## 27. MultiHit 与 alreadyHitByGroup

```ts
type HitGroupId = string;

interface MultiHitScheduleItem {
  frame: number;
  hitGroupId: HitGroupId;
  hitboxId: HitBoxId;
}

interface ActionInstance {
  alreadyHitByGroup: Map<HitGroupId, Set<ActorId>>;
}
```

规则：

```text
1. 每个 HitBoxFrameWindow 必须拥有 hitGroupId；
2. 同一 hitGroupId 内，同一 target 只能被命中一次；
3. 不同 hitGroupId 可以重复命中同一 target；
4. 多段技能必须使用 multiHitSchedule 产生多个 hitGroupId；
5. RagingFury blood pillar 每段单独命中；
6. FrenzyBasic 每段单独命中；
7. 每段命中都产生 HitConfirmed / DamageApplied；
8. Action ended / interrupted / death cleanup 时必须清理 alreadyHitByGroup；
9. 多段命中音效不得无限重叠，FeedbackController 需要节流。
```

RagingFury baseline multiHitSchedule：

```ts
[
  { frame: 10, hitGroupId: "rf_shockwave", hitboxId: "rf_shockwave" },
  { frame: 15, hitGroupId: "rf_pillar_1", hitboxId: "rf_pillar" },
  { frame: 17, hitGroupId: "rf_pillar_2", hitboxId: "rf_pillar" },
  { frame: 19, hitGroupId: "rf_pillar_3", hitboxId: "rf_pillar" },
  { frame: 21, hitGroupId: "rf_pillar_4", hitboxId: "rf_pillar" },
  { frame: 23, hitGroupId: "rf_pillar_5", hitboxId: "rf_pillar" },
  { frame: 25, hitGroupId: "rf_pillar_6", hitboxId: "rf_pillar" },
  { frame: 29, hitGroupId: "rf_pillar_7", hitboxId: "rf_pillar" },
  { frame: 33, hitGroupId: "rf_pillar_8", hitboxId: "rf_pillar" }
]
```

---

## 28. DeathLoop

### 28.1 触发

```text
DamageApplied 后 hp <= 0；
发布 ActorDied；
priority = Death；
作为 immediate high-priority event 插入 currentQueue；
同 tick / 同 flush 内优先处理，不得延迟到 nextQueue。
```

### 28.2 清理

死亡时必须：

```text
1. 中断 currentAction；
2. 标记 Actor flags.dead = true；
3. 清除 active hitboxes；
4. 清除 combat input buffer；
5. 清除可驱散 Buff；
6. 清除 death_clear Status；
7. 停止 reaction motion；
8. 进入 dead reaction；
9. 记录 DeathCleanupCompleted；
10. DebugOverlay 显示 death trace；
11. 当前 tick 已排队的低优先级 Action / HitQuery / Reaction / Buff trigger 必须按 block policy 标记为 blocked 或 cancelled。
```

### 28.3 Death cleanup barrier

```text
1. ActorDied 开始后，为该 actor 打开 deathCleanupBarrier；
2. DeathCleanupCompleted 之前，该 actor 相关的非 DeathCleanup 事件全部 block/cancel；
3. BuffDeathCleanup / StatusDeathCleanup / ActiveHitboxesCleared 必须继承 death correlationId；
4. ActionInterrupted 必须进入同一 death correlation chain；
5. DeathCleanupCompleted 是 barrier close event；
6. EventArchive 必须记录 barrier start / close；
7. ReplayFrame 必须记录 barrier 状态，便于复盘多段命中死亡时序；
8. deathCleanupBarrier 期间不得触发新的普通 ReactionRequested / HitStopStarted / RecoilStarted。
```

### 28.4 死亡后阻塞

```text
Dead actor：
- 不可 ActionRequest；
- 不可产生 HitQuery；
- 不可被普通 reaction 改写；
- 可被 DebugReset；
- 可被 RespawnController 重置。
```

### 28.5 Respawn baseline

```text
1. 0.2 不做正式复活系统；
2. DebugReset 可恢复 HP/MP；
3. RespawnController 接口预留；
4. 复活必须重置 action、reaction、buff/status、cooldown、input、hitbox。
```

---

## 29. FeedbackController

FeedbackController 只消费事件，不得修改战斗状态。

### 29.1 可触发

```text
SoundRequested；
CameraShakeRequested；
DamageNumberRequested；
VfxRequested；
ArmorSparkRequested；
HitFlashRequested。
```

### 29.2 禁止

```text
1. 禁止扣血；
2. 禁止改 reaction；
3. 禁止决定 hit；
4. 禁止改 buff/status；
5. 禁止改 cooldown；
6. 禁止改 action phase。
```

### 29.3 反馈同步

```text
1. 命中音效与 HitStopStarted 同步；
2. 伤害数字与 DamageApplied 同步；
3. armor spark 与 ArmorHit 同步；
4. camera shake 由 ReactionApplied / DamageApplied 配置触发；
5. 多段攻击音效需要节流，避免杂乱。
```

---

## 30. DebugOverlay

### 30.1 快捷键

```text
F1：开关 DebugOverlay；
F2：HitBox / HurtBox / PushBox；
F3：LastHitTrace；
F4：EventTracePanel；
F5：Toggle Frenzy；
F6：Force Diehard；
F7：Slow Motion；
F8：Single Step。
```

### 30.1.1 专用 Debug Actions

Debug actions 可以通过 DebugOverlay 按钮、脚本 API 或测试脚本触发；不要求全部绑定到 F1-F8，但必须可被 screenshot-test 和 static-test 调用。

```text
DebugReset：重置场景、Actor、Buff、Status、Cooldown、Replay、Trace；
ForceDownPlayer：强制玩家进入 Downed，用于 QuickRebound 验证；
ForceBleed：对指定目标施加 Bleed，用于 StatusEffect 验证；
SpawnTargets：生成普通小怪 / SuperArmor Boss / BuildingArmor dummy / 多目标克隆体；
ForceArmorHit：让下一次命中指向 SuperArmor Boss，用于 ArmorHit 验证；
ForceBuildingArmorHit：让下一次命中指向 BuildingArmor dummy，用于 control blocked 验证；
ExportReplay：导出 verification/replay.json；
RunScreenshotScenario：执行 deterministic screenshot scenario。
```

Debug action 规则：

```text
1. Debug action 必须通过 DebugEventHandlers 或测试 harness 进入 Combat Kernel；
2. Debug action 必须标记 source = debug；
3. Debug action 不得绕过 EventArchive；
4. Debug action 产生的状态变化必须进入 ReplayFrame；
5. Debug action 不得伪造验收结果，必须驱动真实 Combat Kernel 状态变化。
```

### 30.2 必须显示

```text
FPS；
frame delta；
combat tick；
tick cost；
render cost；
object pool usage；
current action；
localFrame；
action phase；
current reaction；
hit stop remaining；
recoil remaining；
cooldown；
resource state；
buff list；
status list；
armor profile；
position x/z/y；
velocity vx/vz/vy；
active hitboxes；
hurtboxes；
pushboxes；
last input；
input buffer；
last hit trace；
event queue length；
replay recording state。
```

### 30.3 LastHitTrace

必须显示：

```text
attacker；
target；
actionName；
localFrame；
hitboxId；
geometry result；
x/z/y overlap；
HitDecision accepted/rejected；
rejectedReason；
armor baseType / immunities / temporaryFlags；
rawReaction；
finalReaction；
damage before/after；
counter/back/crit；
hitStop；
recoil；
events emitted；
timestamp / tick。
```

### 30.4 Debug 红线

```text
1. 未命中必须显示原因；
2. Boss armor hit 必须显示 rawReaction 与 finalReaction；
3. BuildingArmor 必须显示 control blocked；
4. QuickRebound 无敌必须显示；
5. Death cleanup 必须显示；
6. EventTracePanel 必须能追踪 correlationId。
```

---

## 31. ReplayRecorder

R3 统一 Replay 口径：0.2 必做 ReplayRecorder，不强制完整 ReplayPlayer。文档中的“可回放”在 0.2 中定义为可记录、可导出、可逐帧检查数据；正式 UI 播放器只做接口预留，不进入验收。

### 31.1 ReplayFrame

```ts
export interface ReplayFrame {
  tick: number;

  inputs: SerializedInputState[];
  actors: ActorSnapshot[];
  actionInstances: SerializedActionInstance[];
  hitQueries: SerializedHitQuery[];
  hitDecisions: SerializedHitDecision[];
  events: SerializedCombatEvent[];

  debug?: {
    lastHitTrace?: LastHitTrace;
    perf?: PerformanceSnapshot;
  };
}
```

### 31.2 规则

```text
1. 每 tick 记录一帧；
2. 默认保存最近 10 秒 ring buffer；
3. 发生异常 / Blocker 时可导出 replay.json；
4. ReplayFrame 必须使用 immutable snapshot；
5. ReplayFrame 不得保存 ObjectPool 中可复用对象引用；
6. 可通过 Debug 工具逐帧检查 hitbox / event / actor snapshot；
7. ReplayRecorder 不得修改 live combat state；
8. ReplayPlayer.ts 允许作为接口预留或最小 stub，但不进入 0.2 验收。
```

### 31.3 0.2 验收

```text
1. 能记录最近 10 秒 ReplayFrame；
2. 能导出 replay.json；
3. 能在 DebugOverlay 显示 replay buffer 状态；
4. static test 检查 ReplayFrame 字段完整性；
5. static test 检查 export replay 不破坏 live state；
6. 不要求完整 UI 播放器。
```

---

## 32. PerformanceMonitor 与 ObjectPool

### 32.1 PerformanceMonitor 指标

```text
FPS；
frame delta；
combat tick cost；
render cost；
long task warning；
object pool usage；
active hitbox count；
active effect count；
event queue length；
replay buffer size；
heap usage，如浏览器支持。
```

预算：

```text
单个 combat tick 尽量 < 2ms；
单帧 JS 总成本尽量 < 6ms；
不得出现明显 > 50ms 的长任务卡顿；
多目标 Debug 模式也不得出现持续 GC 抖动。
```

### 32.2 ObjectPool 必须池化

```text
HitBox；
HitDecision；
HitQuery；
DamageNumber；
HitEffect；
DebugDrawShape；
CombatEvent；
Vec3 / Point；
ReplayFrame 中的临时数组需复用或 ring buffer 管理。
```

### 32.3 ObjectPool 与 Archive / Replay 红线

```text
1. Runtime processing 可以使用池化对象；
2. EventArchive / LastHitTrace / ReplayFrame 必须保存 immutable plain-data snapshot；
3. 禁止 Archive / Replay 保存池化对象引用；
4. CombatEvent 归还对象池前，必须 serialize / clone 进入 archive；
5. LastHitTraceUpdated 必须引用 snapshot，而不是 live mutable event。
```

红线：

```text
combat tick 内禁止高频 new 临时对象；
命中判定不能每帧创建大量数组；
伤害数字、命中特效、debug shape 必须复用；
对象池使用情况必须能被 PerformanceMonitor 显示。
```

---

## 33. Static Tests

必须提供 `tests/static/`，并通过 `npm run static:test` 执行。

### 33.1 architecture.test.ts

检查：

```text
1. Phaser Scene 不 import damage/reaction/armor resolver 直接执行规则；
2. Combat Kernel 不依赖 Phaser Scene；
3. FeedbackController 不写 Actor combat state；
4. DebugOverlay 不写 Actor combat state；
5. Arcade Physics 不作为攻击命中 truth。
```

### 33.2 event-bus.test.ts

检查：

```text
1. priority stable sort；
2. Death priority 高于 Hit/Damage/Reaction；
3. ActorDied 阻塞死亡 actor 后续 ActionRequested；
4. correlationId 能串起 Hit→Damage→Reaction；
5. archived events 包含 status；
6. ActorDied / ActionInterrupted 在同一 flush 内 immediate 插队；
7. Death 相关低优先级事件会被 blocked/cancelled 并记录原因；
8. BuffApplyRequested / StatusApplyRequested / StatusTickRequested 等 request/result event 类型齐全；
9. CooldownCheckRequested / CooldownRejected / CooldownReady 类型齐全。
```

### 33.3 input-buffer.test.ts

检查：

```text
1. HitStop 期间不消费；
2. CancelWindow 内消费；
3. 同一 pressed edge 只触发一个互斥技能；
4. command 优先于 hotkey；
5. interrupted 清空 combat inputs；
6. Debug inputs 保留；
7. QuickRebound 用 C pressed edge 进入，用 BrowserInputState.isHeld(C) 维持。
```

### 33.4 armor.test.ts

检查：

```text
1. SuperArmor 可受伤但反应被改写；
2. BuildingArmor 可受伤但不可浮空/倒地/抓取；
3. Invulnerable 不受伤；
4. Boss hit stop cap 生效；
5. Debug trace 包含 rawReaction/finalReaction；
6. BaseArmorType 与 immunities 可组合表达 GrabImmune / Invulnerable；
7. temporaryFlags.invulnerableUntilTick 可阻止 DamageApplied；
8. temporaryFlags 不得使用 action localFrame 作为 Actor 级无敌截止时间。
```

### 33.5 status-buff.test.ts

检查：

```text
1. Buff apply / refresh / stack / replace / expire / dispel；
2. death cleanup 清除 death_clear；
3. Bleed tick 产生 DamageRequested；
4. resistance check 可拒绝 status；
5. Frenzy HP drain 不会扣到 0；
6. RagingFury BloodPillar 或 ForceBleed 能触发 Bleed apply → tick → expire；
7. Bleed tick 的 DamageRequested.sourceKind = status_dot；
8. Bleed tick 的 reactionPolicy = status_tick_feedback_only；
9. Bleed tick 不触发普通 ReactionRequested / HitStopStarted / RecoilStarted。
```

### 33.6 death-loop.test.ts

检查：

```text
1. hp <= 0 触发 ActorDied；
2. death 中断 action；
3. active hitbox 被清除；
4. dead actor 不产生 HitQuery；
5. DebugReset 可复位；
6. deathCleanupBarrier 在 ActorDied 后打开，在 DeathCleanupCompleted 后关闭；
7. barrier 期间相关普通 Reaction/HitStop/Recoil 事件被 block/cancel。
```

### 33.7 replay.test.ts

检查：

```text
1. ReplayFrame 包含 tick/input/actors/actions/events；
2. ring buffer 长度受控；
3. export replay 不破坏 live state；
4. LastHitTrace 可被记录；
5. ReplayFrame 不保存 ObjectPool 可复用对象引用。
```

---

## 34. Screenshot Verification

`scripts/screenshot-test.mjs` 必须至少完成：

```text
1. 启动 Vite preview 或 dev server；
2. 打开 Combat Lab；
3. 点击 Start 解锁音频；
4. 等待场景稳定；
5. 打开 DebugOverlay；
6. 执行 deterministic screenshot scenario；
7. 截图保存 verification/screenshot.png；
8. 若浏览器不可用，生成 fallback screenshot 和明确错误说明；
9. fallback screenshot 只用于诊断，screenshotTest.passed 必须为 false；
10. 生成 verification/report.json。
```

Deterministic screenshot scenario 必须驱动真实 Combat Kernel，不能伪造面板状态：

```text
1. Start；
2. Toggle DebugOverlay；
3. SpawnTargets：生成普通小怪、普通木桩、SuperArmor Boss、BuildingArmor dummy；
4. NormalBasic1 命中普通小怪，记录 normalHitObserved；
5. UpwardSlash 挑飞普通小怪，记录 launchObserved；
6. RagingFury 命中普通小怪，至少记录 shockwave + 2 段 blood pillar，记录 ragingFuryMultiHitObserved；
7. 对 SuperArmor Boss 触发 ArmorHit，记录 armorHitObserved；
8. 对 BuildingArmor dummy 触发 BuildingArmor control blocked，记录 buildingArmorBlockedControlObserved；
9. ForceBleed 或 RagingFury test mode 触发 Bleed apply/tick，记录 bleedObserved；
10. ForceDownPlayer 后执行 QuickRebound，要求 pressed edge 进入、held state 维持，记录 quickReboundObserved；
11. 截图时 LastHitTrace / EventTracePanel 至少显示最近一次 armor hit、bleed 或 quick rebound 事件；
12. 导出 verification/report.json 与可选 verification/replay.json。
```

截图必须能看到：

```text
玩家；
普通小怪；
普通木桩；
SuperArmor / BuildingArmor 木桩；
DebugOverlay；
HitBox / HurtBox / PushBox；
LastHitTrace 或 EventTracePanel；
PerformanceMonitor；
当前 action frame。
```

---

## 35. Verification Report

`verification/report.json` 必须包含 docker command 与 innerCommand，避免把宿主机 npm 误认为唯一验收方式。

```json
{
  "project": "combat-lab-0.2-r3",
  "timestamp": "ISO-8601",
  "typecheck": {
    "passed": true,
    "command": "docker compose run --rm combat-lab npm run typecheck",
    "innerCommand": "npm run typecheck"
  },
  "build": {
    "passed": true,
    "command": "docker compose run --rm combat-lab npm run build",
    "innerCommand": "npm run build",
    "distPath": "dist/",
    "artifactWrittenToHost": true
  },
  "staticTest": {
    "passed": true,
    "command": "docker compose run --rm combat-lab npm run static:test",
    "innerCommand": "npm run static:test"
  },
  "screenshotTest": {
    "passed": true,
    "command": "docker compose run --rm combat-lab npm run screenshot:test",
    "innerCommand": "npm run screenshot:test",
    "screenshotPath": "verification/screenshot.png",
    "fallbackGenerated": false,
    "artifactWrittenToHost": true,
    "error": null
  },
  "screenshotScenario": {
    "normalHitObserved": true,
    "launchObserved": true,
    "ragingFuryMultiHitObserved": true,
    "armorHitObserved": true,
    "buildingArmorBlockedControlObserved": true,
    "bleedObserved": true,
    "quickReboundObserved": true
  },
  "combatChecks": {
    "eventBus": true,
    "inputBuffer": true,
    "armorProfile": true,
    "downedHit": true,
    "quickRebound": true,
    "buffLifecycle": true,
    "statusEffect": true,
    "damageSourcePolicy": true,
    "deathLoop": true,
    "deathCleanupBarrier": true,
    "resourceCooldownGate": true,
    "replayRecorder": true
  },
  "dockerCommands": {
    "run": "docker compose up --build",
    "typecheck": "docker compose run --rm combat-lab npm run typecheck",
    "build": "docker compose run --rm combat-lab npm run build",
    "staticTest": "docker compose run --rm combat-lab npm run static:test",
    "screenshotTest": "docker compose run --rm combat-lab npm run screenshot:test",
    "verify": "docker compose run --rm combat-lab npm run verify"
  },
  "artifacts": {
    "dist": "dist/",
    "report": "verification/report.json",
    "screenshot": "verification/screenshot.png",
    "replay": "verification/replay.json"
  },
  "notes": []
}
```

规则：

```text
1. command 必须是 docker compose run 形式；
2. innerCommand 表示容器内部实际执行的 npm script；
3. fallbackGenerated = true 时 screenshotTest.passed 必须为 false；
4. artifactWrittenToHost 必须为 true，否则验收失败；
5. screenshotScenario 所有核心观察项必须为 true；
6. verification/report.json 本身必须写回宿主机项目目录。
```

## 36. README 要求

README 必须包含：

```text
1. Project Overview；
2. Scope；
3. Compliance / Source Policy；
4. How to Run；
5. Services List；
6. Commands；
7. Controls；
8. Debug Keys；
9. Verification；
10. Known Limits；
11. Tuning Policy。
```

### 36.1 How to Run

必须明确：

```bash
docker compose up --build
```

访问地址：

```text
http://localhost:5173
```

### 36.2 Verification

必须明确容器内验收命令。宿主机 npm 命令仅作为开发便利，不作为唯一验收方式。

容器验收命令：

```bash
docker compose run --rm combat-lab npm run typecheck
docker compose run --rm combat-lab npm run build
docker compose run --rm combat-lab npm run static:test
docker compose run --rm combat-lab npm run screenshot:test
docker compose run --rm combat-lab npm run verify
```

宿主机开发便利命令：

```bash
npm run typecheck
npm run build
npm run static:test
npm run screenshot:test
npm run verify
```

---

## 37. Acceptance Criteria

### 37.1 构建验收

```text
1. docker compose up --build 可启动；
2. 容器内 npm run typecheck 通过；
3. 容器内 npm run build 通过；
4. 容器内 npm run static:test 通过；
5. 容器内 npm run screenshot:test 生成真实截图，fallback screenshot 不得算通过；
6. 容器内 npm run verify 生成 report.json；
7. dist/ 存在且写回宿主机项目目录；
8. verification/report.json 与 verification/screenshot.png 写回宿主机项目目录；
9. screenshotScenario 核心观察项全部为 true；
10. README 完整。
```

### 37.2 战斗链路验收

```text
1. NormalBasic1/2/3 可按输入链正常执行；
2. FrenzyToggle 后普通攻击切换为 FrenzyBasic1/2/3；
3. UpwardSlash 可挑飞普通小怪；
4. MountainousWheel 有下落斩击与冲击波；
5. RagingFury 是 Shockwave + BloodPillar 多段；
6. Backstep 可执行；
7. Downed 状态可 QuickRebound；
8. SuperArmor 目标受伤但不进入普通浮空；
9. BuildingArmor 目标不被浮空/倒地/抓取/击退；
10. BleedStatus 可 apply/tick/expire；
11. Buff 可 apply/refresh/expire/dispel；
12. Death 可中断动作并清理 active hitbox；
13. HitStop 期间可收集输入但不消费；
14. Recoil 能体现命中重量；
15. PushBox 不允许明显穿怪/叠怪；
16. LastHitTrace 能解释最后一次命中/未命中；
17. FrenzyBasic / RagingFury 多段命中使用 alreadyHitByGroup，不得退化成单段；
18. ReplayRecorder 能导出 immutable replay.json；
19. Bleed DOT 使用 sourceKind=status_dot 与 reactionPolicy=status_tick_feedback_only，不触发普通受击；
20. Resource/Cooldown gate check 失败不得进入 ActionEntered；
21. Death cleanup barrier 能阻塞死亡 actor 的后续普通事件。
```

### 37.3 Debug 验收

```text
1. F1-F8 调试快捷键可用；
2. 当前 action frame 可见；
3. HitBox / HurtBox / PushBox 可见；
4. LastHitTrace 可见；
5. 未命中原因可见；
6. ArmorProfile 可见；
7. rawReaction 与 finalReaction 可见；
8. EventTracePanel 可见；
9. PerformanceMonitor 可见；
10. ReplayRecorder 状态可见；
11. Debug actions：ForceDownPlayer / ForceBleed / SpawnTargets / RunScreenshotScenario 可用。
```

### 37.4 DNF-style 机制红线

```text
1. 不得把 Frenzy 写成低血自动 12 秒；
2. 不得把 RagingFury 写成单次震开；
3. 不得用 LabDodge 替代 Backstep / QuickRebound；
4. 不得省略 MountainousWheel；
5. 不得省略 CommandInputParser；
6. 不得省略 QuickRebound；
7. 不得省略 BleedStatus baseline；
8. 不得省略 ArmorProfile；
9. 不得使用 Phaser Arcade Physics 作为战斗判定；
10. 不得把 Combat Kernel 写进 Phaser Scene；
11. 不得让动画系统决定命中；
12. 不得跳过 DebugOverlay / LastHitTrace / PerformanceMonitor。
```

---

## 38. 开发任务拆分

### Milestone 0：工程整理

```text
- 清理现有 Demo；
- 建立 src/combat 分层；
- 补 Dockerfile / docker-compose.yml；
- 补 README；
- 补 verify 脚本；
- 保证 docker compose up 可运行。
```

### Milestone 1：CombatEventBus

```text
- CombatEventType / Priority / Status；
- Event envelope；
- currentQueue / nextQueue / archive；
- priority stable sort；
- correlationId / parentEventId / causationId；
- block policy；
- event handlers；
- request/result event 类型；
- death cleanup barrier；
- static tests。
```

### Milestone 2：Input + Action

```text
- BrowserInputState；
- CommandInputParser；
- SkillCommandRegistry；
- InputBuffer；
- ActionInstance；
- FrameDataAction；
- CancelPolicy；
- hit stop 不消费输入；
- tests。
```

### Milestone 3：Hit + Damage + Reaction

```text
- HitQueryBuilder；
- HitResolver2D5；
- HitDecisionResolver；
- DamageResolver；
- DamageSourceKind / DamageReactionPolicy；
- ReactionResolver；
- HitStopController；
- RecoilController；
- LastHitTrace。
```

### Milestone 4：Armor + Death + PushBox

```text
- ArmorProfile；
- SuperArmor / BossSuperArmor / BuildingArmor；
- GrabResolver baseline；
- PushBoxResolver；
- DeathLoop；
- ActionInterrupted；
- active hitbox cleanup；
- tests。
```

### Milestone 5：Buff + Status + Resource

```text
- CooldownResourceKernel gate check + tick update；
- BuffLifecycleSystem；
- StatusEffectSystem；
- Frenzy；
- BloodyCross；
- VimAndVigor；
- Derange；
- Bleed。
```

### Milestone 6：Skills

```text
- NormalBasic 1/2/3；
- FrenzyBasic 1/2/3；
- UpwardSlash；
- MountainousWheel；
- RagingFury；
- Backstep；
- QuickRebound。
```

### Milestone 7：Debug + Replay + Screenshot

```text
- DebugOverlay 完整接入；
- EventTracePanel；
- ReplayRecorder；
- PerformanceMonitor；
- deterministic screenshot scenario；
- screenshot test；
- final verify。
```

---

## 39. 给开发 Agent 的英文实现提示词

```text
Implement Combat Lab 0.2-R3 Final Integrated Development Specification.

Use Phaser 3 + TypeScript + Vite.
The deliverable must run with docker compose up --build.
Do not add server-side gameplay logic.
Do not use DNF official art, audio, animation, UI, client files, leaked source, private server code, or reverse-engineered client code.
Treat all frame tables as tunable baseline parameters, not official exact frame data.

Primary goal:
Build an event-driven DNF-style Berserker combat kernel for a Web single-player lab.

Required systems:
1. FixedStepSimulation at 60Hz with max 4 catch-up ticks and lifecycle guards.
2. BrowserInputState + CommandInputParser + InputBuffer.
3. CombatEventBus with priority, blocking, correlationId, parentEventId, causationId, currentQueue, nextQueue, archive.
4. ActorCore, ActionInstance, FrameDataAction, CancelPolicy.
5. HitQueryBuilder, HitResolver2D5, HitDecisionResolver.
6. DamageResolver, DamageMultiplierResolver.
7. ReactionResolver, ReactionMotionController, HitStopController, RecoilController.
8. ArmorProfile with BaseArmorType none/super_armor/boss_super_armor/building_armor plus immunity flags for grab/control/damage/hitStop and temporary invulnerability flags.
9. DownedHitResolver and QuickRebound state chain.
10. GrabResolver baseline.
11. PushBoxResolver and RootMotionSystem.
12. CooldownResourceKernel with separate gate check and tick update, GCD, independent cooldown, HP/MP/cube cost fields.
13. BuffLifecycleSystem with apply, refresh, stack, replace, expire, dispel, death cleanup.
14. StatusEffectSystem with Bleed baseline, sourceKind=status_dot, reactionPolicy=status_tick_feedback_only, and extensible status types.
15. DeathLoop: lethal damage emits ActorDied, opens a death cleanup barrier, interrupts action, clears hitboxes and eligible buffs/statuses.
16. DebugOverlay, LastHitTrace, EventTracePanel.
17. ReplayRecorder with immutable snapshots and replay.json export; ReplayPlayer is optional stub only.
18. PerformanceMonitor and ObjectPool.
19. Static tests and deterministic screenshot verification with artifacts written back to the host project directory.

Required skills:
- NormalBasic1/2/3
- FrenzyToggle
- FrenzyBasic1/2/3
- UpwardSlash
- MountainousWheel
- RagingFury with Shockwave + BloodPillar multi-hit
- Backstep
- QuickRebound
- Derange baseline
- BloodyCross baseline
- VimAndVigor + Bleed baseline
- Diehard interface

Hard constraints:
- Phaser Scene must not decide hit, damage, reaction, armor, death, buffs, or cooldown.
- Phaser Arcade Physics must not be used as attack hit truth.
- FeedbackController must not mutate combat state.
- DebugOverlay must not mutate combat state.
- HitStop collects input but does not consume input.
- QuickRebound uses C pressed edge to enter and BrowserInputState.isHeld(C) to maintain hold duration.
- Status DOT damage must not trigger normal hit reaction, HitStop, or Recoil.
- Death blocks later actions from the dead actor.
- BuildingArmor allows damage but blocks launch, knockdown, knockback, and grab.
- RagingFury must not be implemented as a single radial knockback.
- Frenzy must be a toggle, not a low-HP 12-second temporary mode.
- Backstep and QuickRebound must not be replaced by generic dodge.
- Every hit, miss, armor hit, downed hit, status trigger, buff refresh, resource/cooldown rejection, and death cleanup must be visible in DebugOverlay and LastHitTrace.

Verification commands:
- docker compose up --build
- docker compose run --rm combat-lab npm run typecheck
- docker compose run --rm combat-lab npm run build
- docker compose run --rm combat-lab npm run static:test
- docker compose run --rm combat-lab npm run screenshot:test
- docker compose run --rm combat-lab npm run verify

Deliverables:
- Complete source code
- README.md
- docs/source-policy.md
- docs/tuning-baseline.md
- verification/report.json
- verification/screenshot.png
- verification/replay.json when exported
- dist/
- All artifacts must be written back to the host project directory when commands run inside Docker
```

---

## 40. 最终结论

Combat Lab 0.2 的核心不是“再加几个技能”，而是把战斗系统升级为：

```text
事件驱动；
规则分层；
输入可控；
命中可解释；
状态可追踪；
死亡可中断；
Buff/异常可扩展；
Web 环境稳定；
Debug/Replay 可验证；
一键运行可验收。
```

完成 0.2 后，项目才具备继续推进到：

```text
Combat Lab 0.3：手感精修与帧级校准；
Combat Lab 0.4：怪物 AI 与地图交互；
Combat Lab 0.5：完整狂战士技能扩展；
Combat Lab 1.0：DNF 风格可玩战斗验证台。
```

0.2 是整个项目的工程地基版本。
