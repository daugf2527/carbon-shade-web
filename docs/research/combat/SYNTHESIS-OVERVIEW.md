# Combat Research Synthesis Overview

> **Status: [SYNTHESIS]** — 21 篇源文档收束为 4 条主线，新阅读入口

## Purpose

这篇是 `docs/research/combat` 的新总入口。现有 21 篇源文档保留为 archive/evidence；后续阅读、实现拆解和缺口讨论先读 4 篇 synthesis，再按 source map 回查源文档。

当前 DFO 动作/手感 P2 的阅读顺序：

1. `SYNTHESIS-COMBAT-KERNEL.md`：先确认当前系统主链、P2 缺口和下一批实现方向。
2. `SYNTHESIS-DATA-RUNTIME-PIPELINE.md`：再确认 PVF/ANI/NPK、manifest、parser、runtime data 和测试治理。
3. `SYNTHESIS-PERIPHERAL-SYSTEMS.md`：只在任务进入 PvP、raid、评分、房间/NPC/掉落时读取。
4. 源文档：只在需要表格、公式、伪代码、测试用例、来源链接或历史边界时回查。

不建议从 21 篇源文档随机挑最长的读；也不建议把 PvP/raid/评分默认参数混入当前 PvE handfeel 主线。

## Canonical Decisions

- 21 篇源文档正文不删、不改、不重命名，作为证据层和历史层保留。
- 主要阅读入口收束为 4 篇：overview、data/runtime pipeline、combat kernel、peripheral systems。
- 当前实现主线以 PvE 动作/手感复刻为准，不以全量 DNF 系统复刻、PvP 规则或 raid 外围系统为默认目标。
- 当前最大工程缺口是数据化/版本化，不是继续堆更多手写技能。
- 代码差距优先参考 `dnf-dfo-research-vs-current-system-technical-report.md`、`code-level-dnf-replication-gap-assessment.md`、`dnf-dfo-mechanics-gap-analysis.md`，但实现引用优先读 synthesis 的结论层。

## Merged Source Map

| Synthesis | 合并主题 | 主要来源 |
|---|---|---|
| `SYNTHESIS-DATA-RUNTIME-PIPELINE.md` | PVF/ANI/NPK、manifest、runtime data、parser/test/checklist、合规边界 | extraction/runtime、replication implementation、technical pipeline、kernel development、reconstruction、tech report、implementation v1 |
| `SYNTHESIS-COMBAT-KERNEL.md` | 帧数据、2.5D 判定、输入/取消、伤害、状态、armor/grab、AI、Replay、current-code gap | frame-ai、data/damage、replication implementation、technical route、reconstruction、code-level gap、research-vs-current、mechanics gap |
| `SYNTHESIS-PERIPHERAL-SYSTEMS.md` | PvP/1v1、评分奖励、raid/party/buff、房间/NPC/掉落、剧情演出、历史边界 | 1v1 spec、compact spec、scoring、cleanroom、deep research technical/freeze、implementation v1/v2 |

## Preserve Details

合并和实现时不能丢：

- 表格：数据模型、FrameDataAction、status/damage profile、AI pattern、PvE/PvP profile、network/replay header。
- 公式：伤害、属性、防御、硬直恢复、速度、评分权重、状态 tick。
- 伪代码：输入消费、取消窗、2.5D overlap、hit resolve、同 Tick 裁决、replay hash、parser/checklist。
- 来源链接和证据层级：公开 API、wiki、公开可核对样例、clean-room 合规边界。
- 测试用例：parser、manifest schema、hit/hurt frame、damage/status profile、AI pattern、Replay hash/schema。

## Implementation Notes

- 当前代码实现优先沿 `Input -> InputBuffer -> requestAction -> ActionEntered -> HitQuery -> HitDecision -> Damage -> Reaction -> HitStop/Recoil -> Replay` 做数据化。
- P2 优先交付不是新增十几个手写技能，而是把已验证 handfeel 迁到 versioned manifest：FrameDataAction manifest、hit/hurt frame、Damage/Status profile、AI pattern data、Replay hash/schema。
- 外围系统可先保留字段和规则，不进入当前 PvE 默认参数。

## Source Backing

- `1v1-combat-system-spec-compact.md`
- `code-level-dnf-replication-gap-assessment.md`
- `combat-cleanroom-v2.md`
- `combat-replication-implementation-v1.md`
- `combat-replication-implementation-v2.md`
- `combat-replication-scoring.md`
- `combat-replication-tech-report.md`
- `combat-system-implementation-details.md`
- `combat-system-freeze-replication.md`
- `combat-technical-replication.md`
- `dnf-combat-replica-implementation-technical-report.md`
- `dnf-combat-system-reconstruction-engineering-report.md`
- `dnf-dfo-combat-1v1-spec-report.md`
- `dnf-dfo-combat-data-model-and-damage-report.md`
- `dnf-dfo-combat-extraction-runtime-pipeline-report.md`
- `dnf-dfo-combat-frame-ai-implementation-report.md`
- `dnf-dfo-combat-kernel-development-report.md`
- `dnf-dfo-combat-replication-implementation-report.md`
- `dnf-dfo-combat-technical-pipeline-report.md`
- `dnf-dfo-mechanics-gap-analysis.md`
- `dnf-dfo-research-vs-current-system-technical-report.md`
