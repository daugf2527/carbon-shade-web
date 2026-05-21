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

## 4C — 取消 Vec3 swap，落档坐标系映射注释（2026-05-21 决策）

### 取消理由（实施时发现）

原计划用 sed 全项目 swap `Vec3 {x,z,y}` → `{x,y,z}` 对齐 DNF 原生坐标系。动手时发现致命问题：

**TypeScript interface 字段顺序不影响类型** — 改 `Vec3 {x,y,z}` 跟 `{x,z,y}` 在类型层面完全等价，typecheck 不会报错。**4C swap 没有编译器兜底**。

后果：
1. 必须用 sed 三步替换（中介符号）做全项目语义重命名，650+ 处机械改动
2. 任何遗漏 → 坐标系反向 bug（typecheck 静默通过，行为悄悄改变）
3. 注释 / 字符串 / test message 里的 `position.y` 也可能被误改
4. 唯一兜底是 hash 比对（golden-scenario / auto-combat / replay-hash），但只能验证"和取消前一致"，不能证明"swap 后语义对"
5. 实际收益（DNF 数据接入时省一次 mental translation）远小于上面的风险

### 替代方案：坐标系映射注释

在 `src/combat/types.ts` 的 `Vec3` 接口上落档明确的坐标系翻译表：

```typescript
// **Project**:  x=horizontal, y=height (jump),    z=ground depth
// **DNF**:      x=horizontal, y=ground depth,     z=height (jump)
// Translation:  DNF.y ↔ our.z;  DNF.z ↔ our.y;  x is same.
// .atk [lift up] (DNF z-velocity) → assign to our velocity.y
```

Phase 5 受击对齐时引用即可。

### 后续

后续 Phase 5+ 阶段如果对齐工作量大到 mental translation 真的成为瓶颈，再重新评估全量 swap。

### Gate
- typecheck 仍 pass ✓
- 没有 runtime 变化

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
