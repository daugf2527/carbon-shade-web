# 22-System 字段矩阵（最小闭环 5 系统先行）

**日期**: 2026-05-27  
**数据来源**: `verification/baseline-shards/players/swordman.json` (2.2MB) + `monsters/goblin.json` (27KB) + `shared/physics.json`  
**classify-v4 参考**: `verification/nut-samples-2026-05-27/classify-v4-output.json`

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

**关键链路**: `chr.attackInfo` 记录了每个 action 引用哪个 .atk 文件。skill 的 section 中有 `[attack info]` 段指向特定的 atk。

```
skill path (如 skill/swordman/upperslash.skl)
  → .skl sections 中的 [attack info] 段
  → 引用 atkDef (如 character/swordman/attackinfo/attack1.atk)
  → attacks["attack1"] 中的 liftUp/pushAside/damageBonus 等
```

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

## 九、剩余 17 个系统（Phase 4 再排）

classify-v4 的 22 buckets 减去以上 5 个 = 剩余 17 个：

02-Net/RPC, 03-Monster/AI, 01-Input, 09-Status, 10-PassiveObj, 11-Pool, 12-ScriptRT, 13-DataStore, 14-Appendage, 15-VFX, 16-CameraFX, 17-Math, 18-Timer, 19-StateMachine, 20-Time, 21-Predicate, 22-Identity

其中 Input (01) 和 StateMachine (19) 在最小闭环起步阶段可能需要简化版，其余 Phase 4 再排。
