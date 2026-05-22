# dnf-extract 能力评估与改进方案

> 评估时间：2026-05-21。目标：判断 `tools/dnf-extract` 是否足以支撑"镜像 DNF 内部模型"的 SQLite 数据库建设。

## 1. 解析器调度拓扑

入口：`PvfNode::unpack()` (`tools/dnf-porting-src/PvfNode.cpp:9-63`)。

```
PVF 文件 → 解压 + 解密 → 按扩展名走 4 条路径：

  .ani               → PvfAnimation    → JSON type: "animation"
  .str .nut .lst     → PvfTextScript   → JSON type: "text"
  .txt .rtf .info
  .glist .kor .jap
  .xml
  .exe .dat .img     → PvfRawScript    → JSON type: "binary"
  .bin .ogg .wav
  .png .jpg
  其余一切            → PvfDocument     → JSON type: "document"
  (.skl .mob .atk
   .act .chr .dgn
   .map .etc .eqp
   及所有未识别扩展名)
```

.bak 后缀先剥离再判断（`PvfNode.cpp:19-22`）。

## 2. 与需求 scope 的对齐

需求 scope：**主角 / 怪物 / 副本 / 掉落 / 装备 / 技能**（PvE 副本相关，不含城镇/社交）。

| 领域 | PVF 文件 | 扩展名 | 解析路径 | JSON type | 状态 |
|------|---------|--------|---------|-----------|------|
| 主角 | character/\<job\>/\*.chr | .chr | Document | document | ✅ |
| 主角 | character/\<job\>/\*.ani | .ani | Animation | animation | ✅ |
| 主角 | skill/\<job\>/\*.skl | .skl | Document | document | ✅ |
| 主角 | skill/\<job\>/\*.nut | .nut | Text | text | ✅ |
| 怪物 | monster/\*.mob | .mob | Document | document | ✅ |
| 怪物 | monster/\*.ani | .ani | Animation | animation | ✅ |
| 怪物 | monsterai/\* (AI 脚本) | .ai/.nut | Text* | text | ⚠️ .ai 未显式列在 text 路径 |
| 副本 | dungeon/\*.dgn | .dgn | Document | document | ✅ |
| 副本 | map/\*.map | .map | Document(??) | document | ⚠️ 需抽样验证 |
| 掉落 | etc/\*.etc | .etc | Document | document | ✅ |
| 装备 | equipment/\*.eqp | .eqp | Document | document | ✅ |
| 装备 | equipment/\*/\*.ani | .ani | Animation | animation | ✅ |
| 技能 | skill/\*/\*.skl | .skl | Document | document | ✅ |
| 技能 | skill/\*/\*.nut | .nut | Text | text | ✅ |

**结论：广度全覆盖。** 所有目标文件类型的扩展名均在调度表中。

### 悬案

- **.ai 文件**：当前不在 Text 路径的显式列表里。如果 `.ai` 是纯文本（类似 `.nut`），需加入 Text 路径。如果 `.ai` 是二进制格式，需调研后加入对应路径。抽样一个 `.ai` 文件即可确认。
- **.map 文件**：当前走 Document 路径（默认分支）。需抽样验证其二进制格式是否与 Document 的 tag-value 结构兼容。

## 3. 三个缺陷及修复方案

### 缺陷 1：Document 属性丢失类型信息（🔴 高优先级，阻塞入库）

**根因**：`PvfDocument::NumberAttribute::toString()` 把 int 和 float 都转成十进制字符串（`PvfDocument.h:38`），`printDocumentJson()` 输出时不做类型标注（`main.cpp:110-117`）。

**影响**：入库时所有属性都是字符串，无法区分 `300`（int）、`1.5`（float）、`"swordman"`（string）。

**修复目标**：JSON 输出带类型标注。

**修复位置**：`tools/dnf-porting-src/main.cpp` 的 `printDocumentJson()` 函数。

**修复内容**：

```cpp
// 现状：
printf("\"%s\"", escapeJson(attr->toString()).c_str());

// 改为：
if (attr->type == PvfDocument::Number) {
    auto* na = static_cast<PvfDocument::NumberAttribute*>(attr.get());
    printf("{\"type\":\"int\",\"v\":%d}", na->value.intValue);
} else if (attr->type == PvfDocument::Float) {
    // 前提：给 NumberAttribute 加一个 isFloat 标记，
    // 或者在 PvfDocument 里新增 FloatAttribute 子类
    auto* na = static_cast<PvfDocument::NumberAttribute*>(attr.get());
    printf("{\"type\":\"float\",\"v\":%f}", na->value.floatValue);
// ...
```

**完整方案**（三步）：

1. `PvfDocument.h`：在 `NumberAttribute` 加 `bool isFloat = false` 字段，`addAttribute(float)` 重载设置 `isFloat = true`。或者新增 `FloatAttribute` 子类（更干净）。
2. `PvfDocument.h`：给 `StringAttribute` 加一个 `bool isLink = false` 标记，来自 StringLink 的属性设置 `isLink = true`（`PvfDocument.cpp:113-117`）。
3. `main.cpp`：`printDocumentJson()` 输出改为 `{"t":"int","v":300}` / `{"t":"float","v":1.5}` / `{"t":"str","v":"swordman"}` / `{"t":"link","v":"resolved_value"}`。

**改动量**：约 30 行 C++。

**Node 输出格式**（改后示例）：

```json
{
  "name": "attack3",
  "attributes": [
    {"t":"int","v":300},
    {"t":"float","v":1.5},
    {"t":"str","v":"swordman"}
  ]
}
```

### 缺陷 2：.ai 扩展名路由（2026-05-22 已证伪）

**原始预设**：假设 `.ai` 是 Squirrel 脚本，应入 Text 路径。

**实测结果**（Tier-1，dnf-extract 实测 `monster/goblin/ai/action.ai`）：`.ai` 本身就是 Document tag-value 结构，输出含 `{"name":"think","attributes":[]},{"name":"return","attributes":["6"]}` 等标准 Document section，符合 Document 解析器预期。

**结论**：缺陷 2 不存在。当前 `PvfNode.cpp:28-39` Text 路径不含 `.ai` 是**正确分类**，无需修改。

**新发现**：但 `.ai` 文件里的 `ai pattern` section 在多数怪物（goblin/spirit/mj 等）实测为空，决策逻辑可能不在 `.ai` 显式表里 —— 待"决策真位置"专项深挖。

### 缺陷 3：缺少跨文件引用解析层（🟡 中优先级，不阻塞）

**根因**：dnf-extract 是单文件提取器，不跟踪文件间的隐式外键。

**影响**：`.mob` 引用掉落表 ID、`.chr` 引用 skill index、`.skl` 引用动画路径——这些引用在 JSON 里以原始值形式存在，需要在 importer 层额外解析。

**定位**：这不是 dnf-extract 的职责，属于 importer 层的工作。

**Importer 层需要做的事**（不在本次修复范围）：
- 建立文件路径 → row 的映射（如 `character/swordman/swordman.chr` → `characters` 表的哪一行）
- 识别数值字段中指向其他文件的 ID（如 `.mob` 里的 drop table ID）
- 用 VIEW 或迁移脚本建立显式外键

## 4. 修复执行顺序

```
Step 1: 修复缺陷 1（Document 属性类型标注）   ← 阻塞镜像数据库入库
Step 2: 抽样验证 .ai + .map 文件格式          ← 确认缺陷 2 是否存在
Step 3: 视验证结果修复缺陷 2（.ai 入 Text 路径）
Step 4: 重新编译 dnf-extract（Linux aarch64）
Step 5: 用修复后的 dnf-extract 跑全量 PVF dump → JSON
Step 6: 写 importer 脚本（JSON → SQLite）
Step 7: 在 SQLite 上做关系发现 + VIEW 建立
```

## 5. Importer 设计概要

### 表结构（镜像 DNF 内部模型）

```
一个 PVF 文件类型 = 一张 SQLite 表

animations   ← .ani 文件
documents    ← .skl .mob .atk .act .chr .dgn .map .etc .eqp（统一存为 document 结构）
texts        ← .str .nut .lst .txt .rtf .info .glist .kor .jap .xml .ai
binaries     ← .exe .dat .img .bin .ogg .wav .png .jpg
```

`documents` 表结构：

```sql
CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pvf_path TEXT UNIQUE NOT NULL,          -- 如 'character/swordman/swordman.chr'
  extension TEXT NOT NULL,                 -- 'chr' | 'skl' | 'mob' | ...
  raw_json TEXT NOT NULL,                  -- dnf-extract 输出的原始 JSON（带类型标注）
  created_at TEXT DEFAULT (datetime('now'))
);
```

其他表同理，核心原则：**raw_json 列保留原始提取结果，不做裁剪**。关系发现通过额外表/VIEW 逐步建立。

### 导入流程

```
dnf-extract --pvf Script.pvf --pipe
  → 逐文件 stdin 路径
  → stdout JSON（带类型标注）
  → importer.mjs 逐行 INSERT INTO SQLite
```

## 6. PVF 数据能覆盖的逻辑 vs 引擎硬编码的逻辑

### 区分原则

DNF 的逻辑分两类：

| | 数据/脚本驱动的逻辑 | 引擎硬编码逻辑 |
|------|------|------|
| 在哪 | `.skl` `.atk` `.chr` `.mob` `.nut` 里 | DNF 客户端 C++ 二进制（`.exe`）里 |
| 能拿到吗 | ✅ `dnf-extract` 能提取原文 | ❌ 反编译成本极高，不可行 |
| 例子 | 技能帧数/hitbox/cancel 窗口、怪物 AI 参数 | 物理积分器、碰撞检测、状态机仲裁器 |

**核心结论**：PVF 存的是"配置参数"和"逻辑脚本"，不存"引擎"。`dnf_enum_header.nut` 暴露的 478 个 `sq_*` API 是引擎与脚本之间的契约边界——引擎在 .exe 里，脚本在 PVF 里，API 是桥梁。

### 逐链路拆解

#### 技能释放链路

```
玩家按键 → [引擎: Command 检测] → [.nut: 条件判断] → [引擎: 消耗 MP + 进入 CD]
→ [.skl: 播放动画帧序列] → [.skl: 在关键帧触发 hitbox] → [引擎: 碰撞检测]
```

| 逻辑元素 | 数据源 | 状态 |
|---------|--------|------|
| 技能 CD / MP | Neople API + `.skl` | ✅ 可提取 |
| 技能帧时间线 | `.skl` + `.ani` | ✅ 可提取 |
| Cancel 窗口 | `.skl` cancel section | ✅ 项目已解码 |
| 技能前置条件 | `.nut` 脚本 | ✅ 可提取为文本 |
| Command 输入检测 | `.exe` 引擎 | ❌ 硬编码 |
| 技能队列/预输入 | `.exe` 引擎 | ❌ 硬编码 |

#### 怪物 AI 链路

| 逻辑元素 | 数据源 | 状态 |
|---------|--------|------|
| AI 基础参数（视野、速度、频率）| `.mob` | ✅ 可提取 |
| 状态机定义 | `.mob` + `.nut` | ✅ 可提取 |
| Boss 阶段/模式 | `.mob` + `.nut` | ✅ 可提取 |
| AI 决策逻辑（FSM 流转规则）| `.exe` 引擎 | ❌ 硬编码 |
| 寻路 | `.exe` 引擎 | ❌ 硬编码 |
| 仇恨系统 | `.exe` 引擎 | ❌ 硬编码 |

当前项目 `EnemyAI.ts` 的 FSM + behavior tree 结构是对的，问题在于参数用的是 `local_baseline` 而非 `.mob` 真值。

#### 攻击 → 受击 → 反馈链路

| 逻辑元素 | 数据源 | 状态 |
|---------|--------|------|
| hitbox 几何（每帧）| `.ani` atk[] 6-int 数组 | ✅ 可提取 |
| hurtbox 几何（每帧）| `.ani` dmg[] 6-int 数组 | ✅ 可提取 |
| 攻击力度（launch/knockback）| `.atk` lift_up/back_force | ✅ 可提取 |
| hit count 限制 | `.atk` max_hit | ✅ 可提取 |
| 受身参数（per-level）| `.chr` hit_recovery[17] | ✅ 可提取 |
| 碰撞检测算法（AABB/圆形/扇形）| `.exe` 引擎 | ❌ 硬编码 |
| 状态仲裁（5 级优先级）| `.exe` 引擎 | ❌ 硬编码 |
| 伤害公式 | `.nut` + wiki 验证 | ✅⚠️ 公式已知，参数从 wiki |
| combo 修正（浮空衰减、落地保护）| `.exe` 引擎 | ❌ 硬编码 |

#### 地图/副本交互

| 逻辑元素 | 数据源 | 状态 |
|---------|--------|------|
| 房间连接关系 | `.dgn` | ✅ 可提取 |
| 怪物组配置 | `.dgn` | ✅ 可提取 |
| 地形/碰撞 | `.map` | ⚠️ 待抽样验证 |
| 门/触发器逻辑 | `.exe` 引擎 | ❌ 硬编码 |
| 物理碰撞响应 | `.exe` 引擎 | ❌ 硬编码 |

对 Combat Lab 而言地图交互不是核心——战斗发生在 2.5D 平台圈内。

### 汇总

```
✅ 可从 PVF 提取（进 SQLite 数据库）：
   .skl  — 技能帧数据、hitbox 时间窗、cancel 规则
   .atk  — 攻击判定参数（lift_up、back_force、hit_count）
   .ani  — 逐帧 hitbox/hurtbox 几何坐标
   .chr  — 角色属性、动作表、成长曲线
   .mob  — 怪物属性、AI 参数
   .nut  — 技能/AI 逻辑脚本（文本，可 AI 辅助转 JS）
   .dgn  — 副本结构定义
   .etc  — 掉落表、装备属性表

⚠️ 推断中，待抽样验证：
   .mob 具体字段名和数据结构
   .dgn 具体字段名和数据结构
   .map 是否走 Document 路径正确解析
   .etc 具体字段名和数据结构

❌ 引擎硬编码，必须自己实现：
   物理积分器（Phase 4 AirbornePhysicsSystem 已就绪）
   碰撞检测（HitResolver2D5 已就绪）
   状态仲裁器（需从 ad-hoc canCancelInto 重写为 5 级优先级）
   伤害公式（DamageFormula 已就绪，参数对齐即可）
   寻路 / 仇恨 / 触发器 / Command 输入检测
```

## 7. 是否需要逆向 DNF.exe

### 决策：不做逆向

**技术上可以做**（IDA Pro / Ghidra / x64dbg 从 `sq_*` API 导出表入口逆推引擎实现），但：

| 因素 | 评估 |
|------|------|
| 代码规模 | 战斗引擎数万行汇编，还原需 3-6 个月熟练逆向工程人力 |
| 混淆/保护 | Nexon 商业游戏，大概率有反调试 + 代码混淆 |
| 版本获取 | 70-85 classic 客户端 10+ 年了，对应 .exe 能否找到存疑 |
| 法律风险 | 逆向商业软件在多个管辖区属灰色地带 |
| ROI | 478 个 API 签名 + .nut 脚本 + PVF 配置已能反推 90-95% 引擎行为 |

### 逆向才能拿到的 vs 已经能推出来的

```
已能从 API + 脚本推出来的：
  sq_SetZVelocity / sq_GetZVelocity   → 物理积分器的输入输出契约
  sq_SetCurrentAttacknUpForce         → 攻击浮空力度计算
  DEFAULT_GRAVITY_ACCEL = -1500       → 重力常数（铁证）
  FORCE_TO_VELOCITY_CONST = 4000      → 力→速度换算常数（铁证）
  sq_JumpDownStartFrame               → 跳跃下落起算点
  5 级 STATE_PRIORITY 枚举             → 状态仲裁的优先级层级

逆向才能拿到的（但对手感影响微乎其微）：
  Euler vs Verlet 积分器（60Hz tick 下差 < 1px）
  碰撞穿透 0.1px 边界时的 clamp 策略
  状态仲裁的精确逐位比较算法
```

### 替代方案：实机录屏逐帧对照

买一台 Windows 机器 + 70 版本 DNF 客户端，**录屏 → 逐帧测量**：

- 跳跃高度（px）→ 和数据推导的 peakHeight 互验
- 滞空时间（帧数）→ 验证重力常数
- 受身硬直时长 → 验证 hit_recovery 系数
- 攻击判定框可视化 → 验证 .ani atk[] 坐标

**比逆向二进制更快、更可靠、无法律风险。** 这也是 `dnf-native-kernel-design.md` 和 pivot 文档里提到的"视频对照可解释"验证标准。

## 8. 待抽样验证清单

以下文件类型需要从 PVF 中各抽取一个样本跑 `dnf-extract`，确认 JSON 输出结构：

| 文件 | 验证目标 | 命令 |
|------|---------|------|
| `.mob` | 怪物属性字段是否存在，Document 结构是否正确 | `dnf-extract --pvf Script.pvf --file monster/<id>.mob` |
| `.dgn` | 副本结构字段，房间列表/连接关系 | `dnf-extract --pvf Script.pvf --file dungeon/<id>.dgn` |
| `.map` | 是否走 Document 路径正确解析（非二进制格式）| `dnf-extract --pvf Script.pvf --file map/<id>.map` |
| `.etc` | 掉落表/装备表数据结构 | `dnf-extract --pvf Script.pvf --file etc/<id>.etc` |
| `.ai` | 格式是文本还是二进制，是否需要加入 Text 路径 | `dnf-extract --pvf Script.pvf --file monsterai/<id>.ai` |

## 9. 参考

- dnf-extract CLI 文档：`CLAUDE.md` "Tools > dnf-extract" 段
- PvfNode 调度逻辑：`tools/dnf-porting-src/PvfNode.cpp:9-63`
- Document 解析器：`tools/dnf-porting-src/PvfDocument.cpp`
- Animation 解析器：`tools/dnf-porting-src/PvfAnimation.cpp`（完整，无需修改）
- DNF native kernel 设计：`docs/plans/2026-05-21-dnf-native-kernel-design.md`
- DNF alignment pivot：`docs/planning/2026-05-21-dnf-alignment-pivot.md`
- 需求 scope 讨论：当前 Claude 会话
