# Technical Design Document v0.1

> 定位：给程序、TA、运维、AI 开发代理看的施工蓝图。  
> 当前状态：前端 Web 战斗 Demo 有基础，完整平台架构待补。  
> 注意：本文为 v0.1 设计骨架，不代表最终工程已全部实现。

---

## 1. 当前工程边界

当前项目首先是一个 Web 端类 DNF 2.5D 战斗 Demo。

已知技术栈：

- Phaser 3
- TypeScript
- Vite
- Node >= 20
- npm scripts：`dev`、`typecheck`、`build`、`static:test`
- 当前仓库默认分支：`master`
- GitHub 作为源码真源头
- GitHub Actions 计划作为真实构建、测试、截图验证环境

当前 README 中已说明项目从 token-grep 原型转向 typed、module-split 的 combat-kernel 实现，并包含 event bus、input、hit、damage、reaction、armor、status、buff、cooldown、hit stop、recoil、death、debug、replay 等模块方向。

---

## 2. 总体架构愿景

长期架构分为四层：

```text
Web 游戏客户端
  ↓
Web 平台 / 任务大厅 / 角色成长系统
  ↓
AI 工具接入层：MCP / Skill / Claude Code / Codex / VS Code 插件 / GitHub Actions
  ↓
真实任务与收益结算层：任务、产物、验收、返还资源、风险与成本
```

### 当前阶段

当前只要求完成：

```text
Phaser Web 战斗 Demo
  + GitHub 源码管理
  + GitHub Actions 基础验证
  + 后续截图验证
```

### 中期阶段

加入：

```text
任务系统 MVP
  + GitHub CI / PR / 文档产物读取
  + 外智代役概念入口
  + 任务完成后转化为角色资源
```

### 长期阶段

扩展为：

```text
账号系统
角色存档
任务大厅
工具授权
MCP / Skill / 插件接入
虚拟收益结算
Web 平台展示
App 打包
```

---

## 3. 模块与技术选型

### 3.1 游戏客户端

| 模块 | 当前 / 建议技术 |
|---|---|
| 渲染引擎 | Phaser 3 |
| 语言 | TypeScript |
| 构建工具 | Vite |
| 战斗时钟 | Fixed 60Hz simulation |
| 素材 | PNG sprite sheet，normalized fixed-cell spritesheets |
| 输入 | Keyboard first，后续可扩展手柄 |

### 3.2 战斗内核模块

建议保持模块拆分：

- FixedStepSimulation
- EventBus
- Input 模块
- Movement / Locomotion
- Action State Machine
- Hit Detection
- Damage Resolution
- Reaction / Hitstun
- Armor / Guard
- Status / Buff
- Cooldown / Resource
- HitStop
- Recoil / Knockback / Launch
- Death Cleanup Barrier
- Debug Actions
- Replay / Deterministic Scenario

### 3.3 资源与表现模块

当前已有 `SpriteFrameLibrary.ts`，包含 player、goblin、skeleton、imp、boss 等 normalized sprite sheet 的 key、url、cellW、cellH、动作帧表和动作映射。

后续建议拆分：

```text
src/game/assets/SpriteSheetRegistry.ts
src/game/assets/AnimationFrameMap.ts
src/game/assets/ActorVisualProfile.ts
src/game/debug/VisualDiagnostics.ts
```

目的：降低素材错帧、白边、闪烁、Boss 映射错误等问题的定位成本。

### 3.4 Web 平台层：未来

后续可选：

- React / Vue / Svelte 任一前端框架
- REST / GraphQL API
- 用户账号与角色数据
- 任务大厅与工具授权页面
- 任务结果审核页面
- 返还资源展示

当前阶段不急于引入。

### 3.5 AI 工具接入层：未来

优先级建议：

1. GitHub Actions / PR / Commit / Issue
2. Claude Code / Codex CLI 产物读取
3. MCP Server
4. VS Code 插件 / 变种 IDE 插件
5. Skill / Prompt package
6. App / 桌面端打包

---

## 4. 网络同步方案

当前项目不是多人实时游戏，暂不需要帧同步或状态同步。

短期建议：

- 单机本地模拟
- 所有战斗逻辑尽量 deterministic
- 通过 static test 和 screenshot test 验证关键场景

长期若加入多人或排行榜，需要补充：

- 战斗结果校验
- 服务端权威数据
- 反作弊
- 存档签名
- 任务收益防伪

---

## 5. 数据存储设计：未来规划

当前 Demo 没有正式存储系统。

后续平台化时至少需要：

### 5.1 用户与角色

```text
users
characters
character_stats
character_inventory
character_skills
```

### 5.2 任务与外智代役

```text
tasks
ai_task_runs
tool_invocations
review_records
reward_settlements
risk_events
```

### 5.3 成长与代价

```text
progression_events
resource_ledger
external_intelligence_debt
autonomy_score_history
```

### 5.4 工具接入

```text
tool_connections
github_installations
mcp_servers
skill_packages
plugin_clients
```

### 5.5 防刷与审计

```text
audit_logs
reward_claims
anti_abuse_flags
rate_limits
```

---

## 6. 性能指标与优化

### 当前建议指标

| 项目 | 目标 |
|---|---|
| 战斗模拟 | 固定 60Hz |
| 浏览器帧率 | 目标 60fps |
| 首屏加载 | Demo 阶段尽量 < 5s |
| 构建产物 | 可由 GitHub Actions 上传 |
| 操作延迟 | 键盘输入应有即时反馈 |

### 重点优化方向

- sprite sheet 尺寸与 cell 配置正确
- 避免运行时频繁创建纹理或对象
- 避免 tint / alpha / blendMode 导致闪烁或白边
- 角色 origin、offsetY、scale 统一管理
- 攻击范围调试显示可开关，不应遮挡视觉

---

## 7. 安全与反作弊：未来规划

当前 Demo 暂不处理真实奖励安全问题。

一旦接入虚拟收益、CDK、月卡、真实权益，需要至少处理：

- 任务完成证明
- AI 产物验收记录
- 奖励防重复领取
- GitHub / 工具授权安全
- API token 保护
- 任务结果防伪
- 用户刷奖励行为检测
- 日志审计与申诉机制

原则：

> AI 可以代役，但奖励必须可审计；任务可以自动完成，但责任链必须可追溯。

---

## 8. 第三方集成清单

### 当前最优先

| 集成 | 目的 |
|---|---|
| GitHub Actions | 构建、静态测试、产物上传、截图验证 |
| GitHub API | 读取 PR、Issue、Commit、Workflow 结果 |
| GitHub Pages | Web Demo 预览 |

### 中期

| 集成 | 目的 |
|---|---|
| Claude Code | 代码任务代役 |
| Codex CLI | 静态审查、修复建议、代码生成 |
| MCP | 通用工具调用层 |
| VS Code 插件 | 本地开发环境接入 |
| Skill 包 | 不同 AI 客户端可复用任务能力 |

### 长期

| 集成 | 目的 |
|---|---|
| 支付 / 兑换系统 | 虚拟权益、CDK、月卡等 |
| 数据分析 | 留存、任务转化、成长路径 |
| 崩溃上报 | 客户端错误追踪 |
| 日志平台 | 任务、奖励、安全审计 |

---

## 9. 工具链与开发管线

### 当前已有脚本

```bash
npm run dev
npm run typecheck
npm run static:test
npm run build
```

`static:test` 会编译测试并输出 `.tmp/static-test-results.json`。

### 必须补齐的 GitHub Actions

建议新增：

```text
.github/workflows/combat-lab-ci.yml
```

最小 CI：

```text
npm ci
npm run typecheck
npm run static:test
npm run build
upload dist/
upload .tmp/static-test-results.json
```

### 后续截图验证

建议新增：

```text
tests/visual/
scripts/visual-verify.mjs
playwright.config.ts
```

验证目标：

- 游戏能启动
- 主角 idle / walk / attack 动作正常
- 小怪与 Boss 不闪烁
- 主角无异常白边
- 技能释放不闪白、不错帧
- 攻击范围显示可导出截图

---

## 10. 部署与运维

### 当前短期部署

- GitHub Actions 构建产物上传 artifact
- 后续可启用 GitHub Pages 预览

### 中期部署

- Web Demo 静态部署
- 任务平台 API 单独部署
- 用户与任务数据持久化

### 长期部署

- 多区域服务
- 监控面板
- 日志保留
- 任务队列
- 奖励结算队列
- 风控与审计服务

---

## 11. 技术风险与技术债

| 风险 | 当前表现 | 应对 |
|---|---|---|
| 素材错帧 | 主角白边、Boss 闪烁、小怪不对 | 建立素材验收脚本和截图验证 |
| 打击感不足 | 攻击范围像贴身判定，白线不像刀 | 强化 hitbox、帧事件、特效表现 |
| CI 缺失 | 无 GitHub Actions 自动验收 | 先补最小 CI |
| 视觉验证缺失 | 问题靠人工截图发现 | 加 Playwright 截图验证 |
| 世界观与玩法脱节 | 暗线很强，但游戏本体还弱 | 先把战斗 Demo 做稳，再接外智系统 |
| AI 任务系统复杂 | 工具接入、奖励、审计链条长 | 从 GitHub 任务最小闭环开始 |
| 奖励防刷 | 未来真实收益会引发刷奖励 | 早期不接真实权益，先做虚拟道具 |

---

## 12. 当前 TDD 完成度判断

| 模块 | 当前完成度 |
|---|---:|
| 总体架构图 | 25% |
| 模块与技术选型 | 60% |
| 网络同步 | 0% |
| 数据存储 | 5% |
| 性能指标 | 25% |
| 安全反作弊 | 5% |
| 第三方集成 | 5% |
| 工具链与管线 | 40% |
| 部署运维 | 10% |
| 技术风险与债务 | 30% |

---

## 13. 下一步工程优先级

P0：

1. 新增 GitHub Actions 基础 CI。
2. 上传 `dist/` 和 `.tmp/static-test-results.json`。
3. 建立 docs 索引和项目概念文档。
4. 检查并修复当前素材闪烁、白边、Boss 错帧问题。

P1：

1. 增加 Playwright 截图验证。
2. 增加素材验收脚本。
3. 增加 GitHub Pages 预览。
4. 拆分 SpriteFrameLibrary，降低资源配置耦合。

P2：

1. 设计外智任务 MVP 数据结构。
2. 设计任务收益结算规则。
3. 设计 Web 任务大厅原型。
4. 设计 MCP / Skill / VS Code 插件接入规范。
