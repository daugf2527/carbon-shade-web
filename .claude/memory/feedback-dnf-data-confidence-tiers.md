---
name: feedback-dnf-data-confidence-tiers
description: DNF 数值证据三级置信度铁律 — extract > API/wiki > md/代码; 低优先级证据不能反向覆盖高优先级
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 66c27168-90a9-45b8-9478-977f04f83d04
---

# DNF 战斗数值置信度铁律

任何涉及战斗数值、帧数据、判定、物理参数的结论，按此三级取证：

1. **本地 dnf-extract 提取**（最高）— `tools/dnf-extract.exe` 从 PVF/NPK 提的 `.ani` / `.skl` / `.atk` / `.mob` / `.act` / IMG / `.str`
2. **Neople 官方 API + DFO-specific wiki** — API/DFO World Wiki/NamuWiki 等，仅当 (1) 拿不到时退到这一档
3. **本地 md 文档 + 当前代码实现**（最低）— `docs/` 和 `src/` 在没被 (1)(2) 验证前都是 `local_baseline`

**Why:** 用户 2026-05-21 明确指示。前置背景: 同会话里调研 jump y 漂移 bug 时, 我建议用项目内 `dnfPhysicsConstants.ts` 的 -1500 重力作为"DNF 真值", 用户立刻质疑"这个也不可信吧 我们不是有一个 exe 吗 能提取常量吗"。验证后确认 dnf-extract.exe 在 `.nut` 上 segfault, 现有的 -1500 实际上等同于 local_baseline, 不能伪装 1:1 还原。用户希望以后所有数据决策严格遵循这个等级。

**How to apply:**
- 提任何战斗/物理/帧数值结论前, 先按 1→2→3 找证据
- 现有代码里的数字（哪怕 commit 在 main 上）默认是 (3) 级, 不能当真值反推
- 拿不到 (1) 时, 必须显式标 `sourceType: "local_baseline"` + `requiresManualVerification: true`, 不能伪装高级
- 低级证据不能覆盖或污染高级证据。Wikipedia/百科绝对不进证据链
- 与 [[feedback-dnf-extract-mandatory]] 配套: 提取必走 dnf-extract.exe 不走 TS 栈

**已知缺口（截止 2026-05-21）**: 真实战斗 launch/gravity 曲线 + hitstun 表硬编码在 DNF.exe C++ 二进制里, PVF 提不到, dnf-extract 也提不到 `.nut`（Squirrel 字节码 segfault）。这部分用 (2) 的间接证据或 (3) 的 baseline 标注待校准。

已落档到 `CLAUDE.md` "DNF/DFO reference truth rule" 段。
