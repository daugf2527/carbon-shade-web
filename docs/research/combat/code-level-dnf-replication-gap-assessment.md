# DNF 1:1 复刻代码级差距评估报告

> **Status: [CANONICAL]** — 代码级完成度和具体源码路径缺口

日期：2026-04-29

## 评估方法

本报告基于对 Combat Lab 项目所有核心源文件的逐行阅读和分析，以 DNF 1:1 全职业复刻为目标，按子系统逐一评估当前完成度。每个子系统的评估包含：实际代码行数、已实现功能、DNF 所需功能、完成度百分比。

## 一、动作/技能系统 — 完成度约 0.6%

**实际代码：** `src/combat/actions/FrameDataAction.ts`，共 97 行。

### 已实现

当前手写了 **15 个 Berserker 战斗动作** + 1 个敌方动作 + 若干 debug/工具动作：

| 动作 | 帧数 | Hitbox 数 | 说明 |
|---|---|---|---|
| Idle | 1 | 0 | 待机 |
| Walk | 1 | 0 | 行走（speed 2.45/tick） |
| Run | 1 | 0 | 奔跑（speed 4.15/tick） |
| NormalBasic1 | 20 | 1 | 普攻1段，light_stagger |
| NormalBasic2 | 22 | 1 | 普攻2段，medium_stagger |
| NormalBasic3 | 31 | 1 | 普攻3段，heavy_stagger |
| DashAttack | 24 | 1 | 跑动攻击 |
| Jump | 22 | 0 | 跳跃 |
| JumpAttack | 26 | 1 | 跳跃攻击 |
| FrenzyToggle | 1 | 0 | 开启/关闭狂暴 |
| FrenzyBasic1 | 18 | 2 | 狂暴普攻1段 |
| FrenzyBasic2 | 20 | 2 | 狂暴普攻2段 |
| FrenzyBasic3 | 28 | 3 | 狂暴普攻3段（含击倒） |
| UpwardSlash | 27 | 1 | 上挑（launch） |
| MountainousWheel | 45 | 2 | 崩山击（slash + shockwave） |
| RagingFury | 53 | 11 | 怒气爆发（1 shockwave + 10 blood pillars） |
| Bloodlust | 34 | 1 | 嗜魂之手（grab） |
| Backstep | 21 | 0 | 后跳 |
| QuickRebound | 190 | 0 | 受身蹲伏（max 180f hold） |
| Derange | 1 | 0 | 暴走（120f cooldown） |
| EnemyBasic | 36 | 1 | 敌方基础攻击 |

### DNF 所需

DNF 有 60+ 职业 × 每职业 40+ 技能 = **2400+ 技能**。每个技能的逐帧数据包括：多个 hitbox、hurtbox 变化、状态标志位、sound effect、VFX、取消窗口、无敌窗口。

**当前完成：15/2400 ≈ 0.6%。**

### 核心缺口

1. **零对象型技能（projectile/active object）**：`CombatKernel.ts:374` 行遍历 `action.active` 直接生成 hit query，没有独立的 projectile/object entity 生命周期。RagingFury 的 blood pillars 仍是 action active windows 直接生成多段 hitbox，不是独立 entity。
2. **零抓取完整流程**：Bloodlust 只有 grab detection（`GrabResolver.ts:11` 行），成功后没有 hold attach、位移锁定、喷发分段、释放动画。
3. **手工数据**：所有 hitbox 参数（offset、w、d、h、damage、reaction）都是手写字面量。例如 `hit("nb1",5,8,"normal_1",10,{offsetX:50,w:92,d:40,h:58,...})`，没有从 ANI/PVF 抽取的痕迹。
4. **sweep 和 grab_attach 碰撞形状已定义但未实现**。

---

## 二、伤害公式 — 完成度约 5%

**实际代码：** `src/combat/damage/DamageFormula.ts`，共 44 行。

### 已实现

```typescript
let multiplier = 1;
if (flags.isCounter && req.canTriggerCounter) multiplier *= 1.25;  // counter
if (flags.isBackAttack && req.canTriggerBackAttack) multiplier *= 1.0;  // 占位
if (flags.isCritical && req.canTriggerCritical) multiplier *= 1.5;  // 从未触发
for (const modifier of extraMultipliers) multiplier *= modifier.value;
return Math.max(0, Math.floor(req.baseDamage * multiplier));
```

### DNF 所需但缺失

- **属性系统**：Actor 结构（`types.ts:56-57`）只有 `hp/maxHp/mp/maxMp/cube`，没有 STR/INT、物攻/魔攻、独立攻击、属强、防御。
- **Classic damage bucket**：黄字（同类取最大）、额外黄字（相加）、爆伤（取最大）、额外爆伤（相加）、技攻（乘算）、最终伤害（相加）、异常伤害转换。
- **Modern DFO bucket**：Atk. Increase、Final Damage、cooldown recovery。
- **Defense formula**：防御减伤 = 防御力/(防御力 + 攻击方等级 × 200)。
- **Elemental formula**：属强增伤 = 1 + (属强 - 属抗)/222。
- **Crit rate / hit rate / evasion**：完全缺失。
- **PvE/PvP/版本/职业/技能等级分表**：无。

当前是 `finalDamage = floor(baseDamage × multiplier)` 的占位实现。

---

## 三、判定系统 — 完成度约 30%

**实际代码：**

| 文件 | 行数 | 职责 |
|---|---|---|
| `HitResolver2D5.ts` | 43 | 碰撞检测（rect + circle） |
| `HitDecisionResolver.ts` | 24 | 综合判定决策 |
| `HitRejectionResolver.ts` | 23 | 判定拒绝逻辑 |

### 已实现

- Rect 碰撞检测（`rectsOverlap2D5`）
- Circle AOE 碰撞检测（`circleRectOverlap2D5`）
- Facing 镜像 offset（`signedFacingScale`）
- Z 轴/Y 轴 mismatch 检测

### DNF 所需但缺失

- **Sweep 碰撞**：`HitboxShape` 类型定义了 `sweep` 但 `HitResolver2D5.geometry()` 只处理 rect 和 circle。
- **Grab_attach 碰撞**：定义了但未实现。
- **逐帧 hurt box**：当前 `target.hurtBoxes[0]` 只取第一个固定 hurt box。DNF 每个动作帧的 hurt box 都在变化（受击框随动画缩小/位移）。
- **原始六整数坐标**：研究报告要求保存原始坐标系下的 6-int box 和语义置信度，当前完全缺失。
- **棱柱体碰撞**：研究报告要求的 true 3D 棱柱体碰撞（考虑 Y 轴高度差）未实现，当前仅做 X-Z 平面检测 + Y mismatch 标记。

---

## 四、状态系统 — 完成度约 25%

**实际代码：** `src/combat/status/StatusEffectSystem.ts`，共 104 行。

### 已实现 5 种 DOT 状态

| 状态 | 持续 | 间隔 | 伤害/栈 | 最大栈 | 特殊 |
|---|---|---|---|---|---|
| bleed | 180f | 30f | 6 | 5 | - |
| poison | 180f | 30f | 5 | 5 | - |
| burn | 180f | 30f | 5 | 5 | 150px splash（圆 = distance check） |
| shock | 180f | 30f | 4 | 5 | - |
| rupture | 180f | - | - | 5 | 入伤乘数 1+stacks×0.1 |

### DNF 所需但缺失

- **9 种未实现的 StatusEffectType**：`types.ts:23` 定义了 stun、freeze、stone、bind、sleep、slow、defense_down、attack_down、curse，但在 `STATUS_PROFILES` 中没有对应 profile。
- **Resistance/tolerance 系统**：`StatusEffect.resistanceCheck` 字段存在但永远是 `{accepted:true}`，没有实际抗性计算。
- **Dispel 机制**：定义了 `dispelPolicy` 但没有实现 remove/dispel 逻辑。
- **Modern DFO 系统**：Neutralize（控制免疫爆发）、Ignite（火属性爆发）、Groggy（破防状态）完全没有。
- **PvE/PvP 分 profile**：只有一个 demo profile。
- **状态触发散落在 kernel 里**：`CombatKernel.ts:459` 行硬编码 `RagingFury + vim_and_vigor → applyBleed`，未完全数据化。

---

## 五、AI 系统 — 完成度约 15%

**实际代码：**

| 文件 | 行数 | 职责 |
|---|---|---|
| `EnemyAI.ts` | 113 | 简单 FSM |
| `enemyTuning.ts` | 83 | 5 种敌人参数 |

### 当前 FSM 状态机

```
idle → approach → windup → attacking → recover → idle
                                    ↓
                                  stunned（从任何状态打断）
```

### 5 种敌人参数

| 类型 | detectRange | attackRange | preAttack | postCooldown | speed | HP | damage | armor |
|---|---|---|---|---|---|---|---|---|
| grunt | 360 | 72 | 16 | 34 | 1.05 | 160 | 5 | none |
| dummy | 260 | 76 | 24 | 48 | 0.75 | 160 | 12 | super_armor |
| imp | 300 | 120 | 18 | 42 | 1.15 | 120 | 8 | none |
| boss | 360 | 96 | 38 | 64 | 0.55 | 420 | 25 | boss_super_armor |
| building | 0 | 0 | 0 | 0 | 0 | 500 | 0 | building_armor |

### DNF 所需但缺失

- **行为树/脚本树**：当前是固定 FSM，DNF 需要参数化脚本节点（condition → action → weight → cooldown）。
- **技能选择**：每个敌人只有一个 `EnemyBasic` 动作。真实 DNF boss 有多个技能，需要冷却、优先级、随机分支。
- **仇恨系统**：没有多目标仇恨表、没有最后攻击者追踪、没有队伍目标分配。
- **Boss pattern phases**：boss 没有阶段切换（phase 1/2/3）、armor break 判定、场地交互。
- **Z 轴寻路**：只在 2D 平面移动，Z 轴仅做 tolerance 判断，没有实际 Z 轴移动。

---

## 六、反应/反馈系统 — 完成度约 40%

**实际代码：**

| 文件 | 行数 |
|---|---|
| `ReactionResolver.ts` | 59 |
| `ReactionProfiles.ts` | 27 |
| `ReactionHandfeelApplier.ts` | 18 |
| `HitStopController.ts` | 9 |
| `RecoilController.ts` | 2 |

### 已实现

- 9 种 ReactionKind 的 default profiles：
  - `micro_stagger`：5f hitstun，1.2 knockback
  - `light_stagger`：10f hitstun，2.6 knockback
  - `heavy_stagger`：14f hitstun，3.4 knockback
  - `knockback`：11f，4.4 knockback + Y velocity 1.4
  - `launch`：Y velocity 5.8，30f down
  - `downed`：30f down，14f getup
  - `armor_feedback_only`：12f 视觉反馈
- HitStop 帧冻结（`HitStopController`）
- Recoil 攻击后摇延迟（`RecoilController`）
- Camera shake（heavy hit baseDamage ≥34 或 launch）
- Handfeel 状态管理（hitFlash、visualRecoil）

### DNF 所需但缺失

- **Downed/airhit/sweep 完整规则**：没有 sweep 倒地追加、airhit 空中连段、无限连段保护。
- **Launch decay**：launch 后没有递减机制（连续浮空高度衰减）。
- **细分 hit stop**：当前 direct hit、projectile hit、grab hit 共用同一个 stop profile，没有区分。
- **Super Armor Break**：没有破霸体机制。
- **Holding Gauge**：没有控制条。
- **Groggy 状态**：没有破防后的虚弱状态。

---

## 七、Armor 系统 — 完成度约 35%

**实际代码：**

| 文件 | 行数 |
|---|---|
| `ArmorResolver.ts` | 14 |
| `GrabResolver.ts` | 11 |
| `ActorFactory.ts`（armor 部分） | ~50 |

### 4 种 armor 类型已实现

| 类型 | 被控 | 被击飞 | 被击倒 | 被击退 | 被抓取 |
|---|---|---|---|---|---|
| none | ✗ | ✗ | ✗ | ✗ | ✗ |
| super_armor | ✓ | ✗ | ✗ | ✗ | ✗ |
| boss_super_armor | ✓ | ✗ | ✗ | ✗ | ✓ |
| building_armor | ✓ | ✗ | ✗ | ✗ | ✓ |

### DNF 所需但缺失

- **Super Armor Break**：破霸体计量表。
- **Holding Gauge**：控制条（被抓取/控制时的累积）。
- **Neutralize**（控制免疫爆发）。
- **Groggy**（破防虚弱状态）。
- **Temporary armor 细粒度**：当前只有 invulnerableUntilTick、getUpArmorUntilTick、superArmorUntilTick 三个临时标记。

---

## 八、Replay 系统 — 完成度约 30%

**实际代码：** `src/combat/replay/ReplayRecorder.ts`，共 70 行。

### 已实现

- Per-frame actor snapshot（hp、pos、reaction、action、facing、locomotion、buffs、status）。
- Per-frame input snapshot（held、pressed、released）。
- Per-frame flushed events（id、type、payload）。
- Deterministic stateHash（FNV-1a hash of stable-sorted JSON）。
- `replay-hash.test.ts` 验证同一输入 → 同一 hash。

### DNF 所需但缺失

- **buildHash** 硬编码 `"local-dev"`，未接入 git commit/package version。
- **combatSchemaHash** 硬编码 `"combat-schema-v1"`，不是基于 action/status/schema 实际内容生成。
- **Actor snapshot 不完整**：只保存了 hp、pos、reaction、action、facing、locomotion、buffs、status。缺少 velocity、armorProfile、cooldowns 完整状态。
- **无网络同步**：没有 server-authoritative、输入日志回放、rollback netcode。
- **无 replay 回放功能**：只能录制，不能从录制文件重新驱动 simulation。

---

## 九、Sprite/Asset 系统 — 完成度约 10%

**实际代码：** `src/game/SpriteFrameLibrary.ts`，共 461 行。

### 5 张 normalized sprite sheets

| 角色 | 尺寸 | 帧组数 | 总帧数 |
|---|---|---|---|
| player | 448×432 | 14 | 68 |
| goblin | 672×272 | 12 | 48 |
| skeleton | 272×272 | 8 | 24 |
| imp | 288×272 | 7 | 20 |
| boss | 512×288 | 10 | 49 |

### 核心缺口

- **Jump 动画缺失**：`Jump` 动作映射到 `jump` 组，但 player sheet 的 `frames` 中**没有 `jump` 键**。`getCombatSpriteSpec()` 第 412 行 `if (action === "Jump") return spec(s, "jump", req, "loop", 1)`，但 `SHEETS.player.frames` 中不存在 "jump"，会 fallback 到 `sheet.frames.idle`。这是视觉 fidelity 缺口。
- **EnemyBasic 映射粗糙**：boss 的 EnemyBasic 映射到 `slam_attack`，dummy 映射到 `block`，imp 映射到 `attack`。都是固定映射，不是从数据文件驱动。
- **无 NPK/IMG/ANI pipeline**：完全没有资源抽取工具链（`tools/dnf-extract/` 不存在）。
- **Fixed-cell sheets**：使用固定大小单元格，不是 trimmed atlas。DNF 真实资产是每个动作帧独立尺寸 + anchor point。
- **Hitbox 与 sprite frame 不同步**：两者没有关联到同一 source timeline。

---

## 十、测试覆盖 — 完成度约 5%

**实际代码：** 4 个测试文件，共约 250 行。

| 测试文件 | 行数 | 覆盖内容 |
|---|---|---|
| `dfo-replica.test.ts` | 108 | 12 项 Berserker 竖切行为 |
| `hit-shape.test.ts` | 71 | circle AoE + rect 碰撞 |
| `status-profile.test.ts` | 50 | 4 DOT + burn splash + rupture |
| `replay-hash.test.ts` | 25 | deterministic hash |

### DNF 所需但缺失

- **无 parser 测试**：没有 ANI/PVF/NPK 解析器的 unit test。
- **无 frame parity 测试**：没有对比客户端实机帧数据的 pixel-level 验证。
- **无 render calibration 测试**：没有截图对比。
- **无全职业/怪物/对象技能测试**。
- **无网络同步测试**。

---

## 总体评估表

| 子系统 | 代码行数 | 完成度 | 核心缺口 |
|---|---|---|---|
| 动作/技能 | 97 | 0.6% | 15/2400+ 技能，零对象型技能 |
| 伤害公式 | 44 | 5% | 只有 base×multiplier，缺完整 DNF 公式 |
| 判定系统 | ~100 | 30% | sweep/grab_attach 未实现，单 hurt box |
| 状态系统 | 104 | 25% | 5/14 类型，无 resistance/dispel |
| AI 系统 | 196 | 15% | 简单 FSM，无行为树/仇恨 |
| 反应/反馈 | ~120 | 40% | 缺 downed/airhit/sweep/保护规则 |
| Armor 系统 | ~25 | 35% | 缺破霸体/控制条/Groggy |
| Replay | 70 | 30% | 本地单机，无网络/回放 |
| Asset | 461 | 10% | demo sheets，无 NPK pipeline |
| 测试 | ~250 | 5% | 250 行 vs 需要的数千行 |
| **总计** | **~2,200** | **15-20%** | |
| **CombatKernel** | **633** | **架构正确** | 核心管线已完备 |

## 结论

当前系统是 **Berserker 竖切技术验证原型**，约完成 DNF 1:1 复刻所需内容的 **15-20%**。不是"接近完成但缺细节"，而是"核心架构正确但内容填充率极低"。

最大的缺口不是代码架构（架构反而没问题），而是：

1. **数据工程**：从 PVF/ANI/NPK 抽取逐帧数据的工具链为零。
2. **伤害公式**：当前是玩具级占位。
3. **内容量**：15 个技能 vs 需要的 2400+。
4. **AI/对象技能/抓取**：功能定义但实现深度浅。

下一阶段最需要做的是 P0 数据系统化：将现有手写数据迁移为版本化 JSON manifest，让后续的 PVF/ANI/对象技能/版本 profile 都有落点。

## 风险与边界

- 本评估基于 2026-04-29 代码快照。后续开发可能改变完成度。
- 百分比为相对 DNF 1:1 全职业复刻的估计值，带有主观判断成分。
- "已实现"指已写入代码并通过测试的内容。"已定义"指类型层面存在但未落地实现。
- DNF/DFO 为 Neople/腾讯的商标，本报告仅作技术对标分析。
