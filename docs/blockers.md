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
