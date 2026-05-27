# 2026-05-27 已决策落档（5 个 A 类决策）

> 用户在 2026-05-27 早上给出 "bcabb" 5 字母回答，对应 [decisions-and-questions.md](2026-05-26-decisions-and-questions.md) 里 5 个 Phase 2 开工前阻塞性问题的明确选择。本文档把这 5 个决策、推导依据、关联工作落档。

---

## 决策矩阵

| # | 问题 | 用户选 | 含义 |
|---|------|--------|------|
| **Q1** | 13-system 框架用还是不用 | **B** | 等 Windows 验证再用 — 不当真理但作为工作假设 |
| **Q2** | Runtime Schema Design 何时做 | **C** | 先扩数据再做 — swordman 数据补全后再定 .fbs schema |
| **Q4** | 参考角色 | **A** | swordman — 10 motion + 3 atk + 2 skl 已 inline，零工作量起步 |
| **Q21** | 13 个 system 的 tick 执行顺序怎么定 | **B** | 从 .nut 反推 — 不拍脑袋，不抄 GGPO/MUGEN |
| **Q31** | "最小闭环"精确定义 | **B** | 命中 → 伤害 → 受击 → HP 扣减（4-5 system 范围） |

---

## 决策间的自洽性

这 5 个选择形成了一个**互相支撑**的策略：

```
Q1/B + Q21/B ─┐
              ├─► 一次 Windows .nut 验证解锁两个问题
              │   （2026-05-27 已部分完成 — 见验证报告）
              │
Q2/C ─────────┼─► "先扩数据" 意味着 Phase 2 开工前要先把 swordman
              │   全量数据（.atk×87 / .skl×203 / .ani×14）补进来
              │
Q4/A ─────────┼─► swordman 数据是 baseline 里最完整的（11 player shard 中
              │   只有 swordman + demonicswordman 有 inline animations/attacks/skills）
              │
Q31/B ────────┘   闭环范围：Animation + HitDetection + DamageFormula
                  + Reaction（+ 部分 Resource）= 5 个 system，
                  既验证核心也不至于范围爆炸
```

---

## 已部分完成的关联工作

### Q1 + Q21 + 新-A → .nut 验证（2026-05-27）

跑 `tools/dnf-extract.exe --pvf data/Script.pvf --list --filter ".nut"` + 抽样统计 sq_\* 频次：

- **193 个 .nut 文件**（md 数字精确匹配 ✅）
- **478 case-sensitive 引擎 API / 443 case-normalized 引擎 API**（剔除 5 个 user-defined function 后，与 md 478 精确匹配 ✅，详见 verification report §十）
- **7,370 调用点** + 启发式分类 12 桶（47% unclassified）
- 109/193 集中在 atmage，**swordman/fighter/gunner/thief 0 个 .nut**

**完整报告**：[docs/engineering/nut-validation-2026-05-27.md](../engineering/nut-validation-2026-05-27.md)

**13-system 状态更新**：
- 旧：`agent_claim_unverified` + `requiresManualVerification: true`
- 新：`counts_verified_clustering_inferred` — 数字级真实，但具体"13 个 system 各包含哪些 API"仍是 inference

**对 Q21 的精确化**（B 任务怀疑精神审计发现）：
- ❌ **.nut 不能直接反推 "13-system C++ 内部 tick 顺序"** — 那个在 DNF.exe 硬编码（跟 launch/gravity 一类）
- ✅ **.nut 能反推 "引擎 → 脚本事件 lifecycle graph"** — 9 .nut 跨类型抽样发现统一的事件触发链：
  - 输入：`checkCommandEnable` → `checkExecutableSkill`
  - 状态机：`onEndState` → `onSetState` → `onAfterSetState`
  - 每帧 tick callback：`onProc`/`procAppend`/`proc_appendage`（**.nut 通过 callback 参与 tick**）
  - 动画：`onKeyFrameFlag` → `onEndCurrentAni`
  - 渲染：`prepareDraw` → `drawAppend`
  - 销毁：`onDestroyObject` / `onVaildTimeEnd` / `isEnd` 谓词
- 详见 [verification report §十一](../engineering/nut-validation-2026-05-27.md)。Phase 2 落地建议：**JS/TS 实现先对齐 .nut hook 顺序，不必硬抄 C++ tick 顺序**（拿不到）。

---

## 接下来要做的（按 Q2/C + Q31/B 推出）

### 优先级 1（必做，T3.x 启动前）

1. **修 RuntimeExporter stand/walk inline 黑洞**（task-breakdown T4.0）
   - 现状：CURATED 提了 swordman 12 个 .ani，shard.animations 只有 10 个 key（stand / walk 缺失）
   - 修复：找 exporter 过滤逻辑根因，加 stand/walk 进 inline 集
   - 验收：重跑 baseline，swordman.json.animations 含 12 motion

2. **扩 CURATED_FILES 加 swordman 全量数据**（Q2/C 路径）
   - 当前 31 个 → 目标 ~300 个（+ 87 atk + 203 skl + 14 ani）
   - 风险：swordman.json 会从 196 KB 增长到 5-10 MB，可能触发 validator 边界
   - 决策待补：用户没明确 Q9（CURATED 扩多大），可以分步：
     - 步骤 A：先加 ~20 个最重要的 .atk/.skl（覆盖 Q31/B 闭环用到的 motion）
     - 步骤 B：跑通最小闭环验证后再扩到全量

### 优先级 2（Phase 2 开工时，T1.4 之前）

3. **补 13 system × API 明细表**（Q1/Q21 的 follow-up）
   - 当前 47% unclassified 的 228 个 API 需要语义分类
   - 方式：跑 LLM 深推导 agent，对每个 sq_\* API 名 + 调用上下文做归类
   - 输出：`docs/engineering/13-system-api-map.md` 或类似

### 优先级 3（Phase 2 早期）

4. **从 .nut 反推 system tick 顺序**（Q21 的剩余部分）
   - 选 3-5 个代表性 .nut（technique skill / passiveobject / appendage 各一）
   - 追踪 sq_\* 调用流，推 system 间依赖
   - 输出：`docs/engineering/system-tick-order-from-nut.md`

---

## 仍未决定的 30 个问题

以下来自 [decisions-and-questions.md](2026-05-26-decisions-and-questions.md) 的 Q3/Q5-Q20/Q22-Q30/Q32 + 本次 PR 留下的 3 个 — 共 30 个待决。详见 [p1-p2-backlog.md](2026-05-26-p1-p2-backlog.md) 末尾的待决问题清单。

---

*2026-05-27 用户决策落档。本文档不替代 decisions-and-questions.md（待决池），只把已决部分清单出来供后续会话快速 onboarding。*
