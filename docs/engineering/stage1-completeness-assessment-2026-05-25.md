# Stage 1 数据完备度综合报告 — 广度扫描 + 6 维度游戏设计审计

**日期**: 2026-05-25
**分支**: `dnf-native`
**用途**: 明天 Windows AI 的行动指南 — 验证静态审计 P0 + 执行 Stage 1.5 补件
**前置依赖**: Windows 上有 `Script.pvf` + `ImagePacks2/` + `tools/dnf-extract.exe`
**验证状态**: ✅ 已动态验证（2026-05-26） — 见 [stage1-completeness-verification-2026-05-26.md](stage1-completeness-verification-2026-05-26.md)

> **关键修正速读**（详见末尾 "## 2026-05-26 验证后修正" 段）：
> - **`.act` 实测在 PVF 中是空容器**（startup/active/recovery 假设推翻）
> - **MobDef.hpMax 字段在但永远 null**（HP 实际由 ability category 缩放生成）
> - 完备度数字勘误：角色 70%→80.6% / 技能 14%→file 99.5%+field 20%
> - `.eqp` → `.equ`（扩展名错）
> - "cancel decoder 被删需恢复" → 已迁移至 SklParser.ts:81-257
> - "goblin move speed=300" → 实为 `sight=300`，move speed=[400,400]

---

## 0. 总览

### 0.1 当前状态一句话

管线流程完整（EXTRACT→PARSE→VALIDATE→LOAD→EXPORT 五阶段全通），但数据覆盖度不足：**PVF 中约 40% 的游戏系统数据已结构化，35% 在 raw 里未解析，25% 永远在引擎二进制里。**

### 0.2 各系统完备度

| 游戏系统 | 完备度 | 可支撑 Stage 2? |
|---------|--------|:--:|
| 角色基础属性 | 70% | 够用 |
| 角色动作/动画 | 55% | 不够 — AniDef 未 inline |
| 技能系统 | 25% | 严重不足 — CD/MP/命令全在 raw |
| 战斗判定 (hitbox) | 40% | 不够 — 基础攻击 hitbox 不全 |
| 伤害计算 | 75% | 够用 |
| 受击反应 | 45% | 不够 — hitstun 表靠 baseline |
| 怪物系统 | 50% | 不够 — 关键字段在 raw |
| 副本结构 | 55% | 勉强够 — spawn 未 unpack |
| 成长/装备 | 20% | 严重不足 — .eqp/.stk 未解析 |
| 打击反馈 | 25% | 不够 |

**总评: 勉强能打 → 完成本报告列出的补件后能打**

---

## 第一部分：广度扫描 — 文件类型 × 解析器覆盖

### 1.1 PVF 文件类型 route 总览

C++ dnf-extract 按扩展名分流为 4 种输出 type：

#### Document 类（除以下三类外的所有扩展名 → `type:"document"`）

| 扩展名 | 文件内容 | JS 解析器 | 对 Stage 2 重要性 |
|--------|---------|----------|:--:|
| `.chr` | 角色属性/动作表 | ✅ ChrParser | 🔴 核心 |
| `.skl` | 技能定义 | ✅ SklParser | 🔴 核心 |
| `.atk` | 攻击参数 | ✅ AtkParser | 🔴 核心 |
| `.mob` | 怪物属性/AI 阈值 | ✅ MobParser | 🔴 核心 |
| `.dgn` | 副本结构 | ✅ DgnParser | 🔴 核心 |
| `.map` | 房间布局/spawn | ✅ MapParser | 🔴 核心 |
| `.etc` | 掉落/装备/物品 | ✅ EtcParser | 🟡 重要 |
| **`.act`** | **动作帧事件时间线** | ❌ **没有** | 🔴 **核心！** |
| **`.eqp`** | **装备属性定义** | ❌ **没有** | 🟡 重要 |
| **`.stk`** | **技能树/技能升级** | ❌ **没有** | 🟡 重要 |
| `.ai` | 怪物 AI 定义 | ❌ 没有 | 🟠 次要 (vestigial) |
| `.aic` | 怪物 AI 编译后 | ❌ 没有 | 🟠 (0 文件) |

#### Text 类（`type:"text"`）

| 扩展名 | JS 解析器 |
|--------|----------|
| `.nut` | ✅ NutExtractor (standalone) |
| `.lst` | ❌ 没有 |
| `.str` | C++ 端已处理 |

#### Binary 类（`type:"binary"`）

| 扩展名 | JS 解析器 |
|--------|----------|
| `.img` | ✅ ImgParser (standalone) |
| `.exe/.dat/.bin/.ogg/.wav/.png/.jpg` | ❌ 不解析（资源文件） |

### 1.2 最大的单个缺口：`.act` 文件

> **❌ 2026-05-26 实测推翻**：抽样 3 个 .act 文件（`creature/ignis/animation/ignis_skill2_teleportstart.act` / `ui/skill/animation/new_notice_effect/skill_new_notice.act` / `worldmap/ui/action/worldmap_balloon.act`）全部只有 `{"name":"motion","attributes":[]}` 一个空 section 或 0 sections。**.act 在 PVF 里就是空容器**。且 `character/swordman/action/attack1.act` **根本不存在**于 PVF。startup/active/recovery 数据**不在 .act 文件中** — 跟 hitstun 表一样硬编码在 DNF.exe 引擎二进制里。本节描述应作废，Stage 1.5 第 8 项废除。

`.act` = 动作帧事件时间线。定义每个动作的 startup/active/recovery 帧阶段、hitstop、super armor 帧区间、音效/特效触发帧。

**当前我们只有 `.ani`（逐帧 hitbox 坐标）和 `.atk`（攻击参数），但没有 `.act`**，所以不知道：
- 哪些帧是 startup / active / recovery
- 哪些帧可以 cancel（cancel*.skl 覆盖了部分但非全部）
- 哪些帧有 super armor
- hitstop 持续多久
- 关键帧事件 flag（音效/特效/震动触发帧）

**明天验证**：用 dnf-extract 提取一个 `.act` 文件（如 `character/swordman/action/attack1.act`），看其 section 结构。如果 `.act` 里有 `[startup]`/`[active]`/`[recovery]` 等 section，这就是最高优先级的新 parser。

---

## 第二部分：6 维度游戏设计审计 — 逐系统缺口

### 2.1 角色系统（ChrDef）

#### ✅ 已有的

- 12 个 scalar 属性：jumpPower(430)、moveSpeed(850)、attackSpeed、castSpeed、weight(68000)、lightResistance(-20)、darkResistance(+20)
- 9 个 per-level growth vector（各 17 级）：hpMax、mpMax、mpRegenSpeed、hitRecovery、physAtk、magAtk、physDef、magDef、inventoryLimit
- 27 个 motion section → .ani 引用映射（motionRefs）
- 武器系统：weaponHitInfo(6×6)、weaponWav(4 shapes)、moduleDamageRate(16×4)
- widthBox（角色碰撞体）

#### ❌ 缺失（PVF 有，parser 未结构化）

| 缺失字段 | 位置 | Stage 2 影响 |
|---------|------|-------------|
| **暴击率** | .chr raw sections（或在 .eqp） | 伤害公式暴击分支无输入 |
| **命中率** | .chr raw sections（或在 .eqp） | 命中判定无基础值 |
| **回避率** | .chr raw sections（或在 .eqp） | 回避判定无基础值 |
| **HP 恢复速度** | .chr 无此 growth vector | 角色自然回血无数据 |
| **火/冰/水抗性** | .chr 某些职业可能有 | 元素抗性不完整（目前只有光暗） |
| **觉醒技能槽位** | `[awakening skill]` section | 觉醒技能无法关联 |

#### ❌ 引擎硬编码（PVF 没有）

- STR/INT → physAtk/magAtk 的换算公式（DNF 用 physAtk 直接值，STR/INT 来自装备加成）
- 暴击基础值（DNF 默认 3%）

#### ⚠️ 可疑数据

- `weight` 标注为 "audio-only"，但实际参与 knockback 物理公式（`v = 4000*F/weight`）
- `hitRecovery` 单位不明确（ms? frames? multiplier?）— 600 的语义决定硬直是 0.6s 还是 10s
- `jumpPower` 单位歧义（H1 px/s vs H2 % scaler）

---

### 2.2 技能系统（SkillDef）

#### ✅ 已有的

- skillType (active/passive)、weaponEffectType (physical/magical)
- purchaseCost (SP)、requiredLevel、maximumLevel
- hasPvp/hasDungeon/hasWarroom/hasDeathTower
- cancelWindow (5 字段，cancel*.skl 专用，Tier-1)
- growtypeMaximumLevel (6 slots)、skillFitnessGrowtype

#### ❌ 缺失（PVF 有，在 raw.sections 里未结构化）

这是**整个 Stage 1 最大的解析欠账区**。`.skl` 的 raw 里包含技能能否释放的全部关键参数：

| section 名 | 内容 | Stage 2 系统 | 优先级 |
|-----------|------|-------------|:--:|
| `[command]` | 按键序列 token，如 `(up)&(skill)` | InputLayer | **P0** |
| `[cool time]` | 冷却时间 `[dungeon_ms, pvp_ms]` | ResourceSystem | **P0** |
| `[consume mp]` | MP 消耗 | ResourceSystem | **P0** |
| `[casting time]` | 施放时间 `[base_ms, lvl20_ms]` | AnimPlayback | **P1** |
| `[level property]` | 逐级数值公式 (9 values) | Skill升级引擎 | **P1** |
| `[level info]` | 逐级具体数值表 | Skill升级引擎 | P1 |
| `[pre required skill]` | 前置技能 `[id, level]` | SkillTree | P1 |
| `[feature skill index]` | 技能引擎分类 ID | SkillTree | P1 |
| `[icon]` | 技能图标 `[atlas, frame, lit_atlas, lit_frame]` | UI | P2 |
| `[consume item]` | 消耗道具（无色等） | ResourceSystem | P2 |
| `[maintain mp]` | 持续 MP 消耗（toggle 技能） | ResourceSystem | P2 |
| `[skill command advantage]` | 命令优先级窗口 | InputLayer | P2 |

#### ❌ 缺失（整个文件类型未解析）

- **`.stk`** 技能树文件 — 技能归属、解锁顺序、tab 组织，**完全没有 parser**
- **`.eqp`** 装备文件 — 武器基础攻击力、防具防御力、属性加成

#### ❌ 技能覆盖度

- swordman ~210 个 .skl，目前已解析 ~30 个 = **14%**
- 觉醒技能 (4 个)：**0%**
- EX 技能：**0%**
- 武器精通被动：**0%**
- 转职特有技能 (~178 个)：**0%**

#### ⚠️ 已知问题

- `name` section 值为空 link("")，实际显示名需查 stringtable.bin
- Cancel 系统：C++ 端已输出 dual-semantics，但 Node 端 `SklAnalyzer.ts` 在 commit `e1f3e0f` 被删，需恢复 ~80 行 TS

---

### 2.3 战斗链（AtkDef + AniDef）

#### ✅ 已有的

**AtkDef**:
- liftUp (px/s)、pushAside (px/s)、damageBonus (%)
- attackKind (physic/magic)、element (none/dark/fire/ice/light)
- hitReaction (none/hit_down/hit_lift_up/hit_horizon)
- causesDown/Stun/Bounce/Stuck (6 个布尔标记)
- knuckBack、hitWav、ignoreWeight、pvpOnly

**AniDef**:
- 逐帧数据：i, x, y, imgId, imgParam, sprite, delay
- 逐帧 hitbox：atk[] / dmg[] (6-int [x1,y1,z1,x2,y2,z2])
- delay=10000 sentinel 事件标记
- framesCount、loop

#### ❌ 缺失

| 缺失项 | 严重度 | 详情 |
|--------|:-----:|------|
| **技能攻击力百分比** | 🔴 P0 | "一刀是 physAtk 的 180%" — 这个 180% 在哪？AtkDef 只有 damageBonus(%)，没有基础倍率。最可能在 .skl 的 `[level property]` 或 per-attack 子层 |
| **技能到 .ani 的映射** | 🔴 P0 | SkillDef 没有 animationPath。映射在 .chr 的 motion table 里。需要接通 .skl → .chr → .ani 的引用链 |
| **hitstun 帧数表** | 🔴 P0 | 引擎二进制硬编码，PVF 没有。当前全靠 local_baseline |
| **launch/gravity 曲线** | 🔴 P0 | 引擎二进制硬编码。DNF_PHYSICS_CONSTANTS 只有全局 gravity=-1500 |
| **hitstop 帧数** | 🟡 P1 | 当前靠硬编码 4 帧 |
| **攻击判定帧区间** | 🟡 P1 | attack1/attack2/hardattack 的 .ani 里**没有显式 atk hitbox**（只有 attack3 和 jumpattack 有）。需靠 .act 或 .atk 反推 |

#### ⚠️ 关键验证项（明天 Windows AI 必做）

1. **提取 swordman 的 attack1.ani / attack2.ani / attack3.ani**，逐帧检查 atk[]/dmg[] 数组，确认哪些帧有判定框
2. **提取 `.act` 文件**（如 `character/swordman/action/attack1.act`），看 section 结构
3. **交叉验证**：同一个攻击的 liftUp 在 .atk 和 .ani 里是否一致

---

### 2.4 怪物系统（MobDef）

#### ✅ 已有的

- name、warlike、sight、weight
- hpMax (PvfVectorFact)
- attackInfo (PvfRef[] → .atk)
- animationRefs (PvfRef[] → .ani)
- category (string[] — 行为标签)

#### ❌ 缺失（PVF raw 里有，parser 未消费）

MobDef 目前只解析了 ~7/30 section = **23% 覆盖率**：

| raw section | goblin 实测值 | 含义 | 优先级 |
|------------|-------------|------|:--:|
| `level` | `[1, 6]` | 怪物等级 (min? base/scale?) | **P0** |
| `attack delay` | 1500 (ms) | 两次攻击最小间隔 | **P0** |
| `move speed` | 300 | 移动速度 px/tick | **P0** |
| `hit recovery` | `[500, 500]` | 硬直恢复时间 (ms) | **P0** |
| `ability category` | `[hp max] * 70`, `[equipment_physical_attack] * 90` | HP/ATK/DEF 百分比缩放因子 | **P0** |
| `attack kind` | 24 个 float/int | 近战/远程判定参数集 | P1 |
| `width` | `[40, 10]` | 碰撞体宽高 | P1 |
| `stuckbonus on damage` | `[0,0,0,0]` | 疑似霸体相关 | P2 |
| `item` | `[1000, 50, 1047, 200, ...]` | 掉落表 (itemId×dropRate) | P2 |
| `common champion drop item` | — | 精英怪掉落 | P2 |

#### ❌ 引擎自研

- AI polling loop 的具体算法
- 寻路/仇恨/视野遮挡
- Boss phase 切换条件

---

### 2.5 副本/场景系统（DgnDef + MapDef）

#### ✅ 已有的

**DgnDef**:
- name、explain、basisLevel、minimumRequiredLevel
- experienceIncreasingPoint、backgroundPos
- size (width × height)、mapSpecification (rows × 3 cols)
- startMap、bossMap
- championLevels、pathgateObjects、eventMonsters
- greedLayout (字符网格)、enteringTitleRefs、imageRefs
- worldmapPatternInfo (原始 attrs)

**MapDef**:
- name、mapType、dungeonId
- 摄像机三级卷轴阈值
- tiles[]、sounds[]、playerNumber
- animationRefs、backgroundAnimation
- monsterSpawns（⚠️ packed 格式，未 unpack）
- monsterAiHints[] ✅
- passiveObjects、specialPassiveObjects（⚠️ packed 格式）
- eventMonsterPositions
- pathgatePos[] (原始坐标)

#### ⚠️ 待解码（PVF 有数据但语义不明）

| 项目 | 当前状态 | 明天做什么 |
|------|---------|-----------|
| **greed 字母表** | 字符已提取 (`"bbnnnnee\r\n jjhhhhmm..."`)，字母→地形类型 mapping 未知 | 对比 3+ 个 .dgn 的 greed 字符串，找出字母分布规律，推测 b=blank/n=normal/e=entrance/h=hall 等 |
| **monsterSpawns unpack** | 原始 PvfAttribute[]，形如 `[count, level, ?, mob_id, x, y, z, ?, ?, "[fixed]", "[normal]"]` | 选 3 个 .map，对比 spawn tuple 格式，写 unpacker |
| **mapSpecification side/idx** | `[side, idx, mapId]` 已提取，但 side 的方向映射未知 | 对比 greed 字符串和 mapSpecification 来验证 |
| **startMap/bossMap 语义** | 2-4 ints，格式不统一 | 同上，交叉验证 |
| **passiveObjects** | packed 格式 `[count? x y type?]` | Sampled 3 .map，对比格式 |

#### ❌ 引擎自研

- 门触发条件（打完怪开/需要钥匙/机关）
- 波次管理（打完一波出下一波）
- Boss 房间门锁定逻辑
- 清场检测→门开放信号
- 陷阱触发/伤害逻辑
- 房间间传送逻辑

---

### 2.6 物理常数（DNF_PHYSICS_CONSTANTS）

#### ✅ 已有的（Tier-1 真值）

```
defaultGravityAccel = -1500 px/s²
forceToVelocityConst = 4000
xNormalMoveVelocity = 143 px/s (at SPEED_VALUE_DEFAULT=1000)
yNormalMoveVelocity = 114 px/s
lightObjectMaxWeight = 60000
middleObjectMaxWeight = 100000
downParamType: 5 种 (value/force/bounceValue/bounceForce/bounce)
knockBackType: 5 种 (normal/strong/weak/none/custom)
zAccelType: 3 种
```

#### ❌ 缺失（引擎硬编码）

- 具体 knockback 距离公式
- Launch 速度曲线（不是常数）
- hitstun 帧数 per 反应类型
- 等级压制修正系数
- 异常状态持续时间公式

---

## 第三部分：Stage 1.5 补件清单（按优先级排序）

以下所有项目都是 **"PVF 里有数据，只需 parser 扩展或 batch 提取"**，不需要逆向 DNF.exe。

### P0 — 明天必做（否则 Stage 2 引擎跑不起来）

| # | 项目 | 具体操作 | 预计耗时 |
|---|------|---------|---------|
| **1** | **AniDef inline 进 EXPORT** | 修改 RuntimeExporter，接受 AniDef[] 输入。至少把 swordman 24 个核心 motion 的 .ani 帧数据 inline 进 `players/swordman.json` 的 `animations` 字段 | 0.5天 |
| **2** | **.skl raw section 结构化** | 在 SklParser 中新增解析：`[command]` → string[]、`[cool time]` → {dungeonMs, pvpMs}、`[consume mp]` → number、`[casting time]` → {baseMs, lvl20Ms} | 0.5天 |
| **3** | **.mob raw section 结构化** | 在 MobParser 中新增解析：level、attack_delay、move_speed、hit_recovery、ability_category（HP/ATK/DEF 的百分比缩放值） | 0.5天 |
| **4** | **全量 swordman .skl batch 提取** | 用 pipeline --pipe 提取 `skill/swordman/*.skl`（~210 个），验证 parse 通过率，修 edge case。目标：80%+ 覆盖率 | 0.5天 |

### P1 — 明天做（提升可玩性到"能打"）

| # | 项目 | 具体操作 | 预计耗时 |
|---|------|---------|---------|
| **5** | **3-5 种怪物全量数据** | batch 提取不同 category 的怪物：goblin（近战杂兵）+ 投掷哥布林（远程）+ 牛头兵（中甲）+ 1 个 boss | 0.5天 |
| **6** | **character/common/ 共享动画** | 提取 death/getup/quickstanding 等的 .ani，验证 hitbox | 0.25天 |
| **7** | **恢复 Node cancel decoder** | 在 `src/data/official/dnf/swordman/cancels.ts` 恢复 ~80 行 TS，解读 5 dual-semantics section → cancel 窗口 | 0.25天 |
| **8** | **`.act` 文件抽样验证** | 提取 3-5 个 .act 文件（attack1, attack3, dashattack），看 section 结构。如果 section 清晰 → 加 ActParser 到 Stage 1.5 范围 | 0.25天 |

### P2 — 后天或择机做

| # | 项目 |
|---|------|
| 9 | `.eqp` parser — 至少提取武器基础攻击力 |
| 10 | `.stk` parser — 技能树结构 |
| 11 | MonsterSpawns unpacker — 结构化 spawn 列表 |
| 12 | MapDef passiveObjects unpacker |
| 13 | greed 字母表解码（跨多个 .dgn 对比） |
| 14 | `.chr` raw sections 扫一遍补暴击/命中/回避/全元素抗性 |

---

## 第四部分：静态审计 P0 验证清单

以下 8 个 P0 问题来自 2026-05-25 的 C++/TS 静态代码审计，**必须用真实 PVF 在 Windows 上动态验证**。详见 `docs/engineering/audit-2026-05-25-full-pipeline-static.md`。

| # | 问题 | 验证方法 | 预期结果 |
|---|------|---------|---------|
| **P0-1** | stringtable +4 偏移可能双重跳过 | 取一个已知韩文技能名（参考 Neople API 或 DFO Wiki），hexdump stringtable_body 对应偏移处的字节，人工解码 CP949→UTF-8 对照 | 若偏移正确则字符串开头是有效韩文；若双跳则开头丢 4 字节 |
| **P0-2** | `read<int32_t>()` 有符号左移 UB | 编译加 `-fsanitize=undefined` 跑一次完整提取 | sanitizer 报 left shift of positive value 则确认 |
| **P0-3** | .ani per-frame property unknown type 不消费数据 | 选 10 个不同类型的 .ani（attack1/attack2/dash/jump/damage1/down 等），在 C++ 端加日志打印每个 property type 到 stderr，统计是否有 2/4/5/6/19/20/21/22 | 期望 0 个 unknown type |
| **P0-4** | NpkFile::read<T>() 不检查 fread 返回值 | 手动截断一个 NPK 末尾 100 字节，跑 `--img --frames` 看是否产生垃圾数据 | 应报错而非产出垃圾 JSON |
| **P0-5** | Zod 无数值范围约束 | 全量跑 pipeline，查 SQLite：`SELECT MIN(value), MAX(value) FROM pvf_files` 等聚合查询 | 期望无 NaN/Infinity/负数 HP |
| **P0-6** | Zod 无数组长度约束 | 同上，查各数组字段长度分布 | 期望无空数组或异常长数组 |
| **P0-7** | worldmapPatternInfo 用 z.unknown() | 查 parse.jsonl 中实际 worldmapPatternInfo 的数据结构 | 期望全是合法 PvfAttribute |
| **P0-8** | extraction_runs INSERT 在事务外 | 故意喂一条 JSON.stringify 会失败的数据 → rollback → 查 extraction_runs 表 | 期望无对应记录 |

---

## 第五部分：明天 Windows AI 执行顺序

### 第一步：环境确认（5 分钟）
- 确认 `Script.pvf` 路径
- 确认 `ImagePacks2/` 目录存在
- 确认 `tools/dnf-extract.exe` 可运行
- 跑 `dnf-extract --pvf Script.pvf --list --filter ".chr"` 验证基本功能

### 第二步：P0 动态验证（1-2 小时）
按第四部分的验证清单逐项执行。重点是 P0-2（UB）、P0-3（ani unknown type）、P0-5/6（Zod 约束）。每项记录结果到 audit 报告对应的行。

### 第三步：数据抽样提取（1 小时）
```bash
# 剑士全量数据
dnf-extract --pvf Script.pvf --batch \
  character/swordman/swordman.chr \
  skill/swordman/*.skl \
  character/swordman/attackinfo/*.atk \
  character/swordman/animation/*.ani

# 怪物样本
dnf-extract --pvf Script.pvf --batch \
  monster/goblin/goblin.mob \
  monster/goblin/attackinfo/*.atk \
  monster/goblin/animation/*.ani

# 副样本本
dnf-extract --pvf Script.pvf --batch \
  dungeon/grimseeker.jungle.dgn \
  map/test_lorien/4.map

# .act 抽样验证
dnf-extract --pvf Script.pvf --batch \
  character/swordman/action/attack1.act \
  character/swordman/action/attack3.act
```

### 第四步：Stage 1.5 补件实施
按第三部分的 P0→P1 顺序，逐项修改 TypeScript parser 并 batch 重跑验证。

### 第五步：产出验证
- `npm run typecheck` 通过
- `npm run static:test` 通过
- `npm run smoke:pipeline` (DNF_PVF_PATH=...) 通过
- dist/data/players/swordman.json 的 `animations` 字段非空
- dist/data/monsters/goblin.json 的 `level`/`moveSpeed`/`attackDelay`/`hitRecovery` 字段存在

---

### A. 角色系统审计
- 9✅ / 4⚠️ / 6❌ 基础属性
- 28 个 motion section → ~22 个映射到显式状态
- death/getup/awakening 动画缺失
- .eqp 完全未解析 → 无装备属性
- **结论：可创建裸体剑士，但关键属性缺失**

### B. 战斗链审计
- 链路能走通，但全靠 local_baseline 硬编码
- .ani 帧数据完整但未被 Stage 2 运行时消费
- 技能攻击力% 是整个伤害链最大的数据断层
- cancel 窗口数据完整（Tier-1 ✅），是最好的一块
- **结论：链能走通但数据可信度分布极不均匀**

### C. 怪物系统审计
- MobDef 解析率 ~23%（7/30 section）
- 8 个关键字段在 raw 但未解析（level/speed/delay/hit_recovery/ability_category/attack_kind/width/drop）
- category 标签系统设计正确，足够覆盖多种怪物类型
- Boss phase 数据在 manifest 层，不在 .mob
- **结论：能创建空壳 actor，但不会动、不会攻击、没有属性**

### D. 副本系统审计
- 房间拓扑骨架完整
- monsterSpawns/passiveObjects 是 packed 原始数组，未 unpack
- greed 字母表未解码
- 门控/波次/触发条件全自研
- **结论：结构骨架能搭，但 spawn 和门控必须自研**

### E. 技能系统审计
- 14% .skl 覆盖（30/210）
- CD/MP/施放时间/命令序列/升级公式全在 raw
- .stk 技能树完全未解析
- Cancel 窗口数据已就绪但 Node decoder 被删
- **结论：技能链除 cancel 外全部断裂**

### F. 制作人总评
- **定级：勉强能打**
- Stage 1.5 五件补样后 → 能打
- 核心风险：P0 数据静默损坏 + 引擎自研 25% 黑盒
- 建议：完成 Stage 1.5 → 第一个集成里程碑 = swordman vs goblin 10秒战斗 loop

---

## 2026-05-26 验证后修正

**验证方法**: 3 个 Opus agent 完成（角色/技能/怪物）+ 主对话亲手补完战斗链 + 副本 + 物理常数。完整结论见 [stage1-completeness-verification-2026-05-26.md](stage1-completeness-verification-2026-05-26.md)。

### 关键勘误（按系统）

| 系统 | 原报告 | 验证实测 | 行动 |
|------|--------|----------|------|
| **2.1 角色 ChrDef** | 完备度 70% / 12 scalar / 27 motion | **80.6% (54/67 sections)** / 11 scalar / swordman 24 motion (parser 支持 28) | 觉醒槽位是 parser 丢非 PVF 缺，可修 |
| **2.2 技能 SkillDef** | 14% (30/210) / 缺 `.eqp` parser | **file 99.5% (205/206)** + field 20% / 真实扩展名 `.equ` (67777 个) | cancel decoder 已迁移到 SklParser.ts:81-257，不需"恢复" |
| **2.3 战斗链** | attack1/attack2/hardattack 无 atk hitbox（疑点） | **实测完全证实**：attack1.ani 10 帧全无 atk[]；attack3.ani i=2,3 有 atk；jumpattack i=2 有 atk | 普通攻击判定不在 .ani，须靠 .atk 反推 |
| **2.4 怪物 MobDef** | 23% (7/30) / hpMax 已有 / goblin move speed=300 | **15-20% per-mob** / **hpMax 字段在但 8/8 mob 都无 hp max section 永远 null** / 实为 sight=300, move speed=[400,400] | **hpMax 失效是隐藏致命缺陷**：HP 实际由 `ability category` `[hp max] * 80%` 缩放生成，parser 没读 → runtime 算不出怪物 HP |
| **2.5 副本** | 路径示例 `dungeon/lorien.dgn` | **不存在**；真实路径 `dungeon/act3/jungle.dgn` 等 | DgnDef 实测 90% (18/20 sections) |
| **2.6 物理常数** | 9 项 Tier-1 真值 | **100% 与代码匹配** | 无需修正 |

### Stage 1.5 P0 补件优先级重排

| 原优先级 | 项目 | 验证后状态 |
|---------|------|-----------|
| 1 | AniDef inline 进 EXPORT | ✅ API 已就绪 (RuntimeExporter aniDefs 可选参数)，只差喂数据 |
| 2 | .skl raw section 结构化 | ✅ 12 项 raw section 全部 confirmed 存在，可执行 |
| 3 | .mob raw section 结构化 | ⚠️ **应升级为第 0 优先**：先补 ability category 解决 hpMax 失效 |
| 4 | 全量 swordman .skl batch | ✅ **已 99.5% 完成**，任务应改写为"提升 typed field 覆盖率从 20% 到 80%" |
| 8 | .act 文件抽样验证 | ❌ **废除**：实测 .act 是空容器 |

### 新增 P0（验证暴露的）

- **MobParser 加 ability category 解析**：5/5 goblin 已验证 raw 有，blocking Stage 2 怪物 HP
- **ChrParser 加 4 个 awakening section**：raw 已有但 parser 丢
- **MobParser fix weight 双维**：当前 firstNumberFact 只取第一维
- **撤销 .act 假设**：Stage 1.5 第 8 项 + 1.2 节描述均需作废

### 完备度数字口径调整建议

把"完备度 X%"拆为两个数：
1. **PVF section 覆盖率** = parser 已映射 section / .X raw 实际出现的 section 总数
2. **战斗系统语义覆盖率** = 战斗需要的字段 / 战斗需要的总字段（含 PVF 之外的引擎硬编码项）

不要把两者混用，否则"角色 70%"这种数字会同时让"PVF 数据缺"和"parser 丢"两个性质不同的问题被混淆。
