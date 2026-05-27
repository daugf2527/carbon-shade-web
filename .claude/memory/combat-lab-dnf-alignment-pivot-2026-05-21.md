---
name: combat-lab-dnf-alignment-pivot-2026-05-21
description: "项目方向 pivot — 停止新功能开发, 全力对齐 DNF 真值; Phase 1 已完成, Phase 2-6 路线已定"
metadata: 
  node_type: memory
  type: project
  originSessionId: 66c27168-90a9-45b8-9478-977f04f83d04
---

# Combat Lab 项目方向 Pivot（2026-05-21）

**决定**：Combat Lab 项目从"功能迭代"转入"DNF 真值对齐"。停止新功能开发，所有改动方向 = 把底层物理 / 数据 / 行为对齐 DNF 真值，按三级置信度铁律决策。

**Why:** 2026-05-21 用户明确指示："我们接下来不开发新功能了，要把底层和 DNF 对齐"。背景: 同会话发现项目内大量 Tier-3 baseline (重力 0.56 / 跳跃 200 px peak / launch 各动作手调) 跟 DNF Tier-1 真值 (-1500 px/s² / lift_up 75-300 px/s) 都不对齐。Phase 1 已经把"挖 DNF 真值"这条路打通 (工具修好 + 单位 closure + skill 沉淀)，现在按方向系统重构。

**How to apply:**
- 任何新功能 idea → 拒绝，先列入 Combat Lab 1.0 后的 backlog
- 任何数值改动 → 必须有 sourceProvenance + confidence 标注，按三级铁律决策
- 任何 Tier-3 baseline → 标记 requiresManualVerification 待 PVF/exe 验证
- 用 [[dnf-physics-extraction]] skill 挖新物理领域真值 (不要重复手动 grep)
- 跟 [[feedback-dnf-data-confidence-tiers]] 配套使用

## Phase 1 已完成 (2026-05-21)

- **工具**: tools/dnf-extract.exe 全量修复 (.nut/binary dispatch + bounds 保护), commit 99432ae 已 push origin/master
- **数据**: 11 职业 .chr 对比表 + swordman 7 个 .atk launch 真值表
- **常数**: DEFAULT_GRAVITY_ACCEL=-1500 px/s² (铁证); 所有速度统一 px/s; 加速度 px/s²
- **API map**: sq_SetZVelocity / sq_SetCurrentAttacknUpForce / sq_SetCurrentAttacknBackForce / sq_JumpUp/Down/LandStartFrame 等 8 个核心 API 单位 closure
- **文档**: docs/research/2026-05-21-dnf-air-physics-phase1.md
- **skill**: .claude/skills/dnf-physics-extraction/SKILL.md (系统已识别可调用)

## 悬案

- `jump_power` 单位 (H1 px/s 直接 v0 / H2 % scaler with hidden base) - 无法从 PVF 证伪, 需 .exe 反编译; **采用 H1 作为工作假设**, 承担"项目内跳跃高度降 3 倍"的代价
- 项目内 Vec3 命名 `{x, z, y}` 跟 DNF 原生 (z=height, y=depth) 反了 - Phase 4 重写时决定怎么对齐

## Phase 2-6 路线

| Phase | 状态 |
|-------|------|
| Phase 2 — Hypothesis 决策 (H1) | 已定 |
| Phase 3 — 数据层 (src/data/official/) | pending |
| Phase 4 — 物理引擎重写 (AirbornePhysicsSystem, Jump 速度积分) | pending |
| Phase 5 — 受击物理对齐 (gravity 0.56→0.417, launch 真值) | pending |
| Phase 6 — 验证 + commit | pending |

详细路线: `docs/planning/2026-05-21-dnf-alignment-pivot.md`

## 验证标准

- 所有跳跃曲线由速度积分 + 真重力计算 (不是位移表)
- 所有 launch 来自 .atk [lift up] 真值
- swordman 实机视频对照可解释
- 复现测试 jump-x-cancel-stuck-airborne 通过
- requiresManualVerification: true 的字段全部在 docs/research/ 里列出
