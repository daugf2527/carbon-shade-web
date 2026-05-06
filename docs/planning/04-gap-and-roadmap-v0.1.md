# 缺口清单与路线图 v0.1

> 定位：记录当前项目已具备什么、缺什么、下一步优先补什么。
> 依据：当前仓库状态、已有 README / package.json / SpriteFrameLibrary / static-test 脚本，以及已沉淀的世界观与开发流程。
>
> **状态更新 (2026-05-02):** 项目已正式定名 碳影 / Carbon Shade（见 `02-project-identity-v0.2.md`）。Combat Lab 已经历了 0.2-R3 内核工程化、Training Ground R1+R2 手动战斗（~90%）、以及 R3+R4 视觉音效段落（B/C/D 段 ~90-95%、A 段 ~60%、E 段 0%）。叙事层：Dao哲学地基与叙事结构决定已沉淀（见 `02-concept-art-game-design-v0.1.md`）。以下百分比反映 2026-05-02 实际状态。

---

## 1. 当前总体完成度

| 大模块 | 当前具备度 | 说明 |
|---|---:|---|
| 核心创意主线 | 90% | 明暗双线、AI 时代暗线、外智代役逻辑已清晰；Dao哲学地基（智流动性、"自明"重定义、归途=本来无一物）已沉淀；叙事结构决定（主角=掌灯人、战斗=叙事、第四面墙=NPC破墙）已明确 |
| 暗线世界观 | 80% | 智力平权、智力贬值、成长断代、社会重塑、硅涨碳滞等主题已明确；十种人群谱系已定义 |
| 阳面世界观 | 50% | 主角定位（掌灯人→空灯者/无灯人）、归途终点（本来无一物）、第四面墙角色（斩灯人）已确定；仍缺明庭形态（地方vs界面）、具体场景与NPC设计 |
| 类 DNF 2.5D 战斗 Demo | 75% | Phaser Web Demo 已升级为完整 Training Ground：手动移动、AI 敌人、命中反馈、音效、特效 |
| 战斗内核设计 | 80% | 事件驱动内核就位，P0+P1 完成，LocomotionController + EnemyAI + Status/Buff 系统成熟 |
| 素材接入 | 70% | Normalized fixed-cell spritesheets 已稳定运行，无闪烁/白边 |
| GitHub 开发闭环 | 40% | GitHub 可读写，流程已确定，但 CI 尚未落地 |
| GitHub Actions | 0%～5% | 当前尚未发现现成 workflow，需要新增 |
| 截图验证 | 0% | 尚未建立 Playwright / 浏览器截图验证 |
| AI 任务系统 | 10% | 概念明确，工程未落地 |
| Web 平台 | 5% | 仅有方向，无实现 |
| 商业化 / 虚拟奖励 | 5% | 仅有想法，需防刷、合规、审计设计 |
| 正式项目命名 | 100% | 已定名：碳影 / Carbon Shade（见 `02-project-identity-v0.2.md`） |

---

## 2. CCD 缺口清单

### 已具备

- 类 DNF 2.5D 战斗载体方向
- 明暗双线设定
- AI 时代暗线主题
- 核心差异化：真实任务成果回流游戏成长
- 初步玩家画像
- 初步玩法循环
- 概念层风险意识

### 待补

1. ~~正式项目名。~~ ✅ 已定名：碳影 / Carbon Shade（见 `02-project-identity-v0.2.md`）
2. 阳面世界观：为什么这个世界值得进入，主角为什么战斗（主角定位已确定，详见 `02-concept-art-game-design-v0.1.md` 第 8.1 节）。
3. 目标受众细分：年龄、游戏偏好、付费习惯、AI 工具使用程度。
4. 竞品对比：DNF、晶核、暖雪、Hades、挂机/自动化游戏、AI 工具平台。
5. 关键指标假设：D1、D7、付费率、真实任务转化率。
6. 内容量规划：Demo、EA、正式版、赛季。
7. 商业化边界：虚拟道具、CDK、月卡、任务奖励的合规风险。

---

## 3. TDD 缺口清单

### 已具备

- Phaser 3 + TypeScript + Vite 技术栈
- Node >= 20
- 基础 dev / typecheck / build / static:test 脚本
- normalized sprite sheet 映射（SpriteFrameLibrary）
- 完整战斗内核（事件驱动、Status、Buff、AI、Replay）
- README 中已有基础运行与验证说明

### 待补

1. GitHub Actions 基础 CI。
2. Playwright / 浏览器截图验证。
3. GitHub Pages 预览部署。
4. 素材验收脚本。
5. 资源加载与动画帧配置解耦。
6. 战斗内核正式模块文档（spec 已是最完整文档）。
7. Web 平台架构。
8. 数据模型：角色、任务、工具调用、返还资源、灵债、审核记录。
9. 安全与防刷：奖励、任务证明、工具授权、审计链。
10. 外智任务接入标准：GitHub、MCP、Skill、Claude Code、Codex、VS Code。

---

## 4. 游戏本体 P0 缺口

这些优先级最高，因为游戏本体是所有世界观和 AI 系统的载体。

| # | 缺口 | 状态 |
|---|---|---|
| 1 | 主角白边问题 | ✅ 已解决（normalized spritesheets） |
| 2 | 技能释放闪白问题 | ✅ 已解决 |
| 3 | 怪物 / Boss 闪烁问题 | ✅ 已解决 |
| 4 | Boss 素材和动作映射错误 | ✅ 已解决 |
| 5 | 攻击范围过短，像贴身判定 | ⚠️ 待校准（P2 数据校准） |
| 6 | 攻击范围白线不像刀，需要更像斩击轨迹 | ✅ 已解决（武器弧形特效） |
| 7 | 普攻三段差异需要明确 | ✅ 已实现 |
| 8 | 怪物受击反应需要更像动作游戏 | ⚠️ 待 E 段打击感物理 |
| 9 | Boss 霸体、硬直、受击反馈需要稳定 | ✅ 已解决 |
| 10 | 导出截图按钮或调试截图功能需要落地 | ❌ 未实现 |

---

## 5. 工程 P0 缺口

1. 新增 `.github/workflows/combat-lab-ci.yml` ❌
2. CI 运行：`npm ci && npm run typecheck && npm run static:test && npm run build` ❌
3. CI 上传 `dist/` 和 `.tmp/static-test-results.json` ❌
4. README 增加 CI 状态说明 ❌
5. 后续增加 Playwright 截图验证 ❌

---

## 6. 世界观 P0 缺口

保持原文档不变（未触及）。

---

## 7. 路线图

### Phase 0：文档与流程定基线 ✅ 基本完成

目标：把想法从聊天沉淀到仓库。

交付：

- `00-project-mainline-v0.1.md` ✅
- `01-core-concept-document-v0.1.md` ✅
- `02-technical-design-document-v0.1.md` ✅
- `03-development-workflow-v0.1.md` ✅
- `04-gap-and-roadmap-v0.1.md` ✅
- GitHub Actions 基础 CI ❌

### Phase 1：战斗 Demo 稳定 ✅ 基本完成

目标：让游戏本体先站起来。

交付：

- 主角无白边、无异常闪烁 ✅
- 小怪与 Boss 动作正确 ✅
- 普攻三段范围与反馈正确 ✅
- Boss 霸体与受击反馈稳定 ✅
- 静态测试通过 ✅
- 构建产物稳定 ✅
- 基础截图验证 ❌

### Phase 2：阳面世界观与基础成长

目标：让游戏表层可传播、可理解。待启动。

### Phase 3：外智任务 MVP

目标：打通真实任务 → 游戏收益的最小闭环。待启动。

### Phase 4：Web 平台与工具生态

目标：做出任务大厅和工具接入中枢。待启动。

### Phase 5：奖励、社区与发行

目标：向长期产品演进。待启动。

---

## 8. 当前下一步建议

当前（2026-05-02）最实际的建议：

```text
1. E 段打击感物理（velocity 模型 + 击退 + 全场顿）
2. P2 数据校准剩余项（sweep/grab_attach 发射器）
3. GitHub Actions 基础 CI
4. Playwright 截图验证
5. 阳面世界观：明庭形态确定（地方 vs 界面）、场景设计、NPC 设计
6. 外智派遣系统 MVP 工程落地
```
