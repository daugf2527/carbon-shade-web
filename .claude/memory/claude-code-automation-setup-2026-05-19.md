# Claude Code 自动化配置 (2026-05-19)

## 已配置文件

- `.claude/settings.json` — hooks + permissions
- `.claude/agents/combat-kernel-reviewer.md` — 战斗内核审查 subagent
- `.claude/skills/gen-test/SKILL.md` — 生成符合项目约定的 static test
- `.claude/skills/verify-all/SKILL.md` — 一键三道验证门 (typecheck → static:test → build)
- `.claude/skills/add-action/SKILL.md` — 引导式添加新 FrameDataAction

## Hooks (5个, PreToolUse + PostToolUse)

| Hook | 类型 | 触发条件 | 作用 |
|------|------|----------|------|
| 保护生成目录 | PreToolUse | Edit/Write dist/.tmp/verification/node_modules/ | BLOCK |
| Phaser 边界 | PreToolUse | Edit/Write src/combat/ 含 phaser import | BLOCK |
| Velocity 位置 | PreToolUse | Edit/Write src/combat/ 非允许文件写 .velocity | BLOCK (只允许 ActorFactory/CombatKernel/ReactionResolver/EnemyAI) |
| Lock 文件保护 | PreToolUse | Edit/Write package-lock.json | BLOCK |
| 自动 typecheck | PostToolUse | Edit/Write 任何 .ts 文件 | 跑 tsc --noEmit，失败则警告 |

## Skills 使用方式

- `/gen-test <描述>` — 生成测试，严格遵守：`import { assert } from "./test-utils.js"`、.js 扩展名、用 `assert.ok/equal/deepEqual`（test-utils 只导出 `assert`，不导出零散名）、块作用域隔离、无框架
- `/verify-all` — 顺序执行 typecheck → static:test → build
- `/add-action <ActionName>` — 引导添加 action：类型注册 → hitbox → reaction → cancel → provenance → manifest

## Subagent

- `combat-kernel-reviewer` — 审查 src/combat/ 改动：Phaser 隔离、velocity 位置、确定性(无 Math.random/Date.now)、provenance 完整性、类型安全

## 设计决策依据

- Hooks 对应 CI 中已有的检查（Phaser import boundary、velocity write locations），本地拦截避免 push 后才发现
- gen-test skill 因为项目测试基础设施非常特殊（无框架、standalone Node 执行），约定容易出错
- add-action skill 因为 FrameDataAction 字段多且有 provenance 追踪要求，遗漏任何一步都会导致测试失败
- verify-all 对应 CI 的三道 gate，本地一键跑完
