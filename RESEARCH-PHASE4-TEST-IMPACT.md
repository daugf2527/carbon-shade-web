# Phase 4 (4A+4B+4C) 对 Tests & Hash 体系的影响分析

**研究日期**: 2026-05-21  
**范围**: 45 个 static test + replay metadata hash 体系  
**结论**: 所有三步均会改变 actor.position 轨迹 → hash 必变；需分阶段更新硬编码 hash

---

## 1. 45 个 Test 按影响程度分类

### Group A: 完全不受影响 (19 个)
**特征**: 状态、配置、架构、输入系统检验 — **0 个 actor.position 访问**

- action-cancel-probe.test.ts — Cancel 窗口逻辑
- architecture.test.ts — 模块导入检验
- armor.test.ts — 防御值计算 (1 个 position.x 访问但不断言)
- combo-correction.test.ts — Combo 连接逻辑
- config-validate.test.ts — 配置文件 schema
- death-loop.test.ts — 死亡循环防护
- debug-actions.test.ts — 动作元数据检验
- dnf-official-data.test.ts — 官方数据比对
- enemy-ai.test.ts — AI FSM 状态机
- event-bus.test.ts — 事件总线功能
- frame-index-validate.test.ts — Frame 索引一致性
- input-buffer.test.ts — 输入缓冲
- manifest-provenance.test.ts — Manifest 溯源检验
- movement-bounds.test.ts — 地图边界 (检查 x 坐标不出界，不验证 y/z 值)
- official-api-alignment.test.ts — Neople API 对标
- run-detector.test.ts — 跑步检测
- socd-cleaner.test.ts — SOCD 清理
- status-buff.test.ts — 状态 buff 计算
- status-profile.test.ts — 状态配置 (position.y 作为中间值，无断言)

**→ 4A/4B/4C 完成后无需重新验证**

---

### Group B: 受 4A 影响 (9 个)
**特征**: 重力数值变 0.56 → 0.417 导致**下落曲线变浅**，受击后坠落速度/高度变化

- combat-chain-regression.test.ts — Chain 伤害路由 (AirbornePhysicsSystem 会改 y 轨迹)
- damage-routing.test.ts — Damage 分配逻辑 (受击反应路径)
- death-barrier-multihit.test.ts — 多段伤害边界 (y 位置变化影响判定)
- dfo-replica.test.ts — DNF 复现 (整体 actor 位置轨迹)
- dnf-action-coverage.test.ts — 动作覆盖率 (y 数值校验)
- golden-scenario.test.ts — 黄金场景 (综合战斗轨迹)
- handfeel-fix2.test.ts — 手感修复 (反应延迟 + y 轨迹)
- runtime-evidence.test.ts — 运行时证据采集 (记录 y 变化)
- tick-benchmark.test.ts — Tick 基准 (性能 + 确定性，stateHash 会变)

**→ 4A 跑完必须更新这些 test 的硬编码 hash / 数值断言**

---

### Group C: 受 4B 影响 (7 个)
**特征**: Jump dy 删除 16 条 → 改用速度积分；跳跃高度 200 → 62 px；影响 Jump 和 JumpAttack 轨迹

- jump-down-movement.test.ts — Jump 后 ArrowDown 移动 (y 高度变化)
- jump-phase-mapping.test.ts — Jump 阶段映射 (y 轨迹)
- jump-attack-hit-recoil.test.ts — JumpAttack 受击反弹 (y 速度)
- jump-attack-z-detailed.test.ts — JumpAttack z 轴详细检验 (y 值变化联动)
- jump-attack-z-position.test.ts — JumpAttack z 位移 (y 影响击中判定)
- jump-hit-down-movement.test.ts — Jump+Hit 后 ArrowDown (复合轨迹)
- jump-skill-down-movement.test.ts — Jump+Skill ArrowDown (复合轨迹)

**→ 4B 跑完必须更新这些 test 的 y 相关数值 / stateHash**

---

### Group D: 受 4C 影响 (2 个)
**特征**: Vec3 命名 swap `{x,z,y}` → `{x,y,z}`；所有代码 `position.y / position.z` 含义互换

- walk-run-z.test.ts — 走跑的 z 轴 (含 4 处 position.y/z 访问)
- walk-run.test.ts — 走跑的 x 轴

**最高影响**: 当前 `position.y`=高度, `position.z`=深度 → 4C后反向，必须代码互换

**→ 4C 跑完：遍历更新 14 个 position.y/z 访问的 test**

---

### 多重影响 (8 个特殊 test)

1. **auto-combat.test.ts** 
   - 4A/4B/4C 都影响：1200 帧自动战斗的 stateHash 变 3 次
   - 比对模式：`first.replay.frames.at(-1)?.stateHash === secondHash` (determinism)
   - 需重算：每步后 hash 值变，但 determinism 检验本身过

2. **schema-hash-freshness.test.ts**
   - 4B 时影响：Jump action 改了 → actionManifestHash 变 → test fail
   - 比对模式：`computeActionsHash(actions) === recorder.metadata.combatSchemaHash`
   - 需重算：4B 后 hash 必然不同，需更新硬编码值

3. **replay-hash.test.ts**
   - 4A/4B/4C 都影响：stateHash 三次变
   - 比对模式：`runSequence() === runSequence()` (自比对)
   - 需重算：行为对但数值变

4. **fuzz-combat.test.ts**
   - 3 个 sub-test：no-crash / determinism / replay validity
   - 4A/4B/4C 都改 stateHash，但 determinism 检验本身不变（seed 固定）
   - 需重算：hash 值但不影响通过/失败

5. **replay-performance.test.ts / replay-schema.test.ts / replay.test.ts**
   - 只检查结构、immutability、schema，不依赖数值
   - 全程不受影响 ✓

6. **hit-shape.test.ts**
   - 只检查 HitResolver 的几何判定逻辑
   - position 值变但不影响几何判定 ✓

---

## 2. Hash 体系工作机制

### 计算管道

```
actions/default.json (16KB)
        ↓
computeActionsHash() 
        ├─ JSON parse (去 sourceProvenance)
        ├─ stableStringify() (sorted key)
        └─ fnv1a() (32-bit hash)
        ↓
"9a1b2c3d" (actionManifestHash)
        ↓
ReplayRecorder.metadata {
  combatSchemaHash: "9a1b2c3d",
  manifestHash: "9a1b2c3d",
  statusManifestHash / enemyManifestHash / damageManifestHash
}
```

### 重要发现

1. **schema-hash-freshness.test.ts** — 严格比对 manifest hash
   - 4B 删 Jump dy → action manifest JSON 变 → **actionManifestHash 变** → test fail
   - **不是 bug，是正常的**；需跑一遍重算新 hash

2. **auto-combat / fuzz-combat / replay-hash** — 比对 **stateHash**（actor 快照的 hash）
   - 不依赖 action manifest hash
   - 4A/4B/4C 都改 actor.position → stateHash 变
   - 但这些 test 是**自比对**（运行两次结果相同？）→ determinism 检验过，hash 值变

3. **determinism 正交于 hash 值**
   - seed 固定 → fuzz 同 seed 同结果 ✓ (determinism)
   - 但结果本身的 hash 变 ✗ (需更新)

---

## 3. 阶段性 Hash 更新清单

### 4A 完成后

**不会失败的**:
- schema-hash-freshness (action manifest 没变)
- Group A 全部

**会变但 determinism 本身过的**:
- auto-combat (stateHash 变，但 finalHash === secondHash 仍然过)
- fuzz-combat (determinism 检验过，只是 hash 值变)
- replay-hash (自比对过，hash 值变)

**可能需调的**:
- Group B 的某些数值断言（新重力导致的轨迹变化）

---

### 4B 完成后

**会明确失败的**:
- **schema-hash-freshness** — actionManifestHash 变，测试改了 action JSON
- auto-combat / fuzz-combat / replay-hash — stateHash 再次变

**需更新的**:
- schema-hash-freshness 的硬编码 hash（或由程序自动读）
- Group C 的 jump test（y 轨迹新值）

---

### 4C 完成后

**无需改 manifest**（y/z 互换只是运行时解释）

**需更新代码的**:
- 14 个含 position.y/z 的 test（互换所有访问）
- auto-combat / fuzz-combat / replay-hash 的 hash 再次变（actor 快照中 y/z 互换）

**更新后全部过**:
- 45 个 test + hash 体系对齐

---

## 4. 风险评级

| 步骤 | 风险 | 根因 | 缓解 |
|------|------|------|------|
| 4A | 低 | actor 轨迹变但逻辑不变 | 观察 Group B 数值是否合理 |
| 4B | 中 | action JSON 变 → action hash 变 → schema-hash fail | 理解这是正常的，需跑一遍捕获新 hash |
| 4C | 中-高 | y/z 互换需代码遍历 | 逐个 test 检查，可用 grep 辅助 |
| **综合** | **中** | 三步都会改 stateHash，但决定性检验独立 | 分阶段执行，每步后重算 hash |

---

## 5. 修复策略总结

1. **4A**: 跑 test → Group B 部分 fail → 检查逻辑正确性 → 如是数值变接受 → 不要改 hash
2. **4B**: 跑 test → schema-hash fail（预期）→ 跑脚本捕获新 actionManifestHash → 更新 test
3. **4C**: 遍历 y/z → 代码互换 → 跑 test → 所有过 → 捕获最终 stateHash

**输出**: 一份 csv，每步记录 actionManifestHash / stateHash 的变化，供后续追踪。

---

## 报告完成（~750 字）

**已交付**: RESEARCH-PHASE4-TEST-IMPACT.md
