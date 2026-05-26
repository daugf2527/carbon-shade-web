# 完备度验证报告 — stage1-completeness-assessment-2026-05-25.md

**验证日期**: 2026-05-26
**验证方法**: 5 个 Opus agent 计划 → 3 个 Opus 完成 + 1 个 Sonnet retry 撞额度失败 + **2 块（战斗链 + 副本）由主对话亲手验证**
**PVF 真值**: `/d/BaiduNetdiskDownload/DNF客户端（2018年2月更新）/地下城与勇士/Script.pvf` (crc32 c0779278, 205MB)
**原报告总评**: "勉强能打", Stage 1.5 五补件后能打
**验证总结**: **大部分覆盖率断言量级正确，但多处口径混用 + 部分关键设想（.act 内容）被实测推翻**

---

## 总览：6 系统判定

| 系统 | 报告完备度 | 验证完备度 | 关键修正 |
|------|----------|----------|---------|
| 2.1 角色 (ChrDef) | 70% "够用" | **80.6% (54/67 sections)** | "12 scalar" 实测 11；觉醒槽位是 parser 丢非 PVF 缺 |
| 2.2 技能 (SkillDef) | 25% / "14% (30/210)" | **file 99.5% (205/206) + field 20%** | 覆盖率严重低估；`.eqp` 应为 `.equ`；cancel decoder 已迁移到 SklParser 不需"恢复" |
| 2.3 战斗链 (AtkDef+AniDef) | 40% / 55% | **AtkDef 100%，AniDef 100%，但 attack1.ani 确实无 atk hitbox** | 报告疑点完全证实 |
| 2.4 怪物 (MobDef) | 50% / "23% (7/30)" | **15-20% per-mob，hpMax 永远 null** | hpMax 字段在但 8/8 mob 无该 section；mob HP 实际由 ability category 缩放生成 |
| 2.5 副本 (DgnDef+MapDef) | 55% "勉强够" | **DgnDef 90% (18/20 sections)** | .dgn 实际路径是 `dungeon/act3/jungle.dgn` 不是 `dungeon/lorien.dgn` |
| 2.6 物理常数 | "Tier-1 真值" | **完全证实** | 所有常数与代码 1:1 匹配 |
| **总评** | "勉强能打" | **"7 个真实坑 + 1 个臆测推翻"** | 见下方"关键修正" |

---

## 2.1 角色系统（ChrDef）— 实测 80.6%

| 断言 | 判定 | 实证 |
|------|------|------|
| 12 个 scalar | **PARTIAL** | ChrDef.ts:65-74 实际 8 PvfFact<number> + job + bodyImagePath + widthBox = **11** |
| jumpPower=430 / moveSpeed=850 / weight=68000 / lightResistance=-20 / darkResistance=+20 | **CONFIRMED** | swordman.chr 实测值与报告一一对齐 |
| 9 个 growth vectors (17 级) | **CONFIRMED** | ChrGrowthDef 9 字段；swordman growth.hpMax.values.length=17 |
| 27 个 motion section | **CLOSE** | MOTION_SECTION_NAMES 常量列 **28**；swordman 实际命中 **24**；最大职业 28 (gunner/mage/priest)；27 是 creatormage 实测 |
| weaponHitInfo (6×6) / weaponWav (4 shapes) / moduleDamageRate (16×4) | **CONFIRMED** | swordman 实测 6 rows / 6 slot stereo+1 null / 16×4 |
| widthBox=[40,10] | **CONFIRMED** | swordman widthBox=[40,10] |
| 暴击率 / 命中率 / 回避率 / HP 回复 / 火冰水抗性缺失 | **CONFIRMED** | .chr raw 67 unique sections 无对应 section（PVF 本身没有） |
| 觉醒技能槽位缺失 | **REFUTED** | .chr raw **有** 4 个 awakening sections (awakening 1/2/name/skill)，parser **未解析** — 这是 parser 缺，不是 PVF 缺 |

**实际 .chr raw section 总数**: 67 (swordman)；parser 已映射 54 → **覆盖率 80.6%** (报告称 70%)

### 关键修正

1. "12 scalar" → 11
2. "27 motion" → swordman 24 / parser 支持 28（需注明口径）
3. **觉醒槽位修正**："PVF 缺" 改为 "raw 存在但 parser 未解析" — 这是 Stage 1.5 一个新增可修复项
4. **完备度 70% 偏低**：按 section 覆盖率 80.6%；建议拆"PVF section 覆盖率"和"战斗系统语义覆盖率"两个数

---

## 2.2 技能系统（SkillDef）— file 99.5% / field 20%

| 断言 | 判定 | 实证 |
|------|------|------|
| skillType/weaponEffectType/purchaseCost/requiredLevel/maximumLevel/has* 标志 | **CONFIRMED** | SklDef.ts/SklParser.ts 全部已实现 |
| cancelWindow 5 字段 | **CONFIRMED** | SklDef.ts:31-42，19/19 cancel-named 技能在 baseline 全部填充 |
| growtypeMaximumLevel (6 slots) / skillFitnessGrowtype | **CONFIRMED** | 205/205 swordman 技能有 |
| **[command]/[cool time]/[consume mp]/[casting time]/[level property]/[level info]/[pre required skill]/[feature skill index]/[icon]/[consume item]/[maintain mp]/[skill command advantage] 12 项缺失** | **全部 CONFIRMED** | raw 中各 4-205 命中（icon 205/205），无 typed 字段 |
| .stk 无 parser | **CONFIRMED** | PVF 内 .stk = 10402 个；`Glob src/**/*Stk*` 无结果 |
| **.eqp 无 parser** | **REFUTED (扩展名错)** | PVF 内 `.eqp` = **0**；真实扩展名是 **`.equ`** (67777 个) |
| **覆盖率 14% (30/210)** | **REFUTED** | PVF 内 swordman `.skl` = **206**；baseline 产出 **205**；**file-level 覆盖率 = 99.5%** |
| **Cancel decoder 在 e1f3e0f 被删需恢复 80 行** | **MISLEADING** | `SklAnalyzer.ts` (363行) 确删，但能力已 **完整迁移** 至 `SklParser.ts:81-257`（dual-semantics 别名 19/19 验证通过） |

### 关键修正

1. **覆盖率 14% 严重低估**：file-level 99.5%，field-level（typed section 数 ÷ raw section 数）约 20%
2. **.eqp → .equ**（扩展名错；PVF 里 0 个 .eqp，实际 67777 个 .equ 无 parser）
3. **cancel decoder 已迁移**，"需恢复" 是 stale 描述

---

## 2.3 战斗链（AtkDef + AniDef）— 报告疑点完全证实

| 断言 | 判定 | 实证 |
|------|------|------|
| AtkDef 字段（liftUp/pushAside/damageBonus/attackKind/element/hitReaction/causesDown/Stun/Bounce/Stuck/knuckBack/hitWav/ignoreWeight/pvpOnly） | **CONFIRMED** | AtkDef.ts:8-31 全部已声明 |
| AniDef 字段（逐帧 i/x/y/imgId/imgParam/sprite/delay + atk[]/dmg[] 6-int + framesCount/loop） | **CONFIRMED** | AniDef.ts:9-115，HitboxRect 6-int 完整 |
| 技能攻击力% 缺失 | **CONFIRMED** | AtkDef 只有 damageBonus(%)，无基础倍率；.skl raw 里的 `[level property]` 包含但未结构化 |
| 技能到 .ani 映射缺失（.skl→.chr→.ani 链） | **CONFIRMED** | `Grep SklDef.ts: animationPath\|animationRef\|animation_path\|animationFile` → **No matches** |
| hitstun 帧表 / launch/gravity 曲线引擎硬编码 | **CONFIRMED** | dnfPhysicsConstants.ts 注释明确："Per-skill launch curves, gravity curves, and hitstun frame tables are not here — those are hardcoded in the C++ engine binary" |
| **attack1.ani 无 atk hitbox（疑点）** | **CONFIRMED — 实测 10 帧全无 atk[]** | 10 帧仅 dmg[]，0 帧 atk[] |
| **attack3.ani 有 atk hitbox** | **CONFIRMED** | 9 帧；i=2/3 有 atk (`[-32,-13,0,179,26,94]` / `[15,-13,1,137,26,138]`) |
| **jumpattack.ani 有 atk hitbox** | **CONFIRMED** | 6 帧；i=2 有 atk (`[13,-13,-11,88,26,167]`) |

### .ani 实测帧 hitbox 表

| 动画 | 总帧数 | 有 atk[] 的帧 | 有 dmg[] 的帧 |
|------|--------|---------------|---------------|
| attack1.ani | 10 | **0** | 10 |
| attack3.ani | 9  | **2** (i=2,3) | 9 |
| jumpattack.ani | 6 | **1** (i=2) | 6 |

**结论**：报告疑点（普通攻击 attack1 无 atk hitbox）**完全被实测证实**。这意味着普通攻击的攻击判定 **不在 .ani 帧数据**里 — 必须靠 .atk 反推、用 dmg 框做双向判定、或者引擎使用 attackInfo 直接生成判定。这是 Stage 2 战斗链最大未解项。

---

## 2.4 怪物系统（MobDef）— hpMax 字段在但永远 null

| 断言 | 判定 | 实证 |
|------|------|------|
| name/warlike/sight/attackInfo/animationRefs/category | **CONFIRMED** | MobParser.ts:25-37 |
| **weight (PvfVectorFact)** | **PARTIAL** | 用 `firstNumberFact` 只取第一维，丢失第二维 `[45000, 45000]` |
| **hpMax (PvfVectorFact)** | **CRITICAL** | 类型存在但 8/8 mob 都无 "hp max" section → 字段永远 null。**Mob HP 实际由 `ability category` 的 `[hp max] * 80%` 缩放生成 → parser 没读 → runtime 算不出怪物 HP** |
| **覆盖率 23% (7/30)** | **数量级正确** | per-mob 实测 5-6/30-36 = 15-20%；8-mob 全集 6/70 = 8.6%；分母虚低 |
| goblin level=[1,6] / attack delay=1500 / hit recovery=[500,500] | **CONFIRMED** | 实测匹配 |
| **goblin move speed=300** | **REFUTED** | 实测 sample.mob `move speed=[400,400]`；**300 是 sight 不是 move speed** |
| ability category 缺失（百分比缩放） | **CONFIRMED** | 5/5 goblin 有，parser 完全没读 |
| attack kind: 24 个 | **PARTIAL** | 实测 12-84 不等 (每槽 12 字段 × 1-7 槽) |
| width / stuckbonus / item / common champion drop item | **CONFIRMED 缺失** | parser 全部没读 |

### 关键修正

1. **hpMax 失效是隐藏致命缺陷**：字段在 → runtime 拿 null → 怪物 HP 算不出。这比"缺 ability category"更紧急
2. weight 改用 vectorFact 取双维
3. "move speed=300" 错误 → 应该是 "sight=300"
4. "attack kind 24" 改为 "12-84 不等"

---

## 2.5 副本（DgnDef + MapDef）— DgnDef 90%

| 断言 | 判定 | 实证 |
|------|------|------|
| DgnDef 字段（name/explain/basisLevel/minimumRequiredLevel/experienceIncreasingPoint/backgroundPos/size/mapSpecification/startMap/bossMap/championLevels/pathgateObjects/eventMonsters/greedLayout/enteringTitleRefs/imageRefs/worldmapPatternInfo） | **CONFIRMED** | DgnDef.ts 完整定义 |
| MapDef 字段 | **CONFIRMED** | MapDef.ts 完整 |
| greed 字母表未解码 / monsterSpawns 未 unpack / mapSpecification side/idx / startMap/bossMap / passiveObjects 待解码 | **CONFIRMED** | DgnDef.ts/MapDef.ts 注释里都标 "Semantics unconfirmed" |

### 实测 .dgn raw section（dungeon/act3/jungle.dgn，20 sections）

`explain, start map, map specification, background pos, entering title, cutscene image, special passive object item, minimap image, event monster, worldmap pattern info, basis level, experience increasing point, boss map, champion, pathgate object, maze info, minimum required level, size, name, greed`

DgnDef cover 18/20 = **90%**（剩 special passive object item 和 maze info 进 raw catch-all）

### .dgn 路径修正

报告示例路径 `dungeon/lorien.dgn` **不存在**；真实路径在 `dungeon/act3/*.dgn`：
- `dungeon/act3/jungle.dgn`、`goddesstemple.dgn`、`bloodhell.dgn`、`breeding.dgn`、`outerwall.dgn`、`2ndbackbone.dgn`、`darkhell.dgn`、`whitenight.dgn`、`1stbackbone.dgn`
- `dungeon/southerndale/grimseeker.dgn`
- `dungeon/act7/gentsouthgate.dgn`、`gentdefence.dgn`、`genteastgate.dgn`

---

## **重磅修正：.act 文件被实测推翻**

**报告第 1.2 节**：".act = 动作帧事件时间线... 定义每个动作的 startup/active/recovery 帧阶段、hitstop、super armor 帧区间、音效/特效触发帧"

**报告第二部分**：".ani 帧数据完整但未被 Stage 2 运行时消费... 需要 .act 文件"

**实测结果（3 个 .act 抽样）**：

| .act 路径 | sections |
|----------|----------|
| `creature/ignis/animation/ignis_skill2_teleportstart.act` | 1 个：`{"name":"motion","attributes":[]}` |
| `ui/skill/animation/new_notice_effect/skill_new_notice.act` | 1 个：`{"name":"motion","attributes":[]}` |
| `worldmap/ui/action/worldmap_balloon.act` | **0 个 section** |

**.act 在 PVF 里就是空容器**！startup/active/recovery / hitstop / super armor 帧表 **不存在于 .act**。

而且报告假设的 `character/swordman/action/attack1.act` **PVF 里根本不存在**（试提取返回 `{"type":"error","error":"not_found"}`）。

**含义**：
- Stage 1.5 P0 第 8 项（.act 抽样验证）**结论已经有了，且是否定的**
- startup/active/recovery 数据**不在 PVF 任何已知文件**里 → 跟 hitstun 表一样，是引擎二进制硬编码
- "技能到 .ani 映射" 链就要更复杂：`.skl → .chr motion table → .ani` 是唯一路径

---

## 2.6 物理常数 — 完全证实

| 常数 | 报告值 | 实测代码值 | 匹配 |
|------|--------|-----------|------|
| defaultGravityAccel | -1500 px/s² | -1500 | ✓ |
| forceToVelocityConst | 4000 | 4000 | ✓ |
| xNormalMoveVelocity | 143 px/s | 143 | ✓ |
| yNormalMoveVelocity | 114 px/s | 114 | ✓ |
| lightObjectMaxWeight | 60000 | 60000 | ✓ |
| middleObjectMaxWeight | 100000 | 100000 | ✓ |
| downParamType | 5 种 | 5 种 (value/force/bounceValue/bounceForce/bounce) | ✓ |
| knockBackType | 5 种 | 5 种 (normal/strong/weak/none/custom) | ✓ |
| zAccelType | 3 种 | 3 种 (gravityWorld/gravityObject/antiGravityObject) | ✓ |

**结论**：物理常数是 Tier-1 真值，100% 准确，无需修正。

---

## Stage 1.5 P0 补件可执行性复核

| # | 项目 | 验证结论 |
|---|------|----------|
| 1 | AniDef inline 进 EXPORT | **可执行**。RuntimeExporter.ts:130 已有 `aniDefs?: ReadonlyArray<AniDef>` 可选参数，:259/291 `playerAnims/monsterAnims` 已就绪，只差喂数据。源码注释明确"Not yet inlined: AniDef. ... runtime can lazy-load" |
| 2 | .skl raw section 结构化 | **可执行**。12 项缺失字段在 raw 里都已验证存在 |
| 3 | .mob raw section 结构化 | **可执行 + 优先级修正**。**hpMax 字段空** 比 "缺 ability category" 更紧急，应作为第 0 优先项 |
| 4 | 全量 swordman .skl batch 提取 | **已 99.5% 完成**。该项报告意图是把覆盖率 14% 提到 80%+，但实测已 99.5%。任务应改写为"提升 field 覆盖率（typed section/raw section）从 20% 到 80%" |
| 8 | .act 文件抽样验证 | **结论否定**。.act 在 PVF 里是空容器，startup/active/recovery 数据不在这里 |

---

## 全部行动清单（优先级排序）

### P0 必修（影响 Stage 2 引擎)
- **修 MobParser 加 ability category 解析**（解决 hpMax 永远 null）
- **修 ChrParser 加 awakening 4 section 解析**（4 个觉醒槽位）
- **重写报告第 1.2 节关于 .act 的描述**，把 startup/active/recovery 等数据归类为"引擎硬编码"
- **修 weight 用 vectorFact 取双维**
- **修 SkillDef field 覆盖率**：12 个 raw section typed 化（command/cooltime/consumemp/casting time/...）

### P1 报告勘误
- 角色系统完备度 70% → 80.6% (按 section 覆盖率)
- 技能系统覆盖率 14% → file 99.5% + field 20%
- 技能 .eqp → .equ
- 怪物系统 23% → 15-20% per-mob
- "goblin move speed=300" → "sight=300, move speed=[400,400]"
- "cancel decoder 在 e1f3e0f 被删需恢复" → "已迁移至 SklParser.ts:81-257，无需恢复"
- ".dgn 路径示例" → 用 `dungeon/act3/jungle.dgn` 等真实路径

### P2 长期
- DgnDef 完善 maze info / special passive object item 进 raw 后的解码
- MapDef monsterSpawns/passiveObjects unpacker
- greed 字母表跨多 .dgn 解码

---

## 验证元数据

- **Verifier agents**: completeness-1 (角色) / completeness-2 (技能) / completeness-4 (怪物) Opus 完成 ✓
- **Sonnet retry 失败**: completeness-3 (战斗链) / completeness-5 (副本) — 撞 5/28 12:26 才恢复的限额
- **手工补完**: 战斗链 + 副本 + .act 实测 + 物理常数核对 由主对话亲手验证
- **总执行时长**: ~30 min (含 sonnet retry 失败 + 手工补完)
- **总 token**: ~280k (3 agents + 手工)
- **报告版本**: v1.0
