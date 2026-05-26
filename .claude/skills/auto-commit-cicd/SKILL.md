---
name: auto-commit-cicd
description: 自动化代码提交 → 推送 → 创建 PR → CI 监控 → 合并 master 的完整工作流。如果 CI 失败，自动分析错误并修复，最多重试 3 次。
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
model: sonnet
metadata:
  short-description: 自动化 Git 提交、推送、创建 PR、CI 监控与合并工作流（carbon-shade-web 适配版）
---

# auto-commit-cicd (carbon)

## TRIGGER

当用户说以下任一内容时调用本 skill：
- "提交代码" / "提交并推送" / "commit and push"
- "自动提交" / "auto commit" / "auto-commit"
- "提交到 master" / "合并到 master" / "merge to master"
- "运行 CI" / "run CI" / "触发 CI"
- "/auto-commit-cicd" (slash command)

## 工作流

### Step 1: 检查工作区

```bash
git status --short
```

- 如果有未提交改动 → 继续 Step 2
- 如果工作区干净 → 提示用户"没有需要提交的改动"，退出

### Step 2: 本地预检

```bash
npm run typecheck
npm run static:test
```

跳过 `build` 和 `smoke` —— 它们太慢，pre-push hook 跑 8 gate analyze 已覆盖。

- 任一失败 → 按错误指引修复后重新预检
- 全部通过 → Step 3

**常见预检错误修复指引：**
- TypeScript 类型错 → 看 `tsc --noEmit` 报错位置，修类型/import
- `test-utils.ts` 用 `assert.fail()` → 改成 `throw new Error()`（test-utils 只导出 ok/equal/deepEqual）
- FrameDataAction 字段访问报错 → 用 double-cast `action as unknown as Record<string, unknown>`
- import 报 `Cannot find module './foo'` → NodeNext 要求显式 `.js` 扩展名（即使源是 `.ts`）
- velocity 写入位置违规 → 看 `.claude/hooks/guard-velocity-writes.mjs` 的允许列表
- Phaser 出现在 `src/combat/` → 看 `guard-phaser-boundary.mjs`；纯内核不可 import phaser

### Step 3: 提交改动

1. 当前分支名 + 最近 commit 风格：
```bash
git branch --show-current
git log --oneline -5
```

2. 显式 `git add`（**绝不 `git add -A`**，避免误带 in-progress 业务文件 / secrets）：
```bash
git diff --name-only
git ls-files --others --exclude-standard
# 逐个 add，排除 .env / NEOPLE_API_KEY / *.pvf / *.npk
```

3. 生成 commit message：
   - 格式：`type(scope): 描述`
   - type: feat / fix / refactor / perf / ci / docs / chore
   - 参考 `git log --oneline -5` 同风格
   - 示例：`fix(parser): MobParser P0-3 — abort on unknown .ani type`

### ─── MANDATORY HUMAN CHECKPOINT — commit message 确认 ───

在执行子步骤 4（`git commit`）**之前必须**：

通过 `AskUserQuestion` 给用户展示完整 commit message 草稿（含 Co-Authored-By），问 go / edit / abort：

- **go** → Step 3.4 创建提交
- **edit** → 用户指明改哪里 → 回 Step 3.3 修订 → 重新走本 checkpoint
- **abort** → 退出 skill（保留 working tree，不删 staged changes）

未收到明确 "go" 之前，**禁止**调用 `git commit`。

理由：commit 进入历史后 rewrite（amend / rebase / force-push）成本是 10 倍。参考 closed-loop CHECKPOINT D 同精神。

4. 创建提交：
```bash
git commit -m "$(cat <<'EOF'
type(scope): 简要描述

更详细说明（如需要）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

注意：本仓库已激活 `scripts/hooks/pre-commit`（typecheck + static:test），commit 会被它二次验证。**不要** `--no-verify` 跳过（除非用户明确要求）。

### Step 4: 推送并创建 PR

1. 推送：
```bash
git push origin <current-branch>           # 或 -u 首次
```

pre-push 会跑 `npm run analyze` 8 gate；通过后才进 GitHub。

2. 创建 PR（base = master）：
```bash
gh pr create \
  --base master \
  --head <current-branch> \
  --title "<≤70 字 PR 标题>" \
  --body "$(cat <<'EOF'
## Summary
- <改动点 1>
- <改动点 2>

## Test Plan
- [ ] combat-lab-ci.yml CI 通过
- [ ] 本地 pre-push 8 gate analyze 通过
- [ ] (如改 src/combat/) replay hash parity gate 未破

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

3. 记录 PR URL：
```bash
gh pr view --json url,number,state
```

### Step 5: 监控 CI

PR 创建后 `combat-lab-ci.yml` 自动触发。监控：

```bash
gh pr checks
```

轮询策略：
- 每 60-90 秒检查（不超 prompt cache 5 分钟 TTL）
- 所有 checks `pass` → Step 6
- 任一 `fail` → Step 7 修复循环
- `pending` / `in_progress` → 继续等

最大等待：15 分钟（combat-lab-ci.yml 实际跑 ~3-5 分钟，远快过 harmony）。

### Step 6: 合并 PR

```bash
gh pr merge <PR_URL> --merge
```

- `--merge` 创建 merge commit（保持历史完整）
- 合并冲突 → 提示用户手动解决，退出 skill

报告最终状态：
- ✅ PR URL
- ✅ CI 通过
- ✅ 已合并到 master

### Step 7: 修复循环（最多 3 次迭代）

迭代计数器从 1 开始，超过 3 次退出并报告用户。

**每次迭代：**

1. 获取 CI 失败日志：
```bash
gh run list --branch <current-branch> --limit 1 --json databaseId,status,conclusion
gh run view <run-id> --log --job <job-id> 2>&1 | tail -200
```

2. 分析错误（carbon 技术栈常见模式）：
   - `tsc` 类型错 → 看报错文件:行号，修类型
   - `static:test` FAIL → 看哪个 test 失败，看 `tests/static/<name>.test.ts` 期望
   - `vite build` 错 → import 路径 / 缺 dep / esm 兼容性
   - `depcruise` 循环依赖 → 看 dep graph，断环
   - `knip` unused export → 删未用导出 / 加 ignore 注释
   - `event-trace` mismatch → emitter 和 listener 不匹配，补一边或删一边
   - `pipeline-dump` 报错 → 看 `src/dnf-native-combat/data/pipeline/` stage 顺序
   - replay hash parity → 看 `tests/static/replay-hash.test.ts`，golden hash 漂了说明 kernel 改了，需要重 seed

3. 修复后提交：
```bash
git add <修复的文件>
git commit -m "$(cat <<'EOF'
fix(ci): <简要描述>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin <current-branch>
```

4. 回 Step 5

**无法自动修复（报告中止）：**
- GitHub secrets / `NEOPLE_API_KEY` 缺失
- 第三方服务不可用
- 分支保护阻止合并
- 3 次迭代后仍失败

## 安全约束

- **绝对不提交**：`.env`、`NEOPLE_API_KEY`、`Script.pvf`（PVF 不放仓库）、`*.npk`、`credentials.*`
- **不 force push** master
- **不跳过 hooks**（除非用户明示）
- **修复循环上限** 3 次
- **合并前 CI 必须全绿**

## 项目信息

- **仓库**：`https://github.com/daugf2527/carbon-shade-web`
- **base 分支**：`master`（已 frozen 2026-05-21，DNF 对齐工作在 `dnf-native`）
- **CI 工作流**：`combat-lab-ci.yml`（push + PR 触发）、`build-dnf-extract.yml`（C++ 工具构建）
- **提交格式**：`type(scope): 描述`（中英文均可，参考最近 commit）

## 本地 CI 脚本（对照表）

| 命令 | 作用 | 阶段 |
|------|------|------|
| `npm run typecheck` | tsc --noEmit | pre-commit |
| `npm run static:test` | static 测试（无框架） | pre-commit |
| `npm run analyze` | 8 gate（depcruise / knip / event-trace / ...） | pre-push |
| `npm run build` | vite 生产构建 | CI 内部 |
