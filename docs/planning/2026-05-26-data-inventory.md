# Baseline 数据盘点 — 6 Agent 并行扫描 16 个 JSON Shard

> 2026-05-26，6 路 Agent 并行读取 `verification/baseline-shards/` 下全部 JSON 文件后的汇总结论。
> 回答一个问题：**我们现在手里有什么数据？能支撑离线构建系统和在线仿真系统到什么程度？**

---

## 数据总量

```
15 个 JSON shard，总大小 1,342,213 字节 (1.3MB)
manifest 15 条路径全部唯一，sizeBytes 与实际磁盘大小精确匹配
```

### 文件清单

```
players/
├── swordman.json          196,272 ★ 最完整：10 animation + 3 attack + 2 skill inline
├── demonicswordman.json   202,361 ★ 同样完整（继承 swordman，parentJob="swordman"）
├── thief.json             108,893 ☆ 有 chr 结构，animations/attacks/skills 为空
├── fighter.json           105,417 ☆ 同上
├── atfighter.json         126,995 ☆ 同上
├── gunner.json             79,876 ☆ 同上
├── atgunner.json           95,676 ☆ 同上
├── mage.json               87,558 ☆ 同上
├── atm age.json             93,311 ☆ 同上
├── creatormage.json        89,875 ☆ 同上
└── priest.json            130,323 ☆ 同上

monsters/
└── goblin.json             15,998 ☆ 有 mob 结构，attacks/animations 为空

dungeons/
└── jungle.json              6,485 ☆ 有 dgn 结构，maps/monsterRefs 为空

shared/
├── physics.json               510 ★ 10 个物理常数，0 个 Tier-3
└── enums.json               2,663 ★ 6 张枚举表 110 条目，0 个 Tier-3
```

### Schema 统一性

11 个 player shard 的顶层 key **100% 一致**：
```
animations, attacks, chr, etc, job, parentJob, shape_version, skills
```
`chr` 下有 26 个 sub-key，全部职业统一。`etc` 在所有文件中均为 `null`。

---

## 分文件字段清单

### 一、shared/physics.json

10 个物理常数，**全部 Tier-1，无 local_baseline 标记**：

| 常数 | 值 | 含义 |
|------|-----|------|
| defaultGravityAccel | -1500 | 重力加速度 |
| forceToVelocityConst | 4000 | 力→速度转换常数 |
| speedValueDefault | 1000 | 默认速度基准值 |
| xNormalMoveVelocity | 143 | X 轴移动速度 |
| yNormalMoveVelocity | 114 | Y 轴移动速度 |
| hitRecoveryStatusType | 34 | 硬直状态类型 ID |
| meleeHitDelayStatusType | 35 | 近战命中延迟状态 ID |
| downParamType | {value:0, force:1, bounceValue:2, bounceForce:3, bounce:4} | 倒地参数类型 |
| knockBackType | {normal:0, strong:1, weak:2, none:3, custom:4} | 击退类型 |
| zAccelType | {gravityWorld:0, gravityObject:1, antiGravityObject:2} | Z 轴加速类型 |

### 二、shared/enums.json

6 张枚举表，**全部 Tier-1**：

| 表名 | 条目数 | 用途 |
|------|--------|------|
| ATTACKTYPE | 7 | physical/magical/absolute/light/dark/water/fire |
| ELEMENT | 5 | fire/water/dark/light/none |
| DAMAGEACT | 4 | none/damage/down/damage_except_human |
| KNOCK_BACK_TYPE | 5 | normal/knock_back/short_knock_back/pixel_without_damage_time/not_back(-1) |
| DOWN_PARAM_TYPE | 5 | value/force/bounce_value/bounce_force/bounce |
| CUSTOM_ATTACKINFO | 84 | 招式目录（crash_low_kick/lift_upper/mount/suplex/.../108_stairs 系列） |

另有 `field_to_enum` 映射表 6 条，关联字段名→枚举表。

---

### 三、players/swordman.json

#### 3.1 顶层结构

| Key | 类型 | 值 |
|-----|------|-----|
| shape_version | string | "1.0.0" |
| job | string | "swordman" |
| parentJob | string | "swordman" |
| etc | null | 始终为 null |
| animations | object | **10 motion inline** |
| attacks | object | **3 atk inline** |
| chr | object | **24 sub-key 完整** |
| skills | object | **2 skl inline** |

#### 3.2 animations（10 motion）

| Motion | 帧数 | 循环 | 源文件 |
|--------|------|------|--------|
| attack1 | 10 | false | animation/attack1.ani |
| attack2 | 11 | false | animation/attack2.ani |
| attack3 | 9 | false | animation/attack3.ani |
| damage1 | 1 | false | animation/damage1.ani |
| dash | 8 | **true** | animation/dash.ani |
| dashattack | 10 | false | animation/dashattack.ani |
| down | 6 | false | animation/down.ani |
| hardattack | 18 | false | animation/hardattack.ani |
| jump | 16 | false | animation/jump.ani |
| jumpattack | 6 | false | animation/jumpattack.ani |

每帧结构：`{index, anchor{x,y}, delay(ms), sprite(path)}`，有 attackBoxes/damageBoxes 时附加上。

#### 3.3 attacks（3 atk）

| Attack | liftUp | pushAside | damageBonus | hitReaction | element |
|--------|--------|-----------|-------------|-------------|---------|
| attack1 | 75 px/s | 30 px/s | -15% | hit_down | none |
| attack3 | 300 px/s | 40 px/s | +20% | hit_lift_up | none |
| dashattack | 80 px/s | 50 px/s | +40% | hit_horizon | none |

3 个攻击均在 `attackEnemy=true, attackFriend=false, pvpOnly=false`。liftUp/pushAside 标注为 Tier-3。

#### 3.4 chr — 角色核心（26 sub-key）

**标量（Tier-2 已验证）**：
| 字段 | 值 | 单位 |
|------|-----|------|
| darkResistance | 20 | % |
| lightResistance | -20 | % |
| bodyImagePath | `character/swordman/equipment/avatar/skin/sm_body%04d.img` | path |

**Tier-3 标量**：
| 字段 | 值 | 单位 |
|------|-----|------|
| jumpPower | 430 | ambiguous |
| jumpSpeed | 95 | int |
| moveSpeed | 850 | %xSPEED_VALUE_DEFAULT |
| attackSpeed | 850 | %xSPEED_VALUE_DEFAULT |
| castSpeed | 700 | %xSPEED_VALUE_DEFAULT |
| weight | 68000 | audio-only |

**growth（9×17 逐级成长表，只有 hitRecovery 是 Tier-3）**：
| 字段 | 基础值 | 单位 |
|------|--------|------|
| hpMax | 180 | hp |
| mpMax | 140 | mp |
| physicalAttack | 7.5 | physAtk |
| physicalDefense | 7.5 | physDef |
| magicalAttack | 4.5 | magAtk |
| magicalDefense | 4.5 | magDef |
| mpRegenSpeed | 50 | mp/min |
| inventoryLimit | 48000 | weight |
| hitRecovery | 600 | ms-or-multiplier（Tier-3） |

每个有 17 个元素（基础 + 16 级增量）。

**awakening**：
- skillSlots：10 个槽位，4 个非空（技能 ID 89/90/91/92，各 `[id, 1]`）
- names：5×2 空字符串矩阵
- tier1SlotCounts：全 0
- tier2SlotCounts：全 0

**motionRefs（24 条目）**：
24 个显式 motion → .ani 引用。最大的是 `etc motion`（122 条引用）。注意：motionRefs 引用的动画中，有 14 个 .ani **不在** top-level `animations` 里：
attack2/damage2/summon1/summon2/guard/move/ghost/overturn/simple_move/simple_rest/stay/sit/getitem/throw1/throw2/rest。

**attackInfo（引用链）**：
- attackBase：3 个（attack1.atk, attack2.atk, attack3.atk）
- dashAttack：1 个（dashattack.atk）
- jumpAttack：1 个（jumpattack.atk）
- etc：87 个附加 .atk 引用

**weaponHitInfo（6 条目）**：hitTag/bloodTag/damageScalePct/critOrSimilar/pushBack/launch

**weaponWav（6 条目）**：format(stereo/mono/matrix) + attackSwing/Hit 音效名

**widthBox**：`[40, 10]`

**Tier-3 汇总**：13 个字段（6 在 chr、1 在 growth.hitRecovery、6 在 attacks）

#### 3.5 skills（2 skl）

| 字段 | icewave | upperslash |
|------|---------|------------|
| path | skill/swordman/icewave.skl | skill/swordman/upperslash.skl |
| skillType | active | active |
| weaponEffectType | unknown | physical |
| skillClass | 0 | 1 |
| purchaseCost | 25 sp | 20 sp |
| requiredLevel | 30 | 1 |
| maximumLevel | 70 | 50 |
| command | →↓→+skill | skill |
| coolTime | 7000/7000 ms | null |
| consumeMp | 27→308 | null |
| castingTime | 300/300 ms | null |
| featureSkillIndex | 216 | 215 |
| icon | 有 | 有 |
| growtypeMaximumLevel | [0,0,0,0,50,0] | [10,10,10,10,10,10] |
| skillFitnessGrowtype | [4] | [0,1,2,3,4] |

---

### 四、其余 10 个 player shard

**结构完全一致**。与 swordman 的唯一差异在于数据填充度：

| 指标 | swordman | demonicswordman | 其余 9 个 |
|------|----------|-----------------|----------|
| animations | ✅ 10 motion | ✅ 10 motion（同 swordman） | ❌ 空 |
| attacks | ✅ 3 atk | ✅ 3 atk（同 swordman） | ❌ 空 |
| skills | ✅ 2 skl | ✅ 2 skl（同 swordman） | ❌ 空 |
| chr | ✅ 完整 | ✅ 完整 | ✅ 完整 |
| awakening | ✅ 有 | ✅ 有 | ✅ 有 |

`parentJob` 字段正确区分了子类归属（demonicswordman→swordman, atfighter→fighter, atm age→mage, etc.）。

---

### 五、monsters/goblin.json

23 个顶层 key。

**已填充的战斗字段**：
| 字段 | 值 | 单位 | Tier |
|------|-----|------|------|
| warlike | 60 | raw | Tier-3 |
| sight | 300 | px | Tier-2 |
| weight | 45000 | raw | Tier-3 |
| weightDual | [45000, 45000] | raw | Tier-3 |
| **hpMax** | **null** | — | — |
| abilityCategory | {hp max:70%, eq phys atk:90%, eq phys def:90%, eq mag atk:90%, eq mag def:90%} | percent | Tier-3 |
| level | [1, 6] | raw | Tier-3 |
| attackDelay | 1500 | ms | Tier-3 |
| moveSpeed | [300, 300] | raw | Tier-3 |
| hitRecovery | [500, 500] | ms | Tier-3 |
| widthBox | [40, 10] | raw | Tier-3 |
| stuckbonusOnDamage | [0, 0, 0, 0] | raw | Tier-3 |
| attackKind | 24 raw attr | float/int | 无标记 |
| category | [human, goblin, melee combat, close-passive] | — | Tier-2 |

**为空或缺失的**：
- hpMax：null（abilityCategory 有百分比，但未计算绝对值）
- attacks：`{}`（attack1.atk 已引用但未 inline）
- animations：`{}`（8 个 .ani 已引用但未 inline）

---

### 六、dungeons/jungle.json

23 个顶层 key。**全部 Tier-1，无 Tier-3 标记**。

| 字段 | 值 |
|------|-----|
| name | 空 link |
| basisLevel | 31 |
| minimumRequiredLevel | 28 |
| size | 4×4 网格 |
| startMap | [0, 3, 3, 3] |
| bossMap | [0, 0, 3, 0] |
| mapSpecification | 8 个房间（mapId: 3204-3236） |
| championLevels | [8, 16, 24, 32, 36] |
| pathgateObjects | 10 个门物体 ID |
| eventMonsters | 包含怪物 ID 61727 |
| greedLayout | 4×4 字符网格 |
| enteringTitleRefs | jungle.ani ×1 |
| imageRefs | behemoth.img / act3.img ×3 |

**关键缺口**：
- `maps`：`[]`（8 个 mapId 已识别但未解析为 MapDef shard）
- `monsterRefs`：`[]`（怪物 ID 61727 已识别但未链接到 goblin shard）
- `raw` 中有 `special passive object item`（27 个 packed int）和 `maze info`（空），未解码

---

## 缺口根因分析：工具限制 vs 没让它提

> 2026-05-26 深度实检结论。逐层验证了 C++ 提取器 → TS 主管线 → parseStage 路由 → 引用解析表。

### 链路全貌

```
PVF 文件 → dnf-extract (C++)           → PvfDocumentLoader (TS)  → parseStage (TS)
           │                              │                          │
           根据内部二进制结构判断:          过滤 type 字段:             switch 扩展名:
           Document → type:"document"     "document" → 7种扩展名    .chr .mob .atk .skl
           Animation→ type:"animation"    "animation"→ 独立路径      .dgn .etc .map
           Text     → type:"text"         (text/binary 无加载函数)   其余 → throw
           Binary   → type:"binary"
```

### 缺口逐项判定

| 缺口 | C++ 能提？ | 输出类型 | TS 有 Parser？ | 根因 |
|------|-----------|---------|---------------|------|
| swordman 其余 203 .skl | ✅ | document | ✅ SklParser | **没列进 CURATED_FILES** |
| swordman 其余 87+ .atk | ✅ | document | ✅ AtkParser | **没列进 CURATED_FILES** |
| swordman 其余 14 .ani | ✅ | animation | ✅ AniParser（独立路径） | **没列进 CURATED_FILES** |
| 其余 9 职业的 atk/ani/skl | ✅ | document/animation | ✅ 全部有 | **没列进 CURATED_FILES** |
| 更多怪物 | ✅ | document | ✅ MobParser | **没列进 CURATED_FILES** |
| 更多副本 | ✅ | document | ✅ DgnParser | **没列进 CURATED_FILES** |
| jungle 的 8 个 .map | ✅ | document | ✅ MapParser | **没做跨文件引用解析** |
| 怪物 ID 61727 → shard | ✅ | document | ✅ MobParser | **没做跨文件引用解析** |
| 所有 .nut 脚本 | ✅ | text | ✅ NutExtractor | **主管线无 Text 加载函数** |
| 所有 .img 图片 | ✅ | binary | ✅ ImgParser | **主管线无 Binary 加载函数** |
| **.equ 装备 (67777)** | ✅ | document（推测） | ❌ **EquParser 不存在** | **需新写 parser + parseStage 加路由** |
| **.stk 技能树 (10402)** | ✅ | document（推测） | ❌ **StkParser 不存在** | **需新写 parser + parseStage 加路由** |
| .ai/.aic 怪物 AI | ✅ | document（推测） | ❌ **AiParser 不存在** | **需新写 parser** |

> **实测验证**：fighter.json 的 `chr.attackInfo` 有 62 个 .atk 引用（attackBase 4 + etc 58），`chr.motionRefs` 有 26 个 .ani 引用。thief.json 有 48 个 .atk + 26 个 .ani。这些引用路径都是真实 PVF 路径，不是 null。
>
> 顶层 `animations`/`attacks`/`skills` 为空是因为 **exporter 没收到对应的 inline 数据**——baseline 没让 pipeline 提取那些 .ani/.atk/.skl 文件。工具本身完全能做。

### 工作量分级

| 级别 | 内容 | 方式 |
|------|------|------|
| **零工作量** | 其余 9 职业的 atk/ani/skl、更多怪物/副本、swordman 完整数据集 | 扩 CURATED_FILES 列表 + 重跑 baseline |
| **小工作量** | 跨文件引用解析（副本→地图、副本→怪物、chr→atk→ani 引用链） | 扩展 exporter 做引用追踪 |
| **中工作量** | .nut/.img/.wav 接入主管线 | PvfDocumentLoader 加 Text/Binary 加载 + 接入已有 parser |
| **大工作量** | .equ/.stk parser | 从零写新 parser（类似 MobParser 的复杂度） |

---

## 离线构建系统（Phase 1）可支撑评估（修正版）

| 模块 | 数据完整度 | 工具差距 | 解决方式 |
|------|----------|---------|---------|
| chr 角色 | ✅ 结构完整 | 无 | 扩 CURATED_FILES + 重跑 baseline |
| atk 攻击 | ⚠️ 只测了 3 个 | 无 | 扩 CURATED_FILES |
| ani 动画 | ⚠️ 只测了 10 个 swordman | 无 | 扩 CURATED_FILES |
| skl 技能 | ⚠️ 只测了 2 个 swordman | 无 | 扩 CURATED_FILES |
| mob 怪物 | ⚠️ 只测了 goblin | 无 | 扩 CURATED_FILES |
| dgn 副本 | ⚠️ 只测了 jungle | 无 | 扩 CURATED_FILES + 跨文件引用 |
| equ 装备 | ❌ | EquParser 不存在 | 写新 parser |
| stk 技能树 | ❌ | StkParser 不存在 | 写新 parser |
| shared | ✅ 完整 | 无 | — |

## 在线仿真系统（Phase 2）可支撑评估（修正版）

### 能跑起来的（数据够 + 工具支持）
| 系统 | 依据 |
|------|------|
| PhysicsIntegrator | 10 物理常数齐，jumpPower/jumpSpeed Tier-3 但可用 |
| Animation Playback | 10 motion 有完整帧数据+逐帧 hitbox |
| HitDetection | 3 attack 有 liftUp/pushAside/damageBonus，可走 .atk 反推 |
| DamageFormula | growth 9×17，atk damageBonus，ATTACKTYPE/ELEMENT 枚举 |
| StateMachine | 24 motionRefs → 24 状态有 PVF 依据 |
| ResourceSystem | coolTime/consumeMp/castingTime 已 typed |

### 数据不够但能搭架子（扩 CURATED_FILES 即可补充）
| 系统 | 当前 | 扩列表后 |
|------|------|---------|
| MonsterAI | goblin 1 种 | 加 3-5 种怪物即可 |
| Camera | 1 副本 | 加更多副本即可 |
| Skill | 2 技能 | 加所有 .skl 即可（零工作量，扩列表+重跑） |

### 完全跑不了（需写新 parser 或接入主管线）
| 系统 | 原因 | 需要 |
|------|------|------|
| StatusEffect | 异常状态数值不在 baseline | 数据源位置待确认（可能在 .skl/.nut/.mob 中） |
| Appendage | buff/aura/召唤物数据未提取 | 数据源位置待确认 |
| VFX/Audio | .wav 未提取 | 主管线接入 Binary 类型 |
| Equipment | .equ 数据完全缺失 | 写 EquParser |
| SkillTree | .stk 数据完全缺失 | 写 StkParser |

---

*2026-05-26，6 Agent 并行扫描 16 JSON shard + C++→TS 链路逐层实检后产出。*
