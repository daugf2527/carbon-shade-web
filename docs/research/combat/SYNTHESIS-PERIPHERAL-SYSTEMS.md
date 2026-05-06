# Peripheral Combat Systems Synthesis

> **Status: [SYNTHESIS]** — PvP/评分/raid/party/buff/房间/NPC 扩展系统

## Purpose

这篇解决“哪些资料要保留，但不进入当前 DFO 动作/手感 P2 主线”的问题。它覆盖 PvP/1v1、raid/party/buff、评分奖励、房间/NPC/掉落、剧情演出和历史研究边界。

## Canonical Decisions

- PvP/1v1、raid/party/buff、房间/NPC/掉落、评分奖励是 future extension。
- 这些资料可保留字段、公式、规则和测试想法，但不应污染当前 PvE handfeel 默认参数。
- PvP profile 与 PvE profile 必须隔离：速度、硬直恢复、手搓奖励、连段保护、权威服务器和 rollback 字段只在进入 PvP 任务时启用。
- Raid/party/buff/equipment durability/growth 属于外层系统，不能反向决定当前 combat kernel 的基础命中、伤害和状态默认值。
- 历史研究可保留架构、包头、服务拓扑和风险样本，但不能覆盖 clean-room 合规边界。

## Merged Source Map

| Source | 合并章节/主题 | 保留归属 |
|---|---|---|
| `dnf-dfo-combat-1v1-spec-report.md` | `速度系统公式与帧模型`、`输入系统与手搓奖励`、`房间副本与 Boss 脚本` | PvP/1v1 extension |
| `1v1-combat-system-spec-compact.md` | `战斗循环与数值规范`、`网络同步与权威服务器`、`PvE/PvP 规则分离` | PvP/network profile extension |
| `combat-replication-scoring.md` | `战斗结算、评分与奖励权重模块`、`战斗任务、成就与条件挑战模块` | scoring/reward extension |
| `combat-cleanroom-v2.md` | `掉落、拾取与战斗内奖励物件系统`、`房间边界`、`NPC、佣兵与支援单位`、`剧情演出` | room/NPC/drop/cutscene extension |
| `combat-technical-replication.md` | `Raid 指挥`、`队伍成员状态同步`、`奶系 / Buffer / Party Buff`、`装备套装 / 流派构筑`、`耐久 / 修理`、`强化 / 增幅 / 附魔 / 继承` | raid/party/buff/equipment extension |
| `combat-system-freeze-replication.md` | `成长、SP/TP`、`组队、副本与攻坚编排`、`黑箱层`、`clean-room 复刻路线` | historical boundary |
| `combat-replication-implementation-v1.md` | `服务拓扑`、`包头布局与协议骨架`、`帧同步、锁步与带宽预算` | historical protocol sample |
| `combat-replication-implementation-v2.md` | `战斗 UI 与数值表现层`、`连招保护与补正系统`、`网络与客户端交互` | feedback/replay/network extension |
| `combat-system-implementation-details.md` | `技能槽位、快捷键、技能锁定与技能封印`、`同 Tick 裁决` | input/system rules extension |

## Preserve Details

- PvP/1v1：速度公式、硬直恢复、手搓奖励、连段保护、PvE/PvP profile 隔离、authoritative server、network packet 字段。
- Scoring/reward：combo_rate、clear_time、hit_taken、counter/back attack/overkill、reward eligibility、任务条件、背包重量、转职觉醒版本边界。
- Raid/party/buff：ping、party state sync、buffer target、party buff constraints、equipment set condition、durability/growth 字段。
- Room/NPC/drop/cutscene：掉落拾取数据结构、房间边界、摄像机锁定、支援单位、剧情控制、网络消息、资源路径示例。
- Historical：服务拓扑、包头骨架、带宽预算、可信度分层、不可还原黑箱层、clean-room 合规提醒。

## Implementation Notes

- 当前 P2 不从这些资料提默认参数；只保留 schema hooks，例如 `modeProfile: "pve" | "pvp"`、reward event、room event、party buff event。
- 如果进入 PvP，需要先做 profile isolation，再接速度/硬直/手搓/rollback，不要直接改 PvE damage/status 默认值。
- 如果进入评分奖励，只订阅 combat events，不改 hit resolve 热路径。
- 如果进入 raid/party/buff，先定义外层 buff source 和 target selection，不把 party sync 写进单机 combat kernel。
- 如果进入房间/NPC/掉落，先做 room lifecycle 和 event bridge，不让掉落/剧情逻辑反向污染技能 manifest。

## Source Backing

- `1v1-combat-system-spec-compact.md`
- `combat-cleanroom-v2.md`
- `combat-replication-implementation-v1.md`
- `combat-replication-implementation-v2.md`
- `combat-replication-scoring.md`
- `combat-system-implementation-details.md`
- `combat-system-freeze-replication.md`
- `combat-technical-replication.md`
- `dnf-dfo-combat-1v1-spec-report.md`
