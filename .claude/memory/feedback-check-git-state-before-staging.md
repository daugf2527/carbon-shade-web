---
name: feedback-check-git-state-before-staging
description: "commit 前用 git status 分清 \"我做的\" 和 \"会话开始就 M 的\", 别人的改动不混进自己的 commit"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 03ea92cc-77c4-4ab2-a07d-97624e683692
---

会话开始时项目 working tree 可能已经有别人的未 commit 改动 (上个会话留下的, 或用户手动改的). 这些改动**不属于当前任务**, 不要无差别地 `git add .` 或 `git add -A` 把它们带进自己的 commit.

**Why:** 2026-05-19 会话:
- 开始时 `gitStatus` 已经显示 `M CLAUDE.md` (上个会话做了精简重构, 没 commit).
- 我以为是自己改的, 差点把别人 174 行删除 + 89 行新增的重构跟自己的 dnf-extract section 同步 当成 "我的工作" 一起 commit.
- 最后处理是分两个 commit: `cd8b92e` 接受重构 + 我的 dnf-extract 同步, `80bff6a` 补回精简时丢的 3 处.

**How to apply:**
- **每次 commit 前**: 先 `git status --short` + `git diff <file>` 单独看那些 "我以为我没动过" 的文件.
- session 开始时 `gitStatus` 里出现的 M/?? 文件, **默认假设不属于当前任务**, 除非用户明确说要处理.
- staging 时用 explicit 文件名 (`git add a.ts b.ts`), **不要** `git add .` / `git add -A` / `git add -u`.
- 如果某个会话前 M 的文件碰巧跟当前任务相关, 在 commit message 里 honestly 说明 "这个文件是会话前已 M, 我只动了 X 部分".
