# Engine 真值化批次完成报告（2026-06-06）

**日期**: 2026-06-06
**分支**: `dnf-native`
**状态**: 11 个实装 commit + 本 changelog 本地（**未 push**，遵 "push only when asked"）
**前置**: P3.1 运行时切换（CombatScene 跑 EngineKernel）已完成
**参考**: [engine-native-rewrite-roadmap](../planning/2026-06-04-engine-native-rewrite-roadmap.md) · [engine 真值覆盖矩阵](../testing/engine-truth-coverage-matrix.md)（第五~十二节是本批技术细节）

---

## 一、概述

承接 P3.1（engine 成为 CombatScene 运行时主线）。本批把 EngineKernel 从"结构贯通但数值层断裂/stub"推进到**多系统 PVF 真值驱动**，全程 24h 自主长任务模式（`/loop`），每组机器可验证闭环（typecheck + static:test + consistency），干净切分 commit。

**static:test 105 全绿**（本批新增 **8 个 engine 测试文件**：scenario-replay / status-dot / resource / monster-ai-truth / hitstun-truth / weapon-timeline-flatten / cancel-window / knockback）。consistency 守护点新增 7 个。

## 二、commit 映射

| commit | 组 | 一句话 |
|---|---|---|
| `f29345b` | B 组 | EngineKernel scenario/replay/runDeterministicScenario 从空 stub → 真值实装（确定性黄金测试）|
| `181b3fd` | C 组 | 自主验证闭环：consistency 守护 + 覆盖矩阵 + smoke skip 注释诚实化 |
| `9fc2132` `18c2121` | benchmark | tick-benchmark 去 flaky：先 warmup+中位数，再 `process.cpuUsage()` CPU 时间度量（对并发争用免疫）|
| `f29f09e` | 09-Status | bleed DOT tick-based 接入 kernel（per-actor statusEffects + death_clear + bleedObserved）|
| `bdb8705` | 08-Resource | MP regen + cooldown tick-based（mpMax/mpRegenSpeed/consumeMp/coolTime 真值）|
| `64610f3` | 03-AI | EnemyAISystem 读 mob shard sight=300/attackDelay=3000ms 真值（替硬编码 DEFAULT_CFG）|
| `10fe885` | hitstun | ReactionResolver 读受击方 hitRecovery（swordman 600/goblin 500ms）替死值 DEFAULT_HITSTUN_MS |
| `279aaa1` | D 组 | DualTimeline 攻击盒平铺纯函数 + AniDef.weaponTimeline + play() 接线 |
| `6805561` | cancel-window | skill cancelWindow PVF 真值解析 + 纯谓词 isInCancelWindow |
| `a0a0b5d` | 水平击退 | pushAside 真值驱动 KnockbackPhysics（镜像 airborne 工作状态，**纠正"需架构决策"误判**）|

## 三、engine 真值化覆盖（本批后）

运行时**真值驱动并消费**：04-Attack/05-Animation/07-Physics(launch)/08-Resource/09-Status/03-AI + hitstun + 水平击退。
**机械就位待数据/接线**（诚实标注，非假装真值化）：D 组 weaponTimeline 平铺（baseline 无 weapon 数据 16.2% BLOCKED）、cancel-window 谓词（engine 无 skill actions）。

## 四、方法论沉淀（本批关键经验）

1. **诚实形态三件套**：数据不可得/未接线的任务（D 组、cancel-window），正解 = 机械就位 + 确定性测逻辑 + **诚实标数据缺口**，不是拒做、也不是假装真值化。
2. **⭐ 边界判断本身要 ground truth**：水平击退一度被自主评估误判为"需架构决策（加 velocity 三轴破 stateHash）"，复检发现 airborne 已用"专门工作状态挂 actor"模式证明不破 hash → 照搬即可，无需架构决策。**教训：AI 宣布"边界/不可做"前，那个 blocker 本身也要查实物验证，否则假性收窄可做范围。**（呼应 `feedback-red-root-cause-needs-runtime-evidence`）
3. **gate 可靠性**：墙钟 benchmark 在并发 runner 下抖动 → `process.cpuUsage()` CPU 时间度量（对调度争用免疫）才是"per-tick 成本是否回归"的正确度量。另：`| tail` 会掩盖管道 exit code，验证必 `; echo $?` 或重定向。
4. **真值 vs 手调的界线**：cancelWindow（PVF cancelWindowStart=50 真值）做；combo-correction gauge（barMax/standHitAdd 手调常数，rule version pve-lite）跳过。pushBack=0 不 fallback（0 是"不推"的真值，臆造=local_baseline 猜测）。

## 五、经两轮实物复检的真实边界（剩余 blocker，需用户决策/更大基建）

| 项 | blocker（已实物验证非误判）|
|---|---|
| physicalAttack 等级真值 | growth base=7.5（手感崩）/17 级累加=82.8；"定几级 + 装备加成"是设计决策，LV70 超 17 级数组需装备/外推模型 |
| 真 hitGroup id | atk 全字段并集无任何 group/combo/hitId 字段 → 需改 dnf-extract 重提取 |
| cancelWindow/command 运行时接线 | 需先建 skill-action infra + 指令序列解析器（大子系统，非单组）|
| P4 表现层 VFX/震屏 | 需 playwright headed 视觉验证（自主回路跑不了 headless:false）|
| Z 深度击退 | 无 PVF z-push 初速真值（combat knockbackZ 是 local_baseline），臆造=combo-gauge 式 |

## 六、交付状态

- 工作区干净，11 实装 commit + 本 changelog 本地未 push（`git log --oneline -12`）。**用户可 `git push` 发布。**
- 三 gate：`npm run typecheck` ✓ / `npm run static:test` 105 全绿 ✓ / `npm run consistency` 守护点全绿（唯一 drift 是既有跨项目 memory wiki-link，非本批）。
