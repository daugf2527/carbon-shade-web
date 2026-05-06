# DNF/DFO Research vs Current Combat System Technical Report

> **Status: [CANONICAL]** — 当前代码差距主线，首读决定下一批工程工作

日期：2026-04-29

## 结论摘要

这三份新增研究报告共同指向一个更完整的 DNF/DFO 复刻目标：以版本化客户端数据为真值来源，用 `Script.pvf`、ANI、NPK/IMG、官方 API 与实机回放构成数据链路，再把动作、判定、伤害、状态、AI、反馈、回放都做成可校准的数据驱动系统。

当前项目已经具备一条可继续扩展的战斗内核主线：`Input -> InputBuffer -> requestAction -> ActionEntered -> HitQuery -> HitDecision -> Damage -> Reaction -> HitStop/Recoil -> Replay`。这说明现有架构不是一次性 demo 写法，已经接近研究报告建议的“simulation state 独立于 renderer”的方向。

但当前系统仍处在“手工调参的 Berserker 竖切 demo”阶段，还没有进入“客户端资源抽取 + 版本 profile + 全职业数据仓”的阶段。最重要的缺口不是多写几个技能，而是把现在的手写 `FrameDataAction`、硬编码 damage formula、简化 AI、固定 normalized sprite sheet，升级成报告里要求的版本化数据模型和校准流水线。

## 对比输入

本报告对比以下三份研究报告：

- `docs/research/dnf-dfo-combat-data-model-and-damage-report.md`
- `docs/research/dnf-dfo-combat-extraction-runtime-pipeline-report.md`
- `docs/research/dnf-dfo-combat-frame-ai-implementation-report.md`

当前系统主要对照以下实现：

- `src/combat/kernel/CombatKernel.ts`
- `src/combat/actions/FrameDataAction.ts`
- `src/combat/types.ts`
- `src/combat/hit/HitResolver2D5.ts`
- `src/combat/hit/HitDecisionResolver.ts`
- `src/combat/damage/DamageFormula.ts`
- `src/combat/status/StatusEffectSystem.ts`
- `src/combat/ai/EnemyAI.ts`
- `src/combat/replay/ReplayRecorder.ts`
- `src/game/SpriteFrameLibrary.ts`
- `tests/static/dfo-replica.test.ts`
- `tests/static/hit-shape.test.ts`
- `tests/static/status-profile.test.ts`
- `tests/static/replay-hash.test.ts`
- `docs/planning/dfo-combat-implementation-backlog.md`

## 三份报告的核心要求

### 1. Data Model And Damage Report

这份报告强调“客户端数据格式 + 伤害公式 + 2.5D 判定 + 状态机”的总模型。关键要求是：

- 原始客户端字段不可丢：ANI/PVF 中的帧、盒体、状态位、延迟、flip、clip、sound 等应进入中间数据表。
- 判定采用 2.5D AABB/棱柱体模型，战斗空间至少要有 X、Y、Z 三轴。
- 伤害公式不能写成一个固定公式，要分 classic / modern / PvP / PvE profile。
- 状态、抓取、怪物 AI、仇恨、受击反馈都应成为数据驱动模块。
- 工程上要有 CSV/JSON/Proto 模板，支持未来批量导出和版本切换。

### 2. Extraction Runtime Pipeline Report

这份报告更偏“数据生产流水线”。关键要求是：

- 官方 API 只负责职业、技能、公共元数据清单，不能替代 hitbox/frame data。
- 真正的逐帧数据要从合法取得的客户端中抽取：`Script.pvf`、`stringtable.bin`、`n_string.lst`、`.ani/70ANI`、`ImagePacks2/*.npk`、IMG 帧。
- 抽取结果要形成基础原始表，再投影成 runtime 表。
- hitbox / hurtbox / frame timeline / vfx timeline / skill frame data 应可自动重建。
- 测试体系要覆盖资源解析、坐标镜像、判定重叠、多目标、状态 tick、屏幕反馈和回放稳定性。

### 3. Frame AI Implementation Report

这份报告更偏“落地运行时细节”。关键要求是：

- 动作不是动画图像本身，而是 frame slice + local-space boxes + state flags + object handoff。
- 直接近身技能、子弹/对象型技能、抓取技能需要不同命中去重、hit pause 和取消模型。
- hit stop / recoil / inverse hitstun / downed / airhit / sweep / protection 需要明确规则位。
- AI 应从固定状态机升级为参数化脚本树或行为树，包含目标选择、攻击范围、冷却、随机分支、最后攻击者等字段。
- 网络同步和 replay 要基于确定性 tick、稳定 state hash 和输入日志。

## 当前系统已对齐的部分

### 1. Simulation 与 Rendering 已基本分层

当前 `CombatKernel` 拥有 simulation 状态，Phaser `CombatScene` 只负责固定步进、输入事件注入、渲染刷新、相机、HUD、音效与反馈事件监听。这符合研究报告和浏览器游戏架构里“simulation 不依赖 renderer”的基础要求。

现状评级：已对齐。

继续要求：保持 `CombatKernel` 不依赖 Phaser；未来资源抽取、技能数据、AI 数据也应先进入 combat/data 层，再由 renderer 订阅状态。

### 2. 2.5D 判定核已具备雏形

当前 `Vec3`、`Rect2D5`、`HitResolver2D5` 已经使用 `x/z/y + w/d/h` 表达战斗盒体。`HitResolver2D5` 支持：

- rect 默认判定。
- circle AOE 判定。
- facing 镜像 offset。
- hurt box 与 hit query 分离。

这和报告强调的 2.5D AABB/投影盒体方向一致。

现状评级：部分对齐。

主要缺口：

- `HitboxShape` 类型中已有 `sweep`、`grab_attach`，但碰撞实现只覆盖 `rect` 和 `circle`。
- 当前 actor 只有一个主要 hurt box，没有逐帧 `DAMAGE BOX`。
- hitbox 来源仍是手写数据，不是从 ANI/PVF 抽取的 frame slice。
- 没有保存原始六整数坐标和语义置信度，不满足“原始字段不丢”的要求。

### 3. FrameDataAction 已经可迁移到 timeline/emitter 模型

当前 `FrameDataAction` 同时保留：

- `startup`
- `active`
- `emitters`
- `timeline`
- `recovery`
- `cancelPolicy`
- `hitStopProfile`
- `recoilProfile`
- `rootMotion`
- `armorWindows`
- `invulnerableWindows`
- `costProfile`
- `cooldownProfile`
- `sourcePolicy`

这已经具备向报告所说 `FrameSlice` / `HitEmitter` / `ActionTimeline` 迁移的接口形状。`docs/planning/dfo-combat-implementation-backlog.md` 中 P0 也已经把 `timeline`、`emitters`、shape metadata 和 replay hash 做成已完成项。

现状评级：部分对齐。

主要缺口：

- 当前动作表仍集中在 `src/combat/actions/FrameDataAction.ts`，属于手写 TS 数据。
- `src/data/actions/*.ts` 已存在，但 runtime 主入口还没有真正从版本化 action data manifest 装载。
- `sourcePolicy` 只有粗粒度 `baseline_tuning/community_estimate/original`，还缺少目标版本、客户端 hash、PVF/ANI 文件路径、帧表来源、校准证据等字段。
- 没有对象型技能/投射物 timeline，`RagingFury` 仍是 action active windows 直接生成多段 hitbox，不是 child object / active object 模型。

### 4. Berserker 竖切已有高价值回归测试

`tests/static/dfo-replica.test.ts` 已经把若干 DFO baseline 编码成测试：

- Raging Fury 10 个 blood pillar hit windows。
- Quick Rebound 松手后 18 tick get-up armor。
- Frenzy 支持技能 cooldown reduction 已按 Neople API level-1 样本更新为 10%。
- Frenzy 开启 HP cost。
- Frenzy skill attack multiplier。
- run + X -> `DashAttack`。
- neutral C -> `Jump`。
- jump 中 X -> `JumpAttack`。
- `Bloodlust` grab-immune fallback damage 与 `GrabFailed` 事件。
- `Vim and Vigor` 才允许 `RagingFury` apply Bleed。
- Frenzy 击杀 bleeding target 回 3% max HP。

这符合用户“复刻不是 generic DFO-like”的方向，也符合研究报告中“用可观察事实写验收标准”的要求。

现状评级：已对齐于竖切范围。

主要缺口：

- 测试仍是 Berserker 少量技能，不覆盖全职业/怪物/对象型技能。
- 测试锁的是研究后确定的行为点，不是从客户端版本数据自动生成的 truth table。
- 没有 visual frame parity 测试，也没有逐帧录屏/训练场校准测试。

### 5. 状态系统已从 Bleed 扩展成 profile-driven

当前 `StatusEffectSystem` 已经有 `STATUS_PROFILES`：

- bleed
- poison
- burn
- shock
- rupture

DOT tick 走 `sourceKind: "status_dot"` 和 `reactionPolicy: "status_tick_feedback_only"`，不会触发普通 hit reaction。Burn 有 150px splash。Rupture 通过 `damageMultipliersFor` 进入 direct hit 增伤。

现状评级：部分对齐。

主要缺口：

- `StatusEffectType` 中列出了 stun/freeze/stone/bind/sleep/slow/defense_down/attack_down/curse，但 profile 未实现。
- 没有 resistance/tolerance/remove-level 机制。
- 没有 PvE/PvP profile，也没有 modern DFO 的 Neutralize/Ignite/Groggy 模型。
- 状态触发仍多在 kernel 分支里，例如 `RagingFury` + `vim_and_vigor` apply Bleed，未完全数据化。

### 6. DamageFormula 只是占位，不是 DNF 伤害系统

当前 `DamageFormulaResolver` 支持：

- counter 1.25。
- back attack 1.0，占位记录。
- critical 1.5，但当前 `HitDecisionResolver` 固定 `isCritical:false`。
- extra multipliers，如 Frenzy skill attack、Rupture incoming damage。

这能支撑 demo 和回放可见性，但离报告里的 classic/modern damage bucket 还很远。

现状评级：低到部分对齐。

主要缺口：

- 没有 STR/INT、物攻/魔攻、独立攻击、技能倍率、武器精通、防御、属强/属抗。
- 没有 classic “同类取最大/额外相加/技攻乘算”等 profile。
- 没有 modern `Atk. Increase`、`Final Damage`、cooldown recovery、异常伤害转换等桶。
- 没有 PvE/PvP、版本、职业、技能等级分表。
- 没有暴击率、命中率、回避、抵抗、减伤上限。

### 7. Armor / Grab / Reaction 已有演示级分层

当前有：

- `ArmorResolver`
- `GrabResolver`
- `ReactionResolver`
- `HitStopController`
- `RecoilController`
- `DeathLoop`

actor armor profile 能表达：

- none
- super_armor
- boss_super_armor
- building_armor
- grab/control/damage/hitStop immunity
- temporary invulnerable/get-up armor/super armor flags

现状评级：部分对齐。

主要缺口：

- Super Armor Break、Holding Gauge、Neutralize、Ignite、Groggy 没有实现。
- 抓取成功后没有 hold attach、位移锁定、目标定身、喷发分段、释放动画。
- downed / airhit / sweep / launch decay / infinite combo protection 没有完整规则。
- hit stop 与 recoil 仍以 action profile 简化配置，没有区分 direct hit、object hit、projectile hit、grab hit。

### 8. AI 当前是简单状态机，不是 DNF 脚本树

当前 `EnemyAIController` 支持：

- idle
- approach
- windup
- attacking
- recover
- stunned
- detectRange / loseAggroRange
- attackRange
- preAttackFrames / postCooldown
- moveSpeedPerTick
- z lane tolerance

`src/data/ai/enemyTuning.ts` 已把 grunt/dummy/imp/boss/building 的 AI 参数外置。

现状评级：部分对齐。

主要缺口：

- 没有行为树/脚本节点。
- 没有随机分支、技能冷却选择、最后攻击者、仇恨表、队伍目标、远距离反应概率。
- 只有 `EnemyBasic` 一个攻击动作。
- boss 没有 pattern phase、armor break、groggy、场地交互。

### 9. Replay 已经有确定性回归入口

当前 `ReplayRecorder` 已记录：

- buildHash
- combatSchemaHash
- logicFps
- finalStateHash
- per-frame actor snapshot
- per-frame input snapshot
- per-frame flushed events
- eventCount
- stateHash

并有 `tests/static/replay-hash.test.ts` 验证同一输入序列产生相同 final state hash。

现状评级：已对齐于本地单机 deterministic regression。

主要缺口：

- `buildHash` 默认为 `local-dev`，未接入真实 git commit/package version。
- `combatSchemaHash` 是固定字符串，不是基于 action/status/schema 数据内容生成。
- actor snapshot 不是完整 rollback state。
- 网络同步、服务器权威、输入日志回放还没有进入实现层。

### 10. Sprite/Asset 仍是 demo normalized sheet

当前 `SpriteFrameLibrary` 使用固定 normalized sprite sheets：

- `player_berserker_norm.png`
- `goblin_norm.png`
- `skeleton_shield_norm.png`
- `flying_imp_norm.png`
- `minotaur_boss_norm.png`

动作映射按当前 action/reaction 手写到 frame group，例如 `RagingFury` 映射到 `attack3`，`Bloodlust` 映射到 `attack2`。

现状评级：仅 demo 对齐。

主要缺口：

- 没有从 NPK/IMG/ANI 生成 sprite frame metadata。
- 没有 trimmed atlas/multiatlas，也没有 anchor/pivot metadata。
- `Jump` 映射到 `jump`，但当前 player sheet frames 中没有 `jump` group，实际会 fallback 到 idle。这是视觉 fidelity 缺口。
- hitbox 与 sprite frame 没有关联到同一 source timeline。

## 系统差距总表（含代码级完成度评估）

> 注：以下百分比基于 2026-04-29 代码快照的逐文件行级审计。每个子系统的代码行数、已实现功能、缺口详见 `docs/research/code-level-dnf-replication-gap-assessment.md`。百分比 = 当前实现 / DNF 1:1 全职业复刻所需 × 100%。

| 领域 | 研究报告目标 | 当前系统 | 差距等级 | 代码行数 | 完成度 |
|---|---|---|---|---|---|
| 动作/技能 | FrameSlice + emitters + state flags + object handoff + 2400+ 技能 | 手写 15 个 Berserker 技能 + 1 个敌方动作 | 高 | 97 | 0.6% |
| 伤害公式 | classic/modern/PvE/PvP profile | base × multiplier（仅 counter 1.25、critical 1.5 占位） | 高 | 44 | 5% |
| 判定空间 | 2.5D AABB，逐帧 hit/hurt box | 2.5D rect/circle，单 hurt box | 中 | ~100 | 30% |
| 状态异常 | profile + resistance + tolerance + dispel + modern systems | bleed/poison/burn/shock/rupture DOT（5/14 类型） | 中高 | 104 | 25% |
| 对象型技能 | 子弹/active object 独立生命周期 | 暂无 projectile/object entity | 高 | 0 | 0% |
| 抓取 | grab attach/hold/release/fallback | grab decision + fallback damage | 中高 | ~30 | 15% |
| AI | 脚本树/行为树/仇恨/随机/冷却 | 简单 idle→approach→windup→attacking→recover FSM | 高 | 196 | 15% |
| 反馈 | hit stop/recoil/camera/screen/HP shake/detail controls | hitstop/recoil/camera shake/damage number | 中 | ~120 | 40% |
| Armor | Super Armor Break/Holding/Neutralize/Groggy | none/super_armor/boss_super_armor/building_armor | 中 | ~25 | 35% |
| Replay | deterministic input log + schema hash + network-ready | local stateHash + events + input snapshot | 中 | 70 | 30% |
| Visual asset | NPK/IMG/ANI 派生 atlas + anchors | 5 张 normalized fixed-cell demo sheets | 高 | 461 | 10% |
| 测试 | parser/unit/frame parity/replay/render calibration | 4 个 static kernel tests（约 250 行） | 中 | ~250 | 5% |
| **总计** | | | | **~2,200** | **15-20%** |

## 建议工程路线

### P0：把现有 demo 变成可校准数据系统

目标不是重写引擎，而是把现有手写数据替换成可版本化、可导入、可回放验证的数据格式。

建议任务：

1. 新增 `src/data/combat-schema/` 或 `public/assets/combat-data/`，定义 JSON schema：
   - `ActionDef`
   - `FrameSlice`
   - `HitEmitter`
   - `HurtBoxFrame`
   - `StatusProfile`
   - `DamageProfile`
   - `ActorProfile`
   - `AiPattern`
2. 给 `FrameDataAction` 写 adapter：继续兼容现有 TS 数据，同时能从 JSON manifest 装载。
3. 扩展 `sourcePolicy`：
   - `targetGame`
   - `targetVersion`
   - `clientBuildHash`
   - `sourceFile`
   - `sourceFrameRange`
   - `confidence`
   - `calibrationEvidence`
4. 把 `RagingFury`、`Bloodlust`、`QuickRebound` 先迁移成 JSON 数据，再保持现有 tests 通过。

验收：

- `tests/static/dfo-replica.test.ts` 不改断言仍通过。
- replay final state hash 对同输入保持稳定。
- 新旧 action data adapter 输出一致。

### P1：补齐 hit/hurt frame 与对象技能基础

建议任务：

1. `Actor` 支持逐帧 hurt box，不再只用固定 `hurtBoxes[0]`。
2. `HitResolver2D5` 实现 `sweep`。
3. 引入 `CombatObject` 或 `ActiveObject`：
   - ownerId
   - actionInstanceId
   - lifetime
   - position/root motion
   - emitters
   - alreadyHitByGroup
   - hitStopPolicy
4. 用 `RagingFury` blood pillars 做第一条 object-like 技能竖切。
5. 用 `Bloodlust` 做第一条 `grab_attach` 竖切。

验收：

- Bloodlust 成功抓取目标后，目标进入 `grabbed`，位置/控制被 owner action 管理。
- grab-immune 仍走 fallback damage，并继续记录 `GrabFailed`。
- RagingFury 每个 pillar 的 hit group 仍 replay-readable。

### P2：建立版本化 Damage/Status profile

建议任务：

1. `DamageFormulaResolver` 改成 profile-driven：
   - `classic`
   - `modern`
   - `arena`
   - `demo`
2. Actor stats 增加：
   - STR/INT
   - physical/magical attack
   - independent attack
   - element strength/resist
   - crit rate/crit damage
   - defense
3. Status profile 增加：
   - tolerance/resistance
   - stack rule
   - remove level
   - death policy
   - reaction policy
   - Neutralize/Ignite placeholder。
4. 把 Frenzy / Vim and Vigor / Rupture 从 kernel 分支继续迁移到 profile rule。

验收：

- 旧 demo profile 输出和现有测试一致。
- 新增 classic/modern formula test 只验证结构和样例，不声称全量 DFO 真值。

### P3：AI 从 FSM 过渡到 pattern data

建议任务：

1. 定义 `AiPatternNode`：
   - condition
   - args
   - trueNext/falseNext
   - action
   - weight
   - cooldown
2. 把当前 `EnemyAIController` FSM 保留为 default pattern adapter。
3. 给 boss 增加最小 pattern：
   - approach
   - basic slam
   - armor hit feedback
   - recover
   - phase cooldown
4. 事件上补 `AiDecisionMade`，方便 replay 和 debug layer 观察。

验收：

- `tests/static/enemy-ai.test.ts` 扩展覆盖 pattern selection。
- replay 中能看到 AI 决策事件和 action request。

### P4：资源抽取工具链准备，但不入库官方资产

建议任务：

1. 新建 `tools/dnf-extract/README.md`，明确 clean-room 边界：
   - 不提交 PVF/NPK/IMG 原始文件。
   - 不提交官方图像资产。
   - 只提交自研 schema、抽取脚本接口、空样例和自建 demo 数据。
2. 定义导出格式：
   - `raw_ani_frames.json`
   - `raw_hit_boxes.json`
   - `raw_hurt_boxes.json`
   - `skill_manifest.json`
   - `action_timeline.json`
3. 先做 parser contract tests，用 synthetic fixture 验证 6-int box、delay、frame mirror。

验收：

- 仓库不包含受版权限制资产。
- synthetic fixture 能转成 runtime `ActionDef`。

## 当前最应该先做什么

优先级最高的不是继续堆新技能，而是做“数据系统化”的薄切：

1. 先把 `RagingFury`、`Bloodlust`、`QuickRebound` 从 `FrameDataAction.ts` 中复制出 JSON manifest。
2. 写 adapter 让 runtime 从 manifest 生成当前 `FrameDataAction`。
3. 保持 `dfo-replica`、`hit-shape`、`status-profile`、`replay-hash` 全部通过。
4. 再在这个 manifest 里加 `sourcePolicy`、`frameSource`、`calibrationEvidence`。

这样做的价值是：现有 demo 行为不变，但后续三份研究报告里的 PVF/ANI/对象技能/版本 profile 都有了落点。

## 风险与边界

- 三份研究报告中的 DNF/DFO 官方和社区资料不能直接等价于可商业分发资产。仓库应继续只存自建数据、schema、测试 fixture 和清理后的事实表。
- 当前系统没有接入官方客户端资源，因此不能宣称“1:1 全职业复刻”；只能宣称“已有 Berserker 竖切和 DFO baseline 回归测试”。
- 现有 normalized sprite sheets 是 demo 资产，视觉 fidelity 不能用它证明动作帧准确。
- Damage formula 当前是 demo 公式，不应拿它评估真实 DFO 数值。
- 任何“已对齐 DFO”的说法都必须绑定具体行为点、版本口径和测试证据。

## 最终判断

当前系统适合继续推进，不需要推倒重写。它已经有正确的内核分层、2.5D 判定雏形、状态 profile、replay hash 和 DFO 竖切测试。

下一阶段的工程目标应该从“继续手写技能”切到“让手写技能也走未来资源抽取会使用的数据格式”。只要先完成 action manifest adapter，后面的 hit/hurt frame、object skill、damage profile、AI pattern、asset extraction 都能沿同一条管线落地。
