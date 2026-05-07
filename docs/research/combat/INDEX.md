# Combat Research Index

> **Status: [GOVERNANCE]** — 阅读顺序、文档角色表和合并入口

> Scope: `docs/research/combat` 下 32 篇源文档（含 21 篇战斗研究源文档 + 4 篇 synthesis + INDEX/CHAPTER-AUDIT + 5 篇扩展：berserker-action-frame-calibration、berserker-data-gap-report、dnf-dfo-combat-technical-data-replay-report、npk-img-extraction-workflow、pvf-skl-extraction-workflow）。21 篇核心研究源文档保留为 archive/evidence；后续默认先读 synthesis，再按 source map 回查原文。

## 推荐阅读路线

### 先读 4 篇 synthesis

1. `SYNTHESIS-OVERVIEW.md` — 总入口：21 篇资料收束成 4 条主线，说明当前 DFO 手感 P2 应读什么、不应读什么。
2. `SYNTHESIS-COMBAT-KERNEL.md` — 当前实现最常用：Input -> Replay 主链、P2 缺口、FrameDataAction manifest、hit/hurt frame、Damage/Status profile、AI pattern data、Replay hash/schema。
3. `SYNTHESIS-DATA-RUNTIME-PIPELINE.md` — 数据管线：PVF/ANI/NPK、manifest、runtime data、parser/test/checklist、合规边界。
4. `SYNTHESIS-PERIPHERAL-SYSTEMS.md` — 扩展边界：PvP/1v1、评分奖励、raid/party/buff、房间/NPC/掉落、剧情演出，不进入当前 PvE handfeel 默认参数。

> 只有需要表格、公式、伪代码、来源链接、测试用例或历史边界时，再回查下面 21 篇源文档。

### 当前实现差距优先

1. `dnf-dfo-research-vs-current-system-technical-report.md` — 当前实现 vs 研究要求的主线差距报告。
2. `code-level-dnf-replication-gap-assessment.md` — 代码级完成度、源码路径和具体缺口。
3. `dnf-dfo-mechanics-gap-analysis.md` — 短版 mechanics gap 和补充顺序。

### 战斗管线优先

1. `dnf-dfo-combat-extraction-runtime-pipeline-report.md` — PVF/ANI/NPK 到 runtime manifest 的抽取与测试结构。
2. `dnf-dfo-combat-replication-implementation-report.md` — 静态数据层、动画帧层、命中热路径、开发里程碑。
3. `dnf-dfo-combat-frame-ai-implementation-report.md` — frame/hitbox、怪物受击逻辑、AI、主角动作和网络同步。
4. `dnf-combat-replica-implementation-technical-report.md` — 可执行实现路线，尤其固定帧、输入兼容、回放和事件总线。
5. `dnf-combat-system-reconstruction-engineering-report.md` — 高层工程蓝图和完整战斗子系统地图。

### 当前 DFO 手感 P2 暂不优先

- 1v1/PvP：`dnf-dfo-combat-1v1-spec-report.md`、`1v1-combat-system-spec-compact.md`
- 评分奖励与外层系统：`combat-replication-scoring.md`
- raid/party/buff/装备耐久与强化：`combat-technical-replication.md`
- 房间/NPC/掉落/剧情控制：`combat-cleanroom-v2.md`
- 早期/历史汇总：`combat-replication-implementation-v1.md`、`combat-system-freeze-replication.md`

## 文档角色表

| Slug | Document | Summary | 标签 | 角色 | Canonical 候选 | Superseded / duplicate 风险 | 推荐用法 |
|---|---|---|---|---|---|---|---|
| `research-vs-current` | `dnf-dfo-research-vs-current-system-technical-report.md` | 主线差距报告：当前实现 vs DNF 研究要求，含 P0-P4 工程路线 | `canonical` | 当前代码差距主线 | 当前实现差距 | 与 `code-level-*` 重复 gap，但层级不同 | 首读，用于决定下一批工程工作 |
| `code-level-gap` | `code-level-dnf-replication-gap-assessment.md` | 代码级完成度评估：具体源码路径、未实现项和百分比 | `canonical` | 代码级 gap 和完成度评估 | 当前源码差距 | 与 research-vs-current 重复结论 | 查具体源码路径、完成度、未实现项 |
| `mechanics-gap` | `dnf-dfo-mechanics-gap-analysis.md` | 短版 mechanics gap：DFO handfeel 快速 baseline | `canonical` | 短版 mechanics gap | DFO handfeel 快速 baseline | 内容短，不能替代长报告 | 快速复查当前 match/gap/supplement order |
| `extraction-runtime` | `dnf-dfo-combat-extraction-runtime-pipeline-report.md` | 抽取工具链：PVF/ANI/NPK → runtime manifest 的数据表和测试结构 | `canonical` | 抽取工具链与 runtime 数据表 | PVF/ANI/NPK -> runtime pipeline | 与 replication implementation 重复资源链路 | 做 manifest/parser/test 设计时优先读 |
| `replication-impl` | `dnf-dfo-combat-replication-implementation-report.md` | 运行时实现路线：静态数据层、动画帧层、命中热路径、开发里程碑 | `canonical` | 运行时实现路线 | Runtime execution / hit resolve | 与 extraction/runtime、reconstruction 重复数据模型 | 做命中热路径、开发里程碑时优先读 |
| `frame-ai` | `dnf-dfo-combat-frame-ai-implementation-report.md` | 帧/AI 综合：hitbox、怪物受击逻辑、主角动作、逆硬直、网络同步 | `canonical` | 帧、判定、AI、主角动作 | Frame / AI implementation | 与 technical pipeline 和 replica implementation 重复 | 做 frame/hitbox/AI/pattern 时优先读 |
| `data-damage` | `dnf-dfo-combat-data-model-and-damage-report.md` | 伤害公式大全：百分比/固伤、属性差、防御、现代乘区、CSV 模板 | `canonical` | 数据模型与伤害公式 | Damage / status profile | 与 reconstruction 和 frame-ai 重复公式 | 做 damage formula、属性、状态 profile 时优先读 |
| `replica-tech` | `dnf-combat-replica-implementation-technical-report.md` | 可执行技术路线：Backstep、输入兼容、固定逻辑帧、回放事件总线 | `supporting` | 可执行技术路线 | 输入、固定帧、回放 supporting canonical | 与 reconstruction 高重复 | 读 Backstep、输入兼容、固定帧、回放事件总线 |
| `reconstruction` | `dnf-combat-system-reconstruction-engineering-report.md` | 高层工程蓝图：完整战斗子系统地图和跨系统总览 | `supporting` | 完整工程蓝图 | 高层 blueprint | 与 replica implementation、technical pipeline 高重复 | 用于跨系统总览，不直接当当前代码真值 |
| `tech-pipeline` | `dnf-dfo-combat-technical-pipeline-report.md` | 技术管线：职业样例表、事件总线、冷却资源、服务器/客户端权责 | `overlapping` | 技术管线与伪代码 | 事件总线/冷却/权责 supporting | 与 frame/data/reconstruction 重复 | 抽取职业样例表、事件总线、冷却资源章节 |
| `combat-kernel-dev` | `dnf-dfo-combat-kernel-development-report.md` | Kernel 开发视角：PVF 字符串、ANI 帧解析、ReplayCombatLog checklist | `overlapping` | Kernel 开发视角 | Parser/test checklist supporting | 与 data/frame/technical pipeline 重复 | 查 PVF 字符串、ANI 帧解析、ReplayCombatLog 等 checklist |
| `combat-tech` | `combat-replication-tech-report.md` | 资源链路与样例：JSON/CSV 字段映射、输入状态机、2.5D 伪代码 | `overlapping` | 资源链路、输入、2.5D、伤害和样例 | JSON/CSV 样例 supporting | 与 canonical 多处重复 | 迁移 JSON/CSV、输入状态机、2.5D 伪代码 |
| `impl-details` | `combat-system-implementation-details.md` | 实现细节：同 Tick 裁决、随机种子、技能槽/锁/封印、网络包示例 | `overlapping` | Tick、随机种子、技能槽、命中热路径细节 | 同 Tick / seed / lock rules supporting | 与 1v1、replay/network 重复 | 查同 Tick、随机数、技能锁、封印、网络包示例 |
| `replication-v2` | `combat-replication-implementation-v2.md` | 回放/网络/UI：replay header、事件序列化、连招补正、伤害数字 | `supporting` | UI 反馈、连招补正、Replay/network | Replay/network canonical 候选 | 与 1v1 spec、scoring 重复 | 查 replay header、事件格式、网络包、伤害数字 |
| `replication-v1` | `combat-replication-implementation-v1.md` | 早期复刻研究（历史）：服务拓扑、配置模型、包头骨架、音频优先级 | `historical` | 早期复刻实施研究 | 无 | 与 v2/tech report 重复，协议风险更高 | 仅保留服务拓扑、配置、包头骨架、音频优先级的历史参考 |
| `scoring` | `combat-replication-scoring.md` | 评分奖励系统：combo_rate、clear_time、reward eligibility、背包/转职 | `extension` | 评分、奖励、任务、背包、转职觉醒 | Scoring/reward canonical | 与 feedback 章节重复 | 当前手感线不优先；进入评分奖励时首读 |
| `1v1-spec` | `dnf-dfo-combat-1v1-spec-report.md` | 1v1/PvP 规范：速度系统、手搓奖励、Boss 阶段切换 | `extension` | 1v1/PvP、速度、手搓、Boss 房间 | PvP supporting | 与 input/network/damage 重复 | PvP 或 Boss/room 任务再读 |
| `1v1-compact` | `1v1-combat-system-spec-compact.md` | 1v1 紧凑版：权威服务器、PvE/PvP 规则隔离、网络包字段 | `extension` | 1v1 compact spec，权威服务器和规则隔离 | PvP/network supporting | 与 v2 network、damage/status 重复 | 保留 PvE/PvP profile、网络包字段，不混入 PvE 默认 |
| `cleanroom` | `combat-cleanroom-v2.md` | 外围系统：掉落拾取、房间边界、NPC/佣兵、剧情演出 | `extension` | 掉落、房间边界、NPC、剧情演出 | Peripheral systems | 与 scoring/room 重复 | 房间/NPC/掉落/剧情控制任务再读 |
| `tech-replication` | `combat-technical-replication.md` | raid/party 扩展：buffer/party buff、装备套装、耐久/强化/继承 | `extension` | raid、party sync、buffer、装备套装、耐久、强化 | Peripheral systems | 与 scoring/systems 重复 | raid/party/buff/装备外层任务再读 |
| `system-freeze` | `combat-system-freeze-replication.md` | 历史边界：成长/SP/TP、黑箱层不可还原、clean-room 路线 | `historical` | 底层状态机、成长、组队、黑箱层和 clean-room 路线 | 边界摘要 | 高层概述，细节被其他报告覆盖 | 保留可信度分层和不可还原黑箱边界 |

## 按主题快速查找

当需要查找某个具体主题时，直接匹配下面的关键词，定位 canonical 文档：

| 当你需要... | 先读... | 再参考... |
|---|---|---|
| 当前代码差距 / 下一批工程做什么 | `research-vs-current`、`code-level-gap` | `SYNTHESIS-COMBAT-KERNEL.md` |
| hitbox / 帧数据 / root motion | `frame-ai`、`replication-impl` | `SYNTHESIS-COMBAT-KERNEL.md` |
| 输入系统 / 取消窗 / Backstep | `replica-tech`、`reconstruction` | `SYNTHESIS-COMBAT-KERNEL.md` |
| 怪物 AI / 受击反应 / Boss pattern | `frame-ai`、`extraction-runtime` | `SYNTHESIS-COMBAT-KERNEL.md` |
| Replay / 固定帧 / 回放 | `replication-v2`、`replica-tech` | `SYNTHESIS-COMBAT-KERNEL.md` |
| 反馈 / 震屏 / hitstop | `SYNTHESIS-COMBAT-KERNEL.md` | `impl-details` |
| 抽取工具链 / PVF/ANI/NPK | `extraction-runtime`、`replication-impl` | `SYNTHESIS-DATA-RUNTIME-PIPELINE.md` |
| 合规边界 / clean-room | `SYNTHESIS-DATA-RUNTIME-PIPELINE.md` | `extraction-runtime` |
| PvP / 1v1 / 手搓奖励 | `1v1-spec`、`1v1-compact` | `SYNTHESIS-PERIPHERAL-SYSTEMS.md` |
| 评分 / 奖励 / 任务 | `scoring` | `SYNTHESIS-PERIPHERAL-SYSTEMS.md` |
| raid / party / buff / 装备 | `tech-replication` | `SYNTHESIS-PERIPHERAL-SYSTEMS.md` |
| 房间 / NPC / 掉落 | `cleanroom` | `SYNTHESIS-PERIPHERAL-SYSTEMS.md` |
| Berserker 校准 / 帧数据 | `berserker-action-frame-calibration.md` | `berserker-data-gap-report.md` |

## 标签含义

- `canonical`：该主题首读文档，后续合并应优先保留。
- `supporting`：有独有表格、伪代码或实现细节，应迁入 canonical 后再考虑压缩。
- `overlapping`：与 canonical 大量重复，但存在局部可保留材料。
- `historical`：保留研究脉络和风险样本，不作为当前实现口径。
- `extension`：外围系统或 PvP/多人/奖励方向，当前 DFO 动作/手感 P2 主线不优先。

## 合并前检查

1. 先读 4 篇 synthesis，确认当前主题的主文档。
2. 再查 `CHAPTER-AUDIT.md` 的主题簇，确认源文档 canonical。
3. 合并时只删重复叙述，不丢表格、公式、伪代码、流程图、来源链接和测试用例。
4. 涉及 PVF/NPK/IMG/ANI、serverfiles、协议和私服资料时，保留合规边界。
5. 当前实现差距相关结论以三件套为准：`dnf-dfo-research-vs-current-system-technical-report.md`、`code-level-dnf-replication-gap-assessment.md`、`dnf-dfo-mechanics-gap-analysis.md`；实现引用优先看 `SYNTHESIS-COMBAT-KERNEL.md`。
