# Stage 3 Phase A — 战斗系统调研报告

调研日期：2026-05-30  
调研范围：`src/combat/` + `src/engine/core/`（两套系统并存）  
目标：识别 Phase A 重写边界

---

## 重要前置发现：两套系统并存

项目存在两套独立的战斗系统，**互不连接**：

| 系统 | 路径 | 状态 | 用途 |
|------|------|------|------|
| **combat/** | `src/combat/` | 活跃，CombatScene 使用 | Stage 2 完成的完整战斗内核 |
| **engine/core/** | `src/engine/core/` | 孤立，无 Scene 引用 | Stage 2 Phase 0-1 骨架，未接入渲染 |

`src/engine/core/` 的 `ActorStateMachine`、`DamageFormula`、`ReactionResolver`、`HitDetection`、`Actor` 是 **独立骨架**，不被 `CombatScene` 或 `CombatKernel` 引用。Phase A 调研主体是 `src/combat/`。

---

## 文件逐一分析

### 1. `src/combat/actors/ActorFactory.ts`

**核心职责**：创建 `Actor` 对象，初始化所有字段（位置、HP、stat block、armorProfile、hurtBox 等）。

**公开接口**：
- `createActor(id, type, faction, x, z?): Actor`
- `cloneActorSnapshot(actor): object`（用于 replay/debug）

**依赖**：
- `../types.js`（Actor、ArmorProfile、ActorType、Faction）
- `../util/geometry.js`（cloneVec3）
- `../../data/ai/enemyTuning.js`（enemyTuning — 敌人 AI 调参表）
- `../combo/ComboCorrection.js`（createComboCorrectionState）

**被依赖**：
- `src/combat/kernel/CombatKernel.ts`（`reset()` 里调用 6 次 `createActor`）
- `src/game/CombatScene.ts`（间接通过 CombatKernel）
- `src/combat/replay/ReplayRecorder.ts`（cloneActorSnapshot）

**数据来源**：全部硬编码。注释标注 `local_baseline`。

关键硬编码值（T-A.7 重写目标）：
```
level:    player=70, boss=72, enemy=68
strength: player=480, boss=320, enemy=180
physAtk:  player=1800, boss=1200, enemy=600
defense:  player=0, boss=800, enemy=400
hp:       player=160, boss=420, building=500
pushWidth/pushDepth/hurtWidth/hurtDepth/hurtHeight: 按 id 分支硬编码
```

**无引用** `default.json` 或 `swordman.json`。

**Phase A 处置**：**REWRITE** — stat block 必须从 `verification/baseline-shards/players/swordman.json`（player）和 `dist/data/monsters/*.json`（enemies）读取。hurtBox 尺寸从 `.chr`/`.mob` PVF 提取。

---

### 2. `src/combat/damage/DamageFormula.ts`

**核心职责**：实现 DNF 70-85 classic 10-multiplier 伤害公式，输出 `finalDamage` 和 multiplier 明细。

**公开接口**：
- `class DamageFormulaResolver`
  - `resolve(req: DamageRequest, flags: DamageFormulaFlags, damageAllowed?, extraMultipliers?): DamageFormulaResult`
- `interface DamageFormulaFlags { isCounter, isBackAttack, isCritical }`
- `interface DamageFormulaResult { finalDamage, multipliers }`

**依赖**：`../types.js`（AttackType、DamageRequest）

**被依赖**：`src/combat/damage/DamageResolver.ts`（唯一使用方）

**数据来源**：公式常数硬编码（STR_DIVISOR=250, ELE_DIVISOR=220, CRIT=1.5, DEF_DIVISOR=200）。注释引用 `docs/research/reference/community/damage-formula-audit-from-dcalc.md`。

**关键问题（T-A.9 重写目标）**：
- `ratio_1`（atkPower）被当作**乘数**直接乘入公式：`baseDamage × statRatio × atkPower × ...`
- 正确 DNF 公式：`atkPower` 是**加法基础**，不是乘数。应为 `(atkPower × skill%) × statRatio × defRatio × ...`
- `FINAL_DIVISOR=1` 注释说"keeps damage in 10-30 range"，实际是掩盖了公式错误的补丁
- `baseDamage` 字段（来自 hitbox）在当前公式里是 `finalDamage = baseDamage × multiplier`，但 baseDamage 本身是 local_baseline 的小数值（10-42），不是 DNF 原始 atkPower

**Phase A 处置**：**REWRITE** — 公式结构需重建为 `(atkPower × skillPercent) × statRatio × eleRatio × critRatio × defRatio`，baseDamage 改为 skillPercent（从 .atk 提取）。

---

### 3. `src/combat/damage/DamageResolver.ts`

**核心职责**：桥接 `HitDecision` → `DamageRequest` → `DamageFormulaResolver` → 修改 `target.resources.hp`，返回 `DamageApplied`。

**公开接口**：
- `class DamageResolver`
  - `requestFromHit(decision, correlationId, actionName?, baseDamageOverride?, attackerStats?, targetStats?, attackType?, attackerLevel?): DamageRequest`
  - `apply(target, req, flags, damageAllowed?, extraMultipliers?): DamageApplied`

**依赖**：
- `../types.js`
- `./DamageFormula.js`（DamageFormulaResolver）

**被依赖**：
- `src/combat/hit/HitResolutionSystem.ts`（`applyHitDecision` 里调用）
- `src/combat/kernel/SystemContext.ts`（通过 ctx.damageResolver）

**数据来源**：从 `HitDecision.hitbox.baseDamage` 读取，attackerStats 由 HitResolutionSystem 从 Actor 字段传入（`attacker.physAtk`、`attacker.strength` 等）。

**关键问题**：`requestFromHit` 里 `attackType` 硬编码为 `"physical_percent"`（第 63 行），所有攻击都走物理百分比路径，无法区分技能类型。

**Phase A 处置**：**MODIFY** — 接口本身合理，但需要：(1) attackType 从 .atk 数据读取而非硬编码；(2) baseDamage 语义改为 skillPercent 后，requestFromHit 签名需更新。

---

### 4. `src/combat/hit/HitResolutionSystem.ts`

**核心职责**：每 tick 遍历所有 attacker，对 active hitbox 窗口内的帧执行碰撞检测 → 命中决策 → 伤害 → 受击反应 → hitStop/recoil → 死亡判定。是整个命中管线的编排中心。

**公开接口**：
- `class HitResolutionSystem implements CombatSystem`
  - `tick(ctx, bus): void`
  - `applyHitDecision(ctx, bus, attacker, target, decision): void`（public，供 BloodlustGrab 复用）
  - `shouldForceStandKnockdown(target, decision): boolean`
  - `updateComboCorrection(ctx, bus, target, decision, correlationId): void`
  - `applyForcedWakeIfQueued(ctx, bus, target, correlationId): void`
  - `isPveComboProtectedTarget(target): boolean`
  - `isFrenzySkillAttackAction(actionName): boolean`

**依赖**：
- `../kernel/CombatSystem.js`、`../kernel/SystemContext.js`、`../events/CombatEventBus.js`
- `../types.js`
- `../actions/FrameDataAction.js`（`getAction`）← **从 FrameDataAction 读 hitbox**
- `../events/CombatEventBus.js`（CombatEventPriority）
- `../util/ids.js`（nextId）
- `../combo/ComboCorrection.js`

**被依赖**：
- `src/combat/kernel/CombatKernel.ts`（`this.hitResolution`，注册进 pipeline DETECTION 阶段）

**数据来源**：
- hitbox 数据：`getAction(inst.actionName).active`，即 `FrameDataAction.ts` 的 `ACTIONS` 表（或 manifest `default.json`）
- **不引用** `swordman.json` 或 PVF shards

**关键问题（T-A.8 重写目标）**：
- `getAction()` 返回的 hitbox 是 `FrameDataAction.ts` 里手写的扁平结构（单 timeline，`active[]` 数组）
- Stage 3 目标：hitbox 应从 `.atk` PVF 提取（多 atk 文件 + 双 timeline：attackBox + damageBox）
- 当前 `action.active` 是 `HitBoxFrameWindow[]`，Stage 3 需要改为从 AtkDef 读取的结构

**Phase A 处置**：**REWRITE**（T-A.8）— hitbox 数据源从 FrameDataAction 硬编码改为 PVF .atk 提取的 AtkDef。编排逻辑（遍历 actors、emit events、hitStop/recoil）可保留。

---

### 5. `src/combat/hit/HitResolver2D5.ts`

**核心职责**：从 attacker+hitbox 构建 `HitQuery`（世界坐标），对 target 的所有 hurtBox 执行 2.5D 碰撞检测（rect/circle/sweep/grab_attach 四种形状）。

**公开接口**：
- `class HitResolver2D5`
  - `buildQuery(tick, attacker, hitbox): HitQuery`
  - `geometry(query, target): { overlap, zMismatch, yMismatch, snapshot }`

**依赖**：
- `../types.js`
- `../util/geometry.js`（actorHurtRect、circleRectOverlap2D5、rectsOverlap2D5、sweepRectOverlap2D5、signedFacingScale）
- `../util/ids.js`

**被依赖**：
- `src/combat/kernel/CombatKernel.ts`（`this.hitResolver`）
- `src/combat/kernel/SystemContext.ts`（ctx.hitResolver）
- `src/combat/hit/HitResolutionSystem.ts`（`ctx.hitResolver.buildQuery`、`ctx.hitResolver.geometry`）

**数据来源**：从传入的 `HitBoxFrameWindow` 读取 offsetX/Y/Z、w/d/h 等字段。

**Phase A 处置**：**KEEP** — 碰撞检测几何逻辑正确，与数据来源解耦。Stage 3 只需确保传入的 hitbox 结构兼容（rawBox6 字段已预留）。

---

### 6. `src/combat/hit/HitDecisionResolver.ts`

**核心职责**：综合碰撞结果、armor 状态、grab 判定、hit rejection 规则，输出 `HitDecision`（accepted/rejected + 原因）。

**公开接口**：
- `class HitDecisionResolver`
  - `decide(tick, query, hitbox, attacker, target, geometry): HitDecision`

**依赖**：
- `../types.js`
- `../util/ids.js`
- `../armor/ArmorResolver.js`
- `../armor/GrabResolver.js`
- `./HitRejectionResolver.js`

**被依赖**：
- `src/combat/kernel/CombatKernel.ts`（`this.hitDecisionResolver`）
- `src/combat/hit/HitResolutionSystem.ts`（`ctx.hitDecisionResolver.decide`）

**数据来源**：从 HitQuery 和 Actor 状态读取，无外部数据依赖。

**Phase A 处置**：**KEEP** — 决策逻辑与数据来源无关，可直接复用。

---

### 7. `src/combat/reaction/ReactionResolver.ts`

**核心职责**：(1) `resolve()` 从 HitDecision 推导 ReactionKind；(2) `apply()` 将 reaction 写入 target Actor（velocity、handfeel、reactionState）。

**公开接口**：
- `class ReactionResolver`
  - `resolve(target, decision): ReactionKind`
  - `apply(target, reaction, decision?, attacker?, tick?): void`

**依赖**：
- `../types.js`
- `../util/geometry.js`（signedFacingScale）
- `./ReactionProfiles.js`（resolveReactionProfile）
- `./ReactionHandfeelApplier.js`（applyReactionHandfeel、interruptControlForReaction）

**被依赖**：
- `src/combat/kernel/CombatKernel.ts`（`this.reactionResolver`）
- `src/combat/hit/HitResolutionSystem.ts`（`ctx.reactionResolver.resolve`、`ctx.reactionResolver.apply`）

**数据来源**：
- `resolve()` 读 `decision.hitbox.canLaunch`、`canKnockdown`、`attackLevel`
- `apply()` 读 `ReactionProfiles.ts` 里的 profile 表（hitStunFrames、knockbackX 等）
- reaction profile 数值全部 local_baseline（hardcoded in `FrameDataAction.ts` 的 `reaction()` helper）

**关键问题（Phase C 重写目标）**：
- `resolve()` 逻辑简单但依赖 hitbox 的 `canLaunch`/`canKnockdown` 布尔值，Stage 3 需改为从 .atk 的 `downParam`/`knockBackType` 枚举读取
- `apply()` 的 knockback 数值（knockbackX、launchVelocityY）来自 local_baseline，需替换为 PVF 提取值

**Phase A 处置**：**KEEP**（Phase A 阶段）/ **REWRITE**（Phase C）— Phase A 不动，Phase C 重写 reaction profile 数据来源。

---

### 8. `src/combat/actions/FrameDataAction.ts`

**核心职责**：定义所有 ActionName 的帧数据（hitbox、startup/active/recovery、cancelPolicy、rootMotion 等），提供 `getAction(name)` 查询接口。支持 manifest 覆盖（`loadFromManifest`）。

**公开接口**：
- `export function getAction(name: ActionName): FrameDataAction`
- `export function loadFromManifest(actions: Record<ActionName, FrameDataAction>): void`
- `export const ACTIONS: Record<ActionName, FrameDataAction>`（fallback 表）

**依赖**：`../types.js`（FrameDataAction、HitBoxFrameWindow、ActionName 等）

**被依赖**：
- `src/combat/hit/HitResolutionSystem.ts`（`getAction(inst.actionName)`）
- `src/combat/kernel/CombatKernel.ts`（`getAction` 用于 hitStopProfile、recoilProfile、rootMotion）
- `src/combat/motion/RootMotionController.ts`
- `src/combat/resources/CooldownResourceKernel.ts`
- `src/combat/replay/ReplayRecorder.ts`

**数据来源**：
- 全部硬编码在 TS 文件里（`ACTIONS` 常量）
- 可被 `src/data/manifest/actions/default.json` 覆盖（通过 `loadFromManifest`）
- `default.json` 是从 `ACTIONS` 导出的 JSON 镜像，内容相同，均为 local_baseline
- **不引用** PVF shards

**关键问题（T-A.8 重写目标）**：
- hitbox 结构是扁平的 `HitBoxFrameWindow[]`（单 timeline，单 atk 文件概念）
- DNF 原始数据：每个技能可有多个 `.atk` 文件，每个 atk 有独立的 attackBox（攻击判定）和 damageBox（受击判定），以及 downParam/knockBackType 枚举
- 当前 `hit()` helper 把 offsetX/w/d/h 混合成单一 box，无法区分 attackBox vs damageBox
- `reactionProfile` 内嵌在 hitbox 里（local_baseline 数值），Stage 3 需从 .atk 的 downParam 读取

**Phase A 处置**：**REWRITE**（T-A.8）— 需要新的双 timeline 结构（attackBox timeline + damageBox timeline），支持多 atk 文件，reaction 参数从 AtkDef 读取。

---

### 9. `src/combat/actions/ActionRegistry.ts`

**文件不存在**。`ActionRegistry` 功能由 `FrameDataAction.ts` 的 `getAction()` + `loadFromManifest()` 承担，以及 `src/data/manifest/loader.ts` 的 `loadActionsManifest()`。

**Phase A 处置**：**N/A**（文件不存在，无需处理）

---

### 10. `src/engine/core/ActorStateMachine.ts`

**核心职责**：9 状态 FSM（IDLE/READY/ATTACK/HIT/DOWN/DEAD/CHASE/RETREAT/AIRBORNE），用于 `src/engine/core/Actor.ts`。

**公开接口**：
- `class ActorStateMachine`
  - `update(ctx: TransitionContext): boolean`
  - `force(state, tick): void`
  - `get state(): ActorState`
  - `get enteredAt(): number`
- `const ActorState`（枚举对象）
- `type TransitionContext`

**依赖**：无外部依赖（纯 TS）

**被依赖**：
- `src/engine/core/Actor.ts`（每个 Actor 持有一个 FSM 实例）
- `src/engine/core/ReactionResolver.ts`（调用 `defender.fsm.update()`）
- `src/engine/ai/EnemyAI.ts`

**与 `src/combat/` 的关系**：**完全独立**，`src/combat/` 不使用此 FSM。`src/combat/` 的状态通过 `Actor.reactionState: ReactionKind` 字段 + `Actor.currentAction` 管理，没有显式 FSM 类。

**Phase A 处置**：**KEEP**（engine 层骨架，Phase A 不动）/ 长期看需要决定是否迁移到 combat/ 或废弃。

---

## 调用链拓扑图

```
[BrowserInputState / EnemyAI]
        │ keyDown/keyUp / requestAction
        ▼
[CombatKernel.tick()]
  ├─ INPUT phase
  │   ├─ ReactionTick (hitStop/recoil tick)
  │   ├─ CollectInput → consumeInput → requestAction()
  │   ├─ LocomotionInput
  │   └─ EnemyAI.tick()
  │
  ├─ LOGIC phase
  │   ├─ UpdateActions (localFrame++, phase transitions)
  │   ├─ RootMotionController (dx/dz per frame)
  │   └─ BloodlustGrab / BloodlustEruption
  │
  ├─ DETECTION phase
  │   ├─ PushBoxResolver
  │   ├─ ClampBounds
  │   ├─ HitResolutionSystem.tick()  ← 命中管线入口
  │   │   │
  │   │   ├─ getAction(actionName)   ← FrameDataAction.ts [REWRITE T-A.8]
  │   │   │   └─ action.active[]     ← hitbox 数据 (local_baseline)
  │   │   │
  │   │   ├─ HitResolver2D5.buildQuery()   [KEEP]
  │   │   ├─ HitResolver2D5.geometry()     [KEEP]
  │   │   ├─ HitDecisionResolver.decide()  [KEEP]
  │   │   │
  │   │   ├─ DamageResolver.requestFromHit()  [MODIFY]
  │   │   │   └─ attackerStats from Actor     ← ActorFactory [REWRITE T-A.7]
  │   │   │
  │   │   ├─ DamageResolver.apply()
  │   │   │   └─ DamageFormulaResolver.resolve()  [REWRITE T-A.9]
  │   │   │       └─ baseDamage × (atkPower × statRatio × ...)
  │   │   │
  │   │   └─ ReactionResolver.resolve() + apply()  [KEEP/Phase C REWRITE]
  │   │       └─ ReactionProfiles (local_baseline knockback values)
  │   │
  │   ├─ AirbornePhysicsSystem
  │   └─ ReactionMotionSystem
  │
  ├─ RESOLVE phase
  │   └─ PerActorTick (ComboCorrection, StatusEffect, Buff, Cooldown, Death)
  │
  └─ RECORD/FLUSH phase
      └─ ReplayRecorder, EventFlush

[CombatScene.ts] ← Phaser 渲染层，读 CombatKernel.debugSnapshot()
```

---

## 重写优先级

### P0 — Phase A 必须完成，阻塞后续

| 优先级 | 文件 | 任务 | 原因 |
|--------|------|------|------|
| P0 | `ActorFactory.ts` | **REWRITE** T-A.7 | stat block 全部 local_baseline，player/enemy 数值无 PVF 依据，所有伤害计算基础错误 |
| P0 | `DamageFormula.ts` | **REWRITE** T-A.9 | atkPower 当乘数是结构性错误，FINAL_DIVISOR=1 是掩盖补丁，公式需重建 |
| P0 | `FrameDataAction.ts` + hitbox 结构 | **REWRITE** T-A.8 | 扁平单 box 结构无法承载 .atk 双 timeline（attackBox/damageBox），是 Stage 3 数据接入的前提 |

### P1 — Phase A 内完成，影响正确性

| 优先级 | 文件 | 任务 | 原因 |
|--------|------|------|------|
| P1 | `HitResolutionSystem.ts` | **REWRITE** T-A.8 | hitbox 数据源切换后，`getAction().active` 的读取方式需同步更新 |
| P1 | `DamageResolver.ts` | **MODIFY** | attackType 硬编码 `physical_percent`，需从 AtkDef 读取；baseDamage 语义改为 skillPercent 后签名需更新 |

### P2 — Phase C 或后续阶段

| 优先级 | 文件 | 任务 | 原因 |
|--------|------|------|------|
| P2 | `ReactionResolver.ts` | **REWRITE** Phase C | reaction profile 数值（knockback/launch）需从 .atk downParam/knockBackType 替换 local_baseline |
| P2 | `HitResolver2D5.ts` | **KEEP** | 几何逻辑正确，无需改动 |
| P2 | `HitDecisionResolver.ts` | **KEEP** | 决策逻辑与数据来源解耦，无需改动 |
| P2 | `src/engine/core/ActorStateMachine.ts` | **KEEP**（待决策） | 孤立骨架，不影响 Phase A；长期需决定是否迁移到 combat/ |

---

## 附：关键 magic number 汇总

| 文件 | 值 | 含义 | 状态 |
|------|----|------|------|
| ActorFactory.ts:76 | `level=70/72/68` | 玩家/boss/敌人等级 | local_baseline |
| ActorFactory.ts:77-79 | `strength=480, physAtk=1800, defense=800` | 核心 stat block | local_baseline，T-A.7 重写 |
| ActorFactory.ts:65 | `hp=160/420/500` | HP 初始值 | local_baseline |
| ActorFactory.ts:66-71 | pushWidth/hurtWidth 等 | 碰撞盒尺寸 | local_baseline，需从 .chr/.mob 提取 |
| DamageFormula.ts:33 | `STR_DIVISOR=250` | 力量系数除数 | dcalc 验证，可保留 |
| DamageFormula.ts:38 | `DEF_DIVISOR=200` | 防御公式常数 | dcalc 验证，可保留 |
| DamageFormula.ts:39 | `FINAL_DIVISOR=1` | 伤害缩放补丁 | **删除**，公式重建后不需要 |
| DamageFormula.ts:42-47 | `R_ATK_POWER=1.0` 等 | 未实现的 ratio pass-through | 保留占位，后续填充 |
| FrameDataAction.ts:80-85 | lightStagger/heavyStagger 等 reaction profile | hitStunFrames、knockbackX 数值 | local_baseline，Phase C 替换 |
| HitResolutionSystem.ts:112 | `baseDamage >= 34` | 相机震动阈值 | local_baseline magic number |
