# Carbon Shade / 碳影 项目 Wiki

> 本 Wiki 基于当前 `master` 分支代码阅读整理，用于帮助项目成员快速理解 `carbon-shade-web` 的目标、架构、运行方式、验证方式和后续维护边界。

## 1. 项目一句话理解

**Carbon Shade / 碳影** 当前是一个基于浏览器的 **2.5D 横版战斗原型 / Combat Lab**。

它的核心目标不是先做完整商业游戏，而是先验证一套类 DNF 横版战斗的底座：

- 2.5D 横版移动与站位；
- 固定 60Hz 战斗 Tick；
- 技能帧数据、起手帧、活跃帧、收招帧；
- 命中判定、伤害、硬直、击退、浮空、倒地、霸体、建筑护甲；
- HitStop、Recoil、受击反馈、伤害数字、VFX；
- 浏览器 Phaser 渲染层与纯 TypeScript 战斗内核分离；
- 静态测试、浏览器 Smoke、运行时证据链共同保证项目可验证。

项目表层是可玩的战斗实验场，深层主题围绕“借力、成长、代价与归途”。

## 2. 当前项目定位

仓库名：`carbon-shade-web`

当前原型名：`Combat Lab`

项目方向：

1. **先做战斗手感验证**  
   当前优先级集中在战斗内核、技能表现、受击反馈、怪物/Boss 行为、素材规范化与测试闭环。

2. **保持渲染和战斗内核解耦**  
   `src/combat/` 是纯 TypeScript 战斗内核，不应直接依赖 Phaser。Phaser 只在 `src/game/` 渲染层使用。

3. **所有关键战斗行为必须可测试**  
   项目不是靠肉眼看效果，而是把帧数据、事件、回放、运行时证据、浏览器 Smoke 都纳入验证流程。

## 3. 技术栈

| 层级 | 技术 | 说明 |
|---|---|---|
| Runtime | Browser | 浏览器运行 2.5D 战斗原型 |
| Rendering | Phaser 3 | 负责场景、精灵、VFX、HUD、摄像机、输入绑定 |
| Language | TypeScript | 战斗内核、工具脚本、测试均以 TS/ESM 为主 |
| Build | Vite | 本地开发服务与前端构建 |
| Tests | Node scripts + Playwright | 静态行为测试、类型检查、浏览器 Smoke |
| Deploy | GitHub Actions + GitHub Pages | CI 验证并部署 Pages |
| Container | Docker Compose | 一键启动 Vite dev server |

## 4. 本地运行

### 4.1 Node 本地运行

```bash
npm install
npm run dev
```

访问：

```text
http://localhost:5173
```

### 4.2 Docker 运行

```bash
docker compose up --build
```

服务端口：

```text
5173:5173
```

## 5. 验证命令

常用稳定验证：

```bash
npm run typecheck
npm run static:test
npm run build
```

资源验证：

```bash
npm run validate:sprites
npm run validate:assets
```

浏览器 Smoke：

```bash
npm run browser:smoke
```

注意：README 中说明，浏览器截图与聚合验证脚本在部分本地 Windows 浏览器进程环境里可能挂住，所以日常代码验证优先使用 `typecheck`、`static:test`、`build`。

## 6. 目录理解

```text
.github/workflows/
  combat-lab-ci.yml              # GitHub Actions CI / Pages 部署

src/combat/
  actions/                       # 技能与动作帧数据
  actors/                        # Actor 创建与初始化
  ai/                            # 敌人 AI
  buffs/                         # Buff 生命周期
  damage/                        # 伤害结算
  death/                         # 死亡与死亡屏障
  debug/                         # Debug Overlay 与命中追踪
  events/                        # 战斗事件总线
  hit/                           # 2.5D 命中判定与命中决策
  input/                         # 浏览器输入、指令解析、输入缓冲
  kernel/                        # CombatKernel 与固定步进模拟
  motion/                        # 移动、RootMotion、PushBox
  reaction/                      # 受击反应、HitStop、Recoil
  replay/                        # 回放记录
  resources/                     # CD / 资源消耗
  status/                        # 异常状态，如 Bleed

src/game/
  CombatScene.ts                 # Phaser 战斗场景
  SpriteFrameLibrary.ts          # 角色动作到规范化精灵帧的映射
  CameraController.ts            # 摄像机跟随/控制
  layers/                        # Debug/渲染层

src/runtime/evidence/
  RuntimeEvidenceCollector.ts    # 运行时证据采集

tests/
  static/                        # 战斗行为静态测试
  static-js/                     # JS 层静态测试
  browser/                       # Playwright 浏览器 Smoke

scripts/
  build/typecheck/static-test    # 项目验证脚本
```

## 7. 核心架构

### 7.1 战斗内核：`CombatKernel`

`src/combat/kernel/CombatKernel.ts` 是项目最核心的文件。

它维护：

- 当前 Tick；
- Actor 列表；
- 输入状态与输入缓冲；
- 事件总线；
- 命中判定；
- 伤害结算；
- 受击反应；
- HitStop / Recoil；
- 冷却与资源；
- Buff / Status；
- PushBox / RootMotion / Locomotion；
- DeathLoop；
- DebugOverlay；
- ReplayRecorder；
- EnemyAI；
- Bloodlust 抓取 hold/attach/release 过程。

当前默认创建的对象包括：

| Actor ID | 类型 | 说明 |
|---|---|---|
| player | player | 玩家角色 |
| grunt | enemy | 普通小怪 |
| dummy | dummy | 骨盾/护甲测试目标 |
| imp | enemy | 飞行小怪 |
| boss | boss | Boss 目标 |
| building | building | 建筑护甲目标 |

### 7.2 固定步进：`FixedStepSimulation`

`FixedStepSimulation` 使用固定 60Hz Tick：

- `tickRate = 1 / 60`
- `maxCatchUpTicks = 4`
- `pauseThresholdMs = 250`

这保证战斗逻辑不直接依赖浏览器帧率。浏览器渲染可以波动，但战斗内核尽量按固定 Tick 推进。

### 7.3 Phaser 渲染层：`CombatScene`

`src/game/CombatScene.ts` 负责：

- 创建 Phaser 场景；
- 创建 `CombatKernel`；
- 创建 `FixedStepSimulation`；
- 绑定键盘输入；
- 同步 Actor 视觉表现；
- 绘制 HUD、DebugOverlay、伤害数字、VFX；
- 响应战斗事件，例如 `HitConfirmed`、`ReactionApplied`、`DamageNumberRequested`、`VfxRequested`；
- 把 `scene` 与 `kernel` 暴露到 `window.combatLab` 方便调试和测试。

重要原则：

> Phaser 可以读战斗快照并画出来，但战斗规则不要写进 Phaser 场景里。

## 8. 战斗动作与技能帧数据

核心数据文件：

```text
src/combat/actions/FrameDataAction.ts
```

每个动作大体包含：

- `actionName`
- `totalFrames`
- `startup`
- `active`
- `recovery`
- `cancelPolicy`
- `hitStopProfile`
- `recoilProfile`
- `rootMotion`
- `feedbackProfile`
- `cooldownProfile`
- `costProfile`
- `sourcePolicy`

当前动作包括：

| 动作 | 说明 |
|---|---|
| NormalBasic1/2/3 | 普通三段攻击 |
| FrenzyBasic1/2/3 | Frenzy 状态下的三段攻击 |
| DashAttack | 奔跑攻击 |
| Jump / JumpAttack | 跳跃与空中攻击 |
| UpwardSlash | 上挑/浮空类技能 |
| MountainousWheel | 山崩/震波类技能 |
| RagingFury | 冲击波 + 多段血柱技能 |
| Bloodlust | 抓取类技能 |
| Backstep | 后跳 |
| QuickRebound | 倒地起身/受身 |
| FrenzyToggle | Frenzy 开关调试动作 |
| Derange / Diehard | Buff/恢复类预留动作 |
| EnemyBasic | 敌人基础攻击 |

### 8.1 RagingFury 当前实现理解

`RagingFury` 当前总帧数为 53。

它包含：

- `rf_shock`：冲击波，活跃帧 10-13；
- `rf_pillar_01` 到 `rf_pillar_10`：血柱，每个 hit group 独立，帧点从 15 到 33；
- 可命中倒地目标；
- 可浮空；
- 有 cube cost；
- 有独立 CD 与全局 CD；
- CD 可被 Frenzy 缩减。

### 8.2 Bloodlust 当前实现理解

`Bloodlust` 当前总帧数为 34。

它包含：

- 抓取 hitbox：`bloodlust_grab`；
- 活跃帧 7-10；
- `hitType = grab`；
- 命中后进入 `GrabAttached`；
- 目标被 attach 到攻击者前方；
- releaseTick 默认是当前 tick + 10；
- 目标进入 `grabbed` 反应状态；
- 释放后走喷发/伤害/VFX 逻辑；
- 对不可抓目标会走失败/fallback 行为。

## 9. 输入系统

输入系统核心文件：

```text
src/combat/input/BrowserInputState.ts
```

输入分为三层：

1. **Raw Input**：浏览器按键状态；
2. **Command Parser**：方向序列 + 按键组合解析；
3. **Input Buffer**：按优先级和过期帧消费动作。

当前常见键位：

| 输入 | 动作 |
|---|---|
| Arrow / WASD | 方向移动 |
| X / J | 普通攻击 |
| Z / K | UpwardSlash |
| C / L | 跳跃；倒地时 QuickRebound；按下方向下时 Backstep |
| F5 | FrenzyToggle |
| F7 | ForceBleed |
| F8 | RunScreenshotScenario |
| F9 | ForceDownPlayer |
| 前前 + Space | Derange |
| 下上 + Z | RagingFury |
| 前前 + Z | Bloodlust |
| 前下 + Z | MountainousWheel |

## 10. 渲染与素材规范

核心文件：

```text
src/game/SpriteFrameLibrary.ts
```

当前使用规范化后的 sprite sheets：

| 角色 | 贴图 key | 说明 |
|---|---|---|
| player | player_berserker_norm | 玩家狂战士占位/规范化素材 |
| goblin | goblin_norm | 普通哥布林 |
| skeleton | skeleton_shield_norm | 骨盾/护甲目标 |
| imp | flying_imp_norm | 飞行小怪 |
| boss | minotaur_boss_norm | Boss 牛头人 |

`SpriteFrameLibrary` 的职责是把：

```text
actor id + 当前 action + reaction + locomotion + tick/localFrame
```

映射到：

```text
sprite key + frame index + scale + offsetY
```

这意味着战斗内核不关心图片帧号，渲染层根据内核状态选择视觉帧。

## 11. 运行时证据链

核心文件：

```text
src/runtime/evidence/RuntimeEvidenceCollector.ts
scripts/assert-runtime-evidence.mjs
```

运行时证据主要采集：

- buildHash；
- 预期加载的资源；
- 已加载资源；
- 失败资源；
- missing asset keys；
- combat scene 是否 ready；
- 当前 tick；
- event count；
- eventTypes 统计；
- replay metadata；
- finalStateHash；
- dynamic manifest 加载情况。

CI 中的浏览器 Smoke 不只是打开页面截图，而是进一步断言：

- `combat.sceneReady` 必须为 true；
- 不能有 missing asset keys；
- 不能有 failed assets；
- 必须存在 finalStateHash；
- 不能有 console/page/request/bad response 错误；
- 未授权 dynamic manifest fallback 不允许通过。

## 12. CI/CD 理解

Workflow 文件：

```text
.github/workflows/combat-lab-ci.yml
```

触发条件：

- push 到 `master`；
- PR 到 `master`；
- 手动 `workflow_dispatch`。

主要 job：

| Job | 说明 |
|---|---|
| Typecheck, Static Test, Build | 安装依赖、边界检查、资源校验、类型检查、静态测试、构建、上传产物 |
| Browser Smoke Test (Playwright) | 安装 Playwright Chromium，运行浏览器 Smoke，断言运行时证据，上传证据产物 |
| Deploy GitHub Pages | master 非 PR 场景部署 GitHub Pages |

CI 里有两个重要架构守卫：

1. `src/combat/` 不允许 import Phaser；
2. velocity 写入只允许出现在指定文件中，避免运动逻辑四处散落。

## 13. 当前质量状态

截至最近一次检查：

- `Combat Lab CI #42` 对应 master 最新提交；
- `Typecheck, Static Test, Build` 成功；
- `Browser Smoke Test (Playwright)` 成功；
- `Deploy GitHub Pages` 成功；
- CI 当前整体健康。

注意项：

- GitHub Actions 提示部分 action 仍使用 Node.js 20 action runtime，后续 GitHub 默认切换 Node.js 24 后需要关注 `actions/checkout`、`actions/setup-node` 是否需要升级。
- README 中引用了 `docs/00-project-mainline-v0.1.md` 与 `docs/01-project-identity.md`，但当前仓库读取时未找到对应文件，需要后续补齐或修正 README 链接。

## 14. 维护原则

### 14.1 战斗规则不要写进 Phaser

新增技能、命中、伤害、受击、CD、Buff、异常状态时，优先修改：

```text
src/combat/
```

Phaser 层只负责显示和反馈。

### 14.2 新技能必须同时补齐三类内容

新增技能时至少补：

1. `FrameDataAction.ts`：帧数据、hitbox、rootMotion、CD、cost；
2. 静态测试：覆盖关键帧、命中、取消、异常目标行为；
3. 渲染反馈：sprite 映射、VFX、音效、HUD/Debug 展示。

### 14.3 任何看起来“只是视觉”的改动也要看证据链

素材、sprite frame、manifest、VFX 都可能影响浏览器 Smoke 和 runtime evidence。

提交前至少跑：

```bash
npm run validate:sprites
npm run validate:assets
npm run typecheck
npm run static:test
npm run build
```

需要确认浏览器真实运行时，再跑：

```bash
npm run browser:smoke
```

## 15. 后续建议 Wiki 页面

当前先落地一页 `Home.md`，后续可以拆成：

```text
docs/wiki/Home.md
docs/wiki/Architecture.md
docs/wiki/Combat-Kernel.md
docs/wiki/Frame-Data.md
docs/wiki/Input-System.md
docs/wiki/Runtime-Evidence.md
docs/wiki/CI-CD.md
docs/wiki/Asset-Pipeline.md
docs/wiki/Development-Checklist.md
```

## 16. 给新成员的最短上手路径

1. 看 README，理解项目主题和运行方式；
2. 跑 `npm install && npm run dev`；
3. 打开 `http://localhost:5173`；
4. 读 `src/combat/actions/FrameDataAction.ts`，理解技能数据怎么写；
5. 读 `src/combat/kernel/CombatKernel.ts`，理解 Tick 流程；
6. 读 `src/game/CombatScene.ts`，理解 Phaser 如何消费内核快照；
7. 跑 `npm run static:test`；
8. 改任何战斗行为前，先补测试再改逻辑。
