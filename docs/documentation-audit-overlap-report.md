# 文档重复内容审计报告

**审计日期**: 2026-05-01
**审计范围**: `docs/` 目录下全部 50 个 markdown 文件
**审计方法**: 逐文件通读 + 跨文件内容对比

---

## 一、总体概况

| 目录 | 文件数 | README 收录 |
|---|---|---|
| `design/` | 5 | 5 |
| `engineering/` | 6 | 5（缺 `art-asset-pipeline-spec.md`） |
| `changelog/` | 8 | 8 |
| `planning/` | 6 | 6 |
| `research/` | 24 | 14（缺 10 个） |
| `README.md` | 1 | — |
| **合计** | **50** | **34（缺 11 个）** |

---

## 二、MAJOR 级别重复（大段内容实质性重复）

### 2.1 Research 目录 —— 最严重的重复区域

`research/` 有 24 个文件，其中约 12-13 个围绕同一套 DNF 战斗系统复刻框架反复论述：四层证据体系(A/B/C/D)、PVF/NPK/ANI 解析、2.5D AABB 碰撞、经典 vs 现代伤害公式(stat/250, elem/220, bucket 系统)、异常状态表(poison/burn/shock/bleed 的持续时间和 tick)、怪物 AI 状态机、60Hz 固定逻辑步长、输入指令缓冲和取消窗口。

| 文件 A | 文件 B | 重复内容 |
|---|---|---|
| `dnf-combat-system-reconstruction-engineering-report.md` | `dnf-combat-replica-implementation-technical-report.md` | 两份 ~620 行的报告结构几乎一致：四层证据体系、PVF/ANI 解析、6-int box、伤害公式、AABB 碰撞、状态机、AI 决策树、5 个 CSV 模板全部重复 |
| `dnf-dfo-combat-extraction-runtime-pipeline-report.md` | `dnf-dfo-combat-replication-implementation-report.md` | PVF/NPK/ANI 提取管线、伤害公式版本对照、异常状态表、怪物 AI、多目标处理规则 |
| `dnf-dfo-combat-frame-ai-implementation-report.md` | `dnf-dfo-combat-replication-implementation-report.md` | 输入指令匹配、取消窗口、2.5D 碰撞(含 AABB vs OBB)、异常状态 DoT 常量、伤害公式推导 |
| `deep-research-npk-img-art-pipeline-spec.md` | `deep-research-spk-npk-img-pvf-compatible-replication.md` | NPK header(NeoplePack_Bill)、264 字节 IMG 索引、IMG V2/V4/V5/V6 字段规格、PVF 容器结构、社区目录映射 |
| `deep-research-paper-doll-avatar-compositor.md` | `deep-research-npk-img-art-pipeline-spec.md` | 11 槽纸娃娃系统、hide mask/z-override 规则、V4/V6 调色板染色、官方 Showroom 数据(69K 物品) |
| `dnf-dfo-neutralize-ignite-defense-report.md` | `dnf-dfo-combat-core-systems-report.md` | Neutralize 计量表消耗、Ignite 倍率、Suppression/hold chain、2026 技能链(4 槽, reinput gating)、目标状态标签 |
| `dnf-dfo-research-vs-current-system-technical-report.md` | `code-level-dnf-replication-gap-assessment.md` | 同一代码库的差距评估，同样结论(15-20% 完成度，架构正确、内容填充低)，同样的子系统打分 |
| `deep-research-combat-system-freeze-replication.md` | `deep-research-spk-npk-img-pvf-compatible-replication.md` | SPK 补丁格式、NPK 打包、IMG V2/V4/V5/V6 字段、PVF 容器、NDC 2014 优化数据 |
| `dnf-dfo-combat-kernel-development-report.md` | `dnf-dfo-combat-extraction-runtime-pipeline-report.md` | 技能数据表(SkillDef/HitEmitter/StateRule)、2.5D 碰撞、伤害公式版本化、自动瞄准/Y 轴修正、怪物 AI |
| `dnf-combat-system-reconstruction-engineering-report.md` | `dnf-dfo-combat-kernel-development-report.md` | 2.5D 碰撞、SkillDef/ActionTimeline 数据模型、伤害公式版本化、怪物 AI 状态机、异常状态分类 |

### 2.2 Design 目录

| 文件 A | 文件 B | 重复内容 |
|---|---|---|
| `01-core-concept-document-v0.1.md` | `00-project-mainline-v0.1.md` | 核心愿景完全一致：DNF 式 2.5D 战斗 + AI 时代寓言的双层叙事，同样的技术栈(Phaser 3 + TS + Vite)，同样的发展原则(先做游戏再加 AI) |

### 2.3 Engineering 目录

| 文件 A | 文件 B | 重复内容 |
|---|---|---|
| `02-technical-design-document-v0.1.md` | `combat-lab-0.2-r3-final-integrated-development-spec.md` | 同一项目架构、战斗内核模块列表、技术栈、CI 管线、性能目标、工程优先级。v0.1 是草图，R3 spec(3467 行)是完整展开版，两者高度重复 |

### 2.4 Changelog 目录 —— 序列化修复的天然重复

| 文件 A | 文件 B | 重复内容 |
|---|---|---|
| `handfeel-fix4-asset-update-notes.md` | `handfeel-fix5-anchor-notes.md` | 同一套 variable crop-box 渲染方案，fix4 实现、fix5 修 anchor bug，均已被 fix6 取代 |
| `handfeel-fix5-anchor-notes.md` | `fix6-normalized-sprite-pipeline.md` | 同一个显示原点 bug 的修复，fix5 是临时方案、fix6 是最终方案 |

---

## 三、MODERATE 级别重复（显著共享主题区域）

### 3.1 跨目录

| 文件 A | 文件 B | 重复内容 |
|---|---|---|
| `planning/04-gap-and-roadmap-v0.1.md` | `planning/training-ground-r3-r4-restoration-plan.md` | 差距文档的 next-steps 把 E 段打击感物理列为优先级 #1，这正是 R3/R4 文档第六章的全部内容 |
| `planning/dfo-combat-implementation-backlog.md` | `planning/dnf-combat-systems-master-spec.md` | 前者从后者 79 个系统中挑选可执行的子系统转成 checkbox 任务，两者共享 P0-P1-P2 优先级分阶段结构 |
| `planning/dfo-combat-implementation-backlog.md` | `planning/dfo-action-handfeel-replication-plan.md` | 前者把后者的狂爆之怒、血之狂暴、血剑等特定技能验证结果转化为具体的 checkbox 任务 |
| `engineering/03-development-workflow-v0.1.md` | `engineering/combat-lab-0.2-r3-final-integrated-development-spec.md` | CI 验证管线、npm 脚本、Docker Compose、Playwright 截图验证、验收标准 |
| `engineering/combat-attack-hit-reaction-chain.md` | `engineering/combat-lab-0.2-r3-final-integrated-development-spec.md` | 链条文档本质上是 R3 spec 第 7-28 节的精简版，tick 管线、输入到伤害链、HitDecision 拒绝原因枚举完全一致 |
| `research/dnf-dfo-mechanics-gap-analysis.md` | `research/code-level-dnf-replication-gap-assessment.md` | 都在审计同一个狂战士实现(15 个手写技能、RagingFury 10 柱、Frenzy CD 缩减、Bloodlust grab) |

### 3.2 Planning 目录

| 文件 A | 文件 B | 重复内容 |
|---|---|---|
| `training-ground-r1-r2-plan.md` | `training-ground-r3-r4-restoration-plan.md` | 同一训练场倡议的连续阶段，共享架构红线(CombatKernel 不引入 Phaser)、相同验收标准、文件清单重叠 |

---

## 四、README.md 索引问题

| 问题 | 详情 |
|---|---|
| 缺少的文件 | 0 —— README 中列出的所有文件都存在 |
| 未列入 README 的文件 | **11 个文件**：`engineering/art-asset-pipeline-spec.md` + `research/` 下的 8 个 `deep-research-*` + `research/dnf-dfo-combat-1v1-spec-report.md`、`dnf-dfo-combat-core-systems-report.md`、`dnf-dfo-combat-kernel-technical-brief.md`、`dnf-dfo-neutralize-ignite-defense-report.md` |
| 分类滞后 | research/ 在 README 中只列了 14 个文件，实际有 24 个，缺失约一半 |

---

## 五、合并建议

### 5.1 Research 目录（最急需整理）

24 个文件可合并为 5-6 个：

1. **《战斗系统架构总纲》** —— 合并 `dnf-combat-system-reconstruction-engineering-report.md` + `dnf-combat-replica-implementation-technical-report.md` + `dnf-dfo-combat-kernel-development-report.md`

2. **《战斗管线实现报告》** —— 合并 `dnf-dfo-combat-extraction-runtime-pipeline-report.md` + `dnf-dfo-combat-replication-implementation-report.md` + `dnf-dfo-combat-technical-pipeline-report.md` + `dnf-dfo-combat-frame-ai-implementation-report.md`

3. **《项目差距评估》** —— 合并 `code-level-dnf-replication-gap-assessment.md` + `dnf-dfo-research-vs-current-system-technical-report.md`

4. **《美术资源格式规格》** —— 合并 `deep-research-npk-img-art-pipeline-spec.md` + `deep-research-spk-npk-img-pvf-compatible-replication.md` + `deep-research-combat-system-freeze-replication.md`

5. **《美术管线实施指南》** —— 合并 `deep-research-paper-doll-avatar-compositor.md` + `deep-research-art-system-dnf-1to1.md` + `deep-research-art-pipeline-dev-guide.md`

6. **《Neutralize/Ignite/技能链系统》** —— 合并 `dnf-dfo-neutralize-ignite-defense-report.md` + `dnf-dfo-combat-core-systems-report.md`

### 5.2 Design 目录

`00-project-mainline-v0.1.md` 和 `01-core-concept-document-v0.1.md` 核心愿景高度重叠，可合并为一个设计基线文档。

### 5.3 Engineering 目录

`02-technical-design-document-v0.1.md` 已被 R3 spec 全面覆盖，可标注为"已被取代"并从 Current 区域移到 Historical。

### 5.4 Changelog 目录

fix1 到 fix6 是递进序列，重叠是预期内的。但 fix4+fix5 均已被 fix6 取代，可在文件头部明确标注即可，无需合并。

### 5.5 README.md

需补充 11 个未收录文件，特别是 `research/` 下缺失的 10 个文件。
