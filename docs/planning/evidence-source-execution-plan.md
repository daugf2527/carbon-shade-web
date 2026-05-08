# 证据源对齐执行计划

> 创建日期: 2026-05-07  
> 基于: Neople API + DFO World Wiki + NamuWiki + Reddit r/DFO 交叉验证  
> 研究者: 4 组并行 agent（7 个后台任务）  
> 参考审计: `docs/research/reference/neople-api-combat-implementation-audit.md`、`docs/research/reference/official-api-wiki-whole-code-audit.md`

---

## 一、证据源三层体系

经过 7 个 agent 对 Neople API、DFO World Wiki、NamuWiki、Reddit r/DFO 的交叉验证，Combat Lab 的证据源已形成明确的三层结构。

### 第一层：API-Covered（Neople Open API 可锁）

**覆盖字段**：`consumeMp`、`coolTime`、`castingTime`、`optionValue`（逐级伤害%、hit count、范围比例、buff 修正值、异常状态参数）

**已对齐**：11 个技能 level-1 事实已写入 `src/data/official/berserkerSkillFacts.ts` 和 `src/combat/actions/FrameDataAction.ts`，由 `tests/static/official-api-alignment.test.ts` 验证。

**局限**：API 是"角色卡+物品数据库"API，不是战斗引擎 API。不暴露帧数据、hitbox、AI、伤害公式运算链。

**Endpoint 汇总**：
- Skill detail: `/df/skills/{jobId}/{skillId}` — 返回逐级 `consumeMp`、`coolTime`、`castingTime`、`optionValue`
- Skill list: `/df/skills/{jobId}?jobGrowId={jobGrowId}` — 完整技能目录
- Character status: `/df/servers/{server}/characters/{id}/status` — 实时角色属性
- Equipment: `/df/servers/{server}/characters/{id}/equip/equipment` — 装备及属性
- Item detail: `/df/items/{itemId}` — 物品属性（100% 品质）
- Job: `/df/jobs` — 职业元数据

### 第二层：Wiki-Semantic（DFO Wiki + NamuWiki 可补）

**DFO World Wiki 最强项**：
- 技能逐级伤害表（Lv1–60 完整）、MP 成本、SP 消耗、前置技能、命令输入（图标形式）
- Boss 页的 Move List（攻击名 + Super Armor 二元标志 + 阶段转换定性描述）
- `Status_Effects` 页的状态类型列表和时长/周期
- `PvP_Mechanics` 页的 Stand/Aerial/Down 状态语义和 combo 保护概念

**DFO World Wiki 最弱项**：
- `Commands` 中心页为空，命令仅在各个技能页碎片化存在
- `MonsterTemplate` 所有字段全部空白（Aggression/Aggro detection range 等）
- 大量 post-100 级 Boss 页缺失或占位
- `Damage` 页为空，`Super_Armor` 仅为概念描述
- 抓取机制无统一页面——最弱模块
- 从不文档化帧数据、hitbox 坐标、AI 行为树

**NamuWiki（意外高质量源）**：
- 伤害计算公式页（2025-12 更新）：百分比/固伤四路、完整乘区桶、元素属抗、示例怪物属性（Jin: Giant Ragol 90.756% 防御, -20 火抗）
- 状态异常页（2026-03 更新）：综合覆盖 Bleed/Poison/Shock/Burn/Freeze/Stun 等
- Boss 阶段转换和 Groggy/break gauge 机制深度超过 DFO World Wiki
- 限制：全韩文，需翻译能力

**已确认的 Wiki 版本漂移**：
- Frenzy CD: Wiki=16s vs API=10s
- RagingFury CD: Wiki=16s vs API=13s
- API 必须为主基线，Wiki 为补充

### 第三层：PVF/ANI-Required（必须 PVF/ANI/NPK 提取或视频标定）

以下 8 个模块经 7 个 agent 交叉确认，三方（API+Wiki+社区）均无法覆盖：

| 模块 | 所需数据 | 当前状态 |
|---|---|---|
| 技能帧窗口 | startup/active/recovery/cancel frame | 纯本地调参 |
| hitbox/hurtbox | 逐帧框坐标、形状、Z 轴范围 | rect/circle/sweep 近似 |
| 怪物攻击帧 | 前后摇、范围、伤害值 | EnemyBasic 仅 FSM |
| 怪物 AI | 行为树、仇恨、冷却、Boss 阶段 | 无公开数据 |
| 怪物受击硬直曲线 | 浮空保护、重力、站立/倒地保护数值 | PVP 语义仅有 |
| 取消/派生窗口 | whiff cancel、派生链帧窗口 | 本地调参 |
| 抓取/霸体判定 | 霸体帧数、抓取判定帧 | 最弱模块 |
| 怪物数值 | HP/Def/Atk/属抗/异常抗性 | 完全不可获 |

---

## 二、16 模块 × 证据源覆盖矩阵

### ✅ 可对齐（API/Wiki 有数据）

| 模块 | 最佳证据 | 可锁内容 |
|---|---|---|
| 资源消耗 (CD/MP/HP/Cube) | Neople API | 逐级 `consumeMp`、`coolTime`、`castingTime`。Cube 消耗待确认 |
| 角色属性 | API character/equipment + Wiki Status 页 | 属性名和装备数值可查。STR→攻击力转换公式不暴露 |
| 输入命令 | DFO Wiki 技能页 | 个别技能有图标命令（→→Z, ↓↑Z 等），无中心列表 |
| 倒地/起身 | API + Wiki | Quick Rebound level 1 MP/CD/invul/armor 已对齐 |
| 异常状态（时长/周期） | Wiki Status_Effects + NamuWiki | Bleed 3s/0.5s, Poison 5s/0.5s, Burn 5s/0.5s+splash, Shock 10s split |

### 🟡 部分对齐

| 模块 | 现状 |
|---|---|
| 伤害公式 | API 有逐级 `optionValue` 伤害%/hit count；Wiki 有 Lv1-60 伤害表；NamuWiki 有完整乘区桶。运算链非官方 |
| 抓取/霸体 | API special text + Wiki Super Armor 页 + Boss 页 SA 标志。帧级判定无数值 |
| 技能对象/emitter | RagingFury 10-hit 有 API 确认。对象生命周期需客户端逆向 |
| 异常状态（抗性/免疫） | 技能级 bleed 值可从 API optionValue 获取。抗性/容忍/免疫系统无结构化数值 |

### ❌ 无法对齐（必须 PVF/ANI/NPK 或视频标定）

| 模块 | 原因 |
|---|---|
| 技能帧窗口 | startup/active/recovery/cancel — 三方均无。Wiki 从不文档化帧数据 |
| hitbox/hurtbox | 当前 rect/circle/sweep/grab_attach 纯本地近似 |
| 怪物攻击/前后摇 | Wiki Boss 页仅有定性 Move List + SA 标志，无帧级时序/范围/伤害 |
| 怪物 AI | MonsterTemplate 字段全部空白。无行为树/仇恨/冷却/Boss 阶段文档 |
| 怪物受击硬直 | PvP_Mechanics 描述语义，PVE 具体数值曲线不透明 |
| 取消/派生窗口 | whiff cancel/派生链帧窗口三方均不暴露 |
| 抓取机制 | 最弱模块——无统一页面。无抓取类型/持续帧/不可抓目标规则 |
| 怪物数值 | 无结构化 HP/Def/Atk/属抗/异常抗性表 |

---

## 三、执行计划：三批次路线图

### Batch A：API 数据完整性（立即可做，无需新能力）

**目标**：将 Neople API 可锁字段扩展到全部已实现技能，消除当前 "level-1 only" 的半成品状态。

| ID | 任务 | 具体操作 | 产出 | 涉及文件 |
|---|---|---|---|---|
| A1 | 扩展 `berserkerSkillFacts.ts` | 对 Derange/Diehard/Frenzy/Backstep/QuickRebound/BloodyCross/VimAndVigor 调 API 抓 level 1–10 逐级 optionValue | 所有 11 技能均有 API-backed 事实快照 | `src/data/official/berserkerSkillFacts.ts` |
| A2 | 更新对齐测试 | 为新增 7 技能添加 level-1 事实验证 | 测试覆盖从 4 技能扩展到 11 技能 | `tests/static/official-api-alignment.test.ts` |
| A3 | 拆分数据层 | 将硬编码值拆为 `officialSkillFacts`（API-backed）+ `localFrameTuning`（本地调参）两个模块 | 数据溯源清晰，API 事实不可被本地调参污染 | `src/data/official/`、`src/combat/actions/` |
| A4 | 写入审计文档 | 将 16 模块分层结论更新到审计文档，标注 capture date 和 API version | 项目证据链文档版本化 | `docs/research/reference/official-api-wiki-whole-code-audit.md` |

**预计工时**：1–2 个会话。**风险**：低（纯数据抓取+文档更新）。

---

### Batch B：Wiki 语义校准（需要少量翻译/抓取）

**目标**：利用 DFO Wiki 和 NamuWiki 的定性/半定量数据，把当前纯本地基线升级为有外部参考的语义级实现。

| ID | 任务 | 具体操作 | 产出 | 涉及文件 |
|---|---|---|---|---|
| B1 | 状态异常 Wiki 对齐 | 用 Wiki `Status_Effects` 页和 NamuWiki 状态异常页，校准时长/周期/伤害值。补充 Freeze/Stun/Sleep/Blind 语义骨架 | 异常状态从 "demo 级" 升级为 "wiki-referenced" | `src/combat/status/StatusEffectSystem.ts`、`src/data/manifest/status.ts` |
| B2 | 伤害公式模块化 | 用 NamuWiki 乘区桶结构，将 `DamageFormula.ts` 重构为模块化乘区（STR/INT factor → 攻击力% → 增伤% → 附加伤害 → 属强附加 → 技能攻击力% → 最终伤害%）。不标"DNF fidelity" | 为未来接入真实数值留好扩展点 | `src/combat/damage/DamageFormula.ts` |
| B3 | Vim and Vigor 数据驱动 | 将 bleed 应用的 eligible-skill 列表从硬编码改为数据配置，按技能 class 标记 | 新增技能自动获得 bleed，无需逐一修改 | `src/combat/buffs/BuffLifecycleSystem.ts`、`src/data/official/` |
| B4 | Boss 模式定性库 | 从 NamuWiki 和 DFO World Wiki 抓取 3–5 个经典 Boss（Ozma/Sirocco/Prey-Isys 相关）攻击模式定性描述 | 为怪物 AI 设计提供参考素材 | `docs/research/combat/boss-pattern-reference.md` |
| B5 | 命令输入完整化 | 从 Wiki 各技能页抓取 Frenzy/Derange/Diehard 的命令输入，补全 `berserker.commands.ts` | 所有已实现技能均可通过命令输入激活 | `src/data/commands/berserker.commands.ts` |

**预计工时**：3–5 个会话。**风险**：中（NamuWiki 需韩文翻译、Wiki 数据可能有 stale 值需交叉验证）。

---

### Batch C：PVF/ANI 工具链调研（先调研后决策）

**目标**：为 8 个 ❌ 模块寻找合法、可持续的证据获取路径。

| ID | 任务 | 具体操作 | 产出 |
|---|---|---|---|
| C1 | PVF 工具链调研 | 调查 `DNF-PVF-decode-program`、`PVFTools`、`PVFEditor` 等公开工具的可获取性、支持的文件格式（.skl/.ai/.monster/.ani）、数据质量和版本范围 | `docs/research/reference/pvf-toolchain-assessment.md` |
| C2 | 视频标定方法论 | 调研 DNF 社区帧数据项目（YouTube 逐帧分析视频）方法论，评估视频标定的精度和成本 | `docs/research/combat/frame-calibration-methodology.md` |
| C3 | 决策点 | 基于 C1+C2 结果决定：① 是否投入 PVF 提取 ② 提取哪些模块（优先帧数据 vs hitbox vs AI）③ 是否接受"台服历史结构 + live 数值修正"混合方案 | 明确工具链选型和投入决策 |

**预计工时**：调研 2–3 个会话，决策后待定。**风险**：高（PVF 合法边界需确认，台服数据与 115 级版本差距需量化）。

---

## 四、优先级与依赖关系

```
Batch A （API 数据完整性）
  │  无依赖，立即可做
  │  产出：全部技能 API facts 结构化
  │
  ├──→ Batch B （Wiki 语义校准）
  │       依赖：A 完成（API 为主基线后，Wiki 补充不冲突）
  │       产出：状态异常/伤害公式/命令输入 升级为 wiki-referenced
  │
  └──→ Batch C （PVF/ANI 调研）
          依赖：无，可与 A/B 并行
          产出：C3 决策点决定 Combat Lab 的下一个重大能力边界
```

### 建议执行顺序

1. **立即启动**：Batch A（纯数据扩展，最小风险，立刻提升"API 覆盖率"指标）
2. **并行启动**：Batch C1（PVF 工具链调研，可与 A 并行，不冲突）
3. **A 完成后**：切入 Batch B1/B5（状态异常校准和命令补全，对"打怪/放技能"手感直接有提升）
4. **C 调研完成后**：做 C3 决策——如果 PVF 可行，优先提取帧数据和 hitbox；如果不可行，则所有 ❌ 模块走视频标定路线

---

## 五、当前状态总结

当前项目处于 **"可玩的 PvE 战斗骨架 + 部分技能有 API/Wiki 锚点"** 的阶段。

**已对齐**：
- 11 个技能 level-1 API 事实（CD/MP/hit count）
- Bloodlust、RagingFury、Quick Rebound、Frenzy 等有 official/wiki 对齐测试
- 异常状态有 Wiki 时长/周期锚点
- 伤害公式有 NamuWiki 乘区桶参考

**待突破**：
- 逐级 level scaling 尚未完整接入
- 帧数据/hitbox/怪物 AI 仍是纯本地基线
- PVF 工具链路径尚未调研

**最有效推进路径**：先用 Batch A 把 API 可锁数据全部锁死（低成本高收益），再用 Batch B 把 Wiki 语义补到 demo 级实现上（中成本中收益），同时用 Batch C 调研 PVF 路径来决定 ❌ 模块的最终解。
