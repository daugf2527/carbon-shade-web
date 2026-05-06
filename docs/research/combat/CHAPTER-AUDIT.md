# docs/research/combat 章节级去重审计

> **Status: [GOVERNANCE]** — 9 个主题簇的章节级去重和合并规则

> Scope: 仅审计 `docs/research/combat` 下 32 篇 Markdown（21 篇核心战斗研究 + 4 篇 SYNTHESIS + INDEX/CHAPTER-AUDIT + 5 篇扩展文档）。本文不删除、不重命名、不合并旧正文，只给后续资料治理与合并时的保留边界。
> 
> **Merge status (2026-05-06):** Phase 1 物理合并已执行 — 5 组 MAJOR 重复组的独有章节已以 `## Appended:` 章节追加到对应 canonical 文件。源文件原文保留，CHAPTER-AUDIT 合并规则已落地。

## 审计口径

- 粒度：文件 -> H2/H3 章节 -> 主题簇。
- 主题分类：数据模型、PVF/ANI/NPK、帧/判定、伤害、状态、AI、输入/取消、网络/Replay、反馈/评分、合规、当前代码差距。
- 处理建议：
  - `keep canonical`：保留为该主题的首读或主线事实源。
  - `merge into canonical`：内容有价值，但后续若合并应迁入 canonical。
  - `mark historical`：保留历史脉络，不作为当前实现口径。
  - `raw reference only`：只当原始/扩展资料，不参与当前 DFO 手感 P2 主线。

## 总览矩阵

| 主题簇 | Canonical 候选 | 重复来源 | 当前建议 |
|---|---|---|---|
| Synthesis reading layer | `SYNTHESIS-OVERVIEW.md`, `SYNTHESIS-DATA-RUNTIME-PIPELINE.md`, `SYNTHESIS-COMBAT-KERNEL.md`, `SYNTHESIS-PERIPHERAL-SYSTEMS.md` | 21 篇源文档 | 后续默认先读 synthesis；源文档保留为 archive/evidence，不改正文 |
| Combat data/runtime pipeline | `dnf-dfo-combat-extraction-runtime-pipeline-report.md`, `dnf-dfo-combat-replication-implementation-report.md` | `dnf-combat-system-reconstruction-engineering-report.md`, `dnf-combat-replica-implementation-technical-report.md`, `combat-replication-tech-report.md`, `combat-replication-implementation-v1.md` | 以 extraction/runtime 作为工具链 canonical，以 replication implementation 作为运行时 canonical |
| Frame timing / hitbox / root motion | `dnf-dfo-combat-frame-ai-implementation-report.md`, `dnf-dfo-combat-replication-implementation-report.md` | `dnf-dfo-combat-technical-pipeline-report.md`, `dnf-combat-system-reconstruction-engineering-report.md`, `dnf-combat-replica-implementation-technical-report.md`, `combat-replication-tech-report.md` | 保留逐帧、2.5D、root motion、样表与伪代码；重复概念迁入 canonical |
| Damage/status/armor/grab | `dnf-dfo-combat-data-model-and-damage-report.md`, `dnf-dfo-combat-replication-implementation-report.md` | `dnf-combat-system-reconstruction-engineering-report.md`, `dnf-dfo-combat-frame-ai-implementation-report.md`, `combat-system-implementation-details.md`, `1v1-combat-system-spec-compact.md` | 公式和 profile 以 data/damage 为主，命中热路径以 replication implementation 为主 |
| Input/cancel/player state | `dnf-combat-system-reconstruction-engineering-report.md`, `dnf-combat-replica-implementation-technical-report.md` | `combat-replication-tech-report.md`, `combat-system-implementation-details.md`, `dnf-dfo-combat-1v1-spec-report.md`, `dnf-dfo-combat-replication-implementation-report.md` | 当前手感线优先读状态机、输入缓存、取消窗、Backstep/手搓章节 |
| Monster AI/boss/pattern | `dnf-dfo-combat-frame-ai-implementation-report.md`, `dnf-dfo-combat-extraction-runtime-pipeline-report.md` | `dnf-combat-system-reconstruction-engineering-report.md`, `dnf-combat-replica-implementation-technical-report.md`, `dnf-dfo-combat-data-model-and-damage-report.md`, `dnf-dfo-combat-1v1-spec-report.md` | 普通怪 FSM/BT 与 boss pattern 分开治理，Boss/房间脚本作为扩展 |
| Replay/network/sync | `combat-replication-implementation-v2.md`, `dnf-combat-replica-implementation-technical-report.md` | `dnf-combat-system-reconstruction-engineering-report.md`, `combat-system-implementation-details.md`, `1v1-combat-system-spec-compact.md`, `combat-replication-implementation-v1.md` | 当前代码 replay gap 用 gap 文档，网络协议建议保留为未来 multiplayer |
| Scoring/feedback/reward | `combat-replication-scoring.md`, `dnf-dfo-combat-extraction-runtime-pipeline-report.md` | `dnf-combat-system-reconstruction-engineering-report.md`, `dnf-dfo-combat-replication-implementation-report.md`, `combat-replication-implementation-v2.md` | 评分奖励做 extension，命中反馈/震屏可迁入当前手感主线 |
| Current-code gap assessment | `dnf-dfo-research-vs-current-system-technical-report.md`, `code-level-dnf-replication-gap-assessment.md`, `dnf-dfo-mechanics-gap-analysis.md` | 其他报告的“开发落地/实现清单”章节 | 当前实现差距首读三件套，不用从长篇研究报告重新归纳 |
| Peripheral combat systems | `combat-cleanroom-v2.md`, `combat-technical-replication.md`, `combat-replication-scoring.md`, `combat-system-freeze-replication.md` | `dnf-dfo-combat-1v1-spec-report.md`, `1v1-combat-system-spec-compact.md` | 标为扩展资料，不进入当前 DFO 动作/手感 P2 主线 |

## 1. Combat Data / Runtime Pipeline

| 来源章节 | 主题分类 | 重复内容摘要 | 独有信息摘要 | 处理建议 | 细节保留要求 |
|---|---|---|---|---|---|
| `dnf-dfo-combat-extraction-runtime-pipeline-report.md`：`证据层级与资源提取`、`状态机与帧数据`、`合规边界与交付清单` | 数据模型、PVF/ANI/NPK、合规 | 与多篇报告重复说明 Script.pvf、ANI、NPK/IMG、运行时 manifest 的必要性 | 每节都按目标、所需数据、公式/伪代码、数据表、测试用例组织，最适合作为工具链落地底稿 | `keep canonical` | 保留“目标/所需数据/数据表/测试用例”结构，保留 PVF string table、ANI frame、ImagePacks2/NPK/IMG、合规不入库原始资产要求 |
| `dnf-dfo-combat-replication-implementation-report.md`：`客户端资源结构与运行时模型`、`开发落地建议` | 数据模型、PVF/ANI/NPK、当前代码差距 | 与 extraction/runtime 重复资源链路和命中处理顺序 | 独有“静态数据层 -> 动画帧层 -> 运行时执行顺序 -> 命中处理伪代码”，且强调“先做工具，再做手感” | `keep canonical` | 保留运行时执行顺序图、命中处理伪代码、版本配置从第一天存在、最小里程碑 |
| `dnf-combat-system-reconstruction-engineering-report.md`：`可直接落地的数据模型` | 数据模型、帧/判定 | 与 replication implementation 重复 2.5D 坐标、判定盒、时序样例 | 独有“战斗主数据表”“公开可核对尺寸/时序样例”，适合作为 schema 表格来源 | `merge into canonical` | 保留战斗主数据表、坐标单位、判定盒规范、公开尺寸/时序样例 |
| `dnf-combat-replica-implementation-technical-report.md`：`战斗数据模型与判定几何` | 数据模型、帧/判定 | 与 reconstruction 重复数据结构和 2.5D 算法 | 独有公开可验证几何与范围样本、固定帧/输入/回放工具章节串联 | `merge into canonical` | 保留几何样本、技能判定数据结构、2.5D 推荐算法 |
| `combat-replication-tech-report.md`：`客户端资源与数据模型`、`可导入数据样例与复刻建议` | 数据模型、PVF/ANI/NPK | 与 extraction/runtime 重复资源链路与批量抽取 | 独有 JSON/CSV 样例和资源链路字段映射，适合迁为附录 | `merge into canonical` | 保留 JSON 样例、CSV 样例、资源链路字段映射、批量抽取流水线 |
| `dnf-dfo-combat-kernel-development-report.md`：`客户端数据与判定模型`、`网络边界合规与开发交付` | 数据模型、PVF/ANI/NPK、合规、网络/Replay | 与 extraction/runtime、technical pipeline 重复 PVF/ANI/parser/checklist | 独有 Kernel 开发视角、PVF 字符串、ANI 帧解析、ReplayCombatLog 和交付 checklist | `merge into canonical` | 保留 parser checklist、PVF/ANI 字段、ReplayCombatLog、网络边界与合规交付要求 |
| `combat-replication-implementation-v1.md`：`从公开证据还原出的原版架构`、`资源、动画、特效与音频` | 数据模型、PVF/ANI/NPK、网络/Replay | 与 v2、technical report 重复原版架构和资源链路 | 独有服务拓扑、配置模型、包头骨架、音频优先级 | `mark historical` | 保留服务拓扑/包头骨架作为历史研究，不让其覆盖当前 clean-room 边界 |

## 2. Frame Timing / Hitbox / Root Motion

| 来源章节 | 主题分类 | 重复内容摘要 | 独有信息摘要 | 处理建议 | 细节保留要求 |
|---|---|---|---|---|---|
| `dnf-dfo-combat-frame-ai-implementation-report.md`：`技能判定框与帧数据`、`主角动作系统、逆硬直与空中规则` | 帧/判定、输入/取消、AI | 与 technical-pipeline、replication implementation 重复 hitbox/frame/action state | 覆盖技能判定框、伤害属性、怪物受击、主角动作、网络同步，是帧/AI综合 canonical | `keep canonical` | 保留帧数据字段、逆硬直、空中规则、术语对照和实现清单 |
| `dnf-dfo-combat-replication-implementation-report.md`：`判定框、帧数据与位移` | 帧/判定、输入/取消 | 与 frame-ai 重复坐标系、帧表、判定重叠 | 独有根位移与技能强制位移、判定重叠推荐算法 | `keep canonical` | 保留坐标单位、帧表模板、root motion、overlap 算法 |
| `dnf-dfo-combat-technical-pipeline-report.md`：`技能判定框与帧数据模型`、`伤害算法与碰撞交互` | 帧/判定、伤害、数据模型 | 与 reconstruction 和 replica implementation 重复通用判定模型 | 独有主要职业样例表、事件总线/冷却资源内核、服务器/客户端权责划分 | `merge into canonical` | 保留主要职业样例表、事件总线、冷却资源、关键伪代码 |
| `dnf-dfo-combat-kernel-development-report.md`：`客户端数据与判定模型` | 帧/判定、数据模型、测试 | 与 frame-ai、technical pipeline 重复判定模型和帧数据 | 独有从 kernel 开发落地角度组织 parser、hitbox、帧解析和 checklist | `merge into canonical` | 保留 hitbox/frame checklist、ANI frame parsing、ReplayCombatLog 验证入口 |
| `combat-replication-tech-report.md`：`2.5D 判定、碰撞、抓取与异常状态`、`技能判定与核心动作帧表` | 帧/判定、状态 | 与多个 canonical 重复 2.5D 和 hitbox | 独有三轴命名、空间投影、单段/持续/多 hitbox、2.5D 命中伪代码 | `merge into canonical` | 保留三轴命名、持续命中、多 hitbox、伪代码 |
| `dnf-combat-system-reconstruction-engineering-report.md`：`动画根位移与强制位移`、`输入到伤害的关键流程` | 帧/判定、输入/取消 | 与 replication implementation 重复 root motion 和输入到伤害流程 | 独有工程蓝图式流程和公开样例串联 | `merge into canonical` | 保留输入到伤害关键流程、取消窗口表、root motion 说明 |
| `code-level-dnf-replication-gap-assessment.md`：`三、判定系统`、`九、Sprite/Asset 系统` | 当前代码差距、帧/判定 | 与 research-vs-current 重复当前手写 hitbox 和无 NPK/ANI pipeline | 独有代码级完成度、具体文件行数和缺口列表 | `keep canonical` | 保留 `HitResolver2D5.ts`、normalized sprite sheets、无 parser/unit test 的差距证据 |

## 3. Damage / Status / Armor / Grab

| 来源章节 | 主题分类 | 重复内容摘要 | 独有信息摘要 | 处理建议 | 细节保留要求 |
|---|---|---|---|---|---|
| `dnf-dfo-combat-data-model-and-damage-report.md`：`伤害公式与属性算法`、`判定、碰撞与 2.5D 坐标`、`抓取、怪物 AI、仇恨与伤害分发` | 伤害、状态、帧/判定、AI | 与 frame-ai、replication implementation 重复公式、属性、抓取、仇恨 | 公式章节是最完整的 damage canonical，含经典版本和现代乘区规则 | `keep canonical` | 保留百分比/固伤主线、属性差、防御、现代乘区、CSV 模板 |
| `dnf-dfo-combat-replication-implementation-report.md`：`伤害、属性与受击规则` | 伤害、状态、帧/判定 | 与 data/damage 重复公式和属性 | 独有 dual profile 建模、命中判定顺序、霸体/无敌/抓取/受击反应热路径 | `keep canonical` | 保留双 Profile、命中判定顺序、armor/grab/reaction 处理顺序 |
| `dnf-dfo-combat-kernel-development-report.md`：`伤害公式与状态生命周期` | 伤害、状态、测试 | 与 data/damage 和 replication implementation 重复 damage/status 热路径 | 独有状态生命周期、kernel checklist 和交付视角 | `merge into canonical` | 保留状态生命周期、profile checklist、测试/交付清单 |
| `dnf-combat-system-reconstruction-engineering-report.md`：`伤害、属性、异常状态与判定` | 伤害、状态 | 与 data/damage 重复现代伤害桶、属性算法、异常状态 | 独有异常状态完整体系、状态生命周期与事件钩子、结算伪代码 | `merge into canonical` | 保留异常状态体系、状态生命周期、事件钩子、伤害结算伪代码 |
| `combat-system-implementation-details.md`：`技能施放、读条、打断、霸体与施法保护`、`同 Tick 裁决、随机种子与命中系统` | 状态、伤害、网络/Replay | 与 1v1 spec 和 reconstruction 重复热路径裁决 | 独有同 Tick 优先级、随机种子、命中率/回避/Miss、暴击/格挡/穿透顺序 | `merge into canonical` | 保留同 Tick 冲突伪代码、随机种子、Miss/暴击/格挡/穿透边界 |
| `1v1-combat-system-spec-compact.md`：`伤害公式的规范版`、`异常状态、净化、免疫与互斥`、`护盾、伤害吸收、伤害分摊` | 伤害、状态、网络/Replay | 与 PvE damage 文档重复公式和状态 | 独有 PvP/PvE profile 隔离、护盾/吸收/分摊、服务器权威回滚视角 | `raw reference only` | 保留 PvE/PvP 规则隔离、ResolveHit 热路径、网络包字段建议 |
| `code-level-dnf-replication-gap-assessment.md`：`二、伤害公式`、`四、状态系统`、`七、Armor 系统` | 当前代码差距、伤害、状态 | 与 research-vs-current 重复 demo 级 DamageFormula/Profile gap | 独有当前完成度、未实现状态类型、resistanceCheck 空实现、armor 类型现状 | `keep canonical` | 保留完成度表、具体类名、未实现状态类型列表 |

## 4. Input / Cancel / Player State

| 来源章节 | 主题分类 | 重复内容摘要 | 独有信息摘要 | 处理建议 | 细节保留要求 |
|---|---|---|---|---|---|
| `dnf-combat-system-reconstruction-engineering-report.md`：`角色动作、输入与取消规则` | 输入/取消、帧/判定 | 与 replica implementation 和 combat tech 重复输入缓存/取消窗 | 蓝图最完整，含玩家状态机建议表、输入归一化、取消消费伪代码、取消窗口表 | `keep canonical` | 保留状态机表、输入缓存伪代码、取消窗口建议表、输入到伤害流程 |
| `dnf-combat-replica-implementation-technical-report.md`：`角色动作、技能与伤害`、`系统工具、固定帧、输入兼容与回放` | 输入/取消、网络/Replay | 与 reconstruction 重复动作状态机、输入兼容 | 独有 Backstep Upgrade、固定逻辑帧、按键体系、事件总线/战斗报告 | `keep canonical` | 保留 Backstep Upgrade、输入兼容、固定逻辑帧、回放事件总线 |
| `combat-replication-tech-report.md`：`输入系统与连招规则` | 输入/取消 | 与 reconstruction 重复输入语法和取消窗 | 独有输入消费状态机、输入与取消伪代码 | `merge into canonical` | 保留输入语法、优先级、消费状态机、伪代码 |
| `combat-system-implementation-details.md`：`技能槽位、快捷键、技能锁定与技能封印` | 输入/取消、状态 | 与 1v1 spec 重复快捷键/命令锁 | 独有技能槽/快捷键数据模型、命令锁/封印/动作封印、UI 输入伪代码 | `merge into canonical` | 保留技能槽模型、锁定/封印规则、配置与战斗网络包示例 |
| `dnf-dfo-combat-1v1-spec-report.md`：`速度系统公式与帧模型`、`输入系统与手搓奖励` | 输入/取消、帧/判定、网络/Replay | 与 reconstruction 重复输入匹配和取消帧 | 独有手搓奖励、速度断点、PvP 硬直恢复与组合保护 | `raw reference only` | 保留手搓奖励系统、速度来源优先级、模式 profile 边界 |
| `dnf-dfo-combat-replication-implementation-report.md`：`玩家状态机与怪物 AI` | 输入/取消、AI | 与 reconstruction/replica 重复状态机和取消策略 | 独有最小可复刻状态机、取消/攻速/速度策略、PvP 连段保护借鉴 | `merge into canonical` | 保留最小状态机、速度策略、PvP 可借鉴但不混入 PvE 的边界 |
| `dnf-dfo-combat-kernel-development-report.md`：`动作输入交互与怪物AI` | 输入/取消、AI、测试 | 与 reconstruction、frame-ai 重复输入交互和 AI | 独有 kernel 开发 checklist 与输入/AI 同章串联 | `merge into canonical` | 保留输入交互 checklist、怪物 AI 开发交付项 |

## 5. Monster AI / Boss / Pattern

| 来源章节 | 主题分类 | 重复内容摘要 | 独有信息摘要 | 处理建议 | 细节保留要求 |
|---|---|---|---|---|---|
| `dnf-dfo-combat-frame-ai-implementation-report.md`：`怪物受击逻辑与 AI` | AI、帧/判定、状态 | 与 extraction runtime、replica implementation 重复怪物状态和受击反应 | AI + frame 的主线文档，适合定义普通怪/精英/Boss 最小实现 | `keep canonical` | 保留怪物受击、AI 状态、术语与实现清单 |
| `dnf-dfo-combat-extraction-runtime-pipeline-report.md`：`怪物逻辑与受击反应` | AI、PVF/ANI/NPK、帧/判定 | 与 frame-ai 重复怪物行为树和受击 | 独有按“目标/所需数据/公式伪代码/数据表/测试”组织，适合工具链抽取 | `keep canonical` | 保留行为树示意、数据表、测试用例、受击反应所需数据 |
| `dnf-combat-system-reconstruction-engineering-report.md`：`怪物 AI、多目标命中与地图交互` | AI、帧/判定 | 与 frame-ai 重复仇恨、状态机、多目标命中 | 独有地图/地形交互与 AI 决策流 | `merge into canonical` | 保留仇恨模型、怪物状态机、多目标命中、AI 决策流 |
| `dnf-combat-replica-implementation-technical-report.md`：`怪物 AI 与战斗规则` | AI、状态、帧/判定 | 与 reconstruction 重复目标选择和 AI 状态表 | 独有空中战斗、抓取、Neutralize 与规则位 | `merge into canonical` | 保留规则位、Neutralize、空中/抓取约束 |
| `dnf-dfo-combat-1v1-spec-report.md`：`房间副本与 Boss 脚本` | AI、网络/Replay | 与 cleanroom 房间章节重复房间生命周期 | 独有 Boss 阶段切换、触发器、强制转场、跨房间对象同步 | `raw reference only` | 保留 Boss phase/trigger/强制转场，但标为扩展 |
| `code-level-dnf-replication-gap-assessment.md`：`五、AI 系统` | 当前代码差距、AI | 与 research-vs-current 重复当前 AI 简化 | 独有当前 FSM 状态、5 种敌人参数、完成度 15% | `keep canonical` | 保留 `EnemyAI.ts` 现状、FSM 缺口、boss pattern 缺口 |

## 6. Replay / Network / Sync

| 来源章节 | 主题分类 | 重复内容摘要 | 独有信息摘要 | 处理建议 | 细节保留要求 |
|---|---|---|---|---|---|
| `combat-replication-implementation-v2.md`：`战斗日志、回放与调试`、`网络与客户端交互` | 网络/Replay、反馈/评分、合规 | 与 1v1 spec、replica implementation 重复 replay/network | 最完整的回放文件头、事件序列化、同步差异检测、网络包结构 | `keep canonical` | 保留 replay header、事件格式、rollback/diff 伪代码、验证流程图、网络包结构 |
| `dnf-combat-replica-implementation-technical-report.md`：`系统工具、固定帧、输入兼容与回放` | 网络/Replay、输入/取消 | 与 v2 重复固定帧和回放 | 独有 fixed simulation/render separation 与输入兼容串联 | `keep canonical` | 保留固定逻辑帧伪代码、回放系统、战斗报告、事件总线 |
| `dnf-combat-system-reconstruction-engineering-report.md`：`工程落地：固定逻辑帧、回放、评分、震屏、碰撞与事件总线` | 网络/Replay、反馈/评分 | 与 replica implementation 重复 fixed frame/replay/event bus | 独有回放流程图、评分、震屏、碰撞推挤同章整合 | `merge into canonical` | 保留回放流程图、连击评分、震屏反馈、事件总线 |
| `combat-system-implementation-details.md`：`同 Tick 裁决、随机种子与命中系统` | 网络/Replay、伤害 | 与 v2 重复可复现/回滚 | 独有同 Tick、随机种子、回滚补偿、反作弊建议 | `merge into canonical` | 保留同 Tick 优先级、随机种子、回滚补偿、反作弊边界 |
| `1v1-combat-system-spec-compact.md`：`网络同步与权威服务器`、`网络包与字段建议` | 网络/Replay、合规 | 与 v2 重复服务器权威、有限回滚 | 独有 PvP authoritative server、UDP/QUIC datagram、usercmd/replay chunk 建议 | `raw reference only` | 保留网络包字段、PvE/PvP 隔离，不作为当前单机手感主线 |
| `combat-replication-implementation-v1.md`：`包头布局与协议骨架`、`帧同步、锁步与带宽预算` | 网络/Replay、合规 | 与 v2/1v1 重复协议建议 | 独有早期协议骨架和带宽预算，但法律/真实性风险更高 | `mark historical` | 保留为风险样本，不迁入当前协议真值 |

## 7. Scoring / Feedback / Reward

| 来源章节 | 主题分类 | 重复内容摘要 | 独有信息摘要 | 处理建议 | 细节保留要求 |
|---|---|---|---|---|---|
| `combat-replication-scoring.md`：`战斗结算、评分与奖励权重模块`、`战斗任务、成就与条件挑战模块` | 反馈/评分、伤害、合规 | 与 reconstruction 和 replication implementation 重复连击评分概念 | 评分/奖励 canonical，独有版本边界、奖励资格、任务条件、背包重量、转职觉醒外层 | `keep canonical` | 保留评分数据结构、combo_rate、clear_time、hit_taken、reward eligibility、版本拐点 |
| `dnf-dfo-combat-extraction-runtime-pipeline-report.md`：`连击评分与屏幕反馈` | 反馈/评分、PVF/ANI/NPK | 与 scoring 重复连击评分/屏幕反馈 | 独有以数据表和测试用例表达的反馈落地方式 | `merge into canonical` | 保留反馈数据表、测试用例、目标/所需数据结构 |
| `dnf-combat-system-reconstruction-engineering-report.md`：`连击数与评分`、`震屏与屏幕反馈` | 反馈/评分、网络/Replay | 与 scoring 重复评分 | 独有和 fixed frame/replay/event bus 同章，适合当前手感反馈迁入 | `merge into canonical` | 保留震屏、屏幕反馈、事件总线触发点 |
| `dnf-dfo-combat-replication-implementation-report.md`：`连击评分、反馈与网络同步` | 反馈/评分、网络/Replay | 与 scoring 重复 Rank、Counter、Back Attack、Overkill | 独有最小事件集、combo 续接窗口、网络公开线索 | `merge into canonical` | 保留最小评分事件集、combo window、camera/hitstop feedback |
| `combat-replication-implementation-v2.md`：`战斗 UI 与数值表现层`、`连招保护与补正系统` | 反馈/评分、输入/取消 | 与 scoring 和 1v1 spec 重复连招保护 | 独有 damage number/status prompt model、UI 参数表、补正流程图 | `merge into canonical` | 保留 UI 参数表、伤害数字伪代码、补正状态模型、流程图 |

## 8. Current-Code Gap Assessment

| 来源章节 | 主题分类 | 重复内容摘要 | 独有信息摘要 | 处理建议 | 细节保留要求 |
|---|---|---|---|---|---|
| `dnf-dfo-research-vs-current-system-technical-report.md`：`当前系统已对齐的部分`、`系统差距总表`、`建议工程路线` | 当前代码差距、数据模型、帧/判定、伤害、状态、AI、网络/Replay | 与 code-level gap 和 mechanics gap 重复当前缺口 | 面向“研究要求 -> 当前实现 -> 缺口 -> 下一步工程批次”的主线 canonical | `keep canonical` | 保留 Input -> Replay 链路、P0-P4 路线、当前最应该先做什么、风险边界 |
| `code-level-dnf-replication-gap-assessment.md`：十个系统完成度章节 | 当前代码差距 | 与 research-vs-current 重复系统缺口 | 独有代码级文件名、行数、完成度百分比和具体未实现项 | `keep canonical` | 保留完成度表、具体源码路径、未实现类型列表、总体评估表 |
| `dnf-dfo-mechanics-gap-analysis.md`：`Current Match`、`Important Gaps`、`Suggested Supplement Order` | 当前代码差距、输入/取消、状态 | 与 research-vs-current 重复重要缺口 | 短文，适合快速复查 DFO handfeel reference baseline | `keep canonical` | 保留 Sources Checked、gap order、当前 match 摘要 |
| 各长篇报告的 `开发落地建议`、`实现清单`、`测试用例`、`结论` | 当前代码差距 | 与三件套重复“下一步做什么” | 细节可补充，但不应取代当前代码差距三件套 | `merge into canonical` | 合并时只迁移可执行测试表、参数表、伪代码，不迁移泛泛结论 |

## 9. Peripheral Combat Systems

| 来源章节 | 主题分类 | 重复内容摘要 | 独有信息摘要 | 处理建议 | 细节保留要求 |
|---|---|---|---|---|---|
| `combat-cleanroom-v2.md`：`掉落、拾取与战斗内奖励物件系统`、`房间边界`、`NPC、佣兵与支援单位`、`剧情演出` | 反馈/评分、AI、网络/Replay、合规 | 与 scoring、1v1 boss/room 重复奖励/房间/NPC | 独有掉落拾取、房间边界、摄像机锁定、支援单位、剧情控制剥夺 | `raw reference only` | 保留数据结构、关键算法、网络消息、资源路径示例、法律风险；标为扩展 |
| `combat-technical-replication.md`：`Raid 指挥`、`队伍成员状态同步`、`奶系/Buffer/Party Buff`、`装备套装`、`耐久/修理`、`强化/增幅/附魔/继承` | 网络/Replay、状态、反馈/评分 | 与 scoring 和 1v1 spec 重复 party sync/reward | 独有 raid/party/buff/equipment durability/growth 外围系统 | `raw reference only` | 保留 raid/ping/party buff 数据字段和约束，但不参与 P2 手感主线 |
| `combat-system-freeze-replication.md`：`成长、SP/TP`、`组队、副本与攻坚编排`、`黑箱层` | 数据模型、状态、合规 | 与 systems/scoring 重复成长和副本 | 独有“黑箱层不可还原”边界与 clean-room 路线摘要 | `mark historical` | 保留可信度分层、黑箱层、clean-room 路线 |
| `dnf-dfo-combat-1v1-spec-report.md`、`1v1-combat-system-spec-compact.md` | 输入/取消、网络/Replay、伤害、状态 | 与核心战斗热路径重复大量公式/输入/网络 | 独有 PvP 规则分离、手搓奖励、速度系统、权威服务器 | `raw reference only` | 保留 PvP profile、网络字段、速度/手搓参数，不混入当前 PvE 手感默认值 |

## 高重复文档抽查

| 抽查组 | 重复判断 | 独有保留点 | 建议 |
|---|---|---|---|
| reconstruction vs replica implementation | 两者都覆盖数据模型、2.5D 判定、动作输入、伤害状态、AI、固定帧、回放、反馈 | reconstruction 更像全局工程蓝图；replica implementation 更贴近可执行技术方案，含 Backstep、固定帧、输入兼容、回放/报告 | `dnf-combat-system-reconstruction-engineering-report.md` 保留蓝图角色；`dnf-combat-replica-implementation-technical-report.md` 保留实现路线角色 |
| extraction runtime vs replication implementation | 两者都谈 PVF/ANI/NPK、帧数据、伤害、AI、评分、合规 | extraction runtime 的强项是每节都有数据表/测试；replication implementation 的强项是运行时执行顺序和命中热路径 | 前者作为抽取工具链 canonical，后者作为 runtime canonical |
| current-system gap vs code-level gap | 两者都指出手写 FrameDataAction、demo DamageFormula、简化 AI、无 NPK/ANI pipeline | research-vs-current 给工程路线；code-level gap 给具体源码路径/完成度/未实现项 | 两者都保留 canonical；INDEX 中作为首读 |

## 后续合并规则

1. 合并正文前先从 `INDEX.md` 选择 synthesis 主文档，不从最长源文档开始合并。
2. 4 篇 synthesis 是后续合并目标：`SYNTHESIS-OVERVIEW.md` 收入口，`SYNTHESIS-DATA-RUNTIME-PIPELINE.md` 收数据工具链，`SYNTHESIS-COMBAT-KERNEL.md` 收当前实现主线，`SYNTHESIS-PERIPHERAL-SYSTEMS.md` 收扩展系统。
3. 表格、公式、伪代码、流程图、数据字段、来源链接、测试用例一律先迁移到 canonical，再考虑删除重复叙述。
4. 任何涉及 PVF/NPK/IMG/ANI、serverfiles、协议、私服资料的章节必须保留合规提示，不把风险样本写成真值。
5. 1v1/PvP、raid/party/buff、房间/NPC/掉落、评分奖励属于扩展资料；除非当前任务明确进入这些系统，否则不参与 DFO 动作/手感 P2 主线。
