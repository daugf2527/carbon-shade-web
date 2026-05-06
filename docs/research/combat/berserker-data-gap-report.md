# DNF Berserker Combat Data — 最终差距报告
> **Status: [BERSERKER] — API vs wiki vs local baseline 数据差距跟踪**

> 日期: 2026-05-04
> 基于: 官方 API + DFO Wiki + Namu Wiki + DFO 补丁记录 + dcalc 源码 + PVF/NPK 提取管线设计

---

## 一、数据来源总览

| 来源 | 类型 | 获取状态 | 覆盖内容 |
|---|---|---|---|
| Neople Open API | 官方数值 | ✅ 已接入 | CD、MP、等级表、技能文字描述、部分 optionValue |
| DFO World Wiki | 社区 Wiki | ✅ 已抓取分类页 | 技能描述、等级表、部分数值 |
| Namu Wiki (韩文) | 社区 Wiki | ✅ 35 个技能提取 | KDNF 技能机制、版本变更、部分帧数备注 |
| DFO 官方补丁说明 | 官方补丁 | ✅ 已抓取 | Berserker 平衡性调整百分比、技能行为变更 |
| dnfcalc/dcalc | 开源计算器 | ✅ 已克隆 | 装备数据(SQLite)、伤害公式逻辑(Python) |
| COLG 钻石22222 | 社区数值表 | ⚠️ 截图形式 | 伤害系数、等级增长、CD 值(图片格式,需人工转录) |
| OjoDnfExtractor | NPK/IMG 提取 | 📋 管线已设计 | 逐帧时长、锚点、hitbox 挂载帧 |
| PvfPlayer + DNF-Porting | PVF/.skl 提取 | 📋 管线已设计 | 帧阶段、hitbox 几何、浮空/重力参数、攻击系数 |

---

## 二、逐技能数据完整度矩阵

### 图例
- 🟢 **VERIFIED** — 来自官方 API 或 DFO Wiki,已交叉验证
- 🔵 **COMMUNITY** — 来自社区资源(Namu Wiki/COLG/补丁),单源引用
- 🟡 **BASELINE** — 来自 tuning-baseline.md,未经验证
- 🔴 **UNKNOWN** — 无法通过公开渠道获取,需 PVF/NPK 提取或运行时分析

### 已实现的 Berserker 技能(来自 FrameDataAction.ts)

| 技能 | totalFrames | 帧阶段 | CD | MP | Hitbox | 浮空/物理 | 数据来源 |
|---|---|---|---|---|---|---|---|
| **NormalBasic1** | 20, active:5-8 | 🟡 | N/A | N/A | 🟡 w:92/d:40/h:58 | 🟡 lightStagger | baseline |
| **NormalBasic2** | 22, active:6-9 | 🟡 | N/A | N/A | 🟡 w:118/d:42 | 🟡 mediumStagger | baseline |
| **NormalBasic3** | 31, active:8-13 | 🟡 | N/A | N/A | 🟡 w:156/d:46 | 🟡 heavyStagger | baseline |
| **DashAttack** | 24, active:7-11 | 🟡 | N/A | N/A | 🟡 | 🟡 | baseline |
| **UpwardSlash** | 27, active:7-11 | 🟡 | 🟢 120t (2s) | 🟡 | 🟡 | 🔴 浮空值待验证 | CD 由 API 确认 |
| **MountainousWheel** | 45, slashes:16/18/20 | 🟡 | 🟢 240t (4s) | 🟢 17 | 🟡 w:90 shock | 🔴 | CD/MP 由 API 确认; 补丁确认 3 段下劈 |
| **RagingFury** | 53, shock:10-13, 10 pillars | 🟡 | 🟢 780t (13s) | 🟢 142 | 🟡 w:118 | 🔴 | CD/MP 由 API + 补丁确认; 补丁确认 10 hit(从 8→10) |
| **Bloodlust** | 34, grab:7-10 | 🟡 | 🟢 360t (6s) | 🟢 37 | 🟡 | 🔴 | CD/MP 由 API 确认; 补丁确认 免疫 fallback |
| **FrenzyToggle** | 1 (即时) | 🟢 | 🟢 600t (10s) | 🟢 10 | N/A | N/A | API Lv1 值已接入 |
| **Derange** | 1 (即时) | 🟢 | 🟢 300t (5s) | 🟡 | N/A | N/A | API Lv1: 技攻34%,攻速21% |
| **Diehard** | 1 (即时) | 🟡 | 🟢 600t (10s) | 🟢 40 | N/A | N/A | API Lv1: 50%HP可用,回20% |
| **BloodyCross** | 被动 | 🟢 | N/A | N/A | N/A | N/A | API Lv1: 技攻28.7%,速度5.5% |
| **QuickRebound** | 190, 最大保持180t | 🟡 | 🟢 300t (5s) | 🟢 1 | N/A | N/A | API Lv1: 180t 保持,18t 脱离装甲 |

### 尚未实现的官方技能

| 技能 | 韩文名 | 来源 | 已知信息 |
|---|---|---|---|
| **GoreCross** (고어크로스) | 🔵 Namu Wiki | 补丁: 修复高攻速时额外攻击失效 |
| **OutrageBreak** (아웃레이지브레이크) | 🔵 Namu Wiki + 补丁 | 补丁: 攻击力+18.6%,跳跃更快,可基础攻击中取消 |
| **ExtremeOverkill** (익스트림오버킬) | 🔵 Namu Wiki + 补丁 | 补丁: 终结技动画更新,血剑插地爆炸+出血柱多段 |
| **BloodSnatch** (블러드스내치) | 🔵 补丁 | 新增 Lv60 主动,抓取→跳跃旋转→砸地 |
| **Thirst** (갈증) | 🔵 Namu Wiki | 补丁: 整体延迟减少,技攻加成持续有效 |
| **BloodMemory** (블러드메모리) | 🔵 补丁 | 补丁: 对出血敌人增加独立攻击/命中/物爆 |
| **BurstFury** (버스트퓨리) | 🔵 补丁 | 补丁: 攻击力+14%,冲击波与血柱间隔减少 |
| **BloodBoom** (블러드붐) | 🔵 补丁 | 补丁: 攻击力+16.7%,可基础攻击中取消 |
| **BloodRiven** (블러드리븐) | 🔵 补丁 | 补丁: 攻击力+10.1%,可基础攻击中取消 |
| **Enrage** (新增 Lv35) | 🔵 补丁 | 新增技能: 武器砸地→浮空→双武器斩→交叉撕裂 |
| **BloodyTwister** (블러디트위스터) | 🔵 补丁 | 补丁: 攻击力+19.3% |

---

## 三、数据完成度统计

### 按"战斗行为点"统计

| 分类 | 占比 | 说明 |
|---|---|---|
| 🟢 **官方 API 已验证** | **~25-30%** | CD、MP、等级表、Frenzy/Derange/Diehard/BloodyCross Lv1 数值 |
| 🔵 **API + Wiki + 补丁已验证** | **~15-20%** | RagingFury 10 hit(补丁确认)、Bloodlust 免疫 fallback(补丁确认)、补丁调整百分比 |
| 🟡 **Baseline(未经验证)** | **~20-25%** | 所有 totalFrames、帧阶段划分、hitbox 几何、hit reaction profile |
| 🔴 **完全未知(需提取)** | **~35-40%** | 精确逐帧时长、hitbox 挂载帧、浮空力/重力修正/下落帧、Y/Z 轴判定、Boss AI |

### 按数据维度统计

| 数据维度 | 完成度 | 最高精度来源 | 剩余工作 |
|---|---|---|---|
| **技能 CD / MP / 等级** | 🟢 80-90% | Neople Open API | 仅需补全非 API 暴露的新技能 |
| **伤害系数(百分比)** | 🔵 60-70% | COLG 数值表 + dcalc 源码 | COLG 截图需人工转录到 src/data |
| **命中次数** | 🟢 85-90% | API + 补丁确认 | 已准确(MW 3hit, RF 10hit) |
| **帧阶段(startup/active/recovery)** | 🟡 10-15% | ⚠️ 无公开来源 | **需 PVF/.skl 提取或逐帧视频分析** |
| **逐帧时长(不等帧)** | 🔴 0% | ⚠️ 仅 NPK/IMG 含此数据 | **需 OjoDnfExtractor 提取** |
| **Hitbox 几何(w/d/h/offset)** | 🟡 10-15% | ⚠️ 无公开来源 | **需 PVF/.skl 提取** |
| **浮空/重力/下落曲线** | 🔴 5-10% | ⚠️ 无公开来源 | **需 PVF/.skl 提取** |
| **伤害公式(完整)** | 🔵 50-60% | DFO Wiki + dcalc 源码 | 公式结构已有,常数待从 PVF 提取 |
| **Boss AI** | 🔴 0-5% | ⚠️ 无公开来源 | 需 PVF AI 脚本提取或大量实测 |
| **动画锚点/偏移** | 🟡 20-30% | NPK/IMG 含锚点数据 | 需 OjoDnfExtractor 提取验证 |

---

## 四、优先级路线图

### P0 — 立即可做(利用已有社区数据)
1. **从 tuning-baseline 标注数据来源** — 每个 baseline 值标注为 🟡 BASELINE / 🔵 COMMUNITY / 🟢 VERIFIED
2. **补丁记录的数值交叉验证** — 现有 FrameDataAction.ts 中的值是否与补丁记录一致(如 RF 10 hit 已正确)
3. **dcalc 伤害公式审计** — 从已克隆的 `D:\tmp-dnfcalc` 后端代码中提取伤害公式结构

### P1 — 需要一次工具运行(中等投入,最高回报)
4. **运行 NPK/IMG 提取管线** — 使用 OjoDnfExtractor 提取 Berserker 技能动画的逐帧时长和锚点
   - 关键输出: 精确 totalFrames、逐帧时长、锚点验证
   - 参考: `docs/research/combat/npk-img-extraction-workflow.md`
5. **运行 PVF/.skl 提取管线** — 使用 PvfPlayer/DNF-Porting 解析 .skl 文件
   - 关键输出: 帧阶段划分、hitbox 几何、浮空/重力参数、攻击系数
   - 参考: `docs/research/combat/pvf-skl-extraction-workflow.md`

### P2 — 高投入,不确定性大
6. **Boss AI 行为树提取** — 需 PVF AI 脚本解析 + 实测记录
7. **完整伤害公式常数提取** — 从 PVF etc/damage_formula 提取防御减免曲线、属强系数等

---

## 五、无法通过公开渠道获取的数据

以下数据**即使运行 NPK/PVF 提取管线也无法完整获取**,需要 DNF 客户端运行时分析或服务端数据:

| 数据类型 | 原因 | 可能的替代方案 |
|---|---|---|
| **服务端同步逻辑** | 纯服务端执行,不在客户端文件中 | 网络包抓取(法律风险) |
| **组合保护系统** | 服务端判定 | 实测拟合曲线 |
| **精确 Boss AI 状态机** | PVF AI 脚本格式未完全逆向 | 大量实测记录 + 行为树推断 |
| **网络延迟补偿** | 服务端逻辑 | 不需要(单机原型) |
| **NPK 加密的 v6+ 文件** | 最新 DNF 版本加密 | 使用旧版本客户端资源(如果能匹配目标版本) |

---

## 六、下一步行动建议

```
本周:
1. 标注 tuning-baseline.md 中每个值的来源(API/Wiki/Baseline)
2. 运行 npm run static:test 确认当前 29 个测试通过
3. 审计 dcalc 后端的伤害公式代码

本月:
4. 安装 .NET SDK,运行 OjoDnfExtractor 提取一套 Berserker IMG 数据
5. 找一个对应版本的 PVF 文件,运行 PvfPlayer 解包
6. 写 Python 脚本将提取结果转换为 TypeScript 数据模块

下季度:
7. 根据提取数据修正 FrameDataAction.ts 中的帧数和 hitbox 参数
8. 实现剩余 11 个未实现的官方技能
9. Boss AI 实测 + 行为树建模
```

---

## 附录: 已生成的文件清单

### 社区参考数据(`docs/research/reference/community/`)
- ✅ `dfo-world-wiki-berserker-skills.md` — DFO Wiki 技能列表
- ⚠️ `namu-wiki-berserker-skills.md` — Namu Wiki 35 技能数据(已提取,待写入文件)
- ❌ `colg-berserker-numerical-tables.md` — COLG 截图(需人工转录)
- ✅ `df0-berserker-patch-history.md` — DFO 官方补丁记录
- ✅ `damage-calculator-extracts/` — dcalc 源码(克隆于 D:\tmp-dnfcalc)

### 提取管线文档(`docs/research/combat/`)
- ✅ `npk-img-extraction-workflow.md` — NPK/IMG 逐帧提取管线
- ✅ `pvf-skl-extraction-workflow.md` — PVF/.skl 技能数据提取管线
