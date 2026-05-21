# Phase 4 分步实施报告（2026-05-21）

> 4 个并行 agent 调研产出汇总。原始报告：
> - 4A: agent-explore 内联输出（pipeline + 重力影响 + position.y 写点）
> - 4B: `.claude/phase4-4b-research-report.md`（Jump 起跳钩子 + JumpAttack + dy 扫描）
> - 4C: agent-explore 内联输出（Vec3 swap 影响面）
> - 测试: `RESEARCH-PHASE4-TEST-IMPACT.md`（45 个 test 分组 + hash 体系）

落档于 [docs/planning/2026-05-21-dnf-alignment-pivot.md](2026-05-21-dnf-alignment-pivot.md) 的 Phase 4。

---

## 总览：三步独立 commit，逐步推进

| Step | 改动量 | 视觉变化 | 风险 | 预计时间 |
|------|--------|----------|------|---------|
| 4A | 1 新文件 + 1 行常数 | jump cancel bug 消失；受击下落速度变慢 34% | 🟡 中 | 2-3h |
| 4B | 2 个 action JSON + 1 个 kernel 钩子 | 跳跃高度 200→62 px（明显变低） | 🟡 中 | 3-4h |
| 4C | ~650 处字段名替换 | 0（纯命名 swap） | 🟠 中-高 | 1-2 天 |

**总工程量**：约 2-3 天，每步独立 commit + push，**任何一步出问题可单独 revert**。

---

## 4A — AirbornePhysicsSystem + 真重力

### 改动

1. **新文件** `src/combat/motion/AirbornePhysicsSystem.ts`
   ```typescript
   import { DNF_GRAVITY_PER_TICK_60HZ } from "../../data/official/dnf/physics.js";
   const G = DNF_GRAVITY_PER_TICK_60HZ.value;  // -0.417

   export class AirbornePhysicsSystem implements CombatSystem {
     readonly name = "AirbornePhysics";
     readonly phase = "DETECTION" as const;

     tick(ctx: SystemContext): void {
       for (const a of ctx.actors) {
         if (a.flags.dead || ctx.hitStop.isFrozen(a.id)) continue;
         // 只处理"无受击状态 + 在空中"的 actor
         if (a.reactionState !== "none") continue;
         if (a.position.y <= 0 && a.velocity.y <= 0) continue;
         a.previousPosition = cloneVec3(a.position);
         a.position.y += a.velocity.y;
         a.velocity.y += G;
         if (a.position.y <= 0) {
           a.position.y = 0;
           a.velocity.y = 0;
         }
       }
     }
   }
   ```

2. **Pipeline 插入点**：`CombatKernel.buildPipeline()` 的 DETECTION phase，**ReactionMotion 之前**：
   ```
   PushBoxResolve → ClampBounds → HitResolution → AirbornePhysics → ReactionMotion
   ```

3. **改 `ReactionMotionSystem.ts:22`**:
   ```typescript
   // 旧: a.velocity.y -= 0.56 * a.comboCorrection.gravityScale;
   import { DNF_GRAVITY_PER_TICK_60HZ } from "../../data/official/dnf/physics.js";
   // 新: 
   a.velocity.y += DNF_GRAVITY_PER_TICK_60HZ.value * a.comboCorrection.gravityScale;  // +=, 因为常数是负
   ```

### 兼容性分析（agent 已验证）

| 现有 `position.y` 写点 | 改动需求 |
|-----------------------|---------|
| EnemyAI:231 敌人 launched 着地 | ✗ 不动（敌人 AI 独立 FSM） |
| DeathLoop:12 死亡 y=0 | ✗ 不动（cleanup） |
| HitResolutionSystem:161 受击钳制 | ✗ 不动（显式强制） |
| RootMotionController:18 root motion dy | ✗ 不动（4A 不删 Jump dy） |
| **CombatKernel:524 Bloodlust grab** | ⚠️ **需验证** grab 期间 reactionState ≠ "none"（否则 AirbornePhysics 会干预 grab 同步）|

### 预期回归 fail

- Group B 9 个（combat-chain-regression / damage-routing / death-barrier-multihit / dfo-replica / dnf-action-coverage / golden-scenario / handfeel-fix2 / runtime-evidence / tick-benchmark）—— 行为变了但 hash 没硬编码
- 多重 1：auto-combat / replay-hash / fuzz-combat —— **determinism 仍 pass，但 stateHash 值变**，不动 hash 硬编码即可
- jump-x-cancel-stuck-airborne（从 .tmp/repro/ 挪回）—— **必须从 fail 变 pass**

### Gate
- typecheck ✓
- 49 static tests：38 个不变 ✓ / 9 个行为变需复审（如果原 test 是断言"y 落地后 = 0"或"reactionRemaining > X"，行为正确就 pass）
- jump-x-cancel-stuck-airborne 必须 pass

---

## 4B — Jump 速度积分（依赖 4A）

### 改动

1. **`actions/default.json` Jump.rootMotion**：删 16 条 dy step，保留 dx 平移
2. **`actions/default.json` JumpAttack.rootMotion**：删 4 条 dy step（+2/+1/-1/-2 视觉浮动）
3. **`CombatKernel.ts:349` `requestAction()`**：加 Jump 起跳钩子
   ```typescript
   this.applyInstantActionEffect(actor, resolvedActionName);
   if (resolvedActionName === "Jump") {
     // H1 derived (experimental): swordman jump_power = 430 px/s = 7.17 px/tick
     // 来源: src/data/official/dnf/characters.ts DNF_JUMP_DERIVED_H1.swordman.initialZVelocity
     actor.velocity.y = DNF_JUMP_DERIVED_H1.swordman.initialZVelocity.value / 60;
   }
   ```

### 扫描确认

- 项目内 38 个 action，**仅 Jump + JumpAttack 有 dy step**
- UpwardSlash / MountainousWheel / RagingFury / Bloodlust / Frenzy 系列 / Backstep / QuickRebound 都无 dy → 不动

### 影响

- 跳跃高度 200 → **62 px**（H1，swordman v0=430 px/s ÷ 60 tick × 17 帧上升 ÷ 2）
- 视觉上跳跃明显变低，但这是 1:1 还原代价（H1 工作假设）
- jump_power=430 单位歧义（实验性），未来 .exe 反编译可证伪 H1

### 预期回归 fail

- **`schema-hash-freshness.test.ts` 必 fail**（action JSON 改了 → actionManifestHash 变）
  - 修复：跑一遍捕获新 hash，更新硬编码常数
- Group C 7 个 jump test —— 跳跃高度变了，断言"y > 100"会 fail
  - 修复：按新峰值 62 px 调整断言阈值
- auto-combat / replay-hash —— stateHash 再变（determinism 仍 pass）

### Gate
- typecheck ✓
- schema-hash-freshness 用新 hash 后 pass
- jump test 调阈值后 pass
- jump-x-cancel-stuck-airborne 仍 pass

---

## 4C — Vec3 y↔z swap（依赖 4A+4B）

### 改动规模

- **143 处** `position.y` / `position.z` / `velocity.y` / `velocity.z` 代码替换
- **575 处** action JSON 字段（`dy` / `dz` / `offsetY` / `offsetZ` / `launchVelocityY`）
- **78 行** test 断言重算
- 总计 ~650 处改动 + 78 行 test

### Vec3 接口

```typescript
// 旧
export interface Vec3 { x: number; z: number; y: number; }  // x=水平, z=深度, y=高度
// 新（对齐 DNF 原生）
export interface Vec3 { x: number; y: number; z: number; }  // x=水平, y=深度, z=高度
```

### 不受影响（已验证）

- **装备穿戴 / 精灵对齐**：`DnfLayeredSprite.ts` 的 `imgAnchor.y` / `aniOffset.y` 是 sprite 2D 坐标（500×500 画布），与 World 3D 解耦 ✓
- **渲染公式**：`baseY = groundLineY + pos.z - pos.y` → `baseY = groundLineY + pos.y - pos.z`，纯变量名 swap，行为不变 ✓
- **物理行为**：纯命名重构，逻辑零变化 ✓

### 实施策略

1. **Phase 4C.1** IDE Rename Symbol：`Vec3.y` → 临时占位 → `Vec3.z` 改名 → 占位改回 `Vec3.y`
2. **Phase 4C.2** sed 批量替换 + grep 核对：
   - `position.y` ↔ `position.z`
   - `velocity.y` ↔ `velocity.z`
   - `\bdy\b` ↔ `\bdz\b`（注意 word boundary）
   - `offsetY` ↔ `offsetZ`
3. **Phase 4C.3** 按文件分批次跑 typecheck，定位漏改
4. **Phase 4C.4** 全套 static test 跑 + 78 行 test 断言重算
5. **Phase 4C.5** auto-combat / replay-hash 重算

### 预期 fail

- 任何一处漏改 → typecheck 立刻报错（变量类型不对）→ 修复
- 测试断言 `position.y === 132`（旧 height）→ swap 后变成 `position.z === 132`，要么改 test 要么改逻辑

### 字段名延后

`launchVelocityY` / `knockbackZ` 这些字段名跟新坐标系语义对调（如 `launchVelocityY` 其实是 height 速度，新坐标系应该叫 `launchVelocityZ`）。**4C 不改字段名**，仅 Vec3 swap，字段名留给 Phase 5 受击对齐统一处理。

### Gate
- typecheck 全过
- 49 static test 全过（含 78 行新断言）
- auto-combat / replay-hash 用新 hash 后 pass
- 视觉行为零变化（玩家无感知）

---

## 关键风险点（综合）

| 风险 | 步骤 | 缓解 |
|------|------|------|
| Bloodlust grab 期间 reactionState=none 导致 AirbornePhysics 干预 | 4A | 实施前 grep 验证 |
| 跳跃 62 px 视觉过低 | 4B | 接受 1:1 还原代价；标 H1 experimental，留 .exe 反编译路径 |
| Vec3 swap 漏改 1 处坐标反向 | 4C | typecheck 兜底 + 分文件批次跑 |
| schema-hash 必 fail | 4B/4C | 跑脚本捕获新 hash 写回常数（标准流程） |

---

## 推荐顺序

1. **4A** → commit "Phase 4A: AirbornePhysicsSystem + DNF true gravity."（含 jump cancel bug fix）
2. **4B** → commit "Phase 4B: Jump becomes velocity-integrated (H1 derived)."
3. **4C** → commit "Phase 4C: swap Vec3 y/z to align with DNF native axis."

每步独立 push 到 GitHub，每步过 pre-push hook 验证后再进下一步。

---

## 确认开始 4A？

如果 OK：
1. 移 `.tmp/repro/jump-x-cancel-stuck-airborne.test.ts` 回 `tests/static/`（验证仍 fail，作为 4A gate）
2. 写 `AirbornePhysicsSystem.ts` + 接入 pipeline
3. 改 `ReactionMotionSystem.ts:22` 重力数值
4. 跑 typecheck + static:test + build
5. 修可能受影响的 Group B test 数值断言（若有）
6. commit + push
