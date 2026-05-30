# DNF Reaction Formula Reverse Engineering

**日期**: 2026-05-30
**Phase**: Stage 3 Phase C T-C.1
**状态**: 骨架 + H1/H2/H3 假设 (待 H3 - H6 PVF/客户端实测验证)
**前置**: Stage 1 PVF 提取完成 + Stage 3 Phase A/B 真值化完成
**关键约束**: reaction 物理参数大量是 `tier3` 真值（`unit=ms-or-multiplier`），需要靠**行为反推**而不是字段直读

---

## 1. 反推目标

DNF 70-85 PVE 战斗的"受击反应" (reaction) 由以下子系统组成，需要从 PVF 真值字段反推每个的公式：

| 子系统 | 输出 | PVF 输入字段 | 现状 |
|--------|------|-------------|------|
| Launch (击飞 Y 速度) | `velocityY` (px/s) | `atk.liftUp` × `weaponHitInfo.launch` × target.weight | ❌ 公式未定 |
| Pushback (击退 X 速度) | `velocityX` (px/s) | `atk.pushAside` × `weaponHitInfo.pushBack` × target.weight | ❌ 公式未定 |
| Hitstun (受击僵直) | `hitstunFrames` (ticks) | `chr.growth.hitRecovery` + `atk.hitReaction` 类别 | ❌ 公式未定 |
| Downstate (倒地) | `causesDown: bool` 触发条件 | `atk.causesDown` flag + reaction kind | ⚠️ 字段直读 但触发条件复杂 |
| Stun (硬直/眩晕) | `causesStun: bool` 触发 | `atk.causesStun` flag (~3 个 atk 用) | ✅ 字段直读可用 |
| Recoil (反作用力) | 攻方 X/Z 反推距离 | 无 PVF 字段直接对应 | ❌ 全 local_baseline |
| HitStop (命中停帧) | 双方 `frameFrozen` 时长 | 无 PVF 字段（推测来自 .skl 或 cpp 硬编码） | ❌ 全 local_baseline |

**核心难点**: PVF 给的是**输入参数**，不是"打出去飞多高"的物理结果。需要在 DNF 客户端实测「不同 weight 怪打不同 attack3 飞多高」反推公式系数。

---

## 2. PVF 字段全量清单（已 Stage 1 提取）

### 2.1 atk.* per-action 字段

| 字段 | 类型 | 示例值 | 语义 |
|------|------|--------|------|
| `liftUp` | tier3 int (px/s? frame? %?) | -300 / 0 / 75 / 200 / 400 / 550 | Y 方向速度幅度，正=飞起、负=下压、0=平推 |
| `pushAside` | tier3 int (px/s?) | 30 / 50 / 100 / 200 / 400 / 600 | X 方向速度幅度（朝攻击方向） |
| `damageBonus` | int % | -40 / 10 / 50 / 110 | 伤害修正 (此攻击的固有 +/-)，配合 baseDamage |
| `attackKind` | enum | physic / magic | 物理/魔法判定（路由 phys/mag stat） |
| `element` | enum | none / fire / ice / ... | 属性 |
| `hitReaction` | enum | hit_down / hit_horizon / hit_lift_up / none | **基础反应类别**（决定动画分支） |
| `causesDown` | bool | true / false | 是否进入 downstate (倒地) |
| `causesStun` | bool | true / false | 是否触发 stun (硬直) |
| `causesBounce` | bool | true / false | 是否触发 bounce (弹地) |
| `causesStuck` | bool | true / false | 是否触发 stuck (黏滞) |
| `knuckBack` | tier3 int? | null 多见 | 反推力（罕用，可能旧版字段） |

### 2.2 chr.weaponHitInfo (6 武器槽)

每槽提供武器对应的 hit multiplier。剑魂样本：

| Slot | hitTag | damageScalePct | critOrSimilar | pushBack | launch |
|------|--------|---------------|---------------|----------|--------|
| 0 | [cut] | 90% | 1.0 | 0 | 0 |
| 1 | [cut] | 70% | 0.86 | -0.1 | 0 |
| 2 | [blow] | 100% | 1.2 | 0.1 | **-0.95** |
| 3 | [cut] | 120% | 1.4 | 0.2 | 0 |
| 4 | [cut] | 100% | 1.0 | 0 | 0 |
| 5 | [cut] | 60% | 0.85 | -0.15 | 0 |

**关键观察**: `launch` 是 multiplier，`-0.95` 表示反向（向下击）。`pushBack` 同样是 multiplier，叠加到 `atk.pushAside` 上。

### 2.3 chr.growth.hitRecovery

```
values: [600, 1.5, 2, 2, 2, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3]
unit: "ms-or-multiplier"  ← tier3 歧义
sourceType: "tier3"
requiresManualVerification: true
```

values[0]=600 推测是"基础 hitRecovery (ms)"，[1:] 是每个等级段增量。Lv70 累积 ≈ 952.5 ms 也对应 hpMax 计算（同结构）。

### 2.4 chr.weight

```
value: 68000
unit: "audio-only"  ← tier3 歧义
sourceType: "tier3"
```

DNF 设计中 weight 影响 launch 减免（越重越难飞起）。但 PVF unit 标 `audio-only`，可能 weight 实际单位不是物理意义而是音效选择 key（暂存疑）。

---

## 3. H1/H2/H3 三个核心假设

### H1: hitReaction 类别决定基础反应模式

**假设**: `atk.hitReaction` 枚举值映射到一组基础反应行为：

| hitReaction | 基础行为 | atk.liftUp 用途 |
|-------------|----------|----------------|
| `hit_down` | 平打或下压（小击退或脚下） | 0/小值=平推; 负值=拉下; 大正值=反常先抛后落 |
| `hit_horizon` | 水平击退（保持原 Y） | 几乎不读取（部分 atk liftUp=0） |
| `hit_lift_up` | **击飞**（典型 launcher） | liftUp 决定 Y 速度幅度 |
| `none` | 不触发反应（buff/heal/grab 类） | 忽略 |

**Why**: 81 个 atk 配置中:
- `hit_lift_up` (击飞) 26 个，liftUp 普遍 > 100 (200, 300, 400, 550)
- `hit_horizon` 22 个，liftUp 多为 0~120 范围（小或无 Y）
- `hit_down` 31 个，liftUp 范围最广 (-300 ~ 400)，反应最复杂
- `none` 2 个 (weakness, giveblood)

**反例需 verify**:
- chargecrashfinish: liftUp=-300 但 hitReaction=hit_down → 不是 hit_lift_up，但确实有 Y 分量
- attack3: liftUp=300 且 hitReaction=hit_lift_up → 经典 launcher ✓
- attack1: liftUp=75 且 hitReaction=hit_down → 击退 + 小 Y? 还是纯水平?

### H2: launch Y 公式（待验证）

**假设公式**:
```
velocityY = atk.liftUp × weaponHitInfo[currentWeapon].launch_multiplier × weightFactor(target)
weightFactor(target) = clamp(1 - target.weight / WEIGHT_THRESHOLD, MIN_FACTOR, 1)
```

待定常数:
- `WEIGHT_THRESHOLD`: 推测 100000 ~ 200000 (使剑魂 weight=68000 时 factor ≈ 0.5)
- `MIN_FACTOR`: 推测 0.1 (重 boss 也能轻微抬起)
- `weaponHitInfo[currentWeapon].launch_multiplier`: 当前武器在 weaponHitInfo 表的哪一槽？取决于攻击 ID 路由（待查）

**测试场景**:
1. swordman (weight=68000) attack3 (liftUp=300) 打 grunt (weight=?) 飞多高
2. 同 attack3 打 boss (weight=?) 飞多高对比

### H3: pushAside X 公式（待验证）

**假设公式**:
```
velocityX = atk.pushAside × weaponHitInfo[currentWeapon].pushBack_multiplier × weightFactor(target) × directionSign
directionSign = attacker.facing === "right" ? 1 : -1
```

负值 `pushAside` 罕见——实测一例 `ghostsidewind: pushAside=-200`，应表示反向击（吸过来？还是后撤？）

### H4 (推测，待 Phase C T-C.4): hitstun 公式

**假设**:
```
hitstunFrames = baseHitstun(hitReaction) × (1 - target.hitRecovery / NORMALIZE)
baseHitstun:
  hit_horizon: 8 frames (~0.13s)
  hit_down: 12 frames (~0.20s)
  hit_lift_up: 24 frames (~0.40s 含飞行)
```

`target.hitRecovery` 是怪物的"硬直减免"属性，越高僵直越短。但 PVF 字段 `chr.growth.hitRecovery` 是**玩家**的属性（玩家被打），怪物用 `mob.hitRecovery` (待查 mob shard)。

### H5 (推测): hitstop 公式

DNF hitstop（命中时双方"凝固"几帧的卡帧感）**很可能不在 PVF 里**，是 cpp 硬编码常量按 `hitReaction` 类别走表。

**临时方案** (D9=B fallback): 用 `local_baseline` 表代替:
- hit_horizon: 3 frames
- hit_down: 4 frames  
- hit_lift_up: 6 frames
- causesDown=true: +2 额外

### H6 (推测): downstate 进入条件

**字段直读**: `atk.causesDown` true → target reactionState 转 "downed"，配合 hit_lift_up 是典型 launcher → downed 流程。

**复合规则**:
- `causesDown && !target.canBeKnockedDown` → 不进 downed（armor 阻挡）
- `causesDown && target.reactionState === "launch"` → 空中追击触发 air_to_downed
- `causesStun && !causesDown` → "stunned" 状态（眩晕），区别于 downed（眼前金星）

---

## 4. Phase C 实测计划（T-C.2 → T-C.7）

### T-C.2 实测 DNF 客户端行为（最难）

**做法**:
1. 安装 DNF 国服 (Script.pvf 2017 版本) 创建测试帐号
2. 跳关到副本 (例如：暗黑城 / 时光之门 / 推荐 lv70 难度)
3. 录像测以下场景:
   - 同 attack3 打不同 weight 怪（goblin / golem / boss）观察击飞 Y 距离
   - 同 attack1 打不同 weight 怪观察击退 X 距离
   - 玩家被 attack 击中后僵直时长 (frame counter)
4. 用截图/录像测量像素 → 反推 velocity 公式系数

**风险**: 客户端难安装/不可靠。Fallback: 用 DFO Wiki / 韩服老视频测量。

### T-C.3 launch 公式验证

将 T-C.2 测得行为代入 H2 公式，反解 `WEIGHT_THRESHOLD` / `MIN_FACTOR`。如公式形态不对，迭代 H2'。

### T-C.4 hitstun 公式验证

同上，验证 H4。

### T-C.5 重写 ReactionResolver.ts 真值驱动

把 PVF 字段 `atk.liftUp` / `pushAside` / `causesDown` 等接入到 `ReactionResolver.resolve()`，按 H1-H6 公式计算 `velocityX/Y/hitstun/reactionState`。

替换当前 `ReactionResolver` 中的硬编码 `lightStagger` / `mediumStagger` / `heavyStagger` / `upperLaunch` 配置。

### T-C.6 重写 HitStopController + RecoilController

按 H5 把 hitstop 配置改为 PVF / lookup table 驱动。RecoilController（攻方反作用力）暂保留 local_baseline (D9=B fallback)。

### T-C.7 truth 测试

写 `tests/truth/swordman-reaction-formulas.test.ts`:
- attack3 (liftUp=300, causesDown=true) 击飞 grunt 触发 launch + downed 状态
- attack1 (liftUp=75, causesDown=false) 击退 grunt 但不倒地
- chargecrashfinish (liftUp=-300) 把 grunt 拉下（负 Y）
- weight 影响验证: 同 attack3 打 boss (weight 估计 >100000) 比打 grunt (weight 估计 <50000) 飞起 Y 差异

---

## 5. Exit Criteria

### D9=A 路径（roadmap 默认）
- 反推文档定稿，H1-H6 每条假设有 PVF 字段证据 + 实测验证
- ReactionResolver 接受 PVF 字段输入，输出与 DNF 实测行为一致（差异 <10%）
- truth 测试 ≥5 个绿

### D9=B 路径（fallback，时间盒超时退路）
- 反推文档骨架完整，H1-H6 假设标 TBD（未实测）
- ReactionResolver 接受真值参数但公式仍 stub（用现 lightStagger/mediumStagger/heavyStagger 表，但输入字段从 PVF 来）
- Phase D 加任务 "reaction 真值公式实装"

---

## 6. 已知盲区 / 不确定性

| 盲区 | 影响 | 缓解 |
|------|------|------|
| `atk.liftUp` 单位 (px/s vs frame vs %) | launch 公式系数完全错 | T-C.2 实测后迭代 |
| `chr.weight` 实际语义 (PVF 标 audio-only) | weightFactor 公式可能用错字段 | T-C.2 实测验证 weight 是否真影响 launch |
| `weaponHitInfo` 数组索引规则 (哪个 slot 对应当前 attack) | launch/pushBack multiplier 用错 | 查 .skl 或 atk 是否引用 slot index |
| hitstop 来源 (PVF 还是 cpp) | hitstop 表无 PVF 证据 | D9=B fallback 用 local table |
| recoil (攻方反作用) | 完全无 PVF 字段 | 接受 local_baseline，标记 tier3 |
| `causesBounce` / `causesStuck` 行为 | 0 个 atk 用到，无法反推 | 标 TBD，遇到再补 |

---

## 7. 时间盒

| Phase C 子任务 | 预算 | 累计 |
|----------------|------|------|
| T-C.1 文档骨架 + H1-H6 假设 | 2h | 2h |
| T-C.2 客户端实测 | 6h | 8h |
| T-C.3 launch 公式 | 4h | 12h |
| T-C.4 hitstun 公式 | 4h | 16h |
| T-C.5 ReactionResolver 重写 | 6h | 22h |
| T-C.6 HitStop/Recoil 重写 | 4h | 26h |
| T-C.7 truth 测试 | 3h | 29h |
| **时间盒上限** | - | **40h (5 个工作日)** |

超时降级方案: D9=B，跳 T-C.2 实测，直接进 T-C.5 用 H1-H6 假设的 fallback 表实装。

---

## 8. 参考

- [Stage 3 路线图](../planning/2026-05-30-stage3-truth-driven-refactor.md) Phase C 部分
- [Stage 1 swordman shard](../../verification/baseline-shards/players/swordman.json) chr.weaponHitInfo + chr.growth.hitRecovery
- [src/combat/reaction/ReactionResolver.ts](../../src/combat/reaction/ReactionResolver.ts) 现有反应逻辑
- [DNF 物理 Phase 1 调研](2026-05-21-dnf-air-physics-phase1.md) 重力 -1500 px/s² + jump_power 单位歧义先例
