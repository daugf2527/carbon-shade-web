---
name: feedback-verify-agent-output-before-reporting
description: "agent 返回的具体声明（文件:行号 / 数字 / 缺失项）不是事实，写进任何\"客观/犀利/审计\"类报告前必须亲核"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 43a306b5-37ee-4e23-99b6-9182449483f2
---

agent 返回的细节性结论（文件:行号 / 标志数 / 实现项数 / 行为描述）属于**未经验证的二手观察**。写进任何对外的客观/犀利/审计报告前必须亲自 Read + Grep 核一遍。

**Why**: 2026-05-22 Day 1-10 回归测试时让 4 个 Explore agent 并行审计 dnf-extract C++ / parser / pipeline.mjs / H1-H5 probe。我把 agent 结论原样合并进"犀利、客观、详实"报告。用户质疑"二手的你就这么信？"后亲核才发现：
- agent 说 "CLI 7 个标志只实现 2 个" —— 实际 5 个真生效 + 3 吞值 + 2 噪音（agent 拿 v2 设计文档的理想 CLI 当分母，不是 pipeline.mjs 实际暴露的标志）
- agent 说 "M2 FIELD_TO_ENUM 5/6 缺 MOB_CATEGORY" —— 实际 6 个家族跟设计 §1.2 列表完全对齐，MOB_CATEGORY 是设计 §1.5 示例自相矛盾
- agent 说 "L2 cancel JSON 投影缺失（偷工减料）" —— 实际是 alias-list 模式 vs section-rename 模式之争，设计文档没明示哪种，agent 的判断超出证据

讽刺的是我自己在同一份报告里点名了 H4 audit 的 `Provenance.sourcePvfHash` "type lie"（声明 string，运行时可 undefined），结果**自己也犯了同款错误**——把 agent 声明当事实。

**How to apply**:
- **Explore agent 是探针不是裁判**。它们的产出是"待核观察"，不是"已验证结论"
- **报告里若引用 agent 结论**，要么亲核（首选），要么明确标 `[agent observation, unverified]` 或类似措辞
- **数字、文件:行号、"缺失/存在/未实现"类断言**最容易错——agent 容易把"设计文档的理想值"和"代码实际值"混淆。亲核成本通常 1-2 个 Read 调用，不值得跳过
- **跨多 agent 并行的"审计"任务**特别危险：agent 之间不沟通、各自给出自信结论，主进程容易当"全员共识"
- **跟 [[feedback-verify-docs-help-memory-before-trust]] 配套**：那条针对 docs/help/memory，这条针对 agent 输出
- **跟 [[feedback-dnf-data-confidence-tiers]] 同源精神**：低优先级证据（agent 二手观察）不能伪装高优先级证据（亲核一手实证）
