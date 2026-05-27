---
name: feedback-verify-docs-help-memory-before-trust
description: 文档/help/memory 里的具体路径、命令清单、声明的功能 ≠ 现实，使用前先实测
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 03ea92cc-77c4-4ab2-a07d-97624e683692
---

文档（含 CLAUDE.md、工具 `--help` 文本、memory 中的路径）声明的内容不等于现实状态. 在调用一个具体路径/命令/工具能力之前, **要先用最便宜的方式实测**（ls / 调一次 / list 看 entries / cat 看文件）.

**Why:** 2026-05-19 多次中招——
- memory 写 BaiduNetdiskDownload 在 C 盘, 实际在 D 盘.
- dnf-extract `--help` 列出 `--list` 命令, 实际是 stub 返回空数组.
- `--help` 列 workflow 命令 `resolve` / `npk-list`, 实际 dispatch 表里没实现 (走到 unknown_command).
- `--help` 列 `--npk --img --frames`, 实际打印空 `{"frames":[]}`.
- CLAUDE.md 老版本说 `--with-data` 是开关, 没说默认值是 false.

**How to apply:**
- memory/docs 里读到具体路径 → `ls` / `git status` 看一眼是否还在.
- 工具 help 列出命令 → 用 throw-away 输入实测一次最简单的 case, 看输出是不是 JSON、是不是空、exit code 多少.
- 跨会话的 memory 是 snapshot 不是 source of truth (尤其路径/版本/数字).
- 一旦发现文档跟代码不一致, **以代码为准**, 同步把文档修了 (今天 CLAUDE.md 的 dnf-extract 章节就是这种修).

见 [[feedback-dnf-extract-mandatory]] [[session-2026-05-19-dnf-extract-fixes]].
