# P0/P1 代码修复行动计划

> 生成日期: 2026-05-13
> 来源: 6 个 Agent 对 7 条链路的全量审计（170+ 缺口）
> 筛选标准: 100% 确定，纯代码可修，无需外部数据，修复逻辑无歧义

---

## 修复项清单

### P0-1: hpPercentCost 公式 bug

**文件**: `src/combat/resources/CooldownResourceKernel.ts:12`
**问题**: `actor.resources.maxHp * cost.hpPercentCost` 把百分比直接当乘数
**证据**: `Thirst` 的 `hpPercentCost: 10` 表示 10%，但代码算成 `maxHp * 10 = 1600`（应 16）
**修复**: 除以 100 → `maxHp * cost.hpPercentCost / 100`

---

### P0-2: Math.random() 破坏 replay 确定性

**文件**: `src/combat/status/StatusEffectSystem.ts:75`
**问题**: 遗留的 `Math.random()` 使相同输入产生不同状态施加结果
**证据**: EnemyAI.ts 已有 `deterministicRoll(tick, actorId)` 函数（FNV-1a 哈希，范围 0-1）
**修复**: 将 `Math.random()` 替换为 `deterministicRoll(tick, actor.id)`
**注意**: `deterministicRoll` 需从 EnemyAI.ts 提取为共享工具函数，或在此处内联

---

### P0-3: blood_memory 伤害减免符号反了

**文件**: `src/combat/kernel/CombatKernel.ts:725`
**问题**: `1 + bmDef / 100` 使减免变成了增伤
**证据**: 变量名是 `blood_memory_incoming_damage_reduction_percent`（减免百分比）
**修复**: 改为 `1 - bmDef / 100`

---

### P0-4: Damage formula 未接收 Actor 属性

**文件**: `src/combat/kernel/CombatKernel.ts:456,653`
**问题**: `requestFromHit()` 只传了 4 个参数，缺 `attackerStats`, `targetStats`, `attackType`, `attackerLevel`
**证据**:
- Actor 类型已有 `strength/intelligence/physAtk/magAtk/independentAtk/elemStrength/defense/elemResist/level`
- DamageRequest 接口已定义对应字段
- 当前 10 乘数公式中 ratio_0/1/3/8 永远=1.0
**修复**: 从 `attacker` 和 `target` 构造 stats 对象传入
**注意**: 会导致伤害值变化（原来 stats 被忽略=乘数=1，现在 STR/INT 参与计算）。baseDamage 后续可能需要重调，但不影响此修复的正确性。

---

### P0-5: 3 个 Buff 无法被玩家触发

**文件**: `src/combat/kernel/CombatKernel.ts:190,310-318`
**问题**:
- `consumeInput()` 的 allowed set 不含 `Thirst`, `BloodMemory`, `VimAndVigor`
- `applyInstantActionEffect()` 的 switch 不含这 3 个
**证据**: 三者在 FrameDataAction.ts 中有完整定义（cost/cooldown），但无触发路径
**修复**:
1. allowed set 追加 `"Thirst", "BloodMemory", "VimAndVigor"`
2. `applyInstantActionEffect()` 追加对应 handler
   - `Thirst` → `this.buffs.apply(actor, "thirst", this.tickCount, this.bus)`
   - `BloodMemory` → `this.buffs.apply(actor, "blood_memory", this.tickCount, this.bus)`
   - `VimAndVigor` → `this.buffs.apply(actor, "vim_and_vigor", this.tickCount, this.bus)`
**注意**: 需确认 BuffLifecycleSystem 有对应的 apply 方法。`thirst`/`blood_memory`/`vim_and_vigor` 在 `modifiersFor()` 中已有定义。

---

### P0-6: Boss 阶段系统完全未接线

**文件**: 3 个文件联动
**问题**: boss-patterns.json 存在但从未被加载，`bossPhase` 从未初始化
**证据**:
- `ai.ts:toEnemyAIState()` 不设 `bossPhase`（始终 undefined）
- `CombatKernel` 构造 `EnemyAIController()` 不传 bossConfigs
- `EnemyAI.checkBossPhase():287` — `bossPhase !== undefined` 永远 false
- `selectBossPattern()` 存在但从未被 tick loop 调用
**修复**:
1. `toEnemyAIState()` — boss 类型时设 `bossPhase: 1, bossPhaseEnteredTick: 0`
2. `CombatKernel` init — import boss-patterns.json，调用 `this.enemyAI.loadBossConfigs(configs)`
3. `EnemyAI.tick()` attacking phase — 调用 `selectBossPattern()` 并用 pattern name 路由攻击
**注意**: 第 3 步需要建立 pattern name → ActionName 的映射表，先用 `EnemyBasic` 作为 fallback
**依赖**: 需要确认 boss AI 触发 `EnemyBasic` 之外动作时 kernel 的正确行为

---

### P0-7: ImgParser 链接帧解析空操作

**文件**: `src/extraction/ImgParser.ts:201-207`
**问题**: `resolveLinks` 找到目标帧但不复制任何数据
**证据**: 代码块体为空——只有注释
**修复**: 将 target frame 的关键字段复制到 link frame：
  - `pivotX, pivotY, frameWidth, frameHeight, width, height, data`
  - 保留 `type: "link"` 和 `linkFrame` 以便追溯

---

## P1 修复项

### P1-1: 9 种状态类型无行为效果

**文件**: `src/combat/kernel/CombatKernel.ts:187-201,222-224`, `src/combat/status/StatusEffectSystem.ts`
**问题**: 硬控（stun/freeze/stone/bind/sleep）和减益（slow/defense_down/attack_down/curse）施加后无行为影响
**修复**:
1. `consumeInput()` — 检查 player 是否有 active 硬控状态，有则 skip
2. `tickEnemyAI()` — 检查 enemy 是否有 active 硬控状态，有则 skip
3. `LocomotionController.apply()` — 检查 slow 状态，调整 speed multiplier
4. `damageMultipliersFor()` — 检查 defense_down/attack_down/curse，追加 multiplier
**边界清晰**:
- 硬控 = `stun, freeze, stone, bind, sleep` (StatusEffectSystem.ts 已有 `HARD_CONTROL_TYPES`)
- slow = 移动速度 * 0.5（通用 RPG 惯例）
- defense_down = 防御 * 0.9 per stack
- attack_down = 攻击 * 0.9 per stack
- curse = 全属性 * 0.95 per stack

---

### P1-2: Boss pattern 无 Action 路由映射

**文件**: `src/combat/ai/EnemyAI.ts:225`
**问题**: `tick()` 的 attacking phase 永远请求 `EnemyBasic`，不区分 pattern
**修复**: 建立 `patternActionMap: Record<string, ActionName>` 并用于 attacking phase
  - `charge_attack` → 暂用 `DashAttack`（boss 版）
  - `ground_slam` → 暂用 `EarthShatter`（boss 版）
  - `sweep_attack` → 新增 `BossSweep` 或暂用 `EnemyBasic`
  - `enrage_charge` → 暂用 `DashAttack`
  - `frenzy_combo` → 暂用 `EnemyBasic`
**注意**: boss 专用动作需要完整的 FrameDataAction 定义，超出本修复范围。当前用已有动作做 fallback，至少保证 pattern 选择不闲置。

---

### P1-3: SklAnalyzer CANCEL_SECTION_IDS 未接入

**文件**: `src/extraction/SklAnalyzer.ts:55-66, 110-180`
**问题**: 10 个取消窗口 section ID 已解码但 `analyze()` 未读取
**修复**: 在 analyze loop 中识别 section 命令匹配 CANCEL_SECTION_IDS 时，将值写入 SklSkillDef 的新字段
**前提**: SklSkillDef 需增加 cancelWindowStart/Duration/Group/WeaponMask/TargetSlots 字段（已在类型文件中定义）

---

### P1-4: Loader 死代码清理

**文件**: `src/data/manifest/loader.ts:92-145`, `src/game/BootScene.ts:88`
**问题**: `loadDamageManifest/loadStatusManifest/loadEnemyManifest` 存在但从未调用
**修复**: 删除死代码，或加 `@deprecated` 标记并注释说明。保留函数签名供未来使用。

---

## 执行顺序

```
第 1 批（互不依赖，可并行）:
  P0-1  hpPercentCost 修复        (1 行)
  P0-2  Math.random → 确定性      (1 行 + 提取工具函数)
  P0-3  blood_memory 符号修复     (1 行)
  P0-7  ImgParser link 帧修复     (~10 行)

第 2 批（依赖第 1 批完成，验证后继续）:
  P0-4  Damage formula 接入 stats  (~30 行)
  P0-5  3 buffs 可触发             (~15 行)
  P0-6  Boss 阶段系统接线          (~40 行, 3 文件)

第 3 批（P1，独立）:
  P1-1  9 种状态类型行为           (~50 行)
  P1-2  Boss pattern 路由          (~20 行)
  P1-3  CANCEL_SECTION 接入        (~40 行)
  P1-4  Loader 死代码清理           (~10 行)
```

## 验证

每批完成后运行:
```bash
npm run typecheck && npm run static:test && npm run build
```
