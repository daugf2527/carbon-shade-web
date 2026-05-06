# Data And Runtime Pipeline Synthesis

> **Status: [SYNTHESIS]** — PVF/ANI/NPK、manifest、parser、runtime data 和测试治理综合

## Purpose

这篇解决“资料里的 PVF/ANI/NPK、manifest、runtime data、parser、测试和合规边界到底怎么收束”的问题。它是数据工具链和 runtime data migration 的首读文档。

## Canonical Decisions

- 原始 PVF/NPK/IMG/ANI 资产不入库；只保留 clean-room schema、字段解释、公开可核对样例、测试 fixtures 和合规说明。
- Runtime 真值应逐步从手写 TS 常量迁到 versioned manifest，但迁移必须兼容现有 `FrameDataAction`、status profile、AI profile 和 replay metadata。
- 抽取链路分三层治理：evidence/source metadata、normalized manifest、runtime-ready compiled data。
- 工具链优先补 parser/schema/checklist，而不是把长篇资料继续拆成更多报告。
- `dnf-dfo-combat-kernel-development-report.md` 的 PVF 字符串、ANI 帧解析、ReplayCombatLog/checklist 章节应归到本 synthesis，不再遗漏在 audit 外。

## Merged Source Map

| Source | 合并章节/主题 | 保留归属 |
|---|---|---|
| `dnf-dfo-combat-extraction-runtime-pipeline-report.md` | `证据层级与资源提取`、`状态机与帧数据`、`合规边界与交付清单` | 工具链 canonical |
| `dnf-dfo-combat-replication-implementation-report.md` | `客户端资源结构与运行时模型`、`静态数据层`、`动画帧层与贴图层`、`运行时执行顺序` | runtime execution canonical |
| `dnf-dfo-combat-kernel-development-report.md` | `客户端数据与判定模型`、`网络边界合规与开发交付` | parser/test/checklist supporting canonical |
| `dnf-dfo-combat-technical-pipeline-report.md` | `技能判定框与帧数据模型`、`状态机、事件总线与冷却资源内核` | schema、event、cooldown supporting |
| `dnf-combat-system-reconstruction-engineering-report.md` | `可直接落地的数据模型`、`战斗主数据表` | 高层 schema 表格来源 |
| `dnf-combat-replica-implementation-technical-report.md` | `战斗数据模型与判定几何`、`系统工具、固定帧、输入兼容与回放` | fixed-step/replay 工具链来源 |
| `combat-replication-tech-report.md` | `客户端资源与数据模型`、`可导入数据样例与复刻建议` | JSON/CSV 样例来源 |
| `combat-system-implementation-details.md` | `统一运行模型与数据底座`、`技能资产模型与 PVF 字段` | tick/seed/skill asset supporting |
| `combat-replication-implementation-v1.md` | `资源、动画、特效与音频`、`配置模型与关键字段` | historical architecture only |
| `dnf-dfo-combat-data-model-and-damage-report.md` | `客户端数据格式与可直接落地的数据模型`、`可交付的 CSV 模板` | damage/status schema source |

## Preserve Details

- PVF string table、ANI frame、ImagePacks2/NPK/IMG、sprite index、effect/audio mapping 的字段名和合规边界。
- `static data -> animation frame layer -> runtime execution -> hit resolve` 的执行顺序和命中处理伪代码。
- JSON/CSV 样例、FrameDataAction 字段、cooldown/resource 字段、status/damage profile 字段。
- parser checklist、manifest schema、schema version、build hash、combat schema hash、ReplayCombatLog/replay metadata。
- 测试用例：parser fixture、schema validation、manifest diff、runtime load、hit/hurt frame snapshot、replay deterministic hash。

## Implementation Notes

- 第一批落点应是 `FrameDataAction` manifest 与 schema version：保留现有 `startup/active/recovery/cancelPolicy/hitStopProfile/recoilProfile/rootMotion/costProfile/cooldownProfile/sourcePolicy` 等字段。
- `emitters` / `timeline` 可以继续作为迁移兼容别名，但最终 manifest 应明确 hit/hurt frame、active windows、root motion、cancel windows。
- Damage/Status profile 应作为 runtime data，不要继续散落在技能手写逻辑里。
- AI pattern data 应与动作数据分离：普通怪 FSM、boss pattern、reaction table 分开版本化。
- Replay schema 必须记录 build/schema/hash，避免数据迁移后无法比较旧回放。

## Source Backing

- `combat-replication-implementation-v1.md`
- `combat-replication-tech-report.md`
- `combat-system-implementation-details.md`
- `dnf-combat-replica-implementation-technical-report.md`
- `dnf-combat-system-reconstruction-engineering-report.md`
- `dnf-dfo-combat-data-model-and-damage-report.md`
- `dnf-dfo-combat-extraction-runtime-pipeline-report.md`
- `dnf-dfo-combat-kernel-development-report.md`
- `dnf-dfo-combat-replication-implementation-report.md`
- `dnf-dfo-combat-technical-pipeline-report.md`
