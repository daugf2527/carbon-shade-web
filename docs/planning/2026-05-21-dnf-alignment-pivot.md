# Project Direction Pivot: 全面对齐 DNF（2026-05-21）

## 决定

**Combat Lab 项目从"功能迭代"转入"DNF 真值对齐"**。

从今天起：

- ❌ **不再开发新功能**（不加新职业、新技能、新 UI、新机制）
- ✅ **所有改动方向 = 把底层物理 / 数据 / 行为对齐 DNF 真值**
- ✅ **所有数值决策按三级置信度铁律**（见 [CLAUDE.md "DNF/DFO reference truth rule"](../../CLAUDE.md#dnfdfo-reference-truth-rule)）

## 决定的依据

### 现状审计（2026-05-21 之前）

| 系统 | 当前状态 | 与 DNF 真值差距 |
|------|---------|----------------|
| 跳跃物理 | root motion `dy` 表，peak ≈ 200 px | DNF 真实 ≈ 62 px（H1）或 200 px（H2），单位歧义；当前实现非速度积分 |
| 重力 | `ReactionMotionSystem` 手调 `0.56`/tick² | DNF 真值 `-1500 px/s² = -0.417/tick²`（铁证） |
| launch/knockback | 各动作手调 `launchVelocityY`/`knockbackX/Z` | DNF 真值在 `.atk` `[lift up]` 字段（铁证），项目内大多没对齐 |
| Vec3 命名 | `{x, z, y}` —— z=depth, y=height | **跟 DNF 反了**（DNF 原生 y=depth, z=height） |
| 38 个 action 数据 | 大量 `sourceType: "local_baseline"` | 待 PVF 真值替换 |
| 跳跃 cancel bug | 空中按 X cancel 后 y 卡死，复现测试 `.tmp/repro/jump-x-cancel-stuck-airborne.test.ts` | 缺 fallback 重力，根因清楚 |

### Phase 1 已完成（2026-05-21）—— 路打通了

| 成果 | 文件 |
|------|------|
| dnf-extract.exe 工具全量修复（68/68 扩展名 dispatch） | commit 99432ae |
| 三级置信度铁律落档 | [CLAUDE.md](../../CLAUDE.md) |
| Phase 1 完整研究文档（API map + 11 职业 .chr 表 + .atk lift_up 表 + 单位 closure 矩阵） | [`docs/research/2026-05-21-dnf-air-physics-phase1.md`](../research/2026-05-21-dnf-air-physics-phase1.md) |
| 可复用 skill `/dnf-physics-extraction` | [`.claude/skills/dnf-physics-extraction/SKILL.md`](../../.claude/skills/dnf-physics-extraction/SKILL.md) |
| DNF 速度 / 加速度单位 closure（**px/s**, **px/s²**） | 铁证多个 API 验证 |

## 接下来的路线（Phase 2-6）

按"先工具后真值，先真值后实现"原则：

### Phase 2 — Hypothesis 决策

唯一悬案：`.chr` 的 `jump_power` 单位（H1 `px/s` vs H2 `% scaler with hidden base ≈ 1800 px/s`）。

**采用 H1 作为工作假设**（推荐）—— 承担"项目内 baseline 跳跃高度需降 3 倍"的代价，**因为 H1 更接近"原汁原味 DNF"**。所有数据落档时同时标 `requiresManualVerification: true`，待未来 `.exe` 反编译再 closure。

### Phase 3 — 数据层扩张

- 扩 `src/data/official/dnfPhysicsConstants.ts`，加 verified 字段 + API map
- 新 `src/data/official/characterStats.ts` 含 11 职业 .chr 真值
- 新 `src/data/official/attackLiftUp.ts` 含 .atk launch 真值
- 所有 `sourceProvenance` 严格标注，区分 Tier-1 verified vs Tier-3 baseline
- typecheck 通过，不破坏现有 runtime

### Phase 4 — 物理引擎重写

- 加 `AirbornePhysicsSystem`（基于 `-1500 px/s²` 真值）
- `Jump` action 改速度积分模式（删 root motion `dy`，加 `velocity.y` 初速度 + 引擎重力）
- `Vec3` 命名对齐 DNF（y↔z 重命名 / 或者保持现有命名但 doc 明示）—— 需 brainstorming
- 复现测试 `.tmp/repro/jump-x-cancel-stuck-airborne.test.ts` 挪回 `tests/static/` 并通过

### Phase 5 — 受击物理对齐

- `ReactionMotionSystem` 重力从 `0.56` 改为 `-0.417/tick²`（= `-1500/60²` Tier-1）
- launch velocity 用 `.atk` `[lift up]` 真值（如 attack3=300, hardattack=300, jumpattack=180）
- combo correction / quick rebound / overturn 真实参数（要再提一轮 PVF）

### Phase 6 — 验证 + 落档

- 全套 static test + typecheck + build 通过
- 多个 commit 分阶段提交（Phase 3 数据 / Phase 4 物理 / Phase 5 受击）
- 更新 `docs/changelog/`

## 工作准则

1. **每个数值都必须有 `sourceProvenance`** —— `source: "pvf:<full-path>"` + `confidence: high|medium|low` + `requiresManualVerification` 字段
2. **Tier-3 baseline 改成 Tier-1 真值是"修复"，不是"破坏性变更"** —— 即使行为变了，方向是对的
3. **所有 hypothesis 必须显式标注**，注释里说明证伪条件
4. **CLAUDE.md 提到的"DNF 原始数据推导规则"是硬约束**，任何"看起来合理"的实现都需要溯源
5. **`/dnf-physics-extraction` skill 用于挖任何新物理领域真值** —— 不要重复手动 grep

## 不在本 pivot 范围内

- ❌ 新职业（thief/priest/atfighter 等）的具体技能数据（不是不重要，是不优先）
- ❌ UI / 视觉效果 / 音效改进
- ❌ 性能优化（除非阻塞基本可用性）
- ❌ 替换技术栈

待 Combat Lab 1.0（底层完全对齐 DNF）发布后，才考虑新功能。

## 验证标准

- 所有跳跃曲线由速度积分 + 真重力计算，不是位移表
- 所有 launch 来自 .atk `[lift up]` 真值（标注 Tier-1）
- swordman 实机视频对照可解释（高度 / 滞空时间 / 落地时机）
- 复现测试 jump-x-cancel-stuck-airborne 通过
- `requiresManualVerification: true` 的字段全部在文档里列出

## 参考

- 三级证据铁律：[CLAUDE.md "DNF/DFO reference truth rule"](../../CLAUDE.md#dnfdfo-reference-truth-rule)
- Phase 1 详细研究：[`docs/research/2026-05-21-dnf-air-physics-phase1.md`](../research/2026-05-21-dnf-air-physics-phase1.md)
- 可复用 skill：[`.claude/skills/dnf-physics-extraction/SKILL.md`](../../.claude/skills/dnf-physics-extraction/SKILL.md)
- 工具升级：commit 99432ae（`Harden dnf-extract dispatcher to cover all PVF extensions.`）
