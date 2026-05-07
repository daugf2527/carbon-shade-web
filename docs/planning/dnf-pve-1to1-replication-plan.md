
# DNF PvE 1:1 Combat Replication Plan

> **Status: [PLANNING]** — 5-Phase implementation roadmap, approved 2026-05-06

## Context

碳影/Carbon Shade 当前有一条可运行的 Input → Action → Hit → Reaction → Replay 链路（21 个 Berserker 技能，36 个测试全绿），但距离 DNF PvE 1:1 复刻有本质差距：action/status 已进入 manifest v1 数据层但仍以 local baseline 为主，伤害公式 demo 级，状态系统 5/14 实现，AI 仅基础 FSM，无 PVF/ANI/NPK 数据管线。

`docs/research/combat/` 内 21 篇研究文档 + 4 篇 synthesis 已建立完整的复刻证据体系：官方 API → 社区解析器公开字段 → 坐标系/碰撞模型 → 伤害乘区规则 → 状态/AI 参数族 → 合规边界。关键结论：**1:1 复刻必须先锁定目标版本，再以版本化数据仓驱动运行时，不能让帧数据/公式/状态表手写在 TS 源码里。**

## DNF PvE 战斗模型：需要复刻什么

### 攻击链路（我方 → 敌方）

```
输入归一化 → 命令匹配/手搓检测 → 技能请求 → 消耗检查(MP/HP/Cube/冷却)
→ ActionEntered → 帧时间线驱动 → 逐帧 hitbox/hurtbox 启用
→ 朝向镜像变换 → attackBox vs damageBox 碰撞检测
→ hitGroupId 去重(同组已命中跳过) → 生成 HitEvent
```

### 被击链路（敌方 → 我方）

```
HitEvent → StateFlags 过滤(invincible/superArmor/unbreakable/grabImmune)
→ resistanceCheck(属性抗性/异常抗性) → defenseReduction(防御减伤公式)
→ damageBucket(百分比/固伤 × 乘区) → reactionPolicy(hitStun/launch/knockdown)
→ HitStop/Recoil → StatusEffect 申请(DOT/硬控/属性异常)
→ 受击者状态机推送
```

### PvE 特有层

- **怪物 AI**：FSM(Idle/Chase/Attack/Hurt/Death) + 行为树(视野/好战度/攻击距离/冷却检测/随机分支)
- **Boss Pattern**：阶段切换、强制转场、break/groggy 机制
- **多目标命中**：maxTargets、splash damage、chain lightning 等扩展规则
- **Holding Gauge**：控制免疫累计 → 满值后短时免疫硬直/抓取

## 当前代码 vs 1:1 要求

| 系统 | 当前状态 | 1:1 要求 | 缺口 |
|------|---------|---------|------|
| **帧数据** | 21 动作已有 `actions/default.json` parity/hash gate | 版本化 manifest + ANI parser | 无抽取管线，运行时仍兼容同步 ACTIONS |
| **碰撞判定** | rect/circle AABB 2.5D | 6-int 棱柱体 + sweep/grab_attach 形状 | shape 类型不完整，无逐帧 hurtbox |
| **伤害公式** | `baseDamage × multiplier` | 百分比/固伤 + 防御减伤 + 属强乘区 + 词条桶 | 完整公式链缺失 |
| **状态系统** | 5 个已实现 status 已迁入 `status/default.json` | 14 status type + resistance/tolerance/dispel | 9 种未实现，抗性空实现 |
| **AI** | 5 种敌人 FSM | 行为树 + Boss pattern data + 仇恨模型 | 无数据驱动 AI |
| **Replay** | 帧级输入/事件/hash，action manifest hash 已绑定 | manifest 绑定 schema hash + status hash + 判定 snapshot | status manifest hash 和判定 snapshot 未入 metadata/frame |

## 实施阶段

### Phase 1: 数据化基座（~2 周）

**目标**：帧数据/伤害公式/状态表迁出 TS 源码，建立版本化 data layer。

1. **新建 `src/data/manifest/` 目录结构**
   - `actions/` — FrameDataAction JSON manifest
   - `damage/` — 伤害公式参数 profile（百分比/固伤、防御减伤、属强、乘区桶）
   - `status/` — 已实现 status runtime profile；后续再扩到 14 种完整 profile（含 DOT tick、互斥规则、dispel policy）
   - `ai/` — 怪物参数族 + Boss pattern data
   - 每个 manifest 带 `schemaVersion` + `contentHash`

2. **迁移现有手写数据**
   - `FrameDataAction.ts` ACTIONS 对象 → `actions/default.json`（已完成 parity/hash gate）
   - `StatusEffectSystem.ts` 5 种已实现 status → `status/default.json`（已完成 runtime adapter）
   - `enemyTuning.ts` 5 种敌人 → `ai/enemy-params.json`
   - 保留 `FrameDataAction` / `StatusProfile` / `EnemyTuning` TypeScript 类型不变
   - 启动时 load + validate → runtime adapter

3. **manifest schema 校验器**
   - `src/data/manifest/schema.ts`：校验 totalFrames 一致性、hitGroupId 唯一性、cancelPolicy.into[] 引用有效性
   - `src/data/manifest/hash.ts`：content hash → action/status manifest hash
   - ReplayRecorder 构造时读 action manifest hash 写入 `combatSchemaHash` / `manifestHash`，下一步补 `statusManifestHash`

4. **combatSchemaHash 自动绑定**
   - `ReplayRecorder.ts:57` 硬编码 → `loadManifestHash()`
   - 更新 `auto-combat` 测试 hash 期望值（一次性）

**验收**：`npm run typecheck && npm run static:test && npm run build` 全绿，`auto-combat` hash 基于 manifest 内容重新计算。

### Phase 2: 判定系统增强（~1.5 周）

**目标**：碰撞检测对齐 DNF 客户端公开字段，支持 sweep/grab_attach 形状和多 hurtbox。

1. **扩展 HitBoxShape 类型**
   - `HitResolver2D5.ts`：增加 sweep（射线扫掠）和 grab_attach（抓取吸附）形状
   - 多 hurtbox 支持：`target.hurtBoxes[]` 遍历替代 `hurtBoxes[0]`
   - 保留原始 6-int 坐标（`x1,y1,z1,x2,y2,z2`）在 hit query 中

2. **hit group 去重**
   - 同一 `hitGroupId` 在多帧 active 窗口内只命中同一目标一次
   - 在 `HitResolver2D5.buildQuery()` 中附加 `hitWindowId`

3. **hit/hurt frame snapshot 入 replay**
   - `geometry()` 返回结果增加 snapshot 字段（query box、hurt rect、overlap 结果、6-int 原始坐标）
   - ReplayFrame 记录时附带判定 snapshot
   - `replay-schema.test.ts` 增加 snapshot 校验

**验收**：sweep/grab_attach 碰撞测试通过，多 hurtbox 怪物不受单 hurtbox 限制，snapshot 字段在 replay JSON 中可见。

### Phase 3: 伤害公式完整化（~1 周）

**目标**：从 demo 级 `baseDamage × multiplier` 升级到 DNF 经典版伤害链。

1. **重建 DamageFormula**
   - 按攻击 type 分四路：物理百分比 / 魔法百分比 / 物理固伤 / 魔法固伤
   - 属性差：`elemFactor = 1 + (elemStrength - targetElemResist) / 220`
   - 防御减伤：`defFactor = 1 - targetDef / (targetDef + attackerLevel × 200)`
   - 保留现有 counter/critical multiplier

2. **乘区化 profile**
   - `damage/classic-profile.json`：经典版公式参数
   - 暴击 `1.5`、破招 `1.25` 作为独立乘区
   - 不硬编码词条叠加规则（→ 后续 Phase 做版本化规则引擎时再扩展）

3. **Actor 属性补全**
   - `types.ts` Actor 增加：STR/INT、物攻/魔攻、独立攻击、属强/属抗、防御力、等级
   - 战斗初始化时从 profile 加载

**验收**：百分比/固伤四路伤害数值与公式推导一致，属性差增减可验证。

### Phase 4: 状态系统补全（~1 周）

**目标**：从 5 个已实现 status runtime profile → 14 种 status type，resistance/tolerance 可工作。

1. **补全 9 种未实现 status type**
   - 硬控类：stun, freeze, stone, bind, sleep
   - 减益类：slow, defense_down, attack_down, curse
   - 每类有完整 profile：duration/interval/stackLimit/dispelPolicy/mutualExclusion

2. **resistanceCheck 实现**
   - `StatusEffectSystem.ts`：status tolerance 累计 + decay
   - hit → status application 时读 target resistance profile
   - 替代硬编码 `accepted:true`

3. **PvE/PvP profile 隔离**
   - `status/pve-profile.json` vs `status/pvp-profile.json`
   - 当前默认加载 PvE profile

**验收**：眩晕/冰冻可生效，反复同类型控制后 tolerance 上升导致免疫。

### Phase 5: AI 数据驱动（~1 周）

**目标**：从 5 种敌人参数 → 数据驱动的 FSM + 行为树 + Boss pattern。

1. **AI pattern manifest**
   - `ai/enemy-patterns.json`：每种敌人的 FSM 状态/转换条件/冷却
   - `ai/boss-patterns.json`：Boss 阶段切换/trigger/强制转场
   - 字段对齐 DNF 公开 AI 参数族：攻击速度、视野、好战度、换目标时间、攻击距离、远距离反应几率

2. **Boss AI 基础**
   - phase trigger：HP 阈值 / 时间 / 受击次数
   - pattern 冷却 + 权重选择
   - 独立于普通怪 FSM

**验收**：AI 参数从 JSON 加载而非代码常量，Boss 可做阶段切换。

## 不改什么

- **不重写 HitResolver2D5 核**（资料明确说"不应被重写"）
- **不加 PvP/raid/party/评分系统**（→ `SYNTHESIS-PERIPHERAL-SYSTEMS.md` 扩展层）
- **不新增技能**（21 个动作已够验证手感链路，数据化后再扩展）
- **不引入 NPK/PVF parser**（资料要求先锁定目标版本再建提取管线，当前阶段先做 manifest 格式设计）
- **不修改非战斗系统**（渲染层、UI、构建工具链保持现状）

## 关键文件

### 新建
- `src/data/manifest/actions/default.json`
- `src/data/manifest/damage/classic-profile.json`
- `src/data/manifest/status/default.json`
- `src/data/manifest/status/control-profiles.json`
- `src/data/manifest/ai/enemy-params.json`
- `src/data/manifest/ai/boss-patterns.json`
- `src/data/manifest/schema.ts`
- `src/data/manifest/hash.ts`
- `src/data/manifest/loader.ts`

### 修改
- `src/combat/actions/FrameDataAction.ts` — getAction() 改为从 manifest 加载
- `src/combat/hit/HitResolver2D5.ts` — sweep/grab_attach 形状、多 hurtbox、snapshot
- `src/combat/damage/DamageFormula.ts` — 完整四路伤害链
- `src/combat/status/StatusEffectSystem.ts` — 14 种 type + resistance
- `src/combat/ai/EnemyAI.ts` — 数据驱动加载
- `src/combat/replay/ReplayRecorder.ts` — combatSchemaHash 自动绑定
- `src/combat/types.ts` — Actor 属性补全

### 更新测试
- `tests/static/config-validate.test.ts` — 增加 manifest schema 校验
- `tests/static/schema-hash-freshness.test.ts` — hash 计算改为基于 manifest
- `tests/static/fuzz-combat.test.ts` — hash 值更新

## 验证

每 Phase 完成后跑：
```
npm run typecheck && npm run static:test && npm run build
```
36 个测试全绿 + build 通过才进下一 Phase。
