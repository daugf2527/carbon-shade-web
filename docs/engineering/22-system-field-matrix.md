# 22-System 字段矩阵

**日期**: 2026-05-29（T1.1 补全，覆盖全部 22 系统）
**数据来源**: `verification/baseline-shards/players/swordman.json` (2.2MB) + `monsters/goblin.json` (27KB) + `shared/physics.json` + `verification/nut-samples-2026-05-27/classify-v4-output.json`

> **状态**: 5 个核心系统（Animation/Attack/Skill/Physics/Resource）详细字段 + 17 个扩展系统骨架级字段，全部 22 系统覆盖完毕。
> ⚠️ **schema 缺口**（2026-05-28 竖切核查遗留）：`src/engine/schema/` 现有 4 个 .fbs（chr/skl/atk/physics）**未编译**（无 `_generated.ts`）；`ani.fbs` 不存在。Phase 1b 补全。
---

## 〇、数据地貌总览

### swordman shard 顶层

```
swordman.json (2.2MB)
├── shape_version: "1.0.0"
├── job: "swordman"
├── parentJob: "swordman"
├── chr (26 keys)          — 角色常数：growth/hitbox/physics/motionRefs
├── skills (205 keys)       — 技能属性：CD/MP/command/damage/liftUp/cancel
├── attacks (81 keys)       — 攻击模板：liftUp/pushAside/damageBonus/hitReaction
├── animations (161 keys)   — 逐帧数据：sprite/delay/attackBox[]/damageBox[]
└── etc: null
```

### goblin shard 顶层

```
goblin.json (27KB)
├── shape_version / id / mob (21 keys)  — 怪物属性 + abilityCategory
├── attacks (1 key)                      — attack1
└── animations (8 keys)                  — damage1/stay/down/overturn/move/damage2/sit/attack1
```

### shared 数据

```
physics.json  — 12 个物理常数（重力、速度、力→速度转换、枚举表）
enums.json    — 6 张枚举表（ATTACKTYPE / ELEMENT 等）
```

---

## 一、Animation 系统 (05-Animation)

**职责**: 逐帧推进动画游标，在帧边界发射 atkBox / dmgBox 事件给 HitDetection 系统消费。

### 输入字段

| 字段 | 来源 | 路径 | 类型 | 说明 |
|------|------|------|------|------|
| 当前 action 名称 | 输入/状态机 | `stateMachine.currentAction` | `string` | 如 "attack1" |
| 动画定义 | swordman.animations | `animations["attack1"]` | `AniDef` | loop / frames[] |
| 逐帧数据 | 动画定义内 | `animations["attack1"].frames[i]` | `AniFrame[]` | index / anchor / delay / sprite / imgId / imgParam / attackBoxes[] / damageBoxes[] |
| 攻击框 | 逐帧内 | `.frames[i].attackBoxes[]` | `Box3D[]` | {x1,y1,z1,x2,y2,z2} — 攻击判定框 |
| 受击框 | 逐帧内 | `.frames[i].damageBoxes[]` | `Box3D[]` | {x1,y1,z1,x2,y2,z2} — 受击判定框 |
| 帧延迟 | 逐帧内 | `.frames[i].delay` | `number` (ms) | 当前帧持续多久后推进 |
| 锚点 | 逐帧内 | `.frames[i].anchor` | `{x,y}` | sprite 定位用 |
| 循环标志 | 动画定义 | `.loop` | `boolean` | 最后一帧后是否回到第一帧 |
| 角色朝向 | 运行时 | `actor.facing` | `number` (-1/1) | 决定是否镜像翻转 box |

### 输出字段

| 字段 | 消费者 | 说明 |
|------|--------|------|
| 当前帧索引 | 自身 | `currentFrameIndex` — 下次 tick 推进 |
| 帧累计时间 | 自身 | `frameAccumulator` — 与 delay 比较决定是否推进 |
| 活跃攻击框列表 | HitDetection | `activeAtkBoxes: Box3D[]` — 当前帧的 attackBoxes（经 facing 变换） |
| 活跃受击框列表 | HitDetection | `activeDmgBoxes: Box3D[]` — 当前帧的 damageBoxes（经 facing 变换） |
| 动画结束事件 | StateMachine | `onAnimationEnd` — 非 loop 动画最后一帧结束 |

### 引用链

```
motionRefs[actionName] → animation path → animations[basename(path)] → frames[i].attackBoxes[] / damageBoxes[]
```

### 实战数据（swordman attack1）

- 10 帧，loop=false
- 帧 0: delay=50ms, anchor={-232,-333}, 0 个 attackBoxes, 2 个 damageBoxes, sprite="character/swordman/equipment/avatar/skin/sm_body%04d.img"
- **0/10 帧有 attackBoxes**（意味着普攻 attack1 的判定框不在 .ani 里，需从 .atk 反推）
- 10/10 帧有 damageBoxes

**⚠️ 关键设计抉择 A**（已决策）: 当 .ani 没有 attackBoxes 时，从关联的 .atk 反推攻击帧范围。具体映射关系待 Phase 3 确定。

---

## 二、Attack/Hit 系统 (04-Attack/Hit)

**职责**: 接收 Animation 系统发射的 activeAtkBoxes，与目标的 activeDmgBoxes 做 AABB 碰撞检测。命中后产出 HitEvent。

### 输入字段

| 字段 | 来源 | 路径 | 类型 | 说明 |
|------|------|------|------|------|
| 攻击者攻击框 | Animation | `activeAtkBoxes[]` | `Box3D[]` | 经 facing 变换后的世界坐标 |
| 目标受击框 | Animation (对方) | `activeDmgBoxes[]` | `Box3D[]` | 经 facing 变换后的世界坐标 |
| 攻击者位置 | 运行时 | `attacker.position` | `{x,y,z}` | 世界坐标 |
| 目标位置 | 运行时 | `target.position` | `{x,y,z}` | 世界坐标 |
| 攻击属性 | .atk | `attacks[actionName]` | `AtkDef` | attackKind / element / 命中后行为 |
| 相同目标 CD | 运行时 | `perTargetCooldown` | `Map<actorId, tick>` | 每个目标上次命中 tick |

### .atk 关键字段

| 字段 | 路径 | 类型 | 用途 |
|------|------|------|------|
| liftUp | `.liftUp.value` | `number` (px/s) | 将目标弹起的速度 |
| pushAside | `.pushAside.value` | `number` (px/s) | 水平推开的力度 |
| damageBonus | `.damageBonus.value` | `number` (%) | 伤害倍率加成 |
| attackEnemy | `.attackEnemy` | `boolean` | 是否打敌人 |
| attackKind | `.attackKind` | `"physic"` | 物理/魔法 |
| element | `.element` | `"none"\|"fire"\|...` | 元素属性 |
| hitReaction | `.hitReaction` | `"hit_down"\|...` | 命中后反应类型 |
| causesDown | `.causesDown` | `boolean` | 是否击倒 |
| causesStun | `.causesStun` | `boolean` | 是否击晕 |
| causesBounce | `.causesBounce` | `boolean` | 是否反弹 |
| ignoreWeight | `.ignoreWeight` | `boolean` | 忽略重量 |
| pvpOnly | `.pvpOnly` | `boolean` | PvP 专用（PvE 忽略） |

### 输出字段

| 字段 | 消费者 | 说明 |
|------|--------|------|
| HitEvent | Damage, Reaction | `{attackerId, targetId, attackBox, damageBox, attackDef, timestamp}` |
| hitCount | Combo | 本次攻击已命中次数（用于 maxHitPerObject 限制） |

### 实战数据

- swordman attack1: liftUp=75 px/s, pushAside=30 px/s, damageBonus=-15%, hitReaction=hit_down
- goblin attack1: liftUp=300 px/s, pushAside=100 px/s, damageBonus=null

---

## 三、Skill 系统 (06-Skill)

**职责**: 管理技能的属性查询——当输入/状态机决定执行 skill X 时，提供该 skill 的 CD、MP 消耗、施法时间、关联的 .atk 引用、按键序列。

### 输入字段

| 字段 | 来源 | 路径 | 类型 | 说明 |
|------|------|------|------|------|
| 技能 ID | 输入/状态机 | `stateMachine.activeSkill` | `string` | 如 "upperslash" |
| 技能定义 | swordman.skills | `skills["upperslash"]` | `SklDef` | 完整技能属性 |

### .skl 关键字段（最小闭环需要）

| 字段 | 路径 | 类型 | 用途 |
|------|------|------|------|
| coolTime | `.coolTime.dungeonMs` | `number` (ms) | 冷却时间 |
| consumeMp | `.consumeMp.baseMp` + `.lvlMaxMp` | `number` | MP 消耗 |
| castingTime | `.castingTime.value` | `number` (ms) | 施法时间（动画延迟） |
| command | `.command[]` | `string[]` | 按键序列如 `["(right)",",","(down)",",","(skill)"]` |
| requiredLevel | `.requiredLevel.value` | `number` | 学习等级 |
| cancelWindow | `.cancelWindow` | `object|null` | 取消窗口（高级） |
| skillType | `.skillType` | `"active"` | 主动/被动/buff |
| weaponEffectType | `.weaponEffectType` | `"physical"` | 物理/魔法 |
| preRequiredSkill | `.preRequiredSkill` | `object|null` | 前置技能 |

### 技能→攻击引用

**⚠️ 2026-05-29 实测修正**：`skl.sections` 中**不存在** `[attack info]` section，skl 不直接引用 atk。

实际路径（通过 chr 间接）：
```
StateMachine.currentAction（如 "attack1"）
  → chr.attackInfo["attackBase"][0].targetPath → "character/swordman/attackinfo/attack1.atk"
  → basename → attacks["attack1"].liftUp / .pushAside / .damageBonus
```

skl 只提供 `coolTime / consumeMp / castingTime / command`，atk 绑定在 chr.attackInfo，不在 skl。详见 §五の続き T1.2 路径表。

### 输出字段

| 字段 | 消费者 | 说明 |
|------|--------|------|
| skillAttributes | Animation, Damage | {coolTime, consumeMp, castingTime, atkRef, command} |
| atkRef | HitDetection | 关联的 AtkDef — 传给 HitDetection 用于判定时查询 |

### 实战数据

- 205 个 skill 中：22 个有 coolTime, 32 个有 consumeMp, 20 个有 castingTime, 85 个有 command
- upperslash: skillType=active, requiredLevel=1, command=["(skill)"], coolTime=null (基础攻击无 CD), consumeMp=null
- icewave: coolTime={dungeonMs:7000}, consumeMp={baseMp:27,lvlMaxMp:308}, castingTime=null

---

## 四、Physics 系统 (07-Physics)

**职责**: 受击位移——HitEvent 携带的 liftUp/pushAside 值转化为速度，逐帧积分得到新位置。同时处理重力加速度。

### 输入字段

| 字段 | 来源 | 路径 | 类型 | 说明 |
|------|------|------|------|------|
| 受击力 | HitEvent | `event.liftUp` | `number` (px/s) | 垂直弹起速度 |
| 推离力 | HitEvent | `event.pushAside` | `number` (px/s) | 水平推离速度 |
| 目标重量 | goblin.mob | `.weight` / `.weightDual` | `number` | 影响受击位移幅度 |
| 重力常数 | shared | `physics.defaultGravityAccel` | `-1500` (px/s²) | 恒定重力加速度 |
| 力→速度转换 | shared | `physics.forceToVelocityConst` | `4000` | v = const × force / weight |
| 角色重量 | swordman.chr | `.weight.value` | `number` | 自身被击退时的重量参数 |
| 碰撞盒 | swordman.chr | `.widthBox[x,y]` | `number[]` | 角色碰撞体宽高（卡墙检测） |

### 输出字段

| 字段 | 消费者 | 说明 |
|------|--------|------|
| 新位置 | 渲染 | `{x, y, z}` — 经 liftUp × 重力积分 后的位置 |
| 落地事件 | StateMachine | `onLanding` — z=0 时 |
| 位移状态 | Reaction | `isAirborne`, `velocityZ` | 

### 速度积分公式（工作假设）

```
Z(t) = Z₀ + v₀ × t + 0.5 × g × t²
v(t) = v₀ + g × t

其中：
  v₀ = liftUp (px/s)
  g = defaultGravityAccel = -1500 px/s²
  t = 距离受击的 Δt (s)

水平位移：
  X(t) = X₀ + pushAside × dt  （简化：无摩擦）
```

### 实战数据

- liftUp 范围: swordman attack1=75 → attack3=300 → goblin=300 px/s
- 算例: liftUp=300, g=-1500 → peak: 300/1500=0.2s, maxZ=300×0.2-0.5×1500×0.04=30px → 浮空约 0.4s

---

## 五、Resource 系统 (08-Resource)

**职责**: HP 管理——DamageFormula 产出伤害值后扣减 HP。HP=0 触发死亡。

### 输入字段

| 字段 | 来源 | 路径 | 类型 | 说明 |
|------|------|------|------|------|
| 当前 HP | 运行时 | `actor.hp` | `number` | 当前生命值 |
| 最大 HP | 角色 chr | `chr.growth.hpMax.values[level]` | `number[]` | 17 级数组（Level 1-70 跨度） |
| 伤害值 | DamageFormula | `damageDealt` | `number` | 最终伤害 |
| 怪物 HP 倍率 | goblin.mob | `.abilityCategory["hp max"]` | `number` (%) | 如 goblin 的 hp max = 70%（相对角色 HP 的百分比） |

### MP 字段（Phase 4 之前不必须）

| 字段 | 来源 | 路径 | 说明 |
|------|------|------|------|
| 最大 MP | chr | `growth.mpMax.values[]` | 17 级数组 |
| MP 消耗 | skill | `skills[X].consumeMp` | 技能消耗 |
| MP 回复 | chr | `growth.mpRegenSpeed.values[]` | mp/min |

### 输出字段

| 字段 | 消费者 | 说明 |
|------|--------|------|
| 新 HP | 渲染/UI | `hp - damage` |
| HP=0 事件 | StateMachine, Death | `onDeath` |
| HP 变更事件 | UI, Replay | `onHpChanged(oldHp, newHp)` |

---

## 五の続き、T1.2 字段引用链 JSON Pointer 路径表

> **2026-05-29 实测补全**（T1.2 验收：DAG + JSON Pointer 路径表）

### 链路 A：chr → motion → ani → img

| 步骤 | JSON Pointer | 实测值（swordman） | 说明 |
|------|-------------|------------------|------|
| 1. 查 action 对应 ani | `/chr/motionRefs/{motionKey}[0]/targetPath` | `"character/swordman/animation/attack1.ani"` | motionKey 如 `"attack motion"` |
| 2. 取 ani basename | `basename(targetPath).replace('.ani','')` | `"attack1"` | 用于 shard 内 animations 索引 |
| 3. 定位 ani 定义 | `/animations/{basename}` | `{loop:false, frames:[...]}` | 161 个 animation 按 basename 索引 |
| 4. 取帧 sprite | `/animations/{basename}/frames/{i}/sprite` | `"character/swordman/equipment/avatar/skin/sm_body%04d.img"` | `%04d` → imgParam 填充 |
| 5. 取 imgId / imgParam | `/animations/{basename}/frames/{i}/imgId` + `.imgParam` | `imgId:0, imgParam:0` | imgId=sprite table 索引，imgParam=frame index |
| 6. 取攻击框/受击框 | `/animations/{basename}/frames/{i}/attackBoxes` + `.damageBoxes` | `[{x1,y1,z1,x2,y2,z2}]` | **attack1 的 attackBoxes 全为空**，需从 chr.attackInfo 反推 |

**⚠️ 关键发现**：`chr.motionRefs` 的 key 不是 action name（如 `"attack1"`），而是 PVF section 名（如 `"attack motion"`），一个 key 可能映射多个 .ani（如 `attack motion` → attack1.ani/attack2.ani/attack3.ani）。

### 链路 B：chr → attackInfo → atk

| 步骤 | JSON Pointer | 实测值（swordman） | 说明 |
|------|-------------|------------------|------|
| 1. 查 action 对应 atk | `/chr/attackInfo/{infoKey}[0]/targetPath` | `"character/swordman/attackinfo/attack1.atk"` | infoKey 如 `"attackBase"` |
| 2. 取 atk basename | `basename(targetPath).replace('.atk','')` | `"attack1"` | 用于 shard 内 attacks 索引 |
| 3. 定位 atk 定义 | `/attacks/{basename}` | `{liftUp, pushAside, damageBonus, ...}` | 81 个 attack 按 basename 索引 |
| 4. 读伤害参数 | `/attacks/{basename}/liftUp/value` | `75` (px/s) | 弹起速度 |
| 5. 读命中反应 | `/attacks/{basename}/hitReaction` | `"hit_down"` | 命中后状态机触发 |

**chr.attackInfo keys（实测）**: `attackBase`（3个 atk）/ `dashAttack` / `jumpAttack` / `etc`（87个 atk）

### 链路 C：skl → （通过 chr 间接）→ atk

**实测发现**：skl.sections 中**不存在** `[attack info]` section，fieldMatrix §三的"→ .sections[attack info] → 引用 .atk path"描述有误。

实际路径：
```
StateMachine.currentAction
  → chr.attackInfo[infoKey] → atk basename → attacks[basename]
  → chr.motionRefs[motionKey] → ani path → animations[basename]
```

skl 只提供 CD/MP/command/castingTime，**不直接引用 atk**。atk 选择由 chr.attackInfo 决定，与 action 名称绑定。

---

## 六、字段引用链 DAG

```
Input/StateMachine 决定执行哪个 action
        │
        ▼
┌─ Skill (06-Skill) ────────────────────────────────────────┐
│  skills[actionName]                                       │
│    → .coolTime / .consumeMp / .castingTime                │
│    → .command[] (按键序列)                                 │
│    → .sections[attack info] → 引用 .atk path               │
└────────────────────┬──────────────────────────────────────┘
                     │ atkRef (如 "attack1.atk")
                     ▼
┌─ Attack (04-Attack/Hit) ──────────────────────────────────┐
│  attacks[atkName]                                         │
│    → .liftUp / .pushAside / .damageBonus                  │
│    → .attackKind / .element / .hitReaction                │
│    → .pvpOnly (PvE 跳过)                                  │
└────────────────────┬──────────────────────────────────────┘
                     │ 共享 action 名称
                     ▼
┌─ Animation (05-Animation) ────────────────────────────────┐
│  animations[actionName]                                   │
│    → .loop / .frames[]                                    │
│    → frames[i].delay / .anchor / .sprite                  │
│    → frames[i].attackBoxes[] / .damageBoxes[]             │
│                                                           │
│  chr.attackInfo[actionName] → targetPath (atk 引用)       │
│  chr.motionRefs[actionName]  → targetPath (ani 引用)       │
└────────────────────┬──────────────────────────────────────┘
                     │ activeAtkBoxes[] / activeDmgBoxes[]
                     ▼
┌─ HitDetection ────────────────────────────────────────────┐
│  AABB overlap(attacker.atkBox, target.dmgBox)             │
│    → HitEvent {attackerId, targetId, atkDef, timestamp}   │
└────────┬──────────────────────┬───────────────────────────┘
         │                      │
         ▼                      ▼
┌─ DamageFormula ───┐   ┌─ Physics (07-Physics) ────────────┐
│  AtkDef.damageBonus│   │  HitEvent.liftUp / .pushAside     │
│  × ChrDef.growth   │   │  → Z 积分 (g=-1500 px/s²)        │
│  × level scaling   │   │  → X 位移 (pushAside)            │
│  = damageDealt     │   │  → onLanding (z=0)               │
└────────┬───────────┘   └──────────────────────────────────┘
         │
         ▼
┌─ Resource (08-Resource) ──────────────────────────────────┐
│  actor.hp -= damageDealt                                  │
│  → hp ≤ 0 → onDeath                                       │
│  → hp > 0  → onHpChanged(old, new)                        │
└───────────────────────────────────────────────────────────┘
```

---

## 七、每一帧 tick 的数据流（最小闭环 5 系统）

```
Frame N (16.67ms budget):

1. [Animation] frameAccumulator += dt
   → 如果累计 ≥ frames[current].delay: currentFrameIndex++
   → emit activeAtkBoxes = frames[current].attackBoxes[] (× facing)
   → emit activeDmgBoxes = frames[current].damageBoxes[] (× facing)

2. [Physics] 如果 isAirborne:
   → vZ += g × dt; z += vZ × dt
   → 如果 z ≤ 0: z=0, isAirborne=false, emit onLanding

3. [HitDetection] 对每个 activeAtkBox × 每个目标 activeDmgBox:
   → AABB overlap? → HitEvent

4. [DamageFormula] 对每个 HitEvent:
   → damage = calc(AtkDef, ChrDef, level)
   → emit damageDealt

5. [Resource] hp -= damageDealt
   → 如果 hp ≤ 0: emit onDeath
```

---

## 八、数据覆盖度与缺口

| 系统 | 字段覆盖率 | 缺口 |
|------|-----------|------|
| Animation | 100%（161 ani inline） | 无 — swordman 全 motion 已 inline |
| Attack/Hit | 100%（81 atk） | .ani 无 attackBoxes 时需从 .atk 反推（已决策 A） |
| Skill | 100%（205 skl） | 无 — 12 raw sections 全 typed |
| Physics | 100%（12 常数） | liftUp/gravity 曲线是 local_baseline（DNF.exe 硬编码） |
| Resource | 100% | MP 管理延至 Phase 4 |

---

## 九、剩余 17 个系统字段矩阵

**更新日期**: 2026-05-29
**数据来源**: `verification/nut-samples-2026-05-27/classify-v4-output.json` API 名称推断
**分层标准**: HOT = 每帧 tick 必读/写；WARM = 每次状态转换读；COLD = 初始化/懒加载

### Phase 优先级总览

| 系统 | Phase | PvE 最小闭环必须 | 理由 |
|------|-------|-----------------|------|
| 19-StateMachine | **Phase 3** | ✅ 必须 | 驱动 action 切换，是整个 tick 的入口 |
| 01-Input | **Phase 3** | ✅ 必须 | 玩家指令 → 状态机转换的唯一来源 |
| 03-Monster/AI | **Phase 3** | ✅ 必须 | 哥布林需要 AI 才能触发攻击 |
| 09-Status | **Phase 3** | ✅ 必须 | 受击后的 hitstun/down 状态管理 |
| 22-Identity | **Phase 3** | ✅ 必须 | 对象查找/目标选取的基础 |
| 20-Time | **Phase 3** | ✅ 必须 | CD/hitstun 计时依赖 |
| 17-Math | **Phase 3** | ✅ 必须 | 距离判断/随机数（AI 行为） |
| 21-Predicate | **Phase 3** | ✅ 必须 | 条件判断（IsMyControlObject 等） |
| 13-DataStore | **Phase 3** | ✅ 必须 | sq_var 脚本变量存储，技能逻辑依赖 |
| 18-Timer | **Phase 3** | ✅ 必须 | sq_timer_ 延迟触发（技能后摇） |
| 10-PassiveObj | **Phase 4** | 可延后 | 投射物/陷阱，基础攻击不需要 |
| 11-Pool | **Phase 4** | 可延后 | 对象池，性能优化阶段 |
| 14-Appendage | **Phase 4** | 可延后 | buff 附件，基础战斗不需要 |
| 15-VFX | **Phase 4** | 可延后 | 粒子特效，视觉层 |
| 16-CameraFX | **Phase 4** | 可延后 | 屏幕震动/闪光，视觉层 |
| 12-ScriptRT | **Phase 4** | 可延后 | 音效/颜色，视觉/音频层 |
| 02-Net/RPC | **Phase 5+** | ❌ OOS | PvE 单机不需要网络同步 |

---

## 九（续）、17 个系统字段骨架

---

### 系统 A：19-StateMachine（状态机）

**Phase**: 3 — 最小闭环必须
**职责**: 管理角色当前所处的 action 状态（stay/move/attack1/damage1/down 等），响应事件触发状态转换。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `currentState` | HOT | runtime | 当前状态名，如 `"attack1"` |
| `parentState` | WARM | runtime | 父状态（技能子状态用） |
| `stateTransitionTable` | COLD | chr/skl | 合法转换表（cancel window 等） |
| `onAnimationEnd` | HOT | Animation 事件 | 非 loop 动画结束 → 触发转换 |
| `onLanding` | HOT | Physics 事件 | 落地 → 退出 airborne 状态 |

**输出**: `currentAction: string` → 驱动 Animation / Attack / Skill 系统

**API 证据**: `sq_GetSTATE` (67 calls), `sq_GetParentState` (6 calls)

---

### 系统 B：01-Input（输入）

**Phase**: 3 — 最小闭环必须
**职责**: 读取玩家按键，判断是否满足技能 command 序列，向 StateMachine 发出 action 请求。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `commandBuffer` | HOT | runtime | 最近 N 帧的按键序列 |
| `keyState` | HOT | runtime | 当前帧各键是否按下 |
| `commandEnabled` | WARM | runtime | 是否允许输入（受击/硬直期间禁用） |
| `inputDirection` | HOT | runtime | 方向键状态 → 移动/朝向 |
| `keyxEnabled` | WARM | runtime | 特定按键是否启用（技能锁定） |

**输出**: `actionRequest: string` → StateMachine

**API 证据**: `sq_IsCommandEnable` (91), `sq_IsKeyDown` (10), `sq_SetKeyxEnable` (7), `sq_IsEnterCommand` (5), `sq_GetInputDirection` (4)

---

### 系统 C：03-Monster/AI（怪物 AI）

**Phase**: 3 — 最小闭环必须
**职责**: 控制怪物行为决策——寻路、选目标、决定何时发动攻击。

| 字段 | 层级 | 来源 | 路径 | 实测值（goblin） | 说明 |
|------|------|------|------|-----------------|------|
| `targetId` | HOT | runtime | — | — | 当前攻击目标 |
| `abilityCategory` | COLD | mob | `mob.abilityCategory.value` | `{hp max:70, equipment_physical_attack:90, ...}` (%) | 怪物能力倍率 |
| `aiState` | HOT | runtime | — | — | AI 状态（idle/chase/attack/stun） |
| `sight` | COLD | mob | `mob.sight.value` | `300` (px) | 视野范围（字段名是 `sight`，不是 `sightRange`） |
| `warlike` | COLD | mob | `mob.warlike.value` | `60` (raw) | 仇恨激活阈值 |
| `attackDelay` | COLD | mob | `mob.attackDelay.value` | `1500` (ms) | 攻击间隔 |
| `attackDecisionTimer` | WARM | runtime | — | — | 距上次攻击决策的时间 |
| `animationRefs` | COLD | mob | `mob.animationRefs[]` | `[{targetKind:'ani', targetPath:'monster/goblin/animation_goblin2/stay.ani', ...}]` | 动画引用列表 |
| `attackInfo` | COLD | mob | `mob.attackInfo[]` | `[{targetKind:'atk', targetPath:'monster/goblin/attackinfo/attack1.atk'}]` | 攻击信息引用 |
| `weight` | COLD | mob | `mob.weight.value` | `45000` (raw) | 受击位移权重 |
| `hitRecovery` | COLD | mob | `mob.hitRecovery.values[level]` | `[500, 500]` (ms) | 受击硬直时间 |
| `widthBox` | COLD | mob | `mob.widthBox.values` | `[40, 10]` (px) | 碰撞体宽高 |

**输出**: `actionRequest: string` → StateMachine（怪物侧）

**API 证据**: `sq_GetObjectByObjectId` (5), `sq_FindShootingTarget` (5), `sq_SetTargetObjectAICharacter` (4), `sq_IsInBattle` (4)

**⚠️ 字段修正**（2026-05-29 实测）: 原矩阵写 `aggroRange` 字段不存在。实际字段为 `sight`（300px 视野）+ `warlike`（60 仇恨阈值）。`sightRange` 是错误名称。

---

### 系统 D：09-Status（状态效果）

**Phase**: 3 — 最小闭环必须
**职责**: 管理角色身上的状态效果（hitstun/down/stun/freeze 等），决定角色是否能行动。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `activeStatuses` | HOT | runtime | 当前生效的状态列表 |
| `changeStatus` | WARM | atk/skl | 攻击附带的状态变更定义 |
| `statusDuration` | WARM | runtime | 各状态剩余持续时间 |
| `stateLayerAnimation` | WARM | runtime | 状态对应的叠加动画（如冰冻特效） |
| `isValidActiveStatus` | HOT | runtime | 状态是否仍有效（用于每帧检查） |

**输出**: `canAct: boolean`, `isStunned: boolean` → StateMachine / Input

**API 证据**: `sq_AddStateLayerAnimation` (62), `sq_CreateChangeStatus` (18), `sq_SetChangeStatusIntoAttackInfo` (12), `sq_IsValidActiveStatus` (12), `sq_getChangeStatus` (10)

---

### 系统 E：22-Identity（对象标识）

**Phase**: 3 — 最小闭环必须
**职责**: 对象注册/查找——通过 uniqueId 获取场景中的任意对象，判断所属队伍/是否为玩家控制。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `uniqueId` | COLD | runtime | 对象唯一 ID（场景内） |
| `objectId` | COLD | runtime | 对象类型 ID |
| `team` | COLD | runtime | 所属队伍（player/enemy） |
| `isMyCharacter` | WARM | runtime | 是否为本地玩家控制 |
| `objectManagerStage` | COLD | runtime | 对象管理器阶段引用 |

**输出**: `object: Actor` → 所有需要目标引用的系统

**API 证据**: `sq_GetUniqueId` (14), `sq_GetObjectManagerStage` (9), `sq_GetObject` (9), `sq_GetObjectId` (6), `sq_IsMyCharacter` (6), `sq_GetTeam` (4)

---

### 系统 F：20-Time（时间查询）

**Phase**: 3 — 最小闭环必须
**职责**: 提供当前帧时间戳、对象存活时间、状态计时器——CD/hitstun 持续时间计算的基础。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `currentTime` | HOT | runtime | 当前世界时间（ms） |
| `frameStartTime` | HOT | runtime | 本帧开始时间戳 |
| `objectTime` | WARM | runtime | 对象自创建起的存活时间 |
| `stateTimer` | WARM | runtime | 当前状态已持续时间 |
| `validTime` | WARM | runtime | 对象有效期（超时自动销毁） |
| `delaySum` | WARM | ani | 动画帧延迟累计（= 动画总时长） |

**输出**: `elapsed: number` → Status/Skill CD 计算

**API 证据**: `sq_GetCurrentTime` (47), `sq_SetValidTime` (14), `sq_GetFrameStartTime` (11), `sq_GetDelaySum` (10), `sq_GetObjectTime` (9), `sq_GetStateTimer` (7)

---

### 系统 G：17-Math（数学工具）

**Phase**: 3 — 最小闭环必须
**职责**: 提供随机数、绝对值、三角函数、角度转换——AI 行为随机化和投射物角度计算。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `randomSeed` | COLD | runtime | 随机数种子（replay 确定性） |
| `rotateAngle` | WARM | runtime | 对象旋转角度（投射物方向） |
| `customRotate` | WARM | runtime | 自定义旋转参数 |

**输出**: `randomValue: number`, `angle: number` → AI/Physics/VFX

**API 证据**: `sq_getRandom` (33), `sq_Abs` (26), `sq_ToRadian` (11), `sq_SetfRotateAngle` (7), `sq_SetCustomRotate` (7), `sq_Sin/Cos/Atan` (各 6)

**注意**: `sq_getRandom` 33 次调用 — replay 确定性要求必须用 seeded PRNG，不能用 `Math.random()`

---

### 系统 H：21-Predicate（条件判断）

**Phase**: 3 — 最小闭环必须
**职责**: 提供各类布尔查询——是否为玩家控制对象、是否在地图区域内、是否为 Boss 等。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `isMyControlObject` | HOT | runtime | 是否为本地玩家控制（最高频，41 calls） |
| `isInMapArea` | WARM | runtime | 是否在地图可移动区域内 |
| `isBoss` | COLD | mob | 是否为 Boss 怪物 |
| `isIntersectRect` | HOT | runtime | 矩形相交检测（辅助碰撞） |
| `isExistObject` | WARM | runtime | 对象是否仍存在于场景 |

**输出**: `bool` → StateMachine / AI / Input 的条件分支

**API 证据**: `sq_IsMyControlObject` (41), `sq_IsSameAni` (2), `sq_IsIntersectRect` (2), `sq_IsBoss` (1), `sq_IsExistObject` (1)

---

### 系统 I：13-DataStore（脚本数据存储）

**Phase**: 3 — 最小闭环必须
**职责**: .nut 脚本的运行时变量存储——`sq_var` 是最高频 API（885 calls），是脚本状态的核心载体。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `scriptVars` | HOT | runtime | sq_var 键值对（脚本局部变量） |
| `intData` | WARM | runtime | 整型数据槽（sq_GetIntData） |
| `levelData` | COLD | chr/skl | 等级相关数据（sq_GetLevelData） |
| `intVector` | WARM | runtime | 整型向量（临时列表，sq_IntVectPush/Clear） |
| `globalIntVector` | WARM | runtime | 全局整型向量（跨脚本共享） |
| `bonusRateWithPassive` | COLD | skl | 被动技能加成倍率 |
| `job` | COLD | chr | 职业 ID（sq_getJob） |
| `group` | COLD | runtime | 对象分组（sq_GetGroup） |

**输出**: 脚本变量读写 → 所有 .nut 脚本逻辑

**API 证据**: `sq_var` (885), `sq_GetIntData` (220), `sq_IntVectPush` (217), `sq_GetLevelData` (186), `sq_IntVectClear` (132), `sq_GetBonusRateWithPassive` (71)

---

### 系统 J：18-Timer（延迟定时器）

**Phase**: 3 — 最小闭环必须
**职责**: 提供 `sq_timer_` 延迟回调机制——技能后摇、延迟伤害、定时触发效果。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `timerQueue` | HOT | runtime | 待触发的定时器队列 |
| `timerDelay` | WARM | skl/nut | 延迟时间（ms） |
| `timerCallback` | WARM | nut | 到期后执行的脚本函数 |

**输出**: 延迟事件 → StateMachine / Status / VFX

**API 证据**: `sq_timer_` (18 calls，唯一 API，命名模式暗示是前缀，实际有多个具体 timer 函数)

---

### 系统 K：10-PassiveObj（被动对象/投射物）

**Phase**: 4 — 可延后
**职责**: 创建/销毁场景中的被动对象（投射物、陷阱、召唤物）。不参与基础近战攻击闭环。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `passiveObjectId` | COLD | runtime | 被动对象 ID |
| `passiveObjectState` | WARM | runtime | 对象当前状态 |
| `createPos` | WARM | runtime | 创建位置 {x, y, z} |
| `passiveObjectType` | COLD | skl/nut | 对象类型（投射物/陷阱/召唤物） |

**输出**: `PassiveObject` 实例 → Physics / HitDetection

**API 证据**: `sq_SendDestroyPacketPassiveObject` (109), `sq_SendCreatePassiveObjectPacket` (81), `sq_GetPassiveObject` (12)

---

### 系统 L：11-Pool（对象池）

**Phase**: 4 — 可延后
**职责**: CNRD（Create-No-Render-Destroy）对象池管理——复用频繁创建/销毁的对象（特效、投射物）。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `cnrdPool` | COLD | runtime | CNRD 对象池 |
| `pooledObjectType` | COLD | runtime | 池化对象类型 |
| `drawOnlyObject` | WARM | runtime | 仅渲染不参与逻辑的对象 |

**输出**: 复用对象引用 → VFX / PassiveObj

**API 证据**: `sq_CreateCNRDAnimation` (72), `sq_GetCNRDObjectToSQRCharacter` (26), `sq_CreatePooledObject` (17), `sq_CreateDrawOnlyObject` (11)

---

### 系统 M：14-Appendage（附件/buff 附着）

**Phase**: 4 — 可延后
**职责**: 管理附着在角色身上的 buff 附件（光环、持续效果层）。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `appendageList` | WARM | runtime | 当前附件列表 |
| `appendageId` | COLD | skl/nut | 附件类型 ID |
| `effectLayerAppendage` | WARM | runtime | 特效层附件 |
| `changeStatusAppendageId` | WARM | runtime | 状态变更附件 ID |

**输出**: 附件效果 → Status / VFX

**API 证据**: `sq_AppendAppendage` (49), `sq_RemoveAppendage` (23), `sq_IsAppendAppendage` (13), `sq_GetAppendage` (8)

---

### 系统 N：15-VFX（视觉特效）

**Phase**: 4 — 可延后
**职责**: 创建/管理粒子特效、命中特效、全屏特效。纯视觉层，不影响战斗逻辑。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `particleCreator` | COLD | runtime | 粒子创建器引用 |
| `particlePos` | WARM | runtime | 粒子位置 |
| `effectFront` | WARM | runtime | 前景特效层 |
| `hitEffectFileName` | COLD | atk | 自定义命中特效文件 |
| `bodyEffect` | WARM | runtime | 角色身体特效 |

**输出**: 粒子/特效对象 → 渲染层

**API 证据**: `sq_AddObjectParticleCreater` (30), `sq_AddObject` (29), `sq_AddParticleObject` (21), `sq_AddEffectFront` (14), `sq_CreateParticle` (10)

---

### 系统 O：16-CameraFX（镜头特效）

**Phase**: 4 — 可延后
**职责**: 屏幕震动、闪光、镜头滚动控制。纯视觉反馈，不影响战斗逻辑。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `shakeIntensity` | WARM | runtime | 震动强度 |
| `shakeMyOnly` | WARM | runtime | 仅震动本地玩家视角 |
| `flashColor` | WARM | runtime | 闪光颜色/持续时间 |
| `xScrollStop` | WARM | runtime | X 轴滚动锁定 |
| `cameraScrollPos` | WARM | runtime | 镜头滚动目标位置 |

**输出**: 渲染层镜头参数

**API 证据**: `sq_SetMyShake` (35), `sq_flashScreen` (32), `sq_SetShake` (27), `sq_addFlashScreen` (10), `sq_setXScrollStop` (6)

---

### 系统 P：12-ScriptRT（脚本运行时工具）

**Phase**: 4 — 可延后
**职责**: 脚本运行时杂项——音效播放、颜色构造、子脚本执行。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `soundTag` | COLD | ani/skl | 音效标签（文件路径） |
| `rgbColor` | WARM | runtime | RGB 颜色值（特效着色） |
| `rgbaColor` | WARM | runtime | RGBA 颜色值（透明度） |
| `alphaValue` | WARM | runtime | Alpha 透明度 |
| `subScriptPath` | COLD | nut | 子脚本路径（sq_RunScript） |

**输出**: 音效触发 / 颜色参数 → 渲染/音频层

**API 证据**: `sq_PlaySound` (143), `sq_RGB` (67), `sq_RGBA` (14), `sq_ALPHA` (13), `sq_RunScript` (6)

---

### 系统 Q：02-Net/RPC（网络/远程调用）

**Phase**: 5+ — PvE 单机 OOS（Out of Scope）
**职责**: 多人同步——序列化状态包、发送命中事件、广播 HP 变更。PvE 单机模式完全不需要。

| 字段 | 层级 | 来源 | 说明 |
|------|------|------|------|
| `statePacket` | — | runtime | 状态同步包（二进制序列化） |
| `hitObjectPacket` | — | runtime | 命中事件网络包 |
| `sendState` | — | runtime | 当前发送状态 |
| `isPVPMode` | — | runtime | 是否 PvP 模式（PvE 恒为 false） |

**输出**: 网络包 → 服务器/其他客户端

**API 证据**: `sq_AddSetStatePacket` (226), `sq_BinaryWriteDword` (196), `sq_BinaryStartWrite` (60), `sq_isPVPMode` (6)

**PvE 处理**: 所有 `sq_AddSetStatePacket` / `sq_BinaryWrite*` 调用在 PvE 模式下为 no-op stub

---

### 系统 R：99-Unclassified（未分类）

**Phase**: 按需归类
**职责**: 126 个唯一 API，206 次调用，涵盖杂项功能。主要包含：

- **动画引用查询**: `sq_getStayAni`, `sq_getDashAni`, `sq_getDownAni`, `sq_getJumpAni` 等 — 应归入 05-Animation
- **超级护甲**: `sq_setSuperArmor`, `sq_removeSuperArmor` — 应归入 09-Status
- **击退力**: `sq_SetCurrentAttacknUpForce`, `sq_SetCurrentAttacknBackForce` — 应归入 04-Attack/Hit
- **地图/副本**: `sq_GetMap`, `sq_GetDungeonByStage`, `sq_GetMapIndex` — 副本系统（OOS for Phase 3）
- **UI/弹窗**: `sq_GetPopupWindows`, `sq_OpenPopupWindow` — UI 层（OOS for Phase 3）
- **下落帧**: `sq_SetDownUpFrame`, `sq_SetDownLieFrame`, `sq_SetDownBounceUpFrame` — 应归入 07-Physics

**Phase 3 需要的 99 项**: `sq_setSuperArmor`/`sq_removeSuperArmor`（超甲）、`sq_SetCurrentAttacknUpForce`/`sq_SetCurrentAttacknBackForce`（击退力覆盖）

---

## 十、更新后的字段引用链 DAG（全 22 系统）

```
[01-Input] 按键序列
    │ actionRequest
    ▼
[19-StateMachine] currentState ←── [09-Status] canAct / isStunned
    │ currentAction                      ▲
    │                              [20-Time] stateTimer
    ├──────────────────────────────────────────────────────┐
    ▼                                                      ▼
[05-Animation] frames[i]                          [06-Skill] coolTime/MP
    │ activeAtkBoxes / activeDmgBoxes                      │ atkRef
    ▼                                                      ▼
[04-Attack/Hit] AABB overlap ←──────────────── [13-DataStore] sq_var
    │ HitEvent {liftUp, pushAside, atkDef}
    ├──────────────────┬──────────────────────────────────┐
    ▼                  ▼                                  ▼
[07-Physics]    [DamageFormula]                   [09-Status]
  Z 积分           damageDealt                  AddChangeStatus
  onLanding            │                        (hitstun/down)
                       ▼
                [08-Resource] hp -= damage
                       │ onDeath / onHpChanged

横切支撑层（所有系统均可调用）:
[22-Identity]  uniqueId / GetObject / GetTeam
[17-Math]      getRandom / Abs / Sin / Cos
[21-Predicate] IsMyControlObject / IsExistObject
[20-Time]      GetCurrentTime / GetStateTimer
[18-Timer]     sq_timer_ 延迟回调
[13-DataStore] sq_var 脚本变量

Phase 4 扩展层:
[03-Monster/AI] → [19-StateMachine]（怪物侧）
[10-PassiveObj] → [07-Physics] + [04-Attack/Hit]
[14-Appendage]  → [09-Status]
[11-Pool]       → [15-VFX] + [10-PassiveObj]
[15-VFX]        → 渲染层
[16-CameraFX]   → 渲染层
[12-ScriptRT]   → 音频层

Phase 5+ OOS:
[02-Net/RPC]    → 服务器（PvE 单机 no-op）
```

---

## 十一、HOT/WARM/COLD 分层汇总

| 层级 | 字段特征 | 代表字段 |
|------|---------|---------|
| **HOT** | 每帧 tick 必读/写，放 sim-worker 内存 | `currentState`, `activeAtkBoxes`, `hp`, `commandBuffer`, `scriptVars(sq_var)`, `currentTime`, `isMyControlObject` |
| **WARM** | 每次状态转换读，可缓存 | `stateTransitionTable`, `changeStatus`, `statusDuration`, `timerQueue`, `appendageList` |
| **COLD** | 初始化时加载，只读 | `abilityCategory`, `levelData`, `bonusRateWithPassive`, `job`, `passiveObjectType`, `soundTag` |
