# Combat Kernel Synthesis

> **Status: [SYNTHESIS]** — Input→Replay 主链、P2 缺口和下一批实现方向

## Purpose

这篇是后续实现最常用的综合文档，用于把帧数据、2.5D 判定、输入/取消、伤害、状态、armor/grab、AI、Replay 和 current-code gap 收束到同一条工程主线。

当前系统主线必须按这条链路理解：

`Input -> InputBuffer -> requestAction -> ActionEntered -> HitQuery -> HitDecision -> Damage -> Reaction -> HitStop/Recoil -> Replay`

## Canonical Decisions

- 当前最大缺口是数据化/版本化，不是继续堆手写技能。
- P2 优先项：FrameDataAction manifest、hit/hurt frame、Damage/Status profile、AI pattern data、Replay hash/schema。
- 2.5D 判定已具备雏形，应向 manifest shape data 和 hit/hurt frame snapshot 迁移，而不是重写判定核。
- DamageFormula 仍是 demo 级，不能把已有 Berserker 竖切误写成完整 DFO damage system。
- 状态系统已走 profile-driven 入口，但 resistance、immunity、mutual exclusion、PvE/PvP profile 仍需数据层表达。
- Armor/grab 应保留命中热路径顺序：invulnerable/armor/grab intent/grab immune/reaction/hit stop/recoil。
- Replay 要作为回归真值：每帧输入、关键事件、state hash、schema hash 必须跟数据版本绑定。

## Merged Source Map

| Source | 合并章节/主题 | 保留归属 |
|---|---|---|
| `dnf-dfo-research-vs-current-system-technical-report.md` | `当前系统已对齐的部分`、`系统差距总表`、`建议工程路线` | 当前实现差距 canonical |
| `code-level-dnf-replication-gap-assessment.md` | 动作/技能、伤害、判定、状态、AI、Armor、Replay、Sprite/Asset 完成度 | 代码级 gap canonical |
| `dnf-dfo-mechanics-gap-analysis.md` | `Current Match`、`Important Gaps`、`Suggested Supplement Order` | handfeel 快速 baseline |
| `dnf-dfo-combat-frame-ai-implementation-report.md` | `技能判定框与帧数据`、`怪物受击逻辑与 AI`、`主角动作系统、逆硬直与空中规则` | frame/AI canonical |
| `dnf-dfo-combat-data-model-and-damage-report.md` | `伤害公式与属性算法`、`主角与怪物状态机`、`抓取、怪物 AI、仇恨与伤害分发` | damage/status canonical |
| `dnf-dfo-combat-replication-implementation-report.md` | `判定框、帧数据与位移`、`伤害、属性与受击规则`、`玩家状态机与怪物 AI` | runtime hot path canonical |
| `dnf-dfo-combat-kernel-development-report.md` | `客户端数据与判定模型`、`伤害公式与状态生命周期`、`动作输入交互与怪物AI` | kernel checklist supporting |
| `dnf-combat-replica-implementation-technical-report.md` | `角色动作、技能与伤害`、`系统工具、固定帧、输入兼容与回放` | fixed frame/input/replay supporting |
| `dnf-combat-system-reconstruction-engineering-report.md` | `角色动作、输入与取消规则`、`输入到伤害的关键流程`、`工程落地` | blueprint supporting |
| `dnf-dfo-combat-technical-pipeline-report.md` | `技能判定框与帧数据模型`、`伤害算法与碰撞交互`、`状态机、事件总线与冷却资源内核` | schema/event/cooldown supporting |
| `combat-replication-tech-report.md` | `输入系统与连招规则`、`2.5D 判定、碰撞、抓取与异常状态` | 2.5D/input 伪代码来源 |
| `combat-system-implementation-details.md` | `技能施放、读条、打断、霸体与施法保护`、`同 Tick 裁决、随机种子与命中系统` | tick/priority/randomness supporting |
| `combat-replication-implementation-v2.md` | `战斗日志、回放与调试`、`连招保护与补正系统` | replay/network/debug supporting |

## Preserve Details

- Frame/hitbox/root motion：帧表模板、active window、hit/hurt frame、2.5D 坐标、rect/circle shape、facing mirror、root motion。
- Input/cancel：输入缓存、命令匹配、Backstep、手搓可参考边界、取消窗、消费顺序。
- Damage/status：百分比/固伤、防御、属性差、现代乘区、status lifecycle、DOT tick、immunity/resistance/mutual exclusion。
- Armor/grab：霸体、无敌、抓取意图、grab immune fallback、reaction policy、hit stop、recoil。
- AI：普通怪 FSM、受击反应、仇恨、boss pattern data、pattern trigger。
- Replay：fixed-step、event bus、event serialization、state hash、final state hash、schema hash、rollback/diff 伪代码。
- Gap evidence：当前源码路径、完成度、未实现项、无 PVF/ANI/NPK parser、normalized fixed-cell sprite 限制。

## Implementation Notes

- P2 的第一条实现线应把已验证动作数据迁出手写 TS：FrameDataAction manifest + schema validation + runtime adapter。
- HitResolver2D5 不应被重写；先增加 manifest shape/source metadata、hit/hurt frame snapshots 和 replay regression。
- Damage/Status profile 应数据化，并把 `sourceKind`、reaction policy、DOT tick、status immunity/resistance 放入 schema。
- AI pattern data 不要混进技能动作表；用独立 pattern manifest 描述 trigger、cooldown、range、reaction。
- Replay hash/schema 是数据化迁移的护栏：manifest 变更后，回放 hash/schema 能解释差异。
- 继续做 DFO handfeel 时，优先用 source-backed frame/profile 数据驱动现有链路，不用把 PvP、raid、评分奖励默认并入 PvE。

## Source Backing

- `code-level-dnf-replication-gap-assessment.md`
- `combat-replication-implementation-v2.md`
- `combat-replication-tech-report.md`
- `combat-system-implementation-details.md`
- `dnf-combat-replica-implementation-technical-report.md`
- `dnf-combat-system-reconstruction-engineering-report.md`
- `dnf-dfo-combat-data-model-and-damage-report.md`
- `dnf-dfo-combat-frame-ai-implementation-report.md`
- `dnf-dfo-combat-kernel-development-report.md`
- `dnf-dfo-combat-replication-implementation-report.md`
- `dnf-dfo-combat-technical-pipeline-report.md`
- `dnf-dfo-mechanics-gap-analysis.md`
- `dnf-dfo-research-vs-current-system-technical-report.md`
