# Carbon Shade 架构改进方案 — Combat Lab 0.4+

> 基于 2026-05-12 架构评审，针对「手感到位」和「demo→产品」的完整解决方案
> 研究来源：6 个并行 agent（WebSearch + Firecrawl + 本地文档）+ 现有代码分析
>
> Status: superseded planning snapshot
> Authoritative successor: `docs/planning/2026-06-04-engine-native-rewrite-roadmap.md`
> Notes: preserve for pre-engine-native refactor context only.

---

## 一、改进总览

| 序号 | 改进项 | 优先级 | 工作量估算 | 对「手感到位」的影响 |
|------|--------|--------|-----------|---------------------|
| 1 | CombatKernel 拆分为 15 子系统 | P0 | 3-5天 | 架构基础，降低后续耦合 |
| 2 | Fixed Timestep + 渲染插值 | P0 | 2-3天 | 帧率稳定是手感的前提 |
| 3 | Hit Stop（冻结帧） | P0 | 1-2天 | DNF 手感核心，必须做 |
| 4 | 摄像机系统（震屏+闪屏） | P0 | 1-2天 | 打击感 40% 来源于此 |
| 5 | 输入系统重构 | P0 | 2-3天 | 指令预判、优先级、SOCD |
| 6 | 动画混合系统 | P1 | 2-3天 | 动作切换流畅度 |
| 7 | 音频管线 | P1 | 2-3天 | 手感 60% 来自音效 |
| 8 | 特效层（残影/轨迹线） | P1 | 1-2天 | 视觉反馈增强 |
| 9 | UI/HUD 框架 | P1 | 2-3天 | 伤害数字/冷却/连击 |
| 10 | Rollback Netcode 预留 | P2 | 设计阶段 | 多人对战基础 |
| 11 | CI/CD 增强 | P2 | 1-2天 | 截图对比+性能回归 |

---

## 二、P0 改进详细方案

### 1. CombatKernel → 15 子系统管道

**当前问题**：CombatKernel.tick() 是 40 步单体巨方法，893 行。

**目标架构**：

```
CombatLoop (固定 60Hz 步进)
├── 1. InputSystem     — 原始输入→解析命令→推入 inputBuffer
├── 2. AISystem        — EnemyAI.tick() per faction
├── 3. ActionSystem    — 消耗缓冲输入→requestAction→取消检查→冷却门
├── 4. FrameDataSystem — 推进 localFrame→阶段转换(startup/active/recovery/ended)
├── 5. MotionSystem    — 根运动+按住输入移动
├── 6. PhysicsSystem   — 推箱+世界边界夹紧
├── 7. HitSystem       — 构建命中查询→几何重叠→HitDecisionResolver
├── 8. DamageSystem    — 伤害公式→HP扣除→死亡检查
├── 9. ReactionSystem  — HitStop/击退/浮空速度/硬直计时器
├── 10. StatusSystem   — 状态Tick(出血/眩晕衰减)/韧性/互斥
├── 11. BuffSystem     — Buff生命周期/修改器应用
├── 12. CooldownSystem — 冷却Tick/资源门
├── 13. DeathSystem    — kill()/阻塞策略
├── 14. ReplaySystem   — 快照刷新事件到 ReplayRecorder
├── 15. EventFlush     — bus.flush() 清空队列事件
```

**通信规则**：
- 系统间通过 `SystemContext`（共享状态）读取上游结果
- 跨系统通知通过 `CombatEventBus`（双缓冲，避免重入非确定性）
- 系统绝不直接调用前面的系统

**接口定义**：
```typescript
interface CombatSystem {
  phase: SystemPhase;  // INPUT | LOGIC | DETECTION | RESOLVE | CLEANUP | RECORD | FLUSH
  tick(ctx: SystemContext, bus: CombatEventBus): void;
}
```

**迁移策略**：从底部开始提取（Replay→Death→Cooldown，耦合最低）逐步向上，每次提取后跑 41 个测试确认无回归。

---

### 2. Fixed Timestep + 渲染插值

**核心模式**（来自 Gaffer on Games / GGPO 标准）：

```
游戏循环（每帧）：
  accumulator += frameTime
  while (accumulator >= FIXED_DT) {  // FIXED_DT = 1/60s
    kernel.tick(inputs, FIXED_DT)     // 最多追赶 4 个 tick
    accumulator -= FIXED_DT
  }
  alpha = accumulator / FIXED_DT
  renderer.interpolate(prevState, currentState, alpha)  // 渲染滞后 2 帧
```

**实施**：
- 在 `CombatKernel` 外层包装 `FixedStepSimulation` 类
- 渲染层维护 `prevRenderState` / `currentRenderState` 两个快照
- 渲染在 `prev→current` 之间按 `alpha` 插值（位置、动画帧进度）
- 最大追赶 tick 数 = 4（防止螺旋死亡）

---

### 3. Hit Stop（冻结帧）

**模式**：Kernel 内 `hitStopRemaining` 计数器。当 > 0 时，`tick()` 跳过所有逻辑更新，仅累计计数器。渲染层在冻结期间可选定格或轻微缩放。

**强度分级**（参考 DNF Duel 帧数据）：
- 轻攻击：2-5 帧
- 中攻击：6-10 帧
- 重攻击/大招：12-20 帧
- 不对称：攻击方冻结 < 受击方

**实施**：
```typescript
// ReactionSystem.tick() 中
if (hitResult.impactLevel > 0) {
  ctx.hitStopRemaining = HIT_STOP_TABLE[hitResult.impactLevel];
}
// CombatLoop 中
if (ctx.hitStopRemaining > 0) {
  ctx.hitStopRemaining--;
  return; // 跳过所有子系统
}
```

---

### 4. 摄像机系统

**震屏**：Kernel 发射 `CameraShake{intensity, duration}` 事件，渲染层使用 Phaser `camera.shake()`。

| 命中级别 | 强度 | 持续时间 |
|---------|------|---------|
| 轻 | 2-4px | 80ms |
| 中 | 6-10px | 150ms |
| 重/浮空 | 12-18px | 250ms |

**闪屏**：全屏白色矩形，从 30% 透明度淡出到 0，60-100ms。可向元素伤害颜色着色。

**关键**：UI/HUD 必须在独立摄像机上（`camera.ignore()`），不参与震屏。

---

### 5. 输入系统重构

**当前问题**：`requestAction(player, "skill")` — 无预判、无优先级、无 SOCD。

**目标**：
```typescript
interface InputSystem {
  buffer: InputBuffer;        // 环形缓冲区，容量 10-15 帧
  parser: InputParser;        // 原始按键→指令（方向+按键组合）
  priorityResolver: PriorityResolver; // 同时按下时选择最高优先级指令
  socdCleaner: SOCDCleaner;   // 左右同时按→中性/最后按下
}

// 输入预判：在缓冲窗口中查找匹配指令
// 例如：↓↘→ + X → "RagingFury"，在最后 10 帧内查找 ↓,↘,→,X 序列
```

**DNF 特有需求**：方向键指令（↓↘→ + Z/X/C）、快捷键（直接按技能键）、取消窗口内指令缓冲。

---

## 三、P1 改进方案

### 6. 动画混合系统

**核心认识**（来自动画混合 agent 研究）：2D 精灵无法像 3D 那样生成真正的中间帧。可用方案有三种：

1. **过渡桥接帧**（Bridge Frames）：美术提供专用的中间过渡帧——DNF/DFO 的做法
2. **Alpha 交叉淡入淡出**：当前帧淡出 + 目标帧淡入，2-4 帧完成
3. **骨骼/角色纸娃娃**：身体部件独立，可做真正的插值——当前不动此路线

**推荐方案**：Alpha 交叉淡入淡出 + 项目已有的取消窗口数据。

```
FrameDataSystem.tick() → 输出 currentFrame + targetAction
AnimationBlender:
  if (actionChanged) {
    fadeOutFrames = currentAction.recoveryFrames.slice(0, min(3, recovery.length))
    fadeInFrames = targetAction.startupFrames.slice(0, min(3, startup.length))
    for each frame: currentAlpha = 1 → 0, nextAlpha = 0 → 1 (easeOutQuad)
  }
```

**DNF 特有的取消层级**（项目已有 PVF 数据支撑）：
- 普通攻击 → 可取消到技能（cancel*.skl 中的 cancelGroup/cancelTargetSlots）
- 技能 → 可取消到更高级技能（cancelWeaponMask 控制武器限制）
- 觉醒技能 → 最高层级，不可被取消
- 混合窗口通常 2-6 帧，与 whiffCancelFrom/hitCancelFrom 数据联动

**与 Phaser 3 的关系**：Phaser 的 `AnimationManager` 只做简单帧序列播放——无混合、无状态机。项目已有的 `FrameDataAction.ts` + `whiffCancelFrom`/`hitCancelFrom` 已经实现了取消窗口这一半，缺的是过渡期的视觉平滑。

- 混合窗口：2-4 帧（可配置）
- 过渡曲线：easeOut（快入慢出）
- 仅混合位置/缩放，不混合精灵帧索引
- 优先实现 Alpha 淡入淡出，后续考虑桥接帧方案

### 7. 音频管线

**架构**：`AudioManager` 封装 Phaser `WebAudioSoundManager`。

```
AudioManager
├── VoicePool (8 hit SFX, 4 slash, 2 voice)
├── PriorityStealing (Critical > High > Medium > Low)
├── VoiceGate (冷却门，防止技能喊话刷屏)
├── Spatializer (z轴→增益+低通滤波)
└── HitStopSync (hitConfirm音效在冻结期间仍播放)
```

**关键**：命中确认音效使用 `audioCtx.currentTime` 立即播放，不受 HitStop 影响。

### 8. 特效层

**残影（Afterimage）**：渲染层维护最近 3-5 帧位置环形缓冲，快速移动时绘制递减透明度的精灵副本。

**轨迹线（Sword Trail）**：攻击帧之间用细线/渐变多边形连接剑尖位置。

**伤害数字**：HitStop 结束后生成，向上浮动，缓出曲线。

---

## 四、P2 预留

### 9. Rollback Netcode 架构预留

当前确定性内核已为 Rollback 做好准备：
- FNV-1a 哈希 → 确定帧比较
- ReplayRecorder → 可直接演变为快照系统
- 纯逻辑内核 → 可运行于服务端权威/客户端预测

**预留接口**：
```typescript
interface Rollbackable {
  saveState(): ActorSnapshot;   // 浅拷贝纯数据对象
  restoreState(s: ActorSnapshot): void;
}

// CombatKernel 需支持：
kernel.rollbackTo(frameN: number);      // 恢复到第 N 帧
kernel.resimulate(inputs: InputQueue); // 用修正输入重跑
```

**注意**：此阶段仅设计接口，不做网络传输实现。目标是确保后续子系统拆分时不破坏确定性。

### 10. CI/CD 增强

在现有 `typecheck → static:test → build` 基础上增加：

```yaml
# 新增 Job
performance-regression:
  - 运行 auto-combat (1200 ticks)
  - 记录 FPS/帧时间 JSON
  - 与上次运行比较，FPS 下降 >10% 则失败

screenshot-diff:
  - 启动 headless browser (Puppeteer)
  - 进入已知游戏状态
  - 对比基线截图（像素差异 < 3%）

asset-integrity:
  - FNV-1a 哈希所有 public/assets/
  - 对比 manifest hash
  - 检测未授权的资源变更
```

---

## 五、实施路线图

```
Phase 0 (P0, 8-13天) — 手感地基
├── Day 1-3: Fixed Timestep + 渲染插值
├── Day 4-8: CombatKernel → 15 子系统
├── Day 9-10: Hit Stop
├── Day 11-12: 摄像机系统
└── Day 13: 输入系统接口设计

Phase 1 (P1, 6-11天) — 手感打磨
├── Day 1-3: 动画混合
├── Day 4-6: 音频管线
├── Day 7-8: 特效层
└── Day 9-11: UI/HUD

Phase 2 (P2, 设计阶段) — 多人预备
├── Rollback 接口预留
└── CI/CD 增强
```

---

## 六、验证策略

每个 Phase 完成后：
1. `npm run typecheck` — 类型检查
2. `npm run static:test` — 41 个测试全绿
3. `npm run build` — 构建成功
4. 手动验证：DNF 1v1 对比视频逐帧分析
5. 确定性验证：`fuzz-combat.test.ts` 40/40 确定性 + hash 不变

---

## 七、研究来源

本方案综合以下研究来源：

**本地文档**（Explore Agent）：
- `docs/research/combat/SYNTHESIS-COMBAT-KERNEL.md` — 战斗内核当前状态与缺口
- `docs/research/combat/dnf-dfo-research-vs-current-gap.md` — DNF 对比差距分析
- `docs/planning/dfo-combat-implementation-backlog.md` — 实现积压清单
- `docs/changelog/handfeel-*.md` — 历次手感触控迭代记录

**网络研究**（5 个并行 Agent）：
- Rollback Netcode: GGPO 模式, Gaffer on Games, yal.cc 确定性网络
- Hit Stop/Camera: DNF Duel 帧数据 (Dustloop), Phaser 3 Camera API
- ECS/子系统拆分: 固定顺序管道模式, 战斗游戏引擎子系统
- 音频管线: Web Audio API, howler.js, 2.5D 空间化
- UI/HUD + CI/CD: GitHub Actions 游戏 CI, 截图对比, 性能回归检测
