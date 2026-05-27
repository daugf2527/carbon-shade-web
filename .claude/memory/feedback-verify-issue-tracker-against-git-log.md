---
name: feedback-verify-issue-tracker-against-git-log
description: "known-issues / TODO / changelog 类清单文档默认是 snapshot，断言\"未修\"前必须 git log -- 相关文件核 commit history"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ea99eaf9-29c9-4378-bd66-0eb550e9f98c
---

known-issues.md / TODO.md / changelog.md / *-debt.md 这类"已知问题清单"是 snapshot 文档。看到 "P0 未修" / "Open" / "pending" 不等于 bug 现在还存在 — 可能 commit 已经修了但文档没同步更新。

**Why**: 2026-05-24 stage1 闭环时，docs/planning/2026-05-24-stage1-known-issues.md 标 P0-1/P0-2/P0-3 "未修，开工前需确定修法 A 还是 B"。我据此跟用户花两轮问"修法选哪个"，用户答 "暂停先查"，gh 检查后才发现 commit `2539b9c`（同一天）已经用修法 B 修了，known-issues 文档没更新而已。两轮提问全是 moot。

**How to apply**:
1. 看到 issue tracker / debt list / changelog 写"未修 / Open / pending"，**断言 bug 存在之前**，先：
   - `git log --all --oneline --grep="<bug-id|症状关键词>"`
   - `git log --all --oneline -- <bug 涉及的文件路径>`
   - 如果文档说位置在 X.ts:N-M，直接 Read 那段代码看是不是已经修了
2. 这条比 [[feedback-verify-docs-help-memory-before-trust]] 更窄但更尖：那条是"路径/命令/能力使用前先实测"，这条专门针对"清单文档的 status 字段"。
3. 同样适用反方向：清单写"已修 RESOLVED"也不一定准 — 真实改动可能后来被 revert 或 partial revert。但通常 stale-未修 比 stale-已修 更常见。
4. 闭环 fix 一类工作时，开工先扫一遍清单文档对应文件的 `git log`，比逐项推理快得多。
