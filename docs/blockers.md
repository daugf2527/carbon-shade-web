# Stage 3 Blockers

## T-B.8: AttackBoxes 覆盖率不足

**日期**: 2026-05-31  
**状态**: BLOCKED  
**原因**: 覆盖率 16.2% (25/154)，未达标 >50% (77/154)

**发现**:
- 11 个 beamsword 等级提取成功
- 但大部分动画的 attackBoxes 为空
- 只有部分等级的部分动画有数据（如 beamswdc2 的 attack2/3/hardattack/jumpattack/dashattack）

**可能原因**:
1. PVF 数据本身不完整（部分等级/动画无 attackBox）
2. dnf-extract 提取器未完整解析所有 .ani 文件的 atk 字段
3. 不同等级武器的动画数据分布不均

**下一步**:
- 需要用 dnf-extract 直接验证 PVF 原始数据
- 如果 PVF 数据完整，修复提取器
- 如果 PVF 数据不完整，调整验收标准为"至少 1 个等级的 8 个动画有 attackBoxes"

**时间**: 超过 30 分钟时间盒，标记 BLOCKED 跳过

---

## T-C.7: Reaction 公式综合测试超时

**日期**: 2026-05-31  
**状态**: BLOCKED  
**原因**: Agent 运行超时 35 分钟未返回

**背景**:
- T-C.4/5 已完成 ReactionResolver 真值化
- 已有 reaction-routing.test.ts（10 个测试）+ reaction-velocity.test.ts（5 个测试）
- T-C.7 要求创建综合测试 swordman-reaction-formulas.test.ts

**可能原因**:
1. Agent 在编写复杂的 CombatKernel 仿真测试时卡住
2. 测试编译错误导致 agent 反复重试
3. Agent 尝试运行测试但环境问题导致超时

**影响**:
- Phase C 核心功能已完成（resolve + apply 真值驱动）
- 缺少综合测试不阻塞 Stage 3 完成
- 现有 15 个 reaction 测试已覆盖路由 + 公式计算

**下一步**:
- 手动检查 agent 是否创建了测试文件
- 如果文件存在，手动运行 npm run static:test 验证
- 如果文件不存在，Phase E 再补充

**时间**: 超过 30 分钟时间盒，标记 BLOCKED 跳过
