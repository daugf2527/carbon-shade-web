# dnf-native Kernel 设计（2026-05-21）

> 7 个并行 agent 数据驱动反推汇总。从 PVF 真值反推 kernel 拓扑，不依赖项目历史或一般游戏开发经验。
>
> **关键决策**：开 `dnf-native` 分支重写战斗 kernel，**保留所有 verified 资产**（tools / src/data/official/dnf / src/game 渲染层 / src/extraction），**抛弃手调战斗逻辑**（src/combat/ 整个 / 38 个 手调 action / ReactionProfile 预设）。

## 0. 决策摘要

| 选项 | 推荐度 | 理由 |
|------|--------|------|
| A 继续 master 修补 | ✗ | DNF 还原度 ~60% 封顶；每加一个职业需手调 5 天；493 处 local_baseline 累计技术债 |
| **B dnf-native 分支大改** | **✓ 推荐** | 还原度 85-95%；前 2 周与 kernel 无依赖；分支隔离失败可 revert；总成本 5-7 人月 |
| C 全新项目重启 | ✗ | 重建基础设施 1-2 周热情消耗；现有 verified 产物难复用；统计上失败率 > 70% |

## 1. DNF 真值反推的 13 个必有 system

按 .nut + dnf_enum_header.nut 提取 478 个 sq_* API + 全枚举推断的 DNF 引擎拓扑：

```
[1] InputLayer            sq_IsDownKey / sq_IsEnterCommand / sq_IsEnterSkill
[2] AIDecider             CATEGORY_AI_*, sq_SetTargetObjectAICharacter
[3] StateTransition       STATE_PRIORITY 5 级 (AUTO/USER/HALF_FORCE/FORCE/IGNORE_FORCE)
                          onSetState_X / onEndState_X / onAfterSetState_X
[4] AnimPlayback          sq_SetCurrentAnimation + sq_SetAnimationSpeedRate
                          独立动画时钟，不与物理 tick 强绑
[5] FrameEventBus         onKeyFrameFlag(obj, flag), 帧触发命名事件
[6] PhysicsIntegrator     sq_SetZVelocity, gravity (DEFAULT_GRAVITY_ACCEL=-1500)
                          FORCE_TO_VELOCITY_CONST=4000, DOWN_PARAM_TYPE 5 变种
[7] HitDetection          sq_AddAttackBox 几何来自 .ani atk[] 数组
                          MaxHitCounterPerObject 限制
[8] DamageFormula         ATTACKTYPE × 防御表 × 元素 × crit
[9] ReactionStateMachine  DAMAGEACT 4 类 + KNOCK_BACK_TYPE 5 类
[10] ResourceSystem       HP/MP/Cooldown + ChangeStatus 4-depth stack (STATICINFO_DEPTH=4)
[11] StatusEffectSystem   18 ACTIVESTATUS (slow/freeze/poison/stun/curse/blind/lightning/stone/sleep/burn/break/bleed/haste/bless/elem/confuse/hold/armor_break)
[12] AppendageSystem      buff / aura / 召唤子对象生命周期
[13] VFX/Audio            sq_PlaySound / Particle / Shake / FlashScreen
```

跟现有 `src/combat/` 系统的关键差异（DNF 有项目无）：
- **STATE_PRIORITY 仲裁**（项目用 ad-hoc canCancelInto check）
- **独立 FrameEventBus**（项目把 hitbox 时间窗绑在 action 定义里）
- **AnimationSpeedRate**（独立动画时钟，项目没有）
- **Appendage 子对象系统**（项目 BuffLifecycleSystem 是 flat）
- **ChangeStatus 4-depth stack**（base→equip→status→skill 层）
- **PassiveObject** 系统（投射物/陷阱作为独立对象）
- **Down bounce 物理**（5 种 bounce 变种）
- **PAUSETYPE_OBJECT vs PAUSETYPE_WORLD**

## 2. Actor 状态机反推（从 .chr）

11 个职业的 .chr 全部 dump 后，按"动画引用 → 必有状态"反推：

**显式状态（24 个 motion 字段直接证据）**：
```
IDLE / IDLE_PASSIVE / STANCE / WALK / WALK_SLOW / DASH / JUMP
JUMP_ATTACK / BASIC_ATTACK_1/2/3 / DASH_ATTACK / HARD_ATTACK
LIGHT_STAGGER / HEAVY_STAGGER / DOWNED / GETUP
GUARD / HITBACK / BUFF_SUMMON / GHOST_CLONE / THROW / SUMMON
SIT / GETITEM
```

**隐式状态（.nut sq_*Frame 暗示）**：
```
AIR_HITSTUN     ← sq_JumpDownStartFrame
LAUNCH          ← sq_SetCurrentAttacknUpForce > 200
KNOCKBACK       ← sq_SetCurrentAttacknBackForce
BOUNCE          ← sq_SetDownBounceUpFrame / sq_SetDownBounceDownFrame
SUPER_ARMOR     ← sq_setSuperArmor (与 invul 分离的标记)
```

**项目内 Actor 接口缺失字段**（.chr 有项目没有）：
- `mp_regen_speed`（MP 恢复机制）
- `hit_recovery[17]`（per-level hitstun 系数）
- `move_speed / attack_speed / cast_speed` 职业特化值
- `weight`（音效分类用，但 force-to-velocity 公式也用）
- `module_damage_rate[4]`（4 装备 slot 伤害倍率）
- `per-level growth vectors[17]`（等级成长系统）
- `dark / light resistance`（按元素分的抗性）
- `weapon_wav[6]` + `weapon_hit_info[36]`（音效系统）

**项目内 Actor 接口多发明的字段**（.chr 没有）：
- `cube` 资源 / `statusTolerance` / `statusResistance`
- `strength / intelligence`（.chr 用 physical_attack 直接，没有 STR/INT）
- `armorProfile` 完整定义（super_armor / boss_armor 在 .chr 无）
- `handfeel.*` 视觉反馈层
- `comboCorrection.*` 连击补正系统

## 3. Skill Schema 反推（从 .skl）

**项目 FrameDataAction 跟 .skl 是两层不同抽象**：
- `.skl` = **技能定义层**（元数据 + SP 进度 + 资源 + 输入命令 + 场景 override）
- `.atk` + `.ani` + `.act` = **帧级战斗数据**（hitbox / damage / 动画 / cancel window）

**数据驱动重写必须分两层**：`SkillDef`（.skl 驱动）引用 `FrameData`（.ani+.atk+.act 驱动）。

**Cancel 系统真值化**：
- 项目用 `cancelPolicy: { hitCancelFrom, whiffCancelFrom, into: [...] }`
- DNF 用 **cancel passive 技能**（12+ 个 cancel*.skl，全部是 `type=passive` `maxLevel=1` 二值开关）
- cancel 窗口来自 `.ani / .act` 帧级 flag，cancel 目标隐含在 passive 名字（如 `cancelupperslash` = 可 cancel 进 upperslash）

**.skl 必有 sub-system**（项目内没有）：
1. **Skill Tree / Progression** — featureSkillIndex + skillClass(0-4) + preRequiredSkill + purchaseCost
2. **Growtype / Subclass** — growtypeMaximumLevel[6] + skillFitnessGrowtype[]
3. **Level Scaling Engine** — levelProperty (公式) + levelInfo (数值表)
4. **Weapon System** — weaponEffectType: physical / magical
5. **Input Command** — command 序列 + commandCustomizing + skillCommandAdvantage 优先级窗口
6. **Resource 4 类** — consumeMp + consumeItem + maintainMp + durabilityDecreaseRate
7. **Scene Override** — dungeon / warroom / pvp / deathTower 各场景独立参数
8. **Cooldown Dual-Mode** — coolTime[dungeon_ms, pvp_ms] 分场景 + castingTime + autoCoolTimeApply
9. **EX Skill** — featureSkillType + specialPurchaseCost + explainEx

## 4. Hit / Damage / Reaction 反推（从 .atk）

32 个 .atk 样本分析后核心发现：

**Reaction 是阈值驱动而非标签驱动**：

| `lift_up` | `push_aside` | `down` marker | 推 reaction |
|-----------|-------------|---------------|------------|
| ≥ 150 | ≥ 270 | yes | **launch** |
| 50-150 | 100-300 | yes | **downed/knockback** |
| < 50 | < 100 | no | **light_stagger** |
| 0 / 0 | / | no | **grab/special**（无击退） |
| 负值 (-200/-300) | 100-300 | no | **slam_down**（向下击打） |
| `knuck_back = -1` | * | * | **固定打击**（无击退） |

项目内 `canLaunch / canKnockdown / canHitDowned` 显式标志 → DNF 真值是 lift_up 数值大小决定。**必须改为阈值驱动**。

**damage 公式真值化**（.atk 只贡献 2 个乘数，其余来自 .skl/.chr/.mob）：
```
finalDamage = baseDamage
  × (weaponDamageApply ? attackerWeaponScale : 1.0)   // .atk
  × (1 + damageBonus / 100)                            // .atk
  × skillAttackRate%                                   // .skl
  × statCoeff(STR or INT)                              // .chr
  × defReduction(targetDef, attackerLevel)             // .mob/.chr
```

**项目当前 DamageFormulaResolver 缺失**：
- `damage_bonus`（-30% ~ +40%）未映射到任何 ratio
- `weapon_damage_apply` 标志未映射
- 负 lift_up（slam down）未处理
- `knuck_back = -1` 未明确语义化

## 5. Animation / Frame Event 反推（从 .ani）

**关键发现**：
- `.ani` 是**播放驱动型**（delay 序列 + wait event），项目 FrameDataAction 是**设计驱动型**（startup/active/recovery 区间）
- delay=10000 是**外部事件等待标记**（jump frame 7, 14 / down frame 2,3 / damage1 frame 0 / overturn frame 0 全用此约定）
- 每帧 `atk[]` 数组直接对应 active hitbox window，**项目 hitbox 几何应从 .ani 提取，不应手调**

**帧事件总线设计**（从 .nut sq_*Frame 调用汇总 7 类）：
```typescript
interface FrameEvent {
  jump_up_start    // sq_JumpUpStartFrame
  jump_down_start  // sq_JumpDownStartFrame
  jump_land_start  // sq_JumpLandStartFrame
  down_up_start    // sq_SetDownUpFrame
  down_down_start  // sq_SetDownDownFrame
  attack_cancel_window  // sq_AddAttackCancelStartFrame
  attack_launch_vel     // sq_SetCurrentAttacknUpForce 触发帧
  attack_knockback_x    // sq_SetCurrentAttacknBackForce 触发帧
}
```

**项目 SpriteFrameLibrary.ts 当前 `if/else` 硬编码处理 jump phase，无通用帧事件总线**。dnf-native 必须建独立的 `FrameEventBus` system。

## 6. AI 反推（从 .mob/.ai/.aic）

**DNF AI 不是 FSM，是"条件-动作表 (Condition-Action Table, CAT)" / "规则树"**：

```squirrel
// .ai 文件本质
if [target in attack area] then return [skill_idx]
else if [target in sight && cooltime ok] then return [chase_action]
else return [default]
```

**项目内 EnemyAI 9-state FSM** vs DNF 真值：
- DNF 无显式"状态"概念，每帧重新评估条件
- 中间状态（windup/attacking/recover）由动画 cancel window 和冷却管理隐式化
- 项目"好战度"仅影响 detectRange 乘数，DNF 影响规则通过率 + 行为权重 + 随机 roll
- 项目缺：`maintainDistance`（保持距离）/ `keyStreamCooldowns`（技能冷却表）/ `destinationChangeInterval`

**dnf-native AI 架构**（三层）：
```
Parameter Layer (.aic)  →  sightRange / detectRange / aggressionWeight / ...
       ↓
Decision Layer (.ai)    →  Rule Engine: for each rule { if condition() return actionId }
       ↓
Execution Layer (.mob)  →  Map actionId → FrameData + animation + hitbox + cooldown
```

## 7. dnf-native 目录结构

```
src/
├── dnf-native-combat/                # 新 kernel
│   ├── kernel/
│   │   ├── CombatKernel.ts           # tick pipeline (按 DNF 10 phase: Input/State/Anim/Proc/Physics/Hit/Resolution/Status/VFX/Network)
│   │   ├── SystemContext.ts
│   │   └── StatePriority.ts          # STATE_PRIORITY 5 级仲裁
│   ├── actor/
│   │   ├── Actor.ts                  # 从 .chr 反推 schema
│   │   ├── ActorStateMachine.ts      # 25+ 状态（含 air/launch/bounce/super_armor 隐式态）
│   │   └── ChangeStatusStack.ts      # 4-depth 属性叠加（base/equip/status/skill）
│   ├── skill/
│   │   ├── SkillDef.ts               # .skl 驱动技能定义层
│   │   ├── FrameData.ts              # .ani+.atk+.act 驱动帧级数据
│   │   ├── CancelSystem.ts           # passive-gated, ani-window-driven
│   │   └── LevelScaling.ts           # levelProperty + levelInfo
│   ├── hit/
│   │   ├── HitDetection.ts           # 几何来自 .ani atk[]
│   │   ├── HitResolver.ts
│   │   └── MaxHitCounter.ts
│   ├── damage/
│   │   └── DamageFormula.ts          # 含 damage_bonus + weapon_damage_apply
│   ├── reaction/
│   │   ├── ReactionResolver.ts       # 阈值驱动（lift_up + push_aside + down marker）
│   │   ├── LaunchPhysics.ts          # 真重力 -1500 px/s²
│   │   ├── KnockbackTypes.ts         # 5 KNOCK_BACK_TYPE
│   │   └── DownParamTypes.ts         # 5 DOWN_PARAM_TYPE bounce 变种
│   ├── animation/
│   │   ├── FrameEventBus.ts          # 帧触发命名事件总线
│   │   ├── AnimationPlayer.ts        # 独立动画时钟 + SpeedRate
│   │   └── SpriteSequence.ts         # .ani delay/wait event 驱动
│   ├── status/
│   │   ├── StatusEffectSystem.ts     # 18 ACTIVESTATUS
│   │   └── AppendageSystem.ts        # buff / aura / 召唤子对象
│   ├── passive-object/
│   │   └── PassiveObject.ts          # 投射物/陷阱独立对象
│   ├── ai/
│   │   ├── RuleEngine.ts             # CAT 规则树
│   │   ├── AIRule.ts                 # condition + actionId + weight + priority
│   │   └── BossPhase.ts              # 阶段切换（保留现有合理设计）
│   ├── input/
│   │   ├── InputLayer.ts
│   │   ├── CommandParser.ts          # .skl command 序列解析
│   │   └── SkillCommandAdvantage.ts  # 输入优先级窗口
│   ├── resources/
│   │   ├── HP_MP.ts
│   │   ├── Cooldown.ts               # dual-mode dungeon/pvp
│   │   └── DurabilityWeapon.ts
│   └── vfx/
│       └── VFXAudioBridge.ts
│
├── combat/                           # 旧 kernel，保留作对照（Phase 6 后评估删除）
│
├── data/official/dnf/                # ★ 复用 + 扩展
│   ├── physics.ts (existing)
│   ├── characters.ts (existing)
│   ├── attacks.ts (existing)
│   ├── characterStats.ts             # ← NEW: 11 职业 .chr 完整 stats
│   ├── attackLiftUp.ts               # ← NEW: 跨职业 .atk launch 参数表
│   └── animationMap.ts               # ← NEW: action → .ani 映射
│
├── data/dnf-native/                  # ← NEW: dnf-native 分支自动生成数据
│   ├── actions/swordman/             # auto-generated by generate-actions.mjs
│   ├── skl/
│   └── provenance.ts
│
├── extraction/  (复用，无改动)
├── game/        (复用，加 mode toggle 让渲染层切 master / dnf-native kernel)
└── main.ts      (Phaser bootstrap，加 ?kernel=master|dnf-native query param)
```

## 8. 六周路线图

### Week 1 — 基础数据层扩张
- Day 1-2: 扩 `src/data/official/dnf/` 加 characterStats.ts + attackLiftUp.ts + animationMap.ts
- Day 3: 改造 `scripts/generate-actions.mjs` 支持 dnf-native 格式自动导出
- Day 4: 全套验证（typecheck + dnf-official-data.test 扩到 11 职业）
- **Milestone**: 所有 Tier-1 物理常数 + provenance 全覆盖

### Week 2 — Actor 状态机 + 初始化
- Day 1-2: 从 .chr 反推 actor schema（含 ChangeStatus 4-depth stack）
- Day 3: 25+ 状态机架构（显式 24 个 + 隐式 5 个）
- Day 4: 测试 + commit
- **Milestone**: swordman + 1 个 monster 可构造，状态机独立运行

### Week 3 — Skill / Action 双层 schema
- Day 1: SkillDef 从 .skl 反推
- Day 2: FrameData 从 .ani+.atk+.act 反推（含 cancel passive 系统）
- Day 3: LevelScaling + Command 输入解析器
- Day 4: 验证
- **Milestone**: `swordman.attack1` 含完整 frame 真值 + provenance

### Week 4 — Hit / Damage / Reaction 物理对齐
- Day 1-2: 阈值驱动 ReactionResolver（lift_up + push_aside + down marker）
- Day 3: damage 公式加 weapon_damage_apply + damage_bonus；负 lift_up slam_down；knuck_back -1
- Day 4: 集成 AirbornePhysics（复用 4A 真重力 -0.417）+ launch
- **Milestone**: swordman.attack1 完整 hit → damage → reaction 链通

### Week 5 — Animation Playback + FrameEventBus
- Day 1-2: AnimationPlayer 含 delay + wait event(10000) 解析 + 独立 SpeedRate 时钟
- Day 3: FrameEventBus 设计（7 类命名事件）
- Day 4: 集成 + 渲染层 toggle
- **Milestone**: Phaser 场景能播 swordman.attack1，hitbox 在正确帧触发

### Week 6 — Monster AI + 复现验证
- Day 1-2: 从 .mob/.ai 提取 AI 参数 + RuleEngine 实现
- Day 3: 完整场景复现（swordman: stay → walk → jump → attack1 → cancel → upperslash）
- Day 4: 分支稳定 + PR
- **Milestone**: ✓ 5 秒内完整链路 ✓ replay hash 确定性 ✓ ±2 帧对齐参考视频

## 9. 关键 Open Question

| Q | 选项 | 推荐 |
|---|------|------|
| Q1 Vec3 命名 | 保留反向 / swap 对齐 DNF | 保留 + 翻译注释（已落档于 types.ts） |
| Q2 数据加载 | build-time bundle / runtime fetch | build-time（CI 简化） |
| Q3 Action 参数化 | union type / 多 schema | union type + dnf discriminant |
| Q4 Replay schema | 复用现有 / 新设计 | 复用（manifest hash 已在 metadata） |
| Q5 渲染层耦合 | 仍 Phaser / 抽象 RenderPort | 仍 Phaser（短期），H2 评估 RenderPort |
| Q6 Determinism + Multiplayer | 单机 / multi | 单机硬要求，multi 留 Phase 7 |
| Q7 jump_power 单位 | 沿用 H1 / 等 .exe 反编译 | H1，标 requiresManualVerification |
| Q8 hitstun 表 | local_baseline / 视频对照 | local + video_evidence（视频反推后升 Tier-2） |
| Q9 老 kernel 何时删 | Week 6 / 永不 | Week 6 PR 时评估，倾向保留至 dnf-native ship |
| Q10 渲染层 toggle | URL query / 编译宏 | URL `?kernel=dnf-native` |

## 10. 立即可做

1. `git checkout -b dnf-native master`
2. 删 `src/combat/` 暂留作对照（不删）
3. 新建 `src/dnf-native-combat/` 空骨架
4. 复用 `tools/dnf-extract.exe` + `src/data/official/dnf/`
5. Week 1 第一个 commit: 扩 data 层 + characterStats.ts

## 附：现有项目资产分类

| 分类 | 目录/文件 | 处理 |
|------|---------|------|
| **直接复用** | tools/ / src/data/official/dnf/ / src/extraction/ / .claude/skills/dnf-physics-extraction/ / docs/research/ / vite.config.ts / npm scripts | 全部 ✓ |
| **改造复用** | src/combat/kernel/CombatKernel.ts (作 parameter 参考) / src/data/manifest/ (新 dnf-native 版本) / src/combat/replay/ / src/game/ (加 toggle) | 修改后用 |
| **保留作对照** | src/combat/ 整个 | dnf-native ship 前不删 |
| **抛弃** | 38 个手调 action JSON / localFrameTuning.ts / ReactionProfiles.ts 预设 / .json 里 sourceType=local_baseline 的部分 | dnf-native 不引用 |

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| Week 2 状态机过度设计 | 先实现 IDLE/WALK/JUMP/BASIC_ATTACK_1，其他状态后续加 |
| Week 4 reaction 阈值不准 | 用项目内 ReactionProfile 数值作初始 fallback，逐步替换 |
| Week 5 FrameEventBus 改 sprite 渲染 | 渲染层 toggle 兼容老 sprite library，新 kernel 走新 player |
| Week 6 RuleEngine 不如 9-state 简洁 | Boss 保留 phase 系统（兼容性 boss 数据） |
| H1 jump_power 单位假设错 | requiresManualVerification 已标，Phase 6 video 对照可反证 |
| 老 kernel 跟新 kernel 并存导致代码膨胀 | dnf-native ship + 2 周稳定后启动 deprecation |

---

7 个 agent 原始报告：
- 01 agent A：actor 状态机 + .chr 字段表
- 02 agent B：skill schema + cancel 系统
- 03 agent C：hit/damage/reaction 阈值驱动
- 04 agent D：animation + frame event bus
- 05 agent E：monster AI + .mob/.ai/.aic
- 06 agent F：kernel pipeline + 13 必有 system + 478 sq_* API 分类
- 07 agent G：资产复用 + 6 周路线图 + A/B/C 方案对比
