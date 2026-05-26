# Phase 4 Step 4B 研究报告：Jump 速度积分改造

## 1. Jump 起跳钩子位置与代码骨架

**推荐位置**：`src/combat/kernel/CombatKernel.ts` 中 `requestAction()` 方法的 `applyInstantActionEffect()` 之后（line 349）。

**理由**：
- `requestAction()` 在 line 323-351 完成 action 实例初始化，包括 `phase: "enter"`
- line 346 触发 `ActionEntered` 事件
- line 349 已调用 `applyInstantActionEffect()` 处理 FrenzyToggle、Derange 等瞬间效果
- Jump 的速度赋值（非消耗品，但是起始状态修改）应在 enter 阶段完成，避免等到下一 tick 的 updateActions

**代码骨架**（伪代码）：
```typescript
// CombatKernel.requestAction() 中，第 349 行后添加：
this.applyInstantActionEffect(actor, resolvedActionName);
if (resolvedActionName === "Jump") {
  // H1 单位假设：jump_power = px/s
  // swordman: 430 px/s ÷ 60 tick/s = 7.17 px/tick
  const jumpPowerPerTick = 430 / 60; // ≈ 7.167
  actor.velocity.y = jumpPowerPerTick;
  // 同时保留 dx 小位移表现（帧 3,6,9...）
  // dy step 将在下一步全部删除
}
```

**替代方案（不推荐）**：新增 `onActionEnter` 钩子在 RootMotionController，但会增加复杂度——现有设计无此钩子，Jump 是唯一需要此处理的 action。

---

## 2. JumpAttack dy 处理建议

**建议：删除 JumpAttack 的 4 条 dy step**

**JumpAttack 当前数据**（line 2063-2084）：
- frame 3: dy = +2
- frame 5: dy = +1
- frame 6: dy = -1
- frame 7: dy = -2
- **净位移 = 0**

**删除理由**：
1. **不代表物理**：+2, +1, -1, -2 是视觉浮动表演，非动画中位移（不是上斩后落地的重力过程）
2. **与 AirbornePhysicsSystem 冲突**：4B 后 JumpAttack 发动时玩家已在空中（Jump 提供 v0=7.17），AirbornePhysics 将接管重力。4 条 dy step 会与物理系统叠加，产生预期外的运动
3. **Cancel 路径简化**：Jump → JumpAttack (frame 1 cancelable) 时，JumpAttack 无需 dy 表演，由物理系统统一管理
4. **净零意义减弱**：在 1:1 还原的新物理模式下，net=0 的表演 dy 会让玩家感觉"轻浮"（不是真的物理反馈）

**如果保留的风险**：
- JumpAttack frame 6-7 active window 内，dy=-1 叠加下降重力会造成"突然卡顿"视觉
- 一致性问题：Jump 用 velocity，JumpAttack 用 rootMotion dy，两套系统混用

---

## 3. 全 Action 集 dy 评估（38 个 action）

**扫描结果**：项目内仅 2 个 action 有非零 dy step：
- **Jump**（16 步，净 +200 上升 → -200 下降）
- **JumpAttack**（4 步，净 0）

**其他空中 action 检查**（grep 结果无 dy step）：
- UpwardSlash
- MountainousWheel
- RagingFury
- Bloodlust
- Backstep / QuickRebound
- Frenzy 系列

**处理方案**：
| Action | 现状 | 处理 | 理由 |
|--------|------|------|------|
| Jump | 16 dy step | **删除所有 dy** | 替换为 velocity.y 积分 |
| JumpAttack | 4 dy step | **删除所有 dy** | 避免重力叠加 |
| 其他 38 个 | 无 dy | 无需改动 | 不涉及垂直位移 |

---

## 4. 跳跃高度 200 → 62 px 视觉影响评估

**当前数据**：
- rootMotion dy sum (上升 frame 3-24) = +200 px
- 代表人物能跳起 200 px

**H1 假设新数据**（若 jump_power=430 px/s 直接为 v0）：
- v0 = 430 / 60 ≈ 7.17 px/tick
- gravity = -1500 px/s² = -25 px/tick² 
- peak height = v0² / (2×|g|) = 51.2 / 50 ≈ **62 px**
- 上升时间 ≈ 0.287 s ≈ 17 tick

**视觉对比**：
- 角色身高约 100 px
- 旧高度：200 px = **2 × 身高**（浮夸）
- 新高度：62 px = **0.62 × 身高**（贴近现实）
- **感受**：从"高空翻腾"降到"轻跳"，玩家可能觉得角色弱化

**建议**：
- **不提供 fallback 开关**
  - 原因 1：Phase 4B 目标是 1:1 还原，开关违反目标
  - 原因 2：62 px 符合 DNF swordman 真值，玩家感受差异是合理的调整
  - 原因 3：其他 job 的 jump_power 值（priest 500, mage 350）会导致不同高度，多开关维护成本高
- **释放说明**：文档中说明这是"数据层还原"不是"削弱"，对标 DNF 原作的跳跃感受
- **后续迭代**：若玩家反馈强烈，Phase 6 可基于实际 PVF/ANI 重新校准（非 H1 猜测）

---

## 5. 预计会 fail 的测试列表

**7 个 Jump 相关测试中预计 fail 的**：

| Test | 断言模式 | 失败原因 | 修复方式 |
|------|---------|---------|---------|
| `jump-down-movement.test.ts` | 位置绝对值检查 | 无（不检查高度） | ✓ 通过 |
| `jump-attack-z-position.test.ts` | 位置变化日志 | 无（仅输出） | ✓ 通过 |
| `jump-attack-z-detailed.test.ts` | 日志输出 | 无（仅输出） | ✓ 通过 |
| `jump-attack-hit-recoil.test.ts` | 日志追踪 | 无（仅输出） | ✓ 通过 |
| `jump-hit-down-movement.test.ts` | 移动判定 | 无（检查 z，不检查 y） | ✓ 通过 |
| `jump-skill-down-movement.test.ts` | 日志输出 | 无（仅输出） | ✓ 通过 |
| `jump-phase-mapping.test.ts` | **sprite key 匹配** | **会 fail** | ⚠️ 需修正 |

**关键 fail**：
- `jump-phase-mapping.test.ts`（line 44-50）：
  - 检查 Jump localFrame 18（上升中期）应匹配 `dnf_swordman_jump_0[2-7]` 帧范围
  - 检查 Jump localFrame 39（下降中期）应匹配 `dnf_swordman_jump_0[8-9]|1[0-4]` 帧范围
  - **问题**：sprite 映射基于**时间进度**（frame ÷ totalFrames），4B 后 totalFrames 不变（仍 72），但物理时间会变（空中停留时间减少）
  - **修复**：需重新校准 sprite 过渡点，或在 phase-mapping 逻辑中加入 gravity 检测来动态调整帧映射

**其他测试不会 fail**：
- 大多数测试仅输出日志，无硬性断言
- `jump-down-movement.test.ts` 只检查 z > startZ（方向），不检查幅度

**自动化测试影响**：
- replay-hash test（若存在）会因为 y 值变化失效
- scenario-hash test（CombatKernel.runDeterministicScenario）会因为 Jump 高度变化改变哈希值

---

## 6. 风险评级与实施顺序

**风险级别**：**中**（不是高，因为改动局限明确）

**风险细节**：
- ⚠️ **H1 假设未验证**（jump_power=430 px/s）：若单位实际为其他解释（% scaler），整个 v0 值错误，需 Phase 6 PVF/ANI 再次校准
- ⚠️ **sprite 动画映射**：JumpPhaseMapping 依赖时间进度，高度变化会导致视觉"闪烁"（frame 对齐问题）
- ✓ **隔离性强**：只改 Jump + JumpAttack，其他 38 个 action 无改动
- ✓ **RootMotionController 调用仍正常**：删 dy step 不改结构，只是数据变少

**推荐实施顺序**：

1. **Step 4B.1**（预计 2h）：删 Jump 16 条 dy step + JumpAttack 4 条 dy step
2. **Step 4B.2**（预计 1h）：在 CombatKernel.requestAction() 内添加 Jump 起跳钩子，赋值 velocity.y = 7.17
3. **Step 4B.3**（预计 1h）：运行 tests/static/ 全集，记录 sprite 映射变化
4. **Step 4B.4**（预计 2-3h）：修正 jump-phase-mapping.test.ts，需调整 sprite frame 过渡阈值或新增重力感知逻辑
5. **Step 4B.5**（预计 1h）：清理文档，补齐 sourcePolicy + fieldProvenance 的 confidence 从 "medium" → "experimental"（反映 H1 未验证状态）

**阻塞点**：
- 4A（AirbornePhysicsSystem）未完成 → 4B 无法测试"空中重力"的正确落地
  - **workaround**：4B 中 JumpAttack 继承 Jump 的 velocity.y，但落地仍用旧逻辑（frame 数）
  - 4A 完成后，AirbornePhysics 会自动接管 Jump 后的重力，4B 无需二次改

---

## 总结

| 问题 | 答案 |
|------|------|
| Jump 起跳钩子放哪？ | CombatKernel.requestAction() line 349 之后，赋值 actor.velocity.y |
| JumpAttack dy 保留还是删？ | 删除，避免与 AirbornePhysics 冲突 |
| 其他 action dy 如何处理？ | 无需改动（仅 Jump + JumpAttack 有 dy） |
| 高度 200→62 需要 fallback 开关吗？ | 否，这是 1:1 还原的必然结果 |
| 哪些测试会 fail？ | 主要是 `jump-phase-mapping.test.ts`（sprite 帧映射重新校准） |
| 风险级别 | 中（H1 假设未验证，需 Phase 6 PVF 二次校准） |

---

## 附录：4B 后的系统架构变化

```
旧模式（4A 前）:
  Jump action → rootMotion.frames (16 step, dy sync) → actor.position.y += dy

新模式（4B 后，AirbornePhysics 待集成）:
  Jump action → velocity.y = 7.17 (startTick) → [待 4A 完成] AirbornePhysicsSystem.tick() 
    → velocity.y += gravity × delta_tick 
    → actor.position.y += velocity.y
    → 检测落地 (position.y ≤ 0)

关键转变：
  - 从 "表 lookup" 改为 "速度积分"
  - Jump 仅负责 v0，重力全权交给物理系统
  - JumpAttack 无需 dy 浮动（物理连贯）
```
