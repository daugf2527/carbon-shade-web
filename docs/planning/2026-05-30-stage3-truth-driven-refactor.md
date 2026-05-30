# Carbon Shade Stage 3 实施路线图 — 真值驱动重构

**日期**: 2026-05-30
**状态**: Stage 2 完成（Phase 0-5 全绿，M3 达成），Stage 3 开工
**前置**: Stage 1 PVF 提取管线 + Stage 2 22-system 引擎层
**关键发现**: 当前 ActorFactory + DamageFormula + FrameDataAction 全是脑补值，PVF 真值未驱动战斗逻辑（实测：玩家一击秒杀所有敌人）

---

## 〇、全局约束

| 约束 | 内容 |
|------|------|
| 范围 | **PvE 打怪战斗 1:1 还原 DNF**，剑魂职业起步 |
| 模式 | **硬切换**，不做渐进迁移，旧 default.json/scenario baseline 全废 |
| 信源 | dnf-extract (C++) → PVF .ani/.atk/.chr/.skl + equipment/weapon/*.ani 真值 |
| 公式 | hit/damage/reaction 三段公式**推倒重写**，按 PVF 真值反推 |
| 测试 | 旧 Stage 2 scenario 测试移到 `tests/legacy/`，新测试在 `tests/truth/` 双轨 |
| 命名 | 全部切换 PVF 命名（attack1/attack2/dashattack/jumpattack），抛弃 NormalBasic1/DashAttack |

---

## 一、决策锁定表

13 个决策已锁，写代码前不再讨论：

| ID | 决策 | 选择 |
|----|------|------|
| **Q1** | 重构 scope | A→B：剑魂 attack1 PoC → 剑魂全 14 动画 |
| **Q2** | attackBoxes 缺口排查方式 | 三步实证：PVF 直抽 + 同类穷举 + 提取脚本 grep |
| **Q3** | 引擎层处理 | 推倒重写 hit/damage/reaction 子系统 |
| **D1** | PoC 武器 | beamsword（光剑） |
| **D2** | 武器/角色动画关联 | `weaponAnimRef` 字符串引用，shard 不冗余 |
| **D3** | 重写边界 | hit/damage/reaction 三段全推倒，重画交互流图 |
| **D5** | 武器/角色动画长度对齐 | **双 timeline 独立播**，不强制对齐 |
| **D6** | 一帧多 atk 聚合 | **各自独立 hitbox**，支持 multi-hit 一帧重复打 |
| **D7** | 真值运行时位置 | **编译时嵌入 bundle**（vite import），swordman-truth.json |
| **D8** | 旧 default.json | **直接砍掉**，全用真值命名 |
| **D9** | reaction 公式 | **真值驱动 + 写反推文档**（独立 Phase C） |
| **D10** | Stage 2 baseline | **全部重跑**，一次性切换 |
| **D11** | 进度可视化 | 借 Stage 2 roadmap 表样式 |

---

## 二、根因实证（不再讨论的事实）

### attackBoxes 缺口三步排查（2026-05-30 实证）

**症状**: shard `verification/baseline-shards/players/swordman.json` 中，`attack1.ani` 10 帧 `attackBoxes` 全空，但 `attack3.ani` frame 2/3 有数据。

**步骤 1 — PVF 直抽**:
```bash
dnf-extract --pvf Script.pvf --file character/swordman/animation/attack1.ani
# → 10 frames, only `dmg` field, NO `atk` field
```
attack1.ani 在 PVF 里原始就没有 atk 字段。

**步骤 2 — 同类穷举**:
```bash
dnf-extract --pvf Script.pvf --file equipment/character/swordman/weapon/hsword/lswdb/attack1.ani
# → frame 4 has atk:[[-29,-17,21,133,29,37]]
```
攻击盒在**武器动画**里，不在角色动画里。

**步骤 3 — 提取脚本 grep**:
```bash
# scripts/stage1-baseline.mjs:291
if (p.includes('/equipment/')) return false;  # exclude avatar/weapon ani (~21k for swordman)
```
体积权衡的主动排除规则。

### DNF 攻击盒分布真相

| 文件类型 | 内容 | Stage 1 状态 |
|----------|------|------|
| `character/<job>/animation/*.ani` | 身体动画 + damageBox（受击盒） | ✅ 已提取 |
| `character/<job>/attackinfo/*.atk` | 攻击属性（liftUp/pushAside/damageBonus/hitReaction） | ✅ 已提取 |
| `equipment/character/<job>/weapon/<wpn>/*.ani` | 武器动画 + atk（攻击盒） | ❌ **Stage 3 必须开** |
| `character/<job>/<job>.chr` | growth 表（攻击/HP/MP 17 段成长曲线）+ widthBox + weaponHitInfo | ✅ 已提取 |

### 一击秒杀根因（DamageFormula）

`src/combat/damage/DamageFormula.ts:132-143` 将 `atkPower=1800` 直接当乘数：
```
multiplier = statRatio(2.92) × atkPower(1800) × eleRatio(1.0) × defRatio(0.972) × ...
           = 5108
finalDamage = baseDamage(10) × 5108 = 51080  // 一击秒杀 160HP
```

公式错误：DNF 真实公式里 `atkPower` 不是乘数，是基数。**Stage 3 推倒重写**。

---

## 三、技术难点与风险矩阵

### 🔴 核心难点

| # | 难点 | 为什么难 | 影响 | 优先级 |
|---|------|---------|------|--------|
| **G1** | **武器/角色双 timeline 独立播** | D5 选 C，需重新设计 FrameDataAction 数据结构。frame 索引不再保证一致 | hit detection | P0 |
| **G2** | **reaction 公式反推无现成审计** | dcalc 没覆盖 reaction，需从 PVF (liftUp + pushAside + launch + weight + hitRecovery) 行为反推。可能无唯一解 | Reaction System | P0 |
| **G3** | **bundle 体积爆炸** | D7=A 嵌入，单职业 458KB。11 职业 ≈ 5MB+ | 首屏加载 | P1 |
| **G4** | **PVF tier3 单位歧义** | jumpPower=430 (unit=ambiguous), moveSpeed=850 (unit=%xSPEED_DEFAULT)。要么实测换算，要么硬编码 | 物理参数 | P1 |
| **G5** | **Stage 2 测试一片红期** | D8 + D10，新公式稳定前 ~50 scenario 全失效。CI 长期红 | 工程效率 | P1 |

### 🟢 风险缓解（R1-R5）

| ID | 风险 | 缓解策略 |
|----|------|---------|
| **R1** | D9 reaction 反推卡死 | 设 1 周时间盒，超时退回 D9=B（参数真值 + 公式 stub），Phase C 改为 deferred |
| **R2** | bundle 5MB+ | 接受首版超大，Phase D 加 dynamic import 拆 chunk |
| **R3** | CI 长期红 | 旧测试改名 `tests/legacy/`，新测试 `tests/truth/`，CI 分两条 pipeline |
| **R4** | equipment 提取 21k 文件 | D1 锁 beamsword 一把，预估 < 500 文件。Phase B 再按需扩 katana/hsword |
| **R5** | demo scene 输入命名映射 | Phase A 起手就改 J/K/L → attack1/attack2/dashattack |

---

## 四、Phase 分解（4 个 Phase，预估 12-18 工作日）

```
Phase A: PoC 单动作真值跑通 (3-5d)
    ↓
Phase B: 剑魂全 14 动画扩展 (3-4d)
    ↓
Phase C: reaction 公式反推 (3-5d)  ★ 最不确定
    ↓
Phase D: 集成 + baseline 重跑 + 体积优化 (3-4d)
```

---

## Phase A：PoC 单动作真值跑通（3-5 天）

**目标**: 剑魂 attack1（光剑）用 PVF 真值数据驱动，跑通 PVF→shard→manifest→运行时→打中敌人→正常伤害链路。

| 任务 | 内容 | 验收 | 估时 |
|------|------|------|------|
| **T-A.1** | 改 `scripts/stage1-baseline.mjs:291` 排除规则，添加 beamsword 路径白名单 | baseline 包含 `equipment/character/swordman/weapon/beamsword/<某等级>/attack1.ani` | 1h |
| **T-A.2** | 重跑 baseline，验证武器 .ani 提取到 shard | `verification/baseline-shards/players/swordman.json` 包含 `weaponAnims.beamsword.attack1.frames[].atk` | 1h |
| **T-A.3** | 设计新 shard schema：weaponAnimRef 引用结构 | `bodyAnim: "attack1"` + `weaponAnimRef: "beamsword/lswdb/attack1"`，运行时分别 lookup | 2h |
| **T-A.4** | 写 `scripts/sync-truth-to-manifest.mjs` 转换 verification shard → `src/data/manifest/swordman-truth.json` | vite import 成功，typed | 3h |
| **T-A.5** | **砍掉 `src/data/manifest/actions/default.json`** + 所有引用 | tsc 通过 | 1h |
| **T-A.6** | 设计新 `FrameDataAction` 类型：双 timeline + 多 atk 独立 hitbox | type 编译通过；ActorBodyTimeline + WeaponTimeline + 每帧 atk[] | 4h |
| **T-A.7** | 重写 `ActorFactory.ts`：删硬编码 stat block，从 swordman-truth 读 chr.growth (level=70) | 玩家 stat 来自 PVF | 2h |
| **T-A.8** | 重写 `HitResolutionSystem.ts`：从双 timeline 取 atk[]，每个 hitbox 独立检测 | 单测：attack1 frame 4 武器 atk 触发 hit | 6h |
| **T-A.9** | 重写 `DamageFormula.ts`：新公式 = `(chr.growth.physicalAttack × level + weapon.physAtk) × attack.damageBonus × weapon.damageScalePct × (1 - defRatio)` | 单测：attack1 打 grunt 不一击秒杀（HP 减 5-20 范围） | 6h |
| **T-A.10** | 改 `CombatScene.ts` 按键映射：J → attack1, K → attack2, L → dashattack | 浏览器实测 J 打出 attack1 | 1h |
| **T-A.11** | 写 `tests/truth/swordman-attack1-truth.test.ts`：60 帧仿真 attack1 全流程 | green | 3h |

**Exit criteria**:
- 浏览器跑 `npm run dev`，玩家按 J 打出 attack1，打中 grunt 后 HP 减 8-15（不是一击秒杀也不是 0）
- shard schema 包含 `weaponAnimRef`，sync 脚本可重复跑
- `tests/truth/` 至少 1 个测试绿
- `default.json` 已删，tsc 通过

**风险点**:
- T-A.6 数据结构设计可能反复（双 timeline + multi-hit 是新模型）
- T-A.9 新公式需要平衡（PVF 数据 + 公式系数）

---

## Phase B：剑魂全 14 动画扩展（3-4 天）

**目标**: 剑魂 14 个动画 + 9 个 attack 真值打通，beamsword 全等级武器接入。

| 任务 | 内容 | 验收 | 估时 |
|------|------|------|------|
| **T-B.1** | 扩展 `stage1-baseline.mjs` 白名单到 beamsword 全等级（lswda/b/c1/c2/...） | shard 包含全等级武器 | 1h |
| **T-B.2** | 批量验证 14 动画的 attackBoxes 覆盖（stay/move/dash/jump/attack1-3/hardattack/jumpattack/dashattack/damage1-2/down/overturn） | 报告每个动画 atk 覆盖率 | 2h |
| **T-B.3** | sync 脚本扩展：处理 14 动画全量 | swordman-truth.json 完整 | 2h |
| **T-B.4** | 重写 `RunCommandDetector` / `CommandInputParser`：dashattack 用真值帧识别 | dash → dashattack 触发正确 | 3h |
| **T-B.5** | 接入 `weaponHitInfo`：weaponHitInfo[i].damageScalePct/pushBack/launch 应用到伤害计算 | 不同武器等级伤害不同 | 3h |
| **T-B.6** | 普攻三连（attack1 → attack2 → attack3）cancel 窗口真值化（从 .ani delay 推导） | 三连流畅 | 4h |
| **T-B.7** | jumpattack/hardattack 接入 | 浏览器实测可用 | 3h |
| **T-B.8** | `tests/truth/swordman-full-actions.test.ts`：14 动画 cover | green | 4h |

**Exit criteria**:
- 浏览器实测剑魂 14 动画全可用
- 普攻三连可触发
- `tests/truth/` ≥ 5 个测试绿

---

## Phase C：reaction 公式反推（3-5 天）★ 最不确定

**目标**: 写出 DNF reaction 公式反推文档 + 实现 ReactionResolver 真值驱动。

> ⚠️ 这是 Stage 3 风险最高的 Phase。**设 1 周时间盒**，超时退回 D9=B（参数真值 + 公式 stub），Phase D 改为 deferred reaction。

| 任务 | 内容 | 验收 | 估时 |
|------|------|------|------|
| **T-C.1** | 写 `docs/research/reaction-formula-reverse-engineering.md` 反推文档骨架 | 字段清单：liftUp / pushAside / launch / weight / hitRecovery | 2h |
| **T-C.2** | 实测 DNF 客户端行为（不同 weight 怪打 attack3 飞高 vs attack1 倒地） | 行为 → 公式假设 H1/H2/H3 | 6h |
| **T-C.3** | 反推 launch 公式：`launchY = attack.liftUp × weapon.launch × (1 - target.weight/threshold)` 验证 | H1 验证通过/不通过 | 4h |
| **T-C.4** | 反推 hitstun 公式：`hitstunFrames = baseStun × (1 - target.hitRecovery/normalize)` | H1 验证 | 4h |
| **T-C.5** | 重写 `ReactionResolver.ts` 真值驱动 | 实测 attack3 把 grunt 击飞 | 6h |
| **T-C.6** | 重写 `HitStopController` + `RecoilController` 真值化 | hitstun 时长来自 PVF | 4h |
| **T-C.7** | `tests/truth/reaction-formulas.test.ts` | green | 3h |

**Exit criteria** (D9=A 路径):
- 反推文档定稿，每条假设有 PVF 字段证据
- ReactionResolver 接受 PVF 字段输入，输出与 DNF 实测行为一致

**Fallback exit criteria** (D9=B 降级):
- 反推文档骨架 + H1/H2/H3 假设标 TBD
- ReactionResolver 接受真值参数但公式仍 stub
- Phase D 加任务 T-D.X "reaction 真值公式实装"

---

## Phase D：集成 + baseline 重跑 + 体积优化（3-4 天）

**目标**: Stage 2 baseline 全部重跑作为新基线 + bundle 体积优化 + 完整 e2e。

| 任务 | 内容 | 验收 | 估时 |
|------|------|------|------|
| **T-D.1** | 旧测试整体移到 `tests/legacy/`，CI 加 `legacy:test` script | legacy/ 跑 0 个 case 也算 green | 2h |
| **T-D.2** | `tests/truth/` 集成到 `npm run static:test` 主流程 | green | 1h |
| **T-D.3** | 跑 `npm run baseline`，生成新 stage3-baseline.json | verification/stage3-baseline-* | 2h |
| **T-D.4** | bundle 体积分析：vite-bundle-visualizer | 看到 swordman-truth.json 458KB 占比 | 2h |
| **T-D.5** | 改 vite import 为 dynamic import：`import("./swordman-truth.json")` lazy load | bundle 主包减少 458KB | 3h |
| **T-D.6** | e2e 浏览器测试（playwright）：J→K→L 三连 + 实际打死 grunt 验证 HP 归 0 流程 | green | 4h |
| **T-D.7** | 更新 `CLAUDE.md` Stage 3 完成状态 + `docs/changelog/2026-05-30-stage3.md` | 文档更新 | 2h |

**Exit criteria**:
- `npm run static:test` 全绿
- bundle 主包不含 swordman-truth.json
- 浏览器 e2e 跑通三连打死敌人，HP 归 0 + ActorDead 事件触发
- 反应（受击飞起/倒地）符合 DNF 行为

---

## 五、Phase 间依赖图

```
T-A.1 改排除规则 → T-A.2 重跑 baseline → T-A.3 schema 设计 → T-A.4 sync 脚本
                                                                ↓
T-A.5 砍 default.json ──┬──> T-A.6 新 FrameDataAction
                        │                  ↓
T-A.7 ActorFactory ─────┤      T-A.8 HitResolutionSystem
                        │                  ↓
T-A.10 CombatScene ─────┴──> T-A.9 DamageFormula → T-A.11 truth test
                                       ↓
                                   Phase A 完成
                                       ↓
                                    Phase B（扩展剑魂全动画）
                                       ↓
                                    Phase C（reaction 反推）⚠️ 时间盒
                                       ↓
                                    Phase D（集成 + 优化）
```

---

## 六、文件清单（新增 / 修改 / 删除）

### 新增

| 路径 | 内容 |
|------|------|
| `docs/planning/2026-05-30-stage3-truth-driven-refactor.md` | 本文档 |
| `docs/research/reaction-formula-reverse-engineering.md` | Phase C 反推文档 |
| `scripts/sync-truth-to-manifest.mjs` | verification → src/data/manifest 转换 |
| `src/data/manifest/swordman-truth.json` | 编译时真值数据 |
| `src/data/types/SwordmanTruth.ts` | shard typed schema |
| `tests/truth/swordman-attack1-truth.test.ts` | PoC 测试 |
| `tests/truth/swordman-full-actions.test.ts` | 全动画测试 |
| `tests/truth/reaction-formulas.test.ts` | 反应公式测试 |
| `tests/legacy/` | 旧 scenario 测试整体迁入 |
| `verification/stage3-baseline-*.json` | 新基线 |

### 修改

| 路径 | 修改内容 |
|------|---------|
| `scripts/stage1-baseline.mjs` | 第 291 行 `/equipment/` 排除改为 whitelist beamsword |
| `src/combat/actors/ActorFactory.ts` | 删硬编码 stat block，改读 swordman-truth |
| `src/combat/actions/FrameDataAction.ts` | 双 timeline + 多 atk 重新设计 |
| `src/combat/hit/HitResolutionSystem.ts` | 推倒重写 |
| `src/combat/hit/HitDecisionResolver.ts` | 推倒重写 |
| `src/combat/damage/DamageResolver.ts` | 推倒重写 |
| `src/combat/damage/DamageFormula.ts` | **完全推倒**，新公式 |
| `src/combat/reaction/ReactionResolver.ts` | Phase C 推倒 |
| `src/combat/reaction/HitStopController.ts` | Phase C 真值化 |
| `src/combat/reaction/RecoilController.ts` | Phase C 真值化 |
| `src/game/CombatScene.ts` | 按键映射改 PVF 命名 |
| `package.json` | scripts 加 `legacy:test`, `truth:test`, `sync:truth` |
| `CLAUDE.md` | Stage 3 状态表 |

### 删除

| 路径 | 原因 |
|------|------|
| `src/data/manifest/actions/default.json` | 全部真值化（D8=C） |
| Stage 2 ~50 个 scenario test | 移 `tests/legacy/` 后保留，不删 |

---

## 七、进度看板

| Phase | 任务数 | 完成 | 状态 |
|-------|--------|------|------|
| A — PoC 单动作 | 11 | 0 | 🟡 待开工 |
| B — 剑魂全动画 | 8 | 0 | ⚪ 阻塞中 |
| C — reaction 反推 | 7 | 0 | ⚪ 阻塞中（时间盒 1 周） |
| D — 集成 + 优化 | 7 | 0 | ⚪ 阻塞中 |

**M4 里程碑**: Phase A 完成 → 玩家不再一击秒杀
**M5 里程碑**: Phase D 完成 → bundle 主包不含真值 + e2e 跑通

---

## 八、与 Stage 2 的边界

| 维度 | Stage 2 | Stage 3 |
|------|---------|---------|
| 数据来源 | 硬编码 + 推测 | PVF 真值（attack1.ani + atk + chr.growth） |
| 命名 | NormalBasic1/DashAttack 自定义 | attack1/attack2/dashattack PVF 原生 |
| Hit detection | 单 timeline 单 hitbox | 双 timeline 多 atk |
| Damage formula | 10-multiplier 推测 | chr.growth + weapon.damageScalePct 真值 |
| Reaction | 推测的 launch/stun 表 | PVF liftUp + weaponHitInfo.launch 反推 |
| 测试 baseline | Stage 2 scenario | 新 truth/baseline，Stage 2 移 legacy |

---

## 九、TBD 段

写计划时暂不锁定，开工时再定：

1. **武器名命名空间**: shard 用 `beamsword/lswdb/attack1` 还是 `beamsword.lswdb.attack1`？或扁平 key？
2. **chr.growth 等级换算**: 17 段成长曲线如何插值到 level 70？线性还是查表？
3. **damage 浮动**: PVF 真值是否包含 ±5% 浮动？还是固定值？
4. **怪物 chr 数据**: grunt/dummy/imp/boss 用什么 mob 文件做真值？Phase B 阶段需要决策

---

## 十、参考文档

- [Stage 1 完成报告](../changelog/2026-05-24-stage1-complete.md)
- [Stage 2 路线图](2026-05-27-stage2-roadmap.md)
- [DNF alignment pivot](2026-05-21-dnf-alignment-pivot.md)
- [DNF 数值置信度三级铁律](../../C:/Users/newwo/.claude/projects/D--carbon-shade-web/memory/feedback-dnf-data-confidence-tiers.md)（user memory）
- [真值缺口三步实证](../../C:/Users/newwo/.claude/projects/D--carbon-shade-web/memory/feedback-data-gap-root-cause-via-pvf-replay.md)（user memory，Stage 3 起手方法论）
