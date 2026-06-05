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
| **hitstun 真值** | swordman-attacks.json 无 hitstun 字段，保留 600ms local_baseline | — | PVF 不含，诚实保留非伪装真值化 |
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
