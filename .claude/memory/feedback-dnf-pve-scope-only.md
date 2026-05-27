---
name: feedback-dnf-pve-scope-only
description: Combat Lab 1:1 还原范围 = PVE 打怪战斗；PvP / 城镇 / 副本非战斗环节都 out of scope
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 22ff062c-f130-4a7e-b67e-6590d6fcfe24
---

PVE 打怪战斗必须 1:1 还原 DNF（13 system 完整建、不简化），PvP / 城镇 / 副本非战斗环节都 out of scope。

**Why**: 用户 2026-05-22 明确表态："主要是打怪战斗这方面必须 1:1，pvp 城镇 之类的可以不用管，pve 在和怪物战斗必须还原度高"。工程经济性论据（v2 §3 原稿倡导"4 heavy + 5 helper + 3 bridge"分桶简化）被显式拒绝 —— 不接受为了少写代码而压缩 system 数量。

**How to apply**:
- **新模块设计**：13 system 必须各自独立目录（不合并 helper），按 `docs/plans/2026-05-21-dnf-native-kernel-design.md` §1 完整列表实施
- **PVF 字段处理**：parser 全量读取，PvP-only 字段读但 ignore（数据完整性优先），runtime 加 `ignoreInPveOnly: true` flag 跳过消费
- **范围决策**：碰到"要不要支持 PvP / 城镇 / 邮件 / 商店 / 拍卖 / 通关结算 UI / 加血泉" → 默认 stub + `// TODO(OOS): not implemented`，不实现
- **简化提议**：拒绝任何"为了工程效率压缩 DNF 模型"的提案；提之前先确认是否在 OOS 范围内
- **DNF.exe 不可达部分**（jump_power 单位 / AI 算法 / buffer 帧数 / 5 级 priority 仲裁细节）：按 H1 working hypothesis + 标 `requiresManualVerification: true`，不接受省略
- **单一来源**：[[combat-lab-dnf-alignment-pivot-2026-05-21]] 是项目方向；`docs/plans/2026-05-22-dnf-native-v2-design.md` §0.5 Scope + §3 是 scope/架构权威，其它文档冲突时以此为准
