# DNF-Native Kernel v2 Design — 基于 Tier-1 真值实测重构（2026-05-22）

> 本文档替代 [`docs/plans/2026-05-21-dnf-native-kernel-design.md`](2026-05-21-dnf-native-kernel-design.md) 中被 Tier-1 真值证伪的浅判断。原文档保留作历史参考，footnote 已就地纠正；冲突时**以本文为准**。
>
> 证据基础：今天 8 份并行 agent 报告（dnf-extract 实测 / cancel section / sq_* API / 怪物 AI 决策 / 副本地形 / 猫妖+机械牛 / swordman 深挖 / goblin 决策取证）+ 昨晚 9 份 md 计划 + 7 处文档纠错。

---

## 0. 摘要：8 条结构定律

| # | 浅判断（昨晚） | Tier-1 真值（今天） | 含义 |
|---|---|---|---|
| 1 | `.ai` 是 Squirrel 脚本 | Document tag-value，且 `ai pattern` 多数为空 = vestigial | `.ai` 当前 PVF 版本不承载决策 |
| 2 | `.ai` Rule Engine 驱动 AI（CAT 假设） | 完全证伪 — 决策在 `.mob 阈值 + 引擎硬编码 polling loop` | 必须自研 AI loop，但有自由度 |
| 3 | DNF 13 必有 system 一字排开 | grep 实测 60% 验证：4 真热路径 / 5 状态机驱动 / 3 数据驱动；478 enum 中 28% zombie | 不该按 system 拆，按调用驱动设计 |
| 4 | Cancel section ID 应在 C++ 端解码 | C++ 已正常输出，Node 端 `SklAnalyzer.ts` 在 commit `e1f3e0f` 被删 | 1h Node-side 复原即可 |
| 5 | Monster 有 `.nut` 脚本驱动行为 | 0 monster `.nut` 文件；`SetMonsterAI` 0 calls；脚本层只管玩家 | DNF 引擎自跑 AI |
| 6 | Command 系统有 priority window | 纯 token sequence matching；`skillCommandAdvantage` 字段不存在 | 命令 buffer 在 DNF.exe 硬编码 |
| 7 | 转职 `.skl` 顶层有 cooltime/MP | 顶层 section 为空，存在 per-attack 子结构 | schema 需修正 |
| 8 | `.ai` Defect 2 应入 Text 路径 | `.ai` 本就是 Document，路径分类正确 | 缺陷不存在 |

---

## 0.5 Scope: PVE-only（2026-05-22 锚定）

**IN（必须 1:1 还原 DNF）**:
- 玩家操作：swordman 完整链路（`.skl` / `.chr` / `.ani` / `.atk`）
- 怪物战斗 AI：`.mob` 阈值消费 + category-driven 行为分派
- 战斗 13 system 全套（按 [`kernel-design.md`](2026-05-21-dnf-native-kernel-design.md) §1 完整列表，不简化）
- 副本 spawn + 房间 + boss encounter（最小战斗空间环境）
- 装备影响战斗的部分（伤害修正 / 被动 / status 给予）

**OUT（不实现 / stub / 跳过）**:
- PvP：决斗 / 公会战 / 竞技场；`.skl` pvp 场景 override 跳过；`.atk` 标 `pvp: 1` 的攻击跳过
- 城镇：NPC / 商店 / 邮件 / 任务对话 / 拍卖 / 仓库 / 社交
- 副本非战斗环节：通关结算 UI / 加血泉 / 详细掉落表 / 过场动画

**PvP 字段处理原则**：parser 全字段读取（PVF 数据完整性优先），runtime 加 `ignoreInPveOnly: true` flag 跳过 PvP-only 字段消费。

**工程简化提案的默认决议**：拒绝。除非 OOS 范围已盖到该 system，否则 13 system 不接受合并 / 压缩。

---

## 1. 数据 / 引擎边界（真值汇总）

```
┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│   全在 PVF（可入 SQLite）         │  │   全在引擎二进制（必须自研）     │
├──────────────────────────────────┤  ├──────────────────────────────────┤
│  .chr  - 角色属性/动作表/成长     │  │  AI polling loop                 │
│  .skl  - 技能定义 / 命令序列      │  │  状态机仲裁（5 级 priority）     │
│  .atk  - 攻击参数 (lift_up 等)    │  │  门触发条件 / 触发器逻辑          │
│  .ani  - 帧序列 / 帧事件 sentinel │  │  碰撞检测                        │
│  .mob  - 怪物属性 / AI 阈值       │  │  物理积分器                      │
│  .dgn  - 副本结构 / 房间连接      │  │  命令 buffer / 输入预读窗口      │
│  .map  - 地图 spawn / 门坐标      │  │  帧事件 dispatch                 │
│  .etc  - 掉落 / 装备 / 物品       │  │  寻路 / 仇恨 / 视野遮挡          │
│  .nut  - 玩家技能逻辑（韩文）     │  │  动画时钟（SpeedRate 应用）      │
│  cancel*.skl - 取消 dual-semantics│  │  统计 / 经济 / 网络同步          │
└──────────────────────────────────┘  └──────────────────────────────────┘
        ↑ 数据消费层 (Stage 1)              ↑ 自研引擎层 (Stage 2)
        - 一次性入库 + Runtime JSON          - 4-6 周自研工作量集中在这
```

**异常情况**：
- `.ai` / `.aic`：在 PVF 但**当前不承载决策**（vestigial 遗留格式或专为 boss 用）
- monster `.nut`：**不存在** —— DNF 仅玩家技能用 Squirrel，怪物完全引擎驱动
- `greed` 地形字符串：在 `.dgn`，但字母 → 地形 mapping 未知（待"地形字母表"专项）
- per-attack `cooltime/MP`：转职 `.skl` 顶层为空，schema 未确定（在哪个子层）

---

## 2. 各模块 Schema 真值

### 2.1 `.chr` — swordman 实证

- 257 sections 完整 dump（详 [`swordman-data-model.md`](../research/2026-05-21-swordman-data-model.md) §2）
- Scalar 12: jump_power=430, weight=68000, move_speed=850, light_resist=-20, dark_resist=+20, etc.
- Growth vectors 9×17：hp/mp/regen/hit_recovery/phys_atk/mag_atk/phys_def/mag_def/inv_limit
- Module damage rate 16×4 / weapon hit info 6×6 / weapon wav 6×4
- Motion map → 24 显式 .ani + 119 etc-motion 共享池

### 2.2 `.atk` — swordman 92 文件实证

- 18 sections 分布：damage reaction (92/92) / attack type (92/92) / elem property (90/92) / lift_up (84/92) / push_aside (81/92) / damage_bonus (25/92) / ...
- Reaction 阈值假设（Tier-3 待验证）：`lift_up ≥ 200 → hitback`, `down=true → down motion`, `hit_lift_up → hitback`, `hit_down → damage2`, `hit_horizon → damage1`
- swordman 7 关键攻击：attack1=75 / attack2=90 / attack3=300 / hardattack=300 / dashattack=80 / jumpattack=180 / hitback=220

### 2.3 `.ani` — 24 核心 motion + jump 帧事件实证

- per-frame: `{i, delay, imgParam, sprite, x, y, dmg[], atk[]}`
- `delay=10000` 是**引擎事件 sentinel**（jump f7=apex hold / f14=land hold / down f3-4 / damage1 f0）
- 引擎 hook 来自 sq_*Frame API：`sq_JumpUpStartFrame / sq_JumpDownStartFrame / sq_JumpLandStartFrame / sq_SetDownUpFrame / sq_SetDownDownFrame`

### 2.4 `.skl` — swordman 30/210 = 14% 已 land

| 类别 | 已 land | 待挖 |
|---|---|---|
| 共享 active/passive | 23 | 0 |
| 5 转职代表 | 5 (command 已验证) | cooltime/MP 在 per-attack 层（schema 待确认）|
| Awakening 4 (IDs 91/89/90/92) | 0 | feature_skill_index batch scan 待做 |
| 其它 (weapon mastery / EX / wave) | 0 | ~178 |

**Cancel 系统**: 5 stringtable IDs (371543/241483/371546/371547/371549) 在 cancel*.skl 里**取代标准 section 名**承载 dual semantics：

| ID | Stringtable 名 | Cancel 意义 | 类型 |
|---|---|---|---|
| 371543 | `[purchase cost]` | cancelWindowStart | int (frame) |
| 241483 | `[required level]` | cancelWindowDuration | int (frame) |
| 371546 | `[skill class]` | cancelGroup | int |
| 371547 | `[growtype maximum level]` | cancelWeaponMask | int[6] |
| 371549 | `[skill fitness growtype]` | cancelTargetSlots | int[] |

**Command system**:
- Pure token sequence matching（无 priority window）
- Tokens: `(up)(down)(left)(right)(buff)(skill)(attack)(jump)`
- Delimiter: `,` 顺序 / `&` 同时按
- Buffer 在 DNF.exe 硬编码，需自研（无 Tier-1 真值）

### 2.5 `.mob` — goblin + taumetacow 双原型

| 字段 | goblin（轻型近战） | taumetacow（重型多攻） |
|---|---|---|
| level | (低) | 54 |
| weight | (低) | 1,000,000 (重 15× swordman) |
| warlike | 60 | 100 (max) |
| sight | 300 | 1000 |
| attack_delay | 1500 ms | 500 ms |
| move_speed | 300 | 1200 |
| category | `[human][goblin][melee combat][close-passive]` | `[machine][fort armor][tau][melee combat][close-manace]` |
| attack 数 | 1 | 6 (melee + roar + laser + fire + throw + skill:18) |
| 显式抗性 | 无 | 火 30% / 多状态 20-50% |

**双原型验证**："`.mob` 阈值 + category 标签"足以涵盖**完全不同行为模型**的怪物，无需额外脚本层。

### 2.6 `.ai` / `.aic` — vestigial (当前 PVF 版本)

- `.ai` 是 Document tag-value，但 `ai pattern` section 在抽样的 5 个怪物（goblin/spirit/mj/botticelli/...）**全部为空**
- monster `.aic` 0 个
- 决策完全在 `.mob` 阈值 + DNF.exe 硬编码 polling loop

### 2.7 `.dgn` / `.map` — grimseeker 7-room 实证

- `.dgn` 25 sections: recommended level / start map / map specification (×N) / champion / boss map / greed (terrain) / ...
- `.map` 干净 Document（无 binary）：monster spawn / event monster / pathgate pos / animation / sound / monster specific ai
- Spawn 元组: `[count, level, ?, mob_id, x, y, ?, ..., placement_type, spawn_mode, ...]`
- 触发条件 / 门控逻辑 / 碰撞物理 → **引擎自研**

---

## 3. dnf-native v2 架构（两层结构）

> **2026-05-22 scope 修正**：原稿倡导"4 heavy + 5 helper + 3 bridge 工程简化"，已 **deprecated**。新决定：1:1 还原 DNF，引擎层按 [`kernel-design.md`](2026-05-21-dnf-native-kernel-design.md) §1 完整 13 system 实现，每个 system 一个独立目录，PVE 代码路径完整，PvP / 城镇分支 stub。详见 §0.5 Scope。

两层架构：**数据消费层 + 自研引擎层**

```
┌──────────────────────────────────────────────────────────┐
│  数据消费层 (Data Consumption Layer) — Stage 1            │
│  ─────────────────────────────────────────                │
│  EXTRACT (dnf-extract.exe)                                │
│    → PARSE (7 个 parser in TS)                           │
│    → VALIDATE (schema + Provenance + ref integrity)       │
│    → LOAD (node:sqlite mirror DB，开发期 ETL，可选)        │
│    → EXPORT (sharded runtime JSON)                        │
│  PVF 全字段保留，PvP-only 标 ignore                        │
└────────────────────────┬─────────────────────────────────┘
                         │ runtime JSON manifests
                         ▼
┌──────────────────────────────────────────────────────────┐
│  自研引擎层 (Engine Logic Layer) — Stage 2                │
│  ─────────────────────────────────────────                │
│  按 kernel-design.md §1 完整 13 system 一字排开，          │
│  每个 system 一个独立目录:                                  │
│   [1]  InputLayer            [8]  DamageFormula           │
│   [2]  AIDecider             [9]  ReactionStateMachine    │
│   [3]  StateTransition       [10] ResourceSystem          │
│   [4]  AnimPlayback          [11] StatusEffectSystem      │
│   [5]  FrameEventBus         [12] AppendageSystem         │
│   [6]  PhysicsIntegrator     [13] VFX/Audio               │
│   [7]  HitDetection                                       │
└──────────────────────────────────────────────────────────┘
```

**实施约束**：
- 每个 system PVE 代码路径完整实现
- PvP 分支：留 stub function + `// TODO(OOS): PvP path not implemented`
- 城镇相关接口：完全不实现
- 工程经济性论据（如 "helper 合并"）默认拒绝，除非 OOS 已盖到该 system

---

## 4. Monster AI 设计（颠覆性修正）

**原方案**："Decision Layer = `.ai` Rule Engine" → **完全证伪**

**v2 方案**：Polling FSM/BT，消费 `.mob` 阈值 + category 标签。无需脚本层。

### 4.1 决策模型（自研，有自由度）

```typescript
// 每 tick (60Hz):
for (const monster of allMonsters) {
  const target = findTargetPlayer(monster);
  const dist = distance(monster, target);

  // .mob 真值消费:
  const { warlike, sight, attack_delay, move_speed, category } = monster.mobData;

  if (dist > sight) {
    monster.state = "IDLE";
  } else if (Math.random() * 100 < warlike) {
    if (dist <= attackRange(category, monster.attackInfo)) {
      if (monster.attackCooldown <= 0) {
        monster.state = "ATTACK";
        monster.attackCooldown = attack_delay;
      } else {
        monster.state = "WAIT";
      }
    } else {
      monster.state = "CHASE";
    }
  } else {
    monster.state = "WANDER";
  }
}
```

**自由度**：行为模型可以是 FSM / BT / Utility AI 任何一种，**只要消费 `.mob` 阈值就能"和原版手感相近"**。DNF.exe 的具体算法不可获取（也不必获取）。

### 4.2 Category 标签语义化

`.mob.category` 是 behavior tag 数组。从 goblin / taumetacow 实证：

| 标签 | 含义 |
|---|---|
| `[melee combat]` | 近战 |
| `[range combat]` | 远程 |
| `[close-passive]` | 接近后被动等 |
| `[close-manace]` | 接近后主动威胁 |
| `[close-carefully]` | 谨慎接近 |
| `[fort armor]` | 防御机型 |
| `[machine]` / `[human]` / `[tau]` | 种族标签（影响伤害修正） |

行为模型按 category 派生子规则集（"melee" 用近战 FSM, "range" 用远程 FSM）。

### 4.3 Boss 阶段

Boss 阶段保留现有 `boss-patterns.json` 设计（已 Phase 5 验证），不属于"polling loop"管辖。Boss 的 .mob 标 `[boss]` category，引擎切换为 phase-driven 子状态机。

---

## 5. Skill / Action 设计

### 5.1 双层 schema

- **`SkillDef`** (`.skl`-driven): metadata + command + cost + cooldown + level scaling
- **`FrameData`** (`.ani` + `.atk`-driven): per-frame hitbox + active windows + cancel windows

`SkillDef` 引用 `FrameData`，两层独立演进。

### 5.2 Cancel system

实施步骤：
1. C++ `dnf-extract` 已输出 5 dual-semantics section（无需改）
2. 新 `src/data/official/dnf/swordman/cancels.ts` 加 reinterpret 函数（~80 行 TS / 1h）
3. 按 filename pattern `cancel*` 检测，map 标准 section → cancel 语义
4. 19 个 swordman cancel 全部升 Tier-1

### 5.3 Command 输入

- 解析器纯 token sequence matching
- Buffer window 自研（H1 默认 ~10 帧，待手感对齐）

---

## 6. Dungeon / Map 设计

### 6.1 DgnParser / MapParser

- 两者都是 Document tag-value，无 binary surprise
- 估算 19-29h 总工时（含 spawn tuple unpack + room graph 建立）

### 6.2 已知 unknown

- `greed` 地形字符串字母 → 地形类型 mapping 未解码（"aaaaiiaaaa\r\n aajjhhffee..."）
- 触发条件（门何时开 / 怪物何时出场）不在 PVF，自研逻辑

### 6.3 数据完整度

```
✅ 完全 PVF: 房间数 / 房间连接 / spawn 坐标 / 门坐标 / boss 标记 / champion / terrain 字符串
⚠️ 部分 PVF: terrain 字母语义（编码已 dump，意义未知）
❌ 自研: 触发条件 / 门开关逻辑 / 碰撞物理 / 摄像机
```

---

## 7. 实施路线（修正版）

| Stage | 内容 | 工时 | 风险 | 起步 commit |
|---|---|---|---|---|
| **0. 当前未提交收尾** | swordman/ 目录 + index.ts + swordman-data-model.md 加入 commit | 30 min | 🟢 | "swordman: full PVF dump baseline" |
| **1. 数据管线** | (a) Defect 1 C++ 修 (4h) — Document 类型标注；(b) Node cancel decoder 复原 (1h)；(c) MobParser/AtkParser/ChrParser/SklParser/AniParser/DgnParser/MapParser；(d) SqliteImporter (node:sqlite)；(e) RuntimeJsonExporter | **1-2 天** | 🟢 全 Tier-1 | 多个 commits |
| **2. 引擎自研** | AI polling loop / 触发器 / 碰撞 / 物理积分（Phase 4 已就绪）/ 状态机仲裁（5 级 priority）/ 命令 buffer / 帧事件 dispatch | **4-6 周** | 🟡 自由度大但需手感对齐 | per-system commits |
| **3. 数据洞补完** | (a) Awakening 4 .skl batch scan / (b) 猫妖韩文真名查证 / (c) greed terrain 字母表 / (d) per-attack cooltime schema | **1-2 天** 散单 | 🟢 | "fill remaining tier-1 gaps" |

**总工期**：**4-5 周**（vs 原 6 周路线图），因为 Stage 1 数据管线压缩了 Week 1。

---

## 8. 与原 6 周路线图差异

| Week | 原计划 | v2 修正 |
|---|---|---|
| 1 | 基础数据层扩张（characterStats/attackLiftUp/animationMap）| **改成 Stage 1 数据管线全量**（1-2 天而非 1 周） |
| 2 | Actor 状态机（25+ 状态）| 简化：~10 显式 + 5 implicit 即可（不需要"统一 25 状态"，按 .chr motion 表派生） |
| 3 | Skill 双层 schema | 不变 |
| 4 | Hit/Damage/Reaction 物理 | 不变（Phase 4 已就绪） |
| 5 | AnimationPlayer + FrameEventBus | 不变（事件 sentinel `delay=10000` 已确认） |
| 6 | Monster AI = RuleEngine | **改成自研 polling FSM/BT，消费 .mob 阈值 + category** |

---

## 9. 未解 Tier-1（待补 / 标 H1 working hypothesis）

| 项 | 状态 | 升档路径 |
|---|---|---|
| swordman `.skl` 剩余 ~178 个 | 14% Tier-1 / 86% pending | Stage 3 散单 batch scan |
| Awakening 4 .skl 文件名映射 | 0% Tier-1 | feature_skill_index batch scan |
| 猫妖韩/英真名 | 0 命中 | 用户确认副本 or 韩文 name |
| `greed` terrain 字母表 | 未解码 | 专项 — 抽多个 .map 对比字母分布 |
| 转职 .skl per-attack cooltime/MP | 顶层为空 | 抽 1 个转职 attack 子结构 reverse-engineer |
| jump_power 单位 (H1 vs H2) | Tier-3 hypothesis | DNF.exe RE 或视频对照 |
| hitstun 表 per-level | Tier-3 baseline | 视频对照升 Tier-2 |
| Command buffer window | 自研 H1 (~10 frames) | 视频对照 |
| Monster category 完整语义化 | 部分（5/?） | 跨怪物 grep `category` 字段 |

---

## 10. 证据来源

### 10.1 今天 8 份 agent 报告

1. **dnf-extract 实测**：5 文件类型 Tier-1；Defect 1 ~30 行 C++；Defect 2 已证伪
2. **Cancel section ID 解码**：dual-semantics 5 ID；Node 端 SklAnalyzer 被删 (commit e1f3e0f)；1h 复原
3. **sq_* API 调用分布**：13 system 60% 验证；478 enum 28% zombie；4 heavy + 5 helper + 3 bridge
4. **怪物 AI 决策真位置**：`.ai` vestigial；决策完全在 `.mob` + 引擎硬编码；0 monster `.nut`
5. **副本地形 + 环境**：grimseeker 7-room；`.dgn`/`.map` 干净 Document；spatial 完全 PVF
6. **猫妖 + 机械牛**：taumetacow 找到（level 54 / weight 1M / 6 攻击 / category=[machine]）；猫妖 20+ 搜索失败
7. **swordman 深挖**：5 转职代表 command 验证；Awakening 4 未找到；command 系统 = pure token matching
8. （第一轮已合并到上述）

### 10.2 阶段 1 纠错 7 处

详 [`CLAUDE.md`](../../CLAUDE.md) L61 / [`2026-05-21-dnf-extract-assessment.md`](../planning/2026-05-21-dnf-extract-assessment.md) §3 缺陷 2 / [`2026-05-21-dnf-native-kernel-design.md`](2026-05-21-dnf-native-kernel-design.md) §1+§6 footnote / [`swordman-data-model.md`](../research/2026-05-21-swordman-data-model.md) §6.2 / `memory/MEMORY.md` L6 / `memory/session-2026-05-12-extraction-phase-a-d.md` 顶部。

### 10.3 昨晚 9 份 md 计划

详 [`docs/planning/2026-05-21-dnf-alignment-pivot.md`](../planning/2026-05-21-dnf-alignment-pivot.md) 及其引用链。

---

## 11. 下一步建议

1. **先 commit 当前未提交的 swordman 数据** —— 把 `swordman/` 目录 + 修改的 `index.ts` + `swordman-data-model.md` 沉成"swordman PVF dump baseline"commit
2. **再 commit 本 v2 设计 + 7 处纠错** —— 同一个或单独 commit，作为"基于 Tier-1 真值修正方向"
3. **然后选择**：
   - 走 Stage 1（数据管线实现，1-2 天）
   - 或继续散单深挖（Stage 3 数据洞补完）
   - 或开始 Stage 2 引擎自研（4-6 周，先做 AI polling loop POC）
