# Carbon Harness Implementation Plan — 对照 harmony 19 项反推

> 计划日期：2026-05-25
> 适用仓库：`D:/carbon-shade-web`（本仓库）
> 源参照：`D:/windsulf/daugf2527-repos/harmonyos-libretro-emulator/docs/plans/2026-05-24-harness-fusion-design.md`（两仓库共享设计文档）
> harmony 已落地状态：S2 (P0) + S4 (12/12 P1) = 19 项 closed（commit `0bb99ce` / `fb2c6a4` / `c0d18bc` / `9944fbb`）
> 本计划状态：S1 完成（本文件）；S2-S5 待实施
> 实施 cwd：必须 `cd D:/carbon-shade-web`（任何步骤切错 cwd 会让 hook 误指向 harmony）

---

## 1. Business goal + Success criteria

### Business goal

把 harmony 项目 19 项已落地 harness 改造按 carbon-shade-web 的技术栈（TypeScript / Vite / Phaser / Node）等价实现，让 carbon 同样具备：
1. **"改完代码 → 1 命令拿信号"反馈回路**（carbon 已有 `npm run analyze` + `verify-all` skill，只差状态持久化 + statusline 显示 + SessionStart 注入闭环）
2. **会话级反思沉淀**（user-level `session-debrief` skill 已自动享受，只差 idle 自动触发器）
3. **副作用 skill 安全包装**（disable-model-invocation / allowed-tools / model pin）
4. **桌面通知 + 项目级状态栏**（NT1 / OS1）
5. **本地 + CI 反馈塔补 ② 层**（pre-commit hook）

### Success criteria

1. 本计划独立可执行——下次 cwd=carbon 的会话照表走完，不需要本次会话 context。
2. 每条迁移项指明 **harmony 对照 file:line** + **carbon 等价路径** + **验收口径**。
3. 优先级分 P0 / P1 / P2，**P0 必须能在 1 次 2h 会话内落完**。
4. 明确"harmony 业务特定不该抄"的反模式（同样地，carbon 业务特定的 guard-phaser-boundary / guard-velocity-writes 不反推回 harmony）。

### Out-of-scope（本计划明确不做）

- 不改 carbon 业务代码（src/combat/、src/data/、tools/dnf-extract/）。
- 不动 `~/.claude/`（全局），只动 carbon 项目级。
- 不改 carbon 已有且正常工作的 6 个 skill + 4 个 PreToolUse guard 内部逻辑——只在 frontmatter 加新字段。
- 不引入 husky/lefthook（HarmonyOS 那边用裸 `.git/hooks/pre-commit` 是因为非 Node 项目；carbon 是 Node 项目本可以用 husky，但**本计划仍走裸 `.git/hooks/pre-commit`**——理由：harness-fusion 第 6 节 P2/不做明确否决"lefthook 迁移 husky"，个人项目尺度差异不显著，避免新增 npm devDep）。
- 不向 harmony 反向移植 carbon 业务专属物（dnf-physics-extraction skill / guard-phaser-boundary）。

### 关键约束

- 个人项目，无团队回路（参考 harmony memory `feedback_individual_project_workflow`）。
- 当前实施时**绝对不要**在 cwd=harmony 时改 carbon——参考 harmony memory `feedback_agent_worktree_isolation`。
- carbon 项目语言：CLAUDE.md 中英混合，本计划用中文；新加的 hook 脚本用 Node `.mjs`（与现有 4 个 guard 一致），不引入 bash 风格。

---

## 2. carbon 现状对账（19 项 harmony 落地 → carbon 状态）

> 来源：harmony commit `0bb99ce`（T1-T6 30 findings 修复）+ `fb2c6a4`（S4 NT1/OS1 收尾）+ `c0d18bc`（H3/SE1）+ `9944fbb`（B2/SA1）+ `8441462`（附录 O wire-up）

| # | harmony ID | harmony 落地 | carbon 现状 | 行动 |
|---|---|---|---|---|
| 1 | H1 PreToolUse 守卫 | 3 guard | ✓ 4 guard（含业务） | **不做**（carbon 已超 harmony） |
| 2 | H2 closed-loop skill | 移植 carbon | ✓ 源头 | **不做** |
| 3 | B1 disable-model-invocation | auto-commit-cicd | ✗ closed-loop + audit 都没设 | **B1.carbon — P0** |
| 4 | C1 permissions.deny | harmony 已有 4 条 | ✗ 完全空 | **C1 — P0** |
| 5 | C2 defaultMode: acceptEdits | harmony 已有 | ✗ 缺 | **C2 — P0** |
| 6 | CT1 CLAUDE.md ≤200 行 | root 102 行（已分层） | ⚠ 单文件 350 行（边界值） | **CT1 — P1 评估后再定** |
| 7 | CT2 .claudeignore | harmony 已有 | ✗ MISSING | **CT2 — P0** |
| 8 | CT3 @import 子 CLAUDE.md | `@entry/.../ets/CLAUDE.md` + `cpp/CLAUDE.md` | ✗ 没分层，自然不需要 | **CT3 — 视 CT1 决策** |
| 9 | CT5 subagent memory | `napi-boundary-reviewer.memory.md` | ✗ 缺 | **CT5 — P1** |
| 10 | B2 learnings.md | 2 个 skill 各一份 | ✗ 6 个 skill 全无 | **B2 — P1** |
| 11 | H3 SessionStart context-inject | git status + log + 上次 quick_signals | ⚠ 有 reset-status.mjs 但只写 status.json 不 echo 给 Claude | **H3.carbon — P1（改造 reset-status）** |
| 12 | C3 Stop hook | hygiene + regression + idle 时间戳 | ✗ 完全空 | **C3 — P1** |
| 13 | SA1 commit message CHECKPOINT | auto-commit-cicd Step3→4 间 | ✓ closed-loop CHECKPOINT D 已有 | **不做** |
| 14 | SE1 项目级 model | `"model": "sonnet"` | ✗ 缺 | **SE1 — P1** |
| 15 | OS1 项目级 statusLine | bash 解析 quick_signals + idle | ⚠ 有 status.json 但 settings.json 无 statusLine 字段 | **OS1.carbon — P1** |
| 16 | NT1 Notification hook | BurntToast / msg fallback | ✗ 缺 | **NT1.carbon — P1** |
| 17 | PG1 plugin marketplace audit | 决策不装 | ✗ 没 audit 过 | **PG1.carbon — P1** |
| 18 | FB1 pre-commit hook | `.git/hooks/pre-commit` 跑 quick_signals | ✗ MISSING | **FB1.carbon — P1** |
| 19 | SC1+SC2 skill frontmatter | allowed-tools + model: sonnet | ✗ 6 个 skill 全无 | **SC1+SC2 — P1** |

**额外（harmony 没列但 carbon 该有的）**:

| # | 内容 | harmony 对照 | carbon 现状 | 行动 |
|---|---|---|---|---|
| 20 | auto-commit-cicd 等价 | harmony `.claude/skills/auto-commit-cicd/SKILL.md`（commit→push→PR→CI→merge + 自愈 ≤3） | ✗ 缺（closed-loop 止于 git commit） | **CB1 — P1 移植** |
| 21 | idle 自动检测触发 session-debrief | `scripts/check/session_idle_detector.sh` + UserPromptSubmit hook | ⚠ reset-status.mjs 已占 UserPromptSubmit 位 → 合并 | **CB2 — P1** |
| 22 | AG1 combat-kernel-reviewer frontmatter | harmony napi-reviewer line 3 "NOT for general C++ review" | ✗ agent 文件无 frontmatter（纯 markdown） | **AG1 — P1** |
| 23 | PM1+PM2 plan mode 指引 + Alt+M | harmony root CLAUDE.md W6 速查表 | ✗ 完全缺 | **PM1+PM2 — P1** |
| 24 | WIN1.carbon Windows 速查表 | harmony root CLAUDE.md "Windows 注意事项速查" | ✗ 完全缺 | **WIN1.carbon — P0** |

**总计**: P0 = 5 项 / P1 = 13 项 / 0 项故意不做的 P0 / P1 中 CT1 需先评估再决策。

---

## 3. P0 实施清单（必须 1 次会话 ≤2h 落完）

### C1 — 抄 permissions.deny

- **harmony 对照**: `.claude/settings.json:22-28`
- **carbon 落地**: `D:/carbon-shade-web/.claude/settings.json` 在 `permissions` 段加 `deny`：
  ```json
  "deny": [
    "Bash(rm -rf*)",
    "Bash(curl*)",
    "Bash(* | bash*)",
    "Read(**.env)",
    "Read(**secrets**)"
  ]
  ```
- **验收**: 会话内尝试 `Bash(rm -rf foo)` 被拒，提示与 harmony 一致。

### C2 — 加 defaultMode: acceptEdits

- **harmony 对照**: `.claude/settings.json:2`
- **carbon 落地**: settings.json 顶层加 `"defaultMode": "acceptEdits"`
- **验收**: cwd=carbon 时新会话默认进 acceptEdits 模式，Edit/Write 不再弹窗。

### B1.carbon — 副作用 skill 加 disable-model-invocation

- **harmony 对照**: `.claude/skills/auto-commit-cicd/SKILL.md` frontmatter `disable-model-invocation: true`
- **carbon 落地**（2 个文件）:
  - `.claude/skills/closed-loop/SKILL.md` frontmatter 加 `disable-model-invocation: true`
  - `.claude/skills/audit/SKILL.md` frontmatter 加 `disable-model-invocation: true`
- **验收**: prompt "跑闭环" / "audit X"，skill 不自动触发；只有显式 `/closed-loop` / `/audit` 才触发。

### CT2 — 新建 .claudeignore

- **harmony 对照**: `D:/windsulf/.../harmonyos-libretro-emulator/.claudeignore`（包含 `deprecated/legacy/` 等）
- **carbon 落地**: `D:/carbon-shade-web/.claudeignore` 新建：
  ```
  # Build outputs / generated
  dist/
  node_modules/
  .tmp/
  verification/
  bash.exe.stackdump

  # Test artifacts
  playwright-report/
  test-results/

  # Personal AI tooling
  .codex/
  .codex_tmp/
  .windsurf/
  ```
- **验收**: carbon 会话内 Grep `dist/` 不再扫到（除非显式 `--no-claudeignore`）。

### WIN1.carbon — CLAUDE.md 加 Windows 注意事项速查表

- **harmony 对照**: root CLAUDE.md "Windows 注意事项速查"段（W1-W10 表）
- **carbon 落地**: `D:/carbon-shade-web/CLAUDE.md` 末尾或 "Environment" 段（如有）后新增段：
  ```markdown
  ## Windows 注意事项速查

  | # | 坑 | 一句话应对 |
  |---|---|---|
  | W1 | `cmd /c` 包装 stdio MCP | MCP JSON `"command":"cmd","args":["/c","npx","-y","<pkg>"]` |
  | W2 | Git Bash 不在 PATH 时 Claude Code 起不来 | `CLAUDE_CODE_GIT_BASH_PATH=C:\Program Files\Git\bin\bash.exe` |
  | W3 | PowerShell `claude` not recognized | 加 `$env:USERPROFILE\.local\bin` 到 User PATH |
  | W4 | `%USERPROFILE%` vs `~` | PowerShell + Git Bash 用 `~`；CMD 用 `%USERPROFILE%` |
  | W5 | PowerShell 中文 / emoji 乱码 | `chcp 65001; [Console]::OutputEncoding=[Text.Encoding]::UTF8` |
  | W6 | Plan mode Shift+Tab 某些终端 skip | 改按 **Alt+M** 进入 plan mode |
  | W7 | MCP server OAuth 后启动超时 | 启动前 `$env:MCP_TIMEOUT=10000` |
  | W9 | 不知 Claude Code 健康状态 | `/doctor` 或 `claude doctor` |
  ```
- **验收**: `grep -E "W[1-9]" CLAUDE.md | wc -l` ≥ 8。

**P0 实施顺序建议**（每条 ≤20 min）:
1. C1（最快，settings.json 加 5 行）
2. C2（最快，settings.json 加 1 行）
3. B1.carbon（两个 SKILL.md frontmatter 各加 1 行）
4. CT2（新建 .claudeignore）
5. WIN1.carbon（CLAUDE.md 加 1 段表格）

P0 全部完成后 `git add -A && git commit -m "chore(harness): S2 — P0 5 项落地 (C1/C2/B1/CT2/WIN1)"`。

---

## 4. P1 实施清单（分 3-4 次会话，2-4 周窗口）

### S3 会话（≈2h）— "副作用 skill 标准化" 主题

#### SC1 — 副作用 skill 加 allowed-tools

- **harmony 对照**: `.claude/skills/auto-commit-cicd/SKILL.md:5` `allowed-tools: Bash, Read, Grep, Glob, Edit, Write`
- **carbon 落地**: 5 个副作用 skill frontmatter 各加 `allowed-tools`:
  - `closed-loop/SKILL.md`: `Bash, Read, Grep, Glob, Edit, Write, Agent, TaskCreate, TaskUpdate, TaskList, TaskGet`
  - `audit/SKILL.md`: `Bash, Read, Grep, Glob, Agent`（audit 不写代码，去 Edit/Write）
  - `add-action/SKILL.md`: `Read, Grep, Glob, Edit, Write`
  - `dnf-physics-extraction/SKILL.md`: `Bash, Read, Grep, Glob, Edit, Write`
  - `gen-test/SKILL.md`: `Read, Grep, Glob, Write`
  - `verify-all/SKILL.md`: `Bash`（只跑 npm 脚本）
- **验收**: 跑 `/audit X` 时即使 Claude 想 `Edit foo.ts` 也被拒。

#### SC2 — 副作用 skill 加 model: sonnet

- **harmony 对照**: `auto-commit-cicd/SKILL.md:6` `model: sonnet`
- **carbon 落地**: 同 SC1 的 6 个 SKILL.md frontmatter 各加 `model: sonnet`
- **验收**: 触发 `/closed-loop` 时 statusline 显示 sonnet（前提：OS1 完成）。

#### SE1 — settings.json 加项目级 model

- **harmony 对照**: `.claude/settings.json:3` `"model": "sonnet"`
- **carbon 落地**: `.claude/settings.json` 顶层加 `"model": "sonnet"`
- **风险**: 字段在某些版本 Claude Code 可能不识别。**实施前先 `claude doctor` 验证当前版本支持**；如不支持，降级为各 SKILL/agent frontmatter 显式声明（SC2 已覆盖）。

#### AG1 — combat-kernel-reviewer 加 frontmatter

- **harmony 对照**: `napi-boundary-reviewer.md:1-6`:
  ```yaml
  ---
  name: napi-boundary-reviewer
  description: Review NAPI boundary changes in entry/src/main/cpp/app/napi/. Use when files in that directory ... NOT for general C++ review.
  tools: Read, Grep, Glob, Bash
  model: sonnet
  ---
  ```
- **carbon 落地**: `D:/carbon-shade-web/.claude/agents/combat-kernel-reviewer.md` 顶部加 frontmatter:
  ```yaml
  ---
  name: combat-kernel-reviewer
  description: Review changes under src/combat/ for kernel purity and determinism. Use when files in src/combat/ are added, modified, or refactored — focuses on Phaser-isolation, replay determinism, frame-data provenance, hit/damage/status invariants. NOT for src/game/ or src/data/ general TypeScript review.
  tools: Read, Grep, Glob, Bash
  model: sonnet
  ---
  ```
- **验收**: 在 cwd=carbon 时让 Claude "审一下 src/combat/HitResolver2D5.ts"，Claude 自动派 combat-kernel-reviewer agent（不需要用户显式指定）。

**S3 commit message**: `chore(harness): S3 — P1 frontmatter 标准化 (SC1/SC2/SE1/AG1)`

---

### S4 会话（≈2h）— "反馈塔补齐" 主题

#### C3 — Stop hook

- **harmony 对照**: `.claude/stop-hook.sh`（跑 hygiene + regression + idle 时间戳）
- **carbon 落地**: 新建 `.claude/stop-hook.sh`（或 `.mjs`，按 carbon 现有 hook 风格用 .mjs）:
  ```javascript
  // .claude/stop-hook.mjs
  import { execSync } from 'node:child_process';
  import { writeFileSync, mkdirSync } from 'node:fs';
  try {
    execSync('npm run analyze', { stdio: 'inherit', cwd: process.cwd() });
  } catch (e) {
    console.error('[stop-hook] analyze failed, see above');
    process.exit(0); // 不阻塞 stop
  }
  // 盖 idle 时间戳给 UserPromptSubmit 算 gap
  mkdirSync('.claude', { recursive: true });
  writeFileSync('.claude/.last-activity-ts', String(Math.floor(Date.now() / 1000)));
  ```
- **settings.json 追加**:
  ```json
  "Stop": [{ "hooks": [{ "type": "command", "command": "node .claude/stop-hook.mjs" }] }]
  ```
- **验收**: Claude stop 时自动跑 `npm run analyze` + `.claude/.last-activity-ts` 文件被更新。

#### CB2 — idle 自动检测合并到 reset-status.mjs

- **harmony 对照**: `scripts/check/session_idle_detector.sh check` + `.claude/hooks/check-idle-on-prompt.sh`
- **carbon 落地**: 改造 `.claude/hooks/reset-status.mjs`（已绑 UserPromptSubmit），在原逻辑基础上加 idle 检测段:
  ```javascript
  // 加在文件末尾
  import { existsSync, readFileSync } from 'node:fs';
  const tsPath = '.claude/.last-activity-ts';
  const threshold = parseInt(process.env.CLAUDE_DEBRIEF_IDLE_MIN || '15', 10) * 60;
  if (existsSync(tsPath)) {
    const last = parseInt(readFileSync(tsPath, 'utf8').trim(), 10);
    if (Number.isInteger(last)) {
      const gap = Math.floor(Date.now() / 1000) - last;
      if (gap > threshold) {
        console.log(`[auto-detected idle: previous Claude response ended ${Math.floor(gap/60)} min ago. Consider running /session-debrief to capture lessons before context fades.]`);
      }
    }
  }
  // 总是更新时间戳
  import { writeFileSync, mkdirSync } from 'node:fs';
  mkdirSync('.claude', { recursive: true });
  writeFileSync(tsPath, String(Math.floor(Date.now() / 1000)));
  ```
- **验收**: 模拟 16 分钟 idle (`echo $(($(date +%s) - 1000)) > .claude/.last-activity-ts`)，下一次 UserPromptSubmit 产出 `[auto-detected idle:]` sentinel，触发用户级 session-debrief skill 主动询问。

#### FB1.carbon — pre-commit hook

- **harmony 对照**: `.git/hooks/pre-commit`（裸 git hook，跑 `bash scripts/check/quick_signals.sh`）
- **carbon 落地**: 新建 `.git/hooks/pre-commit`（裸文件，chmod +x）:
  ```bash
  #!/usr/bin/env bash
  # carbon pre-commit — runs verify-all gates before allowing commit.
  # Bypass with: git commit --no-verify (use sparingly).
  npm run typecheck && npm run static:test
  ```
  *注*: 不跑全 `verify-all`（含 build），因为 build 太慢；只跑 typecheck + static:test 两道快门。
- **验收**: 命令行手敲 `git commit` 时本地 lint 失败拒提交；`git commit --no-verify` 可跳过。

#### NT1.carbon — Notification hook

- **harmony 对照**: `.claude/hooks/notify.sh`（BurntToast → msg fallback）
- **carbon 落地**: 新建 `.claude/hooks/notify.mjs`:
  ```javascript
  import { execSync } from 'node:child_process';
  let input = '';
  process.stdin.on('data', c => input += c);
  process.stdin.on('end', () => {
    let msg = 'Claude Code event';
    const m = input.match(/"message"\s*:\s*"([^"]*)"/);
    if (m) msg = m[1].slice(0, 100).replace(/'/g, '');
    try {
      const hasBurnt = execSync('powershell.exe -NoProfile -Command "Get-Module -ListAvailable BurntToast"', { encoding: 'utf8' });
      if (hasBurnt.includes('BurntToast')) {
        execSync(`powershell.exe -NoProfile -Command "New-BurntToastNotification -Text 'Claude Code', '${msg}'"`, { stdio: 'ignore' });
      } else {
        execSync(`msg "%USERNAME%" "Claude Code: ${msg}"`, { stdio: 'ignore' });
      }
    } catch { /* swallow */ }
  });
  ```
- **settings.json 追加**:
  ```json
  "Notification": [{ "hooks": [{ "type": "command", "command": "node .claude/hooks/notify.mjs" }] }]
  ```
- **前置条件**: 用户一次性 `powershell -Command "Install-Module BurntToast -Scope CurrentUser -Force"`（与 harmony 一样不自动装）。
- **验收**: 让 Claude 跑 `npm run build`（数十秒），结束时桌面右下角弹通知。

**S4 commit message**: `chore(harness): S4 — P1 反馈塔补齐 (C3/CB2/FB1/NT1)`

---

### S5 会话（≈2h）— "上下文 + 状态可视化" 主题

#### H3.carbon — SessionStart 上下文注入（改造 reset-status）

- **harmony 对照**: `.claude/hooks/session-start.sh`（echo git status + log -3 + 上次 quick_signals 摘要）
- **carbon 落地**: 改造 `.claude/hooks/reset-status.mjs`（已绑 SessionStart），在原"重置 status.json"逻辑后追加 echo:
  ```javascript
  // 在 reset-status.mjs 末尾添加
  import { execSync } from 'node:child_process';
  import { existsSync, readFileSync } from 'node:fs';
  try {
    console.log('=== git status -s ===');
    console.log(execSync('git status -s', { encoding: 'utf8' }).slice(0, 2000));
    console.log('\n=== git log --oneline -3 ===');
    console.log(execSync('git log --oneline -3', { encoding: 'utf8' }));
    if (existsSync('.claude/.last-analyze.txt')) {
      console.log('\n=== last analyze ===');
      console.log(readFileSync('.claude/.last-analyze.txt', 'utf8'));
    }
  } catch { /* silent */ }
  ```
- **stop-hook.mjs 同步**: C3 里的 `npm run analyze` 输出末尾摘要到 `.claude/.last-analyze.txt`（写入用 `tee`-like 重定向）。
- **验收**: 重启 Claude Code、cwd=carbon、新会话开场 prompt "现状如何？"，Claude 立刻知道当前分支 / 最近 3 commit / 上次 analyze 状态，不需要新增 Bash 调用。

#### OS1.carbon — 项目级 statusLine

- **harmony 对照**: `.claude/statusline.sh`（pure bash，输出 `[branch*] qs:PASS idle:Nm`）
- **carbon 落地**: 新建 `.claude/statusline.mjs`（Node 风格，复用现有 status.json）:
  ```javascript
  #!/usr/bin/env node
  import { existsSync, readFileSync } from 'node:fs';
  import { execSync } from 'node:child_process';
  let input = ''; for await (const c of process.stdin) input += c;
  let cwd = process.cwd();
  const m = input.match(/"(?:current_dir|cwd)"\s*:\s*"([^"]*)"/);
  if (m) cwd = m[1];
  try { process.chdir(cwd); } catch {}
  let branch = '?';
  try { branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim() || '?'; } catch {}
  let dirty = '';
  try { if (execSync('git status --porcelain', { encoding: 'utf8' }).trim()) dirty = '*'; } catch {}
  let analyze = '?';
  if (existsSync('.claude/.last-analyze.txt')) {
    const t = readFileSync('.claude/.last-analyze.txt', 'utf8');
    if (/ALL PASS|✓|GREEN/.test(t)) analyze = 'PASS';
    else if (/FAIL|✗|RED/.test(t)) analyze = 'FAIL';
  }
  // 复用 status.json 的 task progress 字段（carbon 独有）
  let task = '';
  if (existsSync('.claude/status.json')) {
    try {
      const s = JSON.parse(readFileSync('.claude/status.json', 'utf8'));
      if (s.task) task = ` ${s.task}`;
    } catch {}
  }
  let idle = '';
  if (existsSync('.claude/.last-activity-ts')) {
    const last = parseInt(readFileSync('.claude/.last-activity-ts', 'utf8'), 10);
    if (Number.isInteger(last)) {
      const gap = Math.floor(Date.now() / 1000) - last;
      if (gap > 60) idle = ` idle:${Math.floor(gap/60)}m`;
    }
  }
  console.log(`[${branch}${dirty}] az:${analyze}${task}${idle}`);
  ```
- **settings.json 追加**:
  ```json
  "statusLine": { "type": "command", "command": "node .claude/statusline.mjs" }
  ```
- **验收**: 状态栏显示 `[main*] az:PASS <task> idle:5m`。

#### PM1+PM2 — CLAUDE.md 加 plan mode 指引 + Alt+M 注记

- **harmony 对照**: root CLAUDE.md W6 速查表 + harness-fusion 附录 F
- **carbon 落地**: `D:/carbon-shade-web/CLAUDE.md` 加段 "When to use plan mode":
  ```markdown
  ## When to use plan mode

  复杂任务**先 /plan**，触发条件：
  - 跨 ≥3 文件改动 / schema 变更 / src/combat/ 内核改动 / replay 哈希影响
  - 重构、重命名跨模块导出
  - security-sensitive（npm scripts / Phaser asset 加载链）

  不需要 /plan：单文件修复 / typo / 单个 frame data 条目调整。

  **Windows 用户**：Shift+Tab 在部分终端 skip plan mode，改用 **Alt+M**（与 WIN1 速查表 W6 一致）。
  ```
- **验收**: `grep -E "plan mode|/plan|Alt\+M" CLAUDE.md | wc -l` ≥ 3。

**S5 commit message**: `chore(harness): S5 — P1 上下文注入 + statusline + plan mode (H3/OS1/PM1/PM2)`

---

### S6 会话（≈1.5h）— "高阶移植 + 收尾" 主题

#### CB1 — 移植 auto-commit-cicd skill

- **harmony 对照**: `D:/windsulf/.../harmonyos-libretro-emulator/.claude/skills/auto-commit-cicd/SKILL.md`
- **carbon 落地**: 新建 `D:/carbon-shade-web/.claude/skills/auto-commit-cicd/SKILL.md`，按 carbon 技术栈适配：
  - frontmatter: `disable-model-invocation: true` + `allowed-tools: Bash(git*), Bash(gh*), Bash(npm run*), Read, Grep, Glob, Edit, Write` + `model: sonnet`
  - Step 2 本地预检改为 `npm run typecheck && npm run static:test`（不跑 build/smoke，太慢）
  - Step 5 监控 CI 改用 carbon 的 GitHub workflow 名（待查 `.github/workflows/` 找出主 CI workflow 名）
  - Step 7 自愈循环常见错误指引按 TS / Phaser / Vite 错误模式重写
- **同目录加** `learnings.md`（B2 一并落）
- **验收**: 用户敲 `/auto-commit-cicd`，skill 走完 commit → push → PR → CI → merge 全流程。

#### B2.carbon — 6 个 skill 各加 learnings.md

- **harmony 对照**: `closed-loop/learnings.md` + `auto-commit-cicd/learnings.md`（append-only 模板）
- **carbon 落地**: 给 closed-loop / audit / verify-all / add-action / dnf-physics-extraction / gen-test 6 个 skill 同目录各加 `learnings.md`（初始模板 + 表头）。
- **CB1 也加一份**（共 7 份 learnings.md）。
- **验收**: 用户级 `session-debrief` 跑完，5 个问题的答案中"哪个 skill 该触发但没触发 / 哪个 skill 验证有效"两条直接 Append 到对应 `learnings.md`。

#### CT5 — combat-kernel-reviewer 加 subagent memory

- **harmony 对照**: `.claude/agents/napi-boundary-reviewer.memory.md`（v2.1.33+ 自动加载）
- **carbon 落地**: 新建 `.claude/agents/combat-kernel-reviewer.memory.md`，内容：
  - Phaser-isolation invariants（src/combat/ 不准 import phaser）
  - Replay determinism patterns（6-int snapshot, hash parity gate）
  - Common mistakes from past reviews（如 velocity 写入路径违规、frame data 缺 sourceProvenance）
  - Patterns to flag in diffs（动态 import / RNG 未 seed / Date.now() 直读）
- **验收**: 让 Claude 派 combat-kernel-reviewer 审一个 src/combat/ 文件，agent 引用 memory.md 中的 invariants。

#### PG1.carbon — plugin marketplace audit

- **harmony 对照**: harness-fusion 附录 J PG1 决策"全部不装，继续自维护"
- **carbon 落地**: 跑 `/plugin marketplace browse` 或 `gh api repos/anthropics/claude-plugins-official/contents/` 查 35 个 internal plugin，列出可能替代 carbon 自维护件的：
  - `commit-commands` plugin vs CB1 移植的 auto-commit-cicd
  - `code-review` plugin vs combat-kernel-reviewer
  - `session-report` plugin vs user-level session-debrief
  - `hookify` / `skill-creator` 通用工具
- **决策记录**：写到本文件 PG1 段下"Status 2026-MM-DD: ..."（参考 harness-fusion-design.md PG1 status 行）
- **验收**: 计划文档多 1 段 audit 结论 + 决策（装 / 不装 / 部分用）。

**S6 commit message**: `chore(harness): S6 — P1 收尾 (CB1/B2/CT5/PG1)`

---

### S4.5（可选）— CT1 评估会话

#### CT1 — 评估 CLAUDE.md 350 行是否需要拆分

- **harmony 对照**: root 102 行 + ets/ 67 行 + cpp/ 50 行 = 分层结构
- **carbon 现状**: 单文件 350 行
- **决策树**:
  - 350 行 < harness-fusion 推荐 ≤200 行的 1.75 倍 → 边界值
  - 若内容已含明确模块边界（如 "Combat kernel" / "Data layer" / "Phaser isolation" 各自独立段）→ **拆**
  - 若全是顶层项目身份 + 全局约束 → **不拆**，标 P2
- **若决定拆**:
  - 拆出 `src/combat/CLAUDE.md`（Combat kernel + Phaser isolation + replay determinism 段）
  - 拆出 `src/data/CLAUDE.md` 或 `src/data/manifest/CLAUDE.md`（versioned manifest + provenance 三级置信度铁律）
  - root CLAUDE.md 用 `@src/combat/CLAUDE.md` `@src/data/CLAUDE.md` 引用（CT3 一并落）
- **验收**:
  - 若拆: `wc -l` 每个 ≤200，且 grep 关键术语（"Phaser isolation" / "sourceProvenance"）在子文件而非 root。
  - 若不拆: 本文件 CT1 段加注 "评估结论: 350 行内容不可分，标 P2 探索"。

---

## 5. P2 探索（条件触发后再做）

| ID | 内容 | 触发条件 |
|---|---|---|
| SE2 | settings.json `additionalDirectories` 加 Phaser 类型源 / DNF 数据真值目录 | Claude 频繁 Read 跨项目目录失败时 |
| SC3 | skill frontmatter `argument-hint` | skill 用户提示不够清晰时 |
| SC4/SC5 | skill 体内嵌 `!cmd` / `@file` 现代化 | 当前手工写"运行 X"足够时不做 |
| WT2 | subagent `isolation: worktree` v2.1.72+ 评估 | Claude Code 升级到 v2.1.72+ 后跑一次验证 |
| OS2 | builtin "detailed" + showCost/showTokens 替代自定义 statusline.mjs | 自维护 statusline 出 bug 时 |
| NT2 | CLAUDE.md 加注 Claude 何时主动调 PushNotification | NT1 hook 稳定 1-2 周后 |
| WIN3 | `/doctor` 嵌入 Stop hook | 长会话出现 Claude Code 健康问题时 |
| CB3 | 完全 headless API 分析 transcript 自动 debrief | session-debrief 手动跑 1 个月稳定后 |

---

## 6. 明确不做（与 harness-fusion 一致）

| 项 | 理由 |
|---|---|
| husky / lefthook | 个人项目尺度差异不显著，避免新 npm devDep |
| commit-msg hook 强制 Conventional Commits | CB1 移植 auto-commit-cicd 已按格式生成 |
| pre-push hook | CI 已覆盖 |
| Agentic pre-commit（Claude SDK） | API token 成本不划算 |
| 5 层反馈塔全做 | ①+②+⑤ 三层够 |
| HTTP hooks / async hooks | 无远程验证服务 |
| Skills 2.0 eval / A-B 测试 | skill 量不够 |
| chained-skills 多 skill 串联 | 个人项目复用度低 |
| `outputStyle` / `apiKeyHelper` / `cleanupPeriodDays` 字段 | 个人偏好层 |
| `env` 项目级 PATH 注入 | harmony memory `feedback_dont_inject_path_to_claude_settings` 警告副作用 |
| 第三方 marketplace plugin | 安全风险（Snyk ToxicSkills 36%） |
| 自建 carbon 项目 plugin | 无分发需求 |
| great_cto 多 agent 编排 | 个人项目过度 |
| fix-agent / agent 递归 | 业界明确反对（trust 失控） |
| 把 dnf-physics-extraction / guard-velocity-writes 反推 harmony | DNF 业务特定 |

---

## 7. 完成后验证清单（cwd=carbon 重启 Claude Code 后）

模仿 harmony 附录 O，S2-S6 全部实施完后逐项验：

| # | 验什么 | 怎么触发 | 期望 |
|---|---|---|---|
| 1 | C1 deny | 让 Claude 跑 `rm -rf foo` | 被拒，提示与 harmony 一致 |
| 2 | C2 acceptEdits | 新会话 Edit/Write | 不弹窗确认 |
| 3 | B1.carbon | prompt "跑闭环 X" | skill 不自动触发；显式 `/closed-loop` 才触发 |
| 4 | CT2 .claudeignore | Grep `dist/` | 不扫到 |
| 5 | WIN1.carbon | `grep -E "W[1-9]" CLAUDE.md` | ≥ 8 行 |
| 6 | C3 Stop hook | 让 Claude stop 后查 `.claude/.last-activity-ts` | mtime 是刚才 |
| 7 | CB2 idle 检测 | 模拟 16min idle，触发 UserPromptSubmit | 注入 `[auto-detected idle:]` sentinel |
| 8 | FB1.carbon | 命令行 `git commit` 引入 typecheck 错 | 提交被拒 |
| 9 | NT1.carbon | `echo '{"message":"test"}' \| node .claude/hooks/notify.mjs` | 弹通知 |
| 10 | H3.carbon | 新会话开场 prompt "现状如何？" | Claude 立刻知道分支 + 3 commit + 上次 analyze |
| 11 | OS1.carbon | 看状态栏 | `[branch*] az:PASS <task> idle:Nm` |
| 12 | SC1+SC2 | 触发 `/closed-loop` 看 statusline | 显示 sonnet |
| 13 | SE1 | 看 statusline 默认 model | sonnet |
| 14 | AG1 | "审一下 src/combat/HitResolver2D5.ts" | Claude 自动派 combat-kernel-reviewer |
| 15 | CB1 | `/auto-commit-cicd` | 走完 commit→push→PR→CI→merge |
| 16 | B2 | 跑 `/session-debrief` 后查 learnings.md | 有 Append |
| 17 | CT5 | 派 combat-kernel-reviewer 审一个文件 | 引用 memory.md invariants |
| 18 | PM1+PM2 | `grep -E "plan mode|Alt\+M" CLAUDE.md` | ≥ 3 行 |
| 19 | PG1 | 本文件 PG1 段 | 有 "Status YYYY-MM-DD" 决策行 |

**全 19 项通过 = harmony 19 项功能在 carbon 完全等价落地**。

---

## 8. 风险与兜底

| 风险 | 兜底 |
|---|---|
| SE1 项目级 `model` 字段 Claude Code 当前版本不识别 | SC2 已在 SKILL.md frontmatter 显式声明 sonnet，兜底有效；本计划 SE1 段已注 "实施前先 `claude doctor` 验证" |
| NT1 BurntToast 未装 | notify.mjs 已写 `msg "%USERNAME%"` fallback，但 fallback 弹的是阻塞 message box 影响 UX，用户需一次性 `Install-Module BurntToast` |
| FB1 pre-commit hook 不在 git tracked（`.git/hooks/` 不版本化） | 设置脚本 `scripts/setup-git-hooks.mjs` 一键 install；README "Setup" 段加一句 "run once: `node scripts/setup-git-hooks.mjs`" |
| H3 改造 reset-status.mjs 时破坏现有 status.json 重置逻辑 | 改造严格按 "原逻辑 + 末尾 append echo" 顺序，不删原代码；先跑 dry-run 一次 `node .claude/hooks/reset-status.mjs` 看 status.json 是否仍正确 |
| CT5 combat-kernel-reviewer.memory.md 内容写错 invariants 误导 review | 第一版从 src/combat/CLAUDE.md（拆出来的）或现有 combat-kernel-reviewer.md body 中提炼，不自创 |
| CT1 拆 CLAUDE.md 时拆得太碎 | 严守"拆完每个文件 ≤200 行且单一主题"；若边拆边发现单主题超 200，停止本次拆分回到 P2 |
| 实施时 cwd 误设为 harmony | 每个 Bash 步骤先 `pwd \| grep carbon-shade-web` 或 `cd D:/carbon-shade-web && pwd`；本计划所有路径都用绝对 `D:/carbon-shade-web/...` |
| auto-commit-cicd 移植后 CI workflow 名/job 名与 harmony 不一致 | S6 实施前先 `gh workflow list` 查 carbon 主 CI workflow 名（推测是 build-dnf-extract.yml 或 ci.yml），按实际名替换 SKILL.md 模板的 `harmonyos-pr-ci.yml` |
| 一次实施跨多会话 context 漂移 | 每个 S 阶段独立 commit，下次会话 `git log --oneline -10` 即可定位上一阶段进度 |

---

## 9. 实施分会话计划

| 阶段 | cwd | 预算 | 范围 | 验收 | 状态 |
|---|---|---|---|---|---|
| **S1（本会话）** | harmony | ≈1.5h | 产出本计划 + 与 harness-fusion-design.md 互相引用 | 本文件 commit | ✅ 2026-05-25（待 commit） |
| **S2** | **carbon** | ≤2h | P0 5 项（C1/C2/B1.carbon/CT2/WIN1.carbon） | 7. 验证清单 #1-#5 通过 | ⏳ pending |
| **S3** | carbon | ≤2h | P1 frontmatter 标准化（SC1/SC2/SE1/AG1） | 验证清单 #12-#14 通过 | ⏳ pending |
| **S4** | carbon | ≤2h | P1 反馈塔（C3/CB2/FB1.carbon/NT1.carbon） | 验证清单 #6-#9 通过 | ⏳ pending |
| **S5** | carbon | ≤2h | P1 上下文 + statusline（H3.carbon/OS1.carbon/PM1+PM2） | 验证清单 #10-#11、#18 通过 | ⏳ pending |
| **S6** | carbon | ≤1.5h | 高阶（CB1/B2/CT5/PG1.carbon） | 验证清单 #15-#17、#19 通过 | ⏳ pending |
| **S4.5（可选）** | carbon | ≤1h | CT1 评估 CLAUDE.md 拆分 | 决策结论写回本文件 | ⏳ 视 S5 时挂 |
| **S7+** | 视情况 | - | P2 探索 8 项（SE2/SC3-5/WT2/OS2/NT2/WIN3/CB3） | 各自条件触发后 | ⏳ 观察期 |

**总预算**: S2-S6 = 9.5h，分摊 2-3 周。

---

## 10. 本计划如何使用（给下次会话的指引）

**开 S2 会话时**（务必 `cd D:/carbon-shade-web`，statusline 看到 `[main*]` 而不是 `[refactor/build-method-split-newarch*]` 才对）:

1. 读本文件第 3 节 P0 5 项
2. 按列出顺序：C1 → C2 → B1.carbon → CT2 → WIN1.carbon
3. 每条按"validation"段手动验证通过才进下一条
4. 全部完成 `git add .claude/settings.json .claude/skills/{closed-loop,audit}/SKILL.md .claudeignore CLAUDE.md && git commit -m "chore(harness): S2 — P0 5 项落地 (C1/C2/B1/CT2/WIN1)"`
5. 更新本文件第 9 节 S2 状态为 "✅ YYYY-MM-DD"

**开 S3-S6 会话时**: 同样模式，按文件第 4 节对应阶段表执行。

**遇到决策歧义时**: 回看第 6 节"明确不做"+ 第 8 节"风险与兜底"——那是计划的 invariant，违反任一条要 stop and ask。

**全部完成后**:
- 按第 7 节"完成后验证清单"逐 19 项跑过
- 更新 harmony 那边 `feedback_individual_project_workflow.md` 或新建 `project_carbon_harness_complete.md` memory，标"两侧 harness 已对齐"
- 更新 harness-fusion-design.md 第 6 节 S3-S6 状态为 "✅ 完成"

---

## 11. 索引

- **源参照**: `D:/windsulf/daugf2527-repos/harmonyos-libretro-emulator/docs/plans/2026-05-24-harness-fusion-design.md`
- **harmony 19 项 commits**:
  - `74e446d` — S2 (P0 harmony 侧 H1+H2+B1)
  - `9944fbb` — S4 B2 + SA1
  - `c0d18bc` — S4 H3 + SE1
  - `fb2c6a4` — S4 NT1 + OS1（S4 全部 12/12 closed）
  - `8441462` — 附录 O wire-up 验证清单
  - `0bb99ce` — 闭环审计 T1-T6 30 findings 修复（与 harness 无关，仅作时间参考）
- **harmony 关键 hook 路径**（参照实现）:
  - `.claude/hooks/session-start.sh` → carbon `reset-status.mjs` 末尾追加
  - `.claude/stop-hook.sh` → carbon `.claude/stop-hook.mjs`
  - `.claude/hooks/notify.sh` → carbon `.claude/hooks/notify.mjs`
  - `.claude/statusline.sh` → carbon `.claude/statusline.mjs`
  - `scripts/check/session_idle_detector.sh` → carbon `reset-status.mjs` 合并
- **个人项目方法论**: harmony memory `feedback_individual_project_workflow`（个人项目砍团队回路）
- **harmony 19 项的"附录 O 验证"经验**: harness-fusion-design.md 附录 O 7 项里 H3/CT3 已经在 SessionStart 会话验证通过，剩 OS1/SE1/CT5/SC1+SC2/NT1 需"真重启 + 真触发"——carbon 实施后照同样口径验

---

## 12. 自审（按 harmony CLAUDE.md "草稿写完立即自审"要求）

> 如果我是用户会挑战哪 3 条？

**Q1: 350 行 CLAUDE.md 真的需要拆吗？拆完 3 个文件总行数可能反而更多（每个 frontmatter / 导引重复）**
答：标 P2 评估而非强制 P1 已经回应了这一点。CT1 段写了决策树："若内容已含明确模块边界 → 拆；若全是顶层项目身份 → 不拆"。S4.5 可选会话单独评估，不进 P0/P1 主路径。

**Q2: NT1 / OS1 / H3 这些"reset-status.mjs 改造"会不会让该文件变成杂物堆？**
答：会有这个风险。CB2（idle 检测）+ H3（git 上下文 echo）+ reset-status 原逻辑（写 status.json）三件事确实塞一起。**接受这个 trade-off**——理由：carbon 已有的 UserPromptSubmit / SessionStart hook 都指向 reset-status.mjs，新增独立文件需改 settings.json 注册多 hook，比合并的复杂度更高。若未来 reset-status.mjs 超过 ~150 行，再拆。

**Q3: auto-commit-cicd 移植到 carbon 是否值得？carbon 已有 closed-loop 止于 commit + 用户手动 push 也能跑**
答：值得，但优先级合理放 S6 最末。理由：(a) carbon CI 在 GitHub Actions，需要 PR 才跑 build-dnf-extract.yml；(b) closed-loop 9 步重审计，auto-commit-cicd 7 步重交付，互补；(c) 移植成本低（按 harmony 模板改 npm script + workflow 名）。但若 S2-S5 跑完发现"手动 push 完全够用"，S6 可以只做 B2/CT5/PG1，CB1 降级 P2。

**其它潜在挑战**:
- 落地路径全用 `D:/carbon-shade-web/...` 绝对路径——好处是跨 cwd 不会错；坏处是不便于 carbon 项目内 hardcoded 文件移动。本计划接受这个 trade-off（实施时 cwd 错位的代价比硬编码大）。
- P0 5 项全是配置文件级改动（settings.json / SKILL.md frontmatter / .claudeignore / CLAUDE.md），单次 2h 时间预算偏宽松，可能 1h 内做完——视为正常 buffer。

---

## 13. DAG + 回退矩阵 + 分支节点（carbon 视图）

> 与 harmony fusion-design.md 附录 P 配套。本节仅列 **carbon 侧 19 项**的内部依赖、局部回退、决策分支。

### 13.1 carbon S2-S6 阶段内依赖 DAG

```mermaid
graph LR
  subgraph S2["S2 P0 (config-only, 全部独立)"]
    C1[C1 deny]
    C2[C2 acceptEdits]
    B1[B1.carbon disable-model-invocation]
    CT2[CT2 .claudeignore]
    WIN1[WIN1.carbon Windows 速查]
  end
  subgraph S3["S3 P1 frontmatter"]
    SC1[SC1 allowed-tools]
    SC2[SC2 model: sonnet]
    SE1[SE1 项目级 model]
    AG1[AG1 combat-kernel-reviewer frontmatter]
  end
  subgraph S4["S4 P1 反馈塔"]
    C3[C3 Stop hook<br/>产出 .last-analyze.txt + .last-activity-ts]
    CB2[CB2 idle 检测<br/>读 .last-activity-ts]
    FB1[FB1 pre-commit]
    NT1[NT1 通知]
  end
  subgraph S5["S5 P1 上下文 + statusline"]
    H3[H3.carbon SessionStart<br/>读 .last-analyze.txt]
    OS1[OS1.carbon statusline<br/>读 .last-analyze.txt + .last-activity-ts]
    PM["PM1+PM2 plan mode 文档"]
  end
  subgraph S6["S6 P1 高阶 + 收尾"]
    CB1[CB1 移植 auto-commit-cicd]
    B2[B2 6 skill learnings.md]
    CT5[CT5 combat-reviewer memory]
    PG1[PG1 marketplace audit]
  end

  C3 --> CB2
  C3 --> H3
  C3 --> OS1
  OS1 -.->|validate| SC2
  B1 --> CB1
  SC1 --> CB1
  SC2 --> CB1
  AG1 --> CT5
```

**关键节点**：
- **C3 是 S4 的拓扑根**——它产出 `.last-analyze.txt` 和 `.last-activity-ts`，S4 的 CB2 + S5 的 H3/OS1 都依赖这两个文件存在。
- **OS1 是 SC2 的验证 enabler**——不通过 OS1 看不出 statusline 的 model 字段是否生效。
- **S2 五项完全独立**——P0 内可乱序，但 S3 以后必须按 DAG 走。

### 13.2 局部回退矩阵（不动 commit）

| ID | 失败现象 | 局部回退 |
|---|---|---|
| C1 | `Bash(rm -rf <legitimate>)` 也被拒 | settings.json `deny` 删那条 pattern |
| C2 | 误改文件没拦住 | settings.json 删 `defaultMode` 行 |
| B1 | `/closed-loop` `/audit` 触发不了 | SKILL.md frontmatter 删 `disable-model-invocation:` |
| CT2 | 需要的 dir 被屏蔽 | .claudeignore 删那行 |
| WIN1 | 无（文档段） | 段删除 |
| SC1 allowed-tools | skill 跑炸说工具被拒 | SKILL.md 加回需要的工具或删 `allowed-tools` 行 |
| SC2 model: sonnet | 错位（如 opus 任务被强降） | SKILL.md 删 `model:` 行（SE1 兜底） |
| SE1 项目级 model | `claude doctor` 报字段不识别 | settings.json 删 `model` 行（SC2 兜底） |
| AG1 combat-reviewer frontmatter | 自动派 agent 频繁误触发 | description 改严"NOT for ..." |
| C3 Stop hook | `npm run analyze` 太慢拖 stop | stop-hook.mjs 改成只写时间戳，不跑 analyze |
| CB2 idle | 注入文案频繁 | reset-status.mjs idle 段注释；或调高 `CLAUDE_DEBRIEF_IDLE_MIN` 环境变量 |
| FB1.carbon pre-commit | 阻 commit 过严 | `chmod -x .git/hooks/pre-commit` 或 `git commit --no-verify` |
| NT1.carbon | BurntToast 错 / 通知狂轰 | settings.json `Notification` hook 段删 |
| H3.carbon | 开场 token 爆 | reset-status.mjs 末尾的 echo 段注释 |
| OS1.carbon | statusline 乱码 | settings.json `statusLine` 字段删 |
| PM1+PM2 | 无（文档段） | 段删除 |
| CB1 | CI 跑炸 / merge 错 | 删 `.claude/skills/auto-commit-cicd/` 目录 |
| B2 learnings | session-debrief append 写错文件 | 删错误的 learnings.md 重建 |
| CT5 | review 引用错误 invariants | 删 `combat-kernel-reviewer.memory.md` |
| PG1 | 无（audit 决策） | 决策行回滚 |

每项也独立 commit → 实在不行 `git revert <sha>`。

### 13.3 carbon 实施时的 if-then 分支节点

实施时这些岔路口必须 stop and decide（与 harmony 附录 P.3 D1-D6 共享，重列 carbon 相关 4 个）：

| 决策点 | 判断 | 主路径 | 分支路径 |
|---|---|---|---|
| **D1 SE1** | `claude doctor` `model` 字段支持？ | 落 `"model": "sonnet"` | 删 SE1，仅 SC2 + 用户级 default 兜底 |
| **D2 BurntToast** | `Get-Module -ListAvailable BurntToast` 有结果？ | `New-BurntToastNotification` | `msg "%USERNAME%"` fallback（阻塞 message box 但能用） |
| **D3 CT1 拆 CLAUDE.md** | 350 行有明确模块边界？ | S4.5 拆 + CT3 @import | CT1 标 P2，不拆 |
| **D4 CB1 移植** | S2-S5 跑完后手动 `git push + gh pr create` 体感够用？ | S6 移植 CB1 | CB1 降级 P2，S6 只做 B2/CT5/PG1 |
| **D5 PG1** | marketplace 有能替代自维护件的 plugin？ | install + 删对应自维护件 | 继续自维护（与 harmony 同走此路） |
| **D6 cwd** | `pwd \| grep carbon-shade-web` 匹配？ | 继续 | 立刻 cd carbon + `git diff` 验证改动没落错仓库 |

### 13.4 闭环反向边（§7 19 项验证失败 → 回到哪一阶段）

| 验证项 | 失败 | 反向流转 |
|---|---|---|
| #1 C1 deny | 拒错 | S2 改 settings.json deny 模式 |
| #6 C3 Stop hook | `.last-activity-ts` 没更新 | S4 改 stop-hook.mjs 写文件逻辑 |
| #7 CB2 idle | sentinel 不输出 | S4 改 reset-status.mjs idle 段（gap 计算 / 阈值） |
| #8 FB1 | commit 没被拒 | S4 重新 chmod +x `.git/hooks/pre-commit` |
| #9 NT1 | 桌面无通知 | 走 D2 分支（msg fallback） |
| #10 H3 | 开场无摘要 | S5 改 reset-status.mjs 末尾 echo；或检查 `.last-analyze.txt` 是否存在（C3 前置） |
| #11 OS1 | statusline 不显 | S5 改 statusline.mjs；字段不支持回 P.2 局部禁用 |
| #12 SC1+SC2 | statusline 看不出 sonnet | 等 OS1 先通过；OS1 通过仍看不出 = 字段不识别，走 D1 |
| #13 SE1 | 字段不识别 | 走 D1（SC2 兜底） |
| #14 AG1 | 不自动派 agent | S3 改 description "Use when ... NOT for ..." 措辞 |
| #15 CB1 | `/auto-commit-cicd` CI 跑炸 | 走 D4（降级 P2） |
| #16 B2 | learnings 没 Append | 检查 session-debrief skill 路径配置 |
| #17 CT5 | review 没引用 memory | 检查 AG1 先通过；通过仍没引用 = 等 Claude Code v2.1.33+ |
| #19 PG1 | 决策行没写 | S6 补写 audit 结论行 |

**与 harmony fusion-design.md 附录 P 互引**：harmony 侧已完成 19 项的 DAG / 回退 / 分支节点在那边；carbon 侧 pending 19 项的同口径表本节给出；两侧合起来才是"完美闭环 + DAG + 可回退 + 分支主干"的全图。

---

> **End of plan v2** (加 §13 后约 540 行)。完整决策点 = P0 5 + P1 13 + P2 8 + 故意不做 15 + 分支决策 6 = 47 项，无 "TBD" 占位。
