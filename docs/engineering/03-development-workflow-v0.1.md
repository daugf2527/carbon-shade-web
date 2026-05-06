# GitHub 开发闭环流程 v0.1

> **Note:** This document was written during the project's initial setup. All references to "ChatGPT" below should be read as **Claude Code**. The workflow principles remain valid. The project is now officially named **碳影 / Carbon Shade** (see `design/02-project-identity-v0.2.md`).
>
> 定位：定义本项目后续如何基于 Claude Code、虚拟沙箱、GitHub、GitHub Actions 进行开发、验证和交付。
> 原则：GitHub 是源码真源头，GitHub Actions 是真实验收环境，虚拟沙箱只做辅助加工。

---

## 1. 角色分工

### 用户

- 提出需求、截图、素材、验收意见
- 判断产品方向、世界观、玩法优先级
- 审核最终效果

### Claude Code

- 分析截图和问题根因
- 读取 GitHub 仓库代码
- 设计修复方案
- 修改文档和代码
- 创建分支、提交 commit、开 PR
- 读取 CI 日志并继续修复
- 维护开发文档与决策记录

### 虚拟沙箱

- 处理临时素材、图片、表格、zip
- 辅助生成脚本或文档
- 做有限的本地静态分析
- 不作为最终构建和验收环境

### GitHub

- 保存源码、文档、素材配置
- 管理分支、PR、Issue、commit 历史
- 作为唯一可信源码位置

### GitHub Actions

- 运行 typecheck、static:test、build
- 上传构建产物和测试报告
- 后续运行 Playwright / 浏览器截图验证
- 作为项目真实验收环境

---

## 2. 标准开发流程

```text
用户提出需求 / 上传截图 / 上传素材
  ↓
AI 分析问题并读取 GitHub 代码
  ↓
先给根因与修复方案
  ↓
确认后创建修复分支或直接提交 docs 小改
  ↓
修改代码 / 文档 / 配置
  ↓
提交 commit
  ↓
GitHub Actions 自动跑验证
  ↓
读取 CI 结果与 artifact
  ↓
失败则继续修复
  ↓
通过后合并或保留稳定版本
```

---

## 3. 分支策略

### master

- 只保留稳定版本
- 不建议频繁直接改动游戏核心代码
- 文档小改可以直接提交，但重要文档也建议后续走 PR

### 修复分支命名

```text
fix/sprite-flicker
fix/player-white-outline
fix/boss-frame-map
ci/add-combat-lab-verification
docs/core-concept-v0-1
feature/external-intelligence-loop
```

### 推荐规则

- 涉及战斗逻辑、渲染、素材、CI 的改动：优先分支 + PR
- 只新增文档、备注、计划：可直接提交 master
- 涉及真实奖励、工具授权、任务结算：必须走 PR 和审查

---

## 4. 当前最小 CI 目标

必须新增：

```text
.github/workflows/combat-lab-ci.yml
```

运行内容：

```bash
npm ci
npm run typecheck
npm run static:test
npm run build
```

上传产物：

```text
dist/
.tmp/static-test-results.json
```

---

## 5. 后续截图验证目标

后续应新增 Playwright 或等效浏览器验证。

验证场景：

1. 页面能打开并进入游戏场景。
2. 主角 idle、walk、run、attack1、attack2、attack3 不闪烁。
3. 怪物 goblin、skeleton、imp 动作和受击帧正确。
4. Boss idle、walk、attack、armor_hit、stagger、death 不错帧。
5. 主角无异常白边。
6. 技能释放不出现整帧白闪。
7. 攻击范围调试线可导出截图，且不遮挡正常模式。

产物：

```text
screenshots/
.tmp/visual-report.json
```

---

## 6. 需求处理规则

### 用户说“先找原因，别改代码”

执行：

1. 只读取代码和资源配置。
2. 输出根因分析。
3. 给出修复方案。
4. 不提交任何代码。

### 用户说“按我们的 GitHub 流程修”

执行：

1. 建分支。
2. 修代码。
3. 提交 commit。
4. 开 PR 或说明直接提交原因。
5. 等待 / 读取 CI。

### 用户说“直接修”

默认仍尽量遵循：

```text
根因 → 修复 → 提交 → CI 验证
```

若改动很小，可直接提交。

---

## 7. 文档维护规则

所有重要判断都应沉淀在 `docs/`。

当前建议文档结构：

```text
docs/
  00-project-mainline-v0.1.md
  01-core-concept-document-v0.1.md
  02-technical-design-document-v0.1.md
  03-development-workflow-v0.1.md
  04-gap-and-roadmap-v0.1.md
```

后续可以补：

```text
docs/worldview/
docs/gameplay/
docs/ai-integration/
docs/visual-verification/
docs/assets/
docs/release/
```

---

## 8. 验收边界

### 当前阶段验收

- 能跑构建
- 能过类型检查
- 能过静态测试
- 能上传产物
- 基础战斗体验无明显错帧、白边、闪烁

### 中期验收

- 有截图验证
- 有 GitHub Pages 预览
- 有可复现的素材验收脚本
- 有第一版外智任务回流 Demo

### 长期验收

- 有 Web 平台
- 有用户与角色数据
- 有任务大厅
- 有工具授权
- 有奖励结算
- 有防刷与审计
- 有插件 / MCP / Skill 接入

---

## 9. 当前优先事项

P0：

1. 建立 GitHub Actions 基础 CI。
2. 上传 dist 和 static-test-results。
3. 修复当前游戏表现问题：怪物 / Boss 闪烁、主角白边、技能闪白、攻击范围表现。
4. ~~明确正式项目名或阶段代号。~~ ✅ 已定名：碳影 / Carbon Shade

P1：

1. Playwright 截图验证。
2. GitHub Pages 预览。
3. 素材验收脚本。
4. 战斗手感调优。

P2：

1. 外智任务 MVP。
2. Web 任务大厅原型。
3. MCP / Skill / VS Code 插件路线。
4. 虚拟收益与风险系统设计。
