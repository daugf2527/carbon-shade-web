---
name: feedback-restart-brainstorming-when-direction-pivots
description: "用户中途改决策方向, brainstorming 已收集的 4 个答案可能失效 — 别埋头继续, 重新评估"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 03ea92cc-77c4-4ab2-a07d-97624e683692
---

正在跑 brainstorming 流程 (依次问 fidelity / 版本 / 装备 / 阶段 / 实施路径 / 资源管理), 用户中途说 "前面有个根本性的决定要改" (例: 工具栈废弃, 必须用 C++ 工具). 这种情况下**前面收集的几个答案可能整体失效**, 不要直接开始干新方向的活儿, 而要先停下来重评估.

**Why:** 2026-05-19:
- brainstorming 收集了 4 个决策: 保真度 / 版本 / 装备 / 分阶段.
- 第 5 个 (实施路径) 用户选 B "自下而上先全量解包".
- 然后用户突然说 "不用 src/extraction/, 必须用 dnf-extract.exe, 跑不起来重编".
- 我直接跳进 "诊断 + 重编 dnf-extract.exe" 模式, 没回去问: 工具栈变了, B 路径 "先全量解包" 还成立吗? 工程量预估 (2-3 周) 还成立吗?
- 结果工具修复这一支独立做完了, 但跟 brainstorming 的主线没接上. 现在主任务 #1 "1:1 还原狂战士外观" 还是 in_progress, 工具修复变成 prerequisite.

**How to apply:**
- 用户改了一个**根本性前提**(工具栈/版本/范围/资源), 先暂停, 列出 "前面 N 个决策里, 哪些被这个变更影响、哪些还成立".
- 不要把工具修复/前置工作做完就当作 brainstorming 结束 — **工具好了之后, 设计还没敲定**.
- 重启 brainstorming 时直接 "现在新前提是 X, 之前 Y/Z 还成立吗?" 而不是从头再问 4 遍.
