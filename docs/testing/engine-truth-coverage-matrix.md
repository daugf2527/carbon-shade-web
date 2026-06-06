# Engine 真值覆盖矩阵 (2026-06-05 Wave 2)

> dnf-native engine 真值贯通体检表。回答"6 个 combat truth 测的真值，engine 等价覆盖到哪、缺什么接口"。
> 本次 Wave 2 真值化的产物：3 域并行（伤害/reaction/stats）+ 整合。新增 2 个 **target `src/engine/`** 的 truth 测试，补"0 truth 守 engine"缺口。

## 一、本次新增的 engine truth 守护（缺口填补）

| 测试 | target | 守的真值契约 | 状态 |
|---|---|---|---|
| `tests/truth/engine-damage-truth.test.ts` | `src/engine/core/DamageFormula.ts` | atkBonus = 1 + damageBonus%/100（+90%→×1.9, -40%→×0.6 不坍缩）+ damageScalePct 流过 + 复合 | ✅ 绿 |
| `tests/truth/engine-reaction-truth.test.ts` | `src/engine/core/ReactionResolver.ts` | hitReaction 路由（lift_up→airborne / down+causesDown→down / horizon→stagger）+ 垂直 launch vy 由 liftUp 真值驱动（非常数）+ legacy 兼容 | ✅ 绿 |

**此前**：`tests/truth/` 6 个测试 **全 target `src/combat/`**（CombatKernel/ReactionResolver），0 个守 engine。新主线伤害/reaction 逻辑裸奔。

## 二、6 个既有 combat truth → engine 等价覆盖

| combat truth 测试 | 测的真值 | engine 等价实现 | 整合后 engine 能否守 | engine 缺的接口 |
|---|---|---|---|---|
| `swordman-attack1-truth` | attack1 帧数/hitbox/单次命中 | CombatResolutionSystem 命中循环 | 部分（帧/hitbox 已通，hitGroup 是 per-attacker 占位非 .atk id） | 真 hitGroup id |
| `swordman-full-actions` | shard 形状（14 ani/81 atk/6 weaponHitInfo） | 同 shard，engine 直接消费 | ✅ 数据层共享，无需 engine 专属 | — |
| `swordman-reaction-formulas` | attack3→launch / slot 路由 / facing velocityX | engine ReactionResolver 路由已等价；**velocityX engine 无字段** | 垂直 launch ✅；**水平 velocityX ❌** | Actor 无 velocity.x（P4） |
| `reaction-routing` | hitReaction→ReactionKind 路由 | `routeFromHitReaction`（engine 版已移植） | ✅ kind 路由等价（engine 把 heavy/light 折成 stagger，downed/knockback 折成 down/hit） | 细分 reaction state（knockback 独立态） |
| `reaction-velocity` | velocityY=liftUp×launch×wf / velocityX=pushAside×pushBack×wf | `computeLaunchVy`（垂直）已移植，wf stub 照搬 | 垂直 vy ✅；**水平 vx ❌** | Actor 无 velocity.x |
| `hit-resolution-weapon-timeline` | DualTimelineAction 从 weapon timeline 读 attackBoxes | engine 用 AnimationPlayer.currentFrame.attackBoxes | 部分（单 timeline；engine 无 weapon timeline 双轨） | DualTimelineAction 模型 |

## 三、engine 真值缺口清单（诚实标注，留后续阶段）

| 缺口 | 影响 | 归属阶段 | 不修原因 |
|---|---|---|---|
| **水平/Z 击退 velocity** | combat 的 velocityX=pushAside×pushBack×facing 在 engine 无字段 | P4 | Actor 加 velocity 三轴会破 stateHash 确定性契约，需专项设计 |
| **physicalAttack 真值 vs 手感** | PVF base=7.5 / LV70-sum=82.8，当前用占位 45 保 2-拳致死手感 | P4/Stage4 | engine 无等级/装备加成模型，直接接真值游戏手感崩（每拳 7 → 10 拳致死） |
| **goblin mob 绝对 base** | mob shard 只有 abilityCategory 百分比，绝对 base 在 DNF.exe | 已知缺口（CLAUDE.md） | GOBLIN_BASE 标 local_baseline，百分比修正是真值 |
| ~~**hitstun 真值**~~ ✅ **已解(2026-06-06,见第九节)** | ~~swordman-attacks.json 无 hitstun~~→真值是**受击方** chr/mob.hitRecovery(swordman 600/goblin 500ms)| — | 原判"PVF 不含"有误:attacks 不含,受击方 hitRecovery 含 |
| **真 hitGroup id** | per-attacker dedup 是 P3.0 占位 | P4 | 需接 .atk hitGroup 数据 |
| **crit/element** | DamageFormula 常量 1.0 | Stage4 | API 不覆盖 |
| **moveSpeed 单位** | PVF moveSpeed=850 是 %xSPEED_VALUE_DEFAULT 百分比非 px/s | — | engine 暂不消费 stats.moveSpeed |

## 四、本次真值化接线总览

```
swordman-attacks.json (damageBonus/hitReaction/liftUp/causesDown)
  + swordman.json chr.weaponHitInfo[slot] (launch/damageScalePct)
        │
        ▼ CombatResolutionSystem (整合点，currentActionName 查表 + slot 路由)
        ├─► DamageFormula.calcPhysicalDamage(atkBonus=1+db%/100, damageScalePct)
        └─► ReactionResolver.applyHitReaction(hitReaction 路由 + 垂直 launch vy)
                                              │ fallback: 合成动画走 attackLiftVy(liftUpValue)
        ▼
   swordman.ts chr.growth → statsFromPlayerShard (hpMax/def 真值, atk 占位)
   goblin 百分比修正 → statsFromGoblinTruth (hp×65/atk×75/def×80)
```

**damageBonus 语义判定**（关键，无第一证据，从数据反推）：combat 从未消费 damageBonus（grep 0 命中），故无同项目第一证据可镜像。shard 内存在负值（weaponcombolight1=-40）→ 排除 `value/100` 解释（会得负伤害）→ 锁定 `1 + value/100`（-40%→×0.6）。标 `requiresManualVerification`，待客户端实测核验系数叠加方式。

## 五、P3 收尾：scenario/replay 确定性真值化（2026-06-06）

EngineKernel 的 3 个 stub（`runDeterministicScenario` / `scenario` / `replay`）从返回空 `{}`/`null` 升级为真值实装。守护：`tests/static/engine-scenario-replay.test.ts`(S1-S6) + `consistency-check` 的 `maturity/p3-engine-scenario-replay`。

**确定性承诺**（engine 对 combat 的核心增益，现可自证）：

| 测试 | 验证 | 实测 |
|---|---|---|
| S2 | attack1 命中 → `normalHitObserved` | true |
| S3 | attack3 `hit_lift_up` → airborne → `launchObserved` | true（vy=300×weightFactor≈164） |
| S4 | `replay.export()` 有效 | 28 帧 / finalStateHash 非空 / metadata 镜像 |
| S5 | 同 seed → 同 finalStateHash | 28 帧逐帧一致 |
| S6 | 不同 seed → 不同 finalStateHash | seed 42 vs 99 发散（PRNG 折进 hash） |

**scenario 7 boolean 诚实覆盖**（engine 现有 player+grunt+5 action + bleed DOT StatusSystem,能观测 3/7）：

| boolean | 状态 | 缺口原因 |
|---|---|---|
| `normalHitObserved` | ✅ 可观测 | attack1 命中 |
| `launchObserved` | ✅ 可观测 | attack3 hit_lift_up → airborne |
| `bleedObserved` | ✅ 可观测 | bleed DOT 扣血（StatusSystem,09-Status） |
| `ragingFuryMultiHitObserved` | ❌ P4 | engine 无多段 super action |
| `armorHitObserved` | ❌ P4 | engine 无 boss/super-armor actor |
| `buildingArmorBlockedControlObserved` | ❌ P4 | engine 无 building actor |
| `quickReboundObserved` | ❌ P4 | engine 无 quick-rebound 机制 |

**架构边界**：`runDeterministicScenario()` 不造世界（无 `new Actor`/无系统装配），只在已装配 kernel 上脚本化 player + 首个非 player actor，守"kernel 是纯容器"原则。browser:smoke 的 boss/building reference 场景仍需 P4 补 actor 后才能解封（见 `tests/browser/combat-smoke.spec.ts` skip 注释）。

## 六、09-Status：bleed DOT 确定性真值化（2026-06-06）

engine 新增 tick-based bleed DOT(区别于旧 `core/StatusEffectSystem.ts` 墙钟未接线类):per-actor `Actor.statusEffects` + 纯逻辑 `core/StatusEffects.ts` + kernel `StatusSystem`(phase CLEANUP)。守护:`tests/static/engine-status-dot.test.ts`(T1-T4) + consistency `maturity/p3-engine-scenario-replay` 的 `bleedWired`。

**真值来源**：`BLEED_PROFILE`(durationTicks=180 / tickIntervalTicks=30 / dotDamagePerStack=6 / maxStacks=5)逐字镜像 `src/data/manifest/status/default.json` profiles.bleed,全字段 **local_baseline / requiresCalibration**(PVF 不含 status DOT 曲线,同 hitstun 缺口类)。

| 测试 | 验证 | 实测 |
|---|---|---|
| T1 | DOT 每 30 tick 扣 6,180 tick 过期 | 命中 t=30/60/90/120/150,过期清零 |
| T2 | stacks 上限 maxStacks,DOT 随 stacks 线性 | 封顶 5 stacks → 30 dmg/interval |
| T3 | kernel 集成:死于 bleed → FSM DEAD + death_clear + ActorDied + bleedObserved | 20hp dummy 121 tick 死,状态清空,事件发出 |
| T4 | 同 seed+序列 → 同 hp trail + finalStateHash | 逐帧一致 |

**确定性**：DOT 是 tick-based(非墙钟),`statusFingerprint` 折进 `computeStateHash`(仅在 status 非空时追加,对无 status 的既有 replay 零哈希影响),replay 可复现。**死亡处理**:DOT 致死 force FSM DEAD + 清 statusEffects(death_clear 策略)+ emit ActorDied,与命中致死同事件流。

## 七、08-Resource：MP regen + cooldown 确定性真值化（2026-06-06）

engine 新增 tick-based MP 资源池 + 技能冷却(区别于旧 `core/SkillResource.ts` 墙钟未接线类):per-actor `Actor.mp` + `Actor.cooldowns(CooldownLedger)` + 纯逻辑 `core/ResourcePool.ts` + kernel `ResourceSystem`(phase LOGIC,早于后续阶段→技能查询见最新 MP/CD)。守护:`tests/static/engine-resource.test.ts`(R1-R5)+ consistency `maturity/p4-engine-resource`。

**真值来源**(PVF tier1,实物验证):
| 字段 | 来源 | swordman 实测 |
|---|---|---|
| mpMax | `chr.growth.mpMax.values[lv]` | base 140 |
| mpRegenSpeed | `chr.growth.mpRegenSpeed.values[lv]` | base 50（单位 mp/min,22-system field-matrix）|
| consumeMp | `skills[id].consumeMp.baseMp` | icewave 27 |
| cooldown | `skills[id].coolTime.dungeonMs` | icewave 7000ms |

唯一 engine 算术 = regen 单位换算:50 mp/min ÷ 60 ÷ 60 = 0.01389 mp/tick;cooldown ms→tick 用 ceil(7000ms→420 tick,永不提前就绪)。

| 测试 | 验证 | 实测 |
|---|---|---|
| R1 | mp/min→mp/tick 换算 + 回复封顶 | 0.01389 mp/tick,1min→50mp,封顶 mpMax |
| R2 | cooldown ms→tick(ceil)+ 倒计时就绪 | 7000ms→420 tick |
| R3 | trySpend 仅在够 MP 且 CD 就绪才扣 | MP 不足/CD 中均拒绝,零副作用 |
| R4 | kernel 集成:requestSkill 触发/哑火 + MP 回复 | SkillFired/SkillFizzled 事件,MP 随时间回升 |
| R5 | 同 seed+序列 → 同 mp trail + finalStateHash | 逐帧一致 |

**确定性**：MP(`mp.toFixed(3)`)+ cooldown fingerprint 折进 `computeStateHash`(cooldown 仅非空时追加),replay 可复现。MP regen 是 tick-based 分数累加(非墙钟 ready-at 时间戳)。技能消耗走 `requestSkill` 队列(ActionSystem 式 FIFO),CombatScene 已注册 ResourceSystem;按键→requestSkill+requestAction 的输入接线属后续(scene 层)。

> **测试基建附记**：`tick-benchmark` 改用 `process.cpuUsage()`(CPU 时间)替代墙钟——static-test runner 并发跑 ~100 子进程,墙钟在满核争用下抖动(实测中位 656us vs 空载 225us)。CPU 时间只计本进程实际算的周期,对调度争用免疫,是"per-tick 成本是否回归"的正确度量。

## 八、03-Monster/AI：sight/attackDelay 真值化（2026-06-06）

EnemyAISystem 原跑硬编码 `DEFAULT_CFG`(sightRange 200 / attackDelay 60 tick,代码内显式标注 "to be read from mob shard in P4")。本次接 goblin .mob shard 真值。守护:`tests/static/engine-monster-ai-truth.test.ts`(A1-A5)+ consistency `maturity/p4-engine-monster-ai`。

**真值来源**:
| 字段 | 来源 | 置信度 | goblin 实测 |
|---|---|---|---|
| sightRange | `mob.sight.value` | **PVF tier1**(无 requiresManualVerification)| 300px |
| attackDelayTicks | `mob.attackDelay.value`(ms)→ tick | PVF tier3 | 3000ms → 180 tick |
| attackRange | **local_baseline** | — | 80px(无干净 PVF 标量,真实打击距在 attack .ani attackBoxes 几何里;mob.widthBox=[40,10] 是体宽非打击距,诚实标注) |

**实装**:`core/MonsterAIConfig.ts`(aiConfigFromMobShard 解析 + aiConfigFromGoblinTruth 镜像)+ per-actor `Actor.aiConfig` + EnemyAISystem 读 `actor.aiConfig ?? DEFAULT`(删除 static DEFAULT_CFG)+ CombatScene grunt 接 aiConfigFromGoblinTruth(create+reset 两路径)。

| 测试 | 验证 | 实测 |
|---|---|---|
| A1 | shard 解析 sight/attackDelay + ms→tick + 缺字段安全回退 | 300 / 180 / 缺→default |
| A2 | goblin truth = sight 300 / attackDelay 180 tick | ✓ |
| A3 | sight 真值驱动 chase(可区分 default)| 250px 处 truth(300)追,default(200)idle |
| A4 | attackDelay 真值驱动节奏 | truth 180→2 次攻击 vs default 60→6 次(360 tick)|
| A5 | 同 seed+config → 同 attack-tick 序列 | 攻击于 tick 2/182/362 |

**回归**:engine-two-way-fight 不变(其 grunt 无 aiConfig → 回退 DEFAULT_MONSTER_AI_CONFIG = 旧 200/80/60 硬编码值,行为等价)。**诚实边界**:attackRange 仍是 local_baseline(PVF 无标量),warlike roll(命中概率)仍 P4 defer(EnemyAISystem 注释已标),weight/hitRecovery 真值已可得但当前 AI 决策未消费(留后续)。

## 九、hitstun 真值化：受击方 hitRecovery 驱动（2026-06-06）

ReactionResolver 原用 `DEFAULT_HITSTUN_MS=600`(标 "local_baseline — swordman-attacks.json has no hitstun field")。**真值修正**:hitstun 不是攻击方属性而是**受击方属性**——swordman `chr.growth.hitRecovery` base=600ms（死值其实就是它）/ goblin `mob.hitRecovery`=500ms。守护:`tests/static/engine-hitstun-truth.test.ts`(H1-H4)+ consistency `maturity/p4-engine-hitstun`。

**真值来源**:
| 受击方 | 字段 | 置信度 | 值 |
|---|---|---|---|
| swordman | `chr.growth.hitRecovery.values[0]` | PVF | 600ms（= 旧死值,玩家行为不变）|
| goblin | `mob.hitRecovery.values[0]` | PVF tier3 | 500ms（怪物恢复更快,真值驱动变化）|

attack1 无 hitstun 字段(`causesStun` 是 stun **状态**布尔,非硬直时长)→ 确认 hitstun 归属受击方,非攻击。

**实装**:ActorStats 加 `hitRecovery?: number` + statsFromPlayerShard(growth.hitRecovery)/statsFromMonsterShard(mob.hitRecovery)/GOBLIN_TRUTH 镜像提取;ReactionResolver `hitstunMs = flags.hitstunMs ?? defender.stats.hitRecovery ?? DEFAULT_HITSTUN_MS`(DEFAULT 降为最终 fallback)。

| 测试 | 验证 | 实测 |
|---|---|---|
| H1 | stat 来源 | swordman 600ms / goblin 500ms |
| H2 | 反应用受击方 hitRecovery | goblin 500ms→30tick |
| H3 | 受击方区分 | 500ms 比 600ms 先恢复(tick31 fast 清 slow 未清)|
| H4 | fallback + flags 覆盖 | 无 stat→600;flags.hitstunMs 优先 |

**回归**:engine-combat-loop/airborne/two-way-fight 全 PASS(goblin 600→500ms 在松界限内,确定性测试同 config 仍等价)。**意义**:把第三节缺口表里的 "hitstun 真值"(原标 "PVF 不含,诚实保留 600ms local_baseline")**升级为 PVF tier3 真值**——原判断"PVF 不含"有误:attacks 不含,但受击方 chr/mob 的 hitRecovery 含。

## 十、D 组：DualTimeline 攻击盒平铺（2026-06-06）

DNF action 播 body + weapon 双 timeline,weapon timeline 携带 attackBoxes。engine 用单帧游标(`AnimationPlayer.currentFrame.attackBoxes`),故在 `play()` 时把 weapon timeline 的 attackBoxes **按帧索引平铺**进 body 帧。守护:`tests/static/engine-weapon-timeline-flatten.test.ts`(W1-W5)+ consistency `maturity/d-weapon-timeline-flatten`。

**实装**:`core/weaponTimelineFlattener.ts` 纯函数 `flattenWeaponTimeline(body, weapon)`(按 index 合并 attackBoxes,帧数不等时 weapon 超出帧追加 / body 超出帧透传)+ AniDef 加可选 `weaponTimeline?: readonly AniFrame[]` + `play()` 检测到 weaponTimeline 则一次性平铺(currentFrame 接口不变)+ parseAniDef 前向兼容解析。

| 测试 | 验证 | 实测 |
|---|---|---|
| W1 | lockstep 合并:weapon frame i → body frame i 的 attackBoxes | weapon hitbox 进 f1,body damageBox 保留 |
| W2 | 帧数不等 | weapon 长→追加;body 长→尾帧透传 |
| W3 | 端到端:纯 weaponTimeline AniDef 命中 | body 全空 attackBox,命中完全来自 weapon(hp 46→39)|
| W4 | 确定性 | 平铺 anim 逐帧 stateHash 一致 |
| W5 | no-op 安全 | 无 weaponTimeline 的 AniDef 不变(向后兼容)|

**⚠️ 诚实边界(这是预备件,非"已真值化")**:
- **数据缺口**:baseline shard 当前**无 weapon timeline 数据**(16.2% BLOCKED——weapon attackBox PVF 提取不完整;实测 swordman body animations 的 attackBoxes 全空)。故运行时暂无 AniDef 供给 weaponTimeline,flattener 是 **dead-until-data 的休眠机械**。合并逻辑确定性可测,数据流入即生效。
- **轴映射前置假设(不在 flattener 做)**:combat 与 engine 的 box y/z 轴**相反**(combat y=depth/z=height;engine y=height/z=depth,见 HitDetection.ts)。flattener **不做轴变换**,假设两 timeline 的 box 已是 engine 约定。把 PVF 原始 weapon box 转 engine 约定是**提取管线职责**,上游于本合并——刻意不在数据缺失时引入无法校验的轴映射假设。
- **范围**:D1 lockstep(同帧延迟,weapon frame i 对齐 body frame i)。真正的独立双帧游标推进(body 帧 3 时 weapon 帧 5)是 Phase 3 渲染层工作,显式 OOS。
