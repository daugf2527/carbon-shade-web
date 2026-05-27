---
name: feedback-parallel-agents-min-sonnet
description: 并行 agent 调度时最低用 Sonnet，不能用 Haiku — 用户对质量底线的硬要求
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a7230054-2ed9-4909-bc39-1a466f33595a
---

并行 / 多 agent 调度时，**每个 agent 最低 Sonnet 起步，不能用 Haiku**。Agent 工具调用时显式传 `model: "sonnet"`（或 `opus`），不依赖默认。

**Why:** 2026-05-23 用户明确指示 "3 并发 agent 最低也得是 sonnet 级别的，不能用 haiku"。背景是当时正要并发 3 个 agent 扩 dnf-native 的 SklParser/AniParser/NutExtractor，那种实质性代码生成 + 测试任务 Haiku 容易给出表面合理但细节错的结果。

**How to apply:**
- 任何 `Agent` / `subagent_type` 调用，**默认显式 `model: "sonnet"`**
- 只有以下场景可考虑 Haiku：
  - 用户明确说"用 haiku 就行"
  - 任务确实极轻（单一查询、纯格式转换、且非生产代码）
- 跟 [[dispatching-parallel-agents]] skill 配套：并发多 agent 时一律 sonnet+
- 单 agent 大任务可以用 opus（看复杂度判断）
