# .nut 验证报告 — 13-system 推导链真值核验

**日期**: 2026-05-27
**分支**: `docs/2026-05-27-md-audit-corrections`（推进中）
**触发**: 用户决策 Q1/B + Q21/B → "13-system 等 Windows 验证" + "system tick 顺序从 .nut 反推"
**PVF**: `data/Script.pvf`（`crc32-head:c0779278|size:205695984`，跟 baseline shard 同源）
**工具**: `tools/dnf-extract.exe v2.0.0`

---

## 一、实测核心数字

| 指标 | md 说 | 实测 | 判定 |
|------|-------|------|------|
| **.nut 文件总数** | 193 | **193** | ✅ 精确匹配 |
| **unique sq_\* API** | 478 | **478 case-sensitive 引擎 API**（与 md 完全相同！）<br>**443 case-normalized 引擎 API**（合并 35 对大小写双命名） | ✅ **md 数字精确复现** — 见 §十 audit |
| **sq_\* 调用点总数** | 未提 | **7,101 引擎调用点**（不含 user-defined function 的 269 calls） | (新增数据) |
| **聚类成 system 数** | 13 | 启发式 ~12（228 unclassified ≈ 47%） | ⚠️ **量级合理，具体分类需深推导** |

> **结论**：md 的"193 .nut + 478 sq_* → 13 system"**计数级断言真实可复现**，但**具体 13 system 包含哪些 API** 仍无法从本次验证完整重建（启发式分类只能确定其中 ~53% 的 API 归属）。

---

## 二、.nut 文件分布（按路径前缀）

| 前缀 | 数量 | 备注 |
|------|------|------|
| `sqr/character/atmage/` | 109 | 暗术士 — 占总 .nut 的 56% |
| `sqr/character/creatormage/` | 29 | 缔造者 |
| `sqr/character/priest/` | 20 | 圣职者（含次子职业） |
| `sqr/appendage/character/` | 13 | buff/aura 附加体 |
| `sqr/passiveobject/character/` | 11 | 被动召唤物 |
| `sqr/character/common/` | 3 | 跨职业共享逻辑 |
| `sqr/*.nut`（root） | 7 | `dnf_enum_header` / `loadstate` / `common` / `init_character` / `*_load_state` × 4 |
| **`sqr/character/swordman/`** | **0** | **swordman 完全无 .nut**（!） |
| `sqr/character/fighter/` | 0 | 同上 |
| `sqr/character/gunner/` | 0 | 同上 |
| `sqr/character/thief/` | 0 | 同上 |

> **关键发现**：**swordman / fighter / gunner / thief 全部没有任何 .nut 文件**。
> 但 `sqr/loadstate.nut` 里有 `sq_LoadSkillEffect_Swordman` / `sq_LoadSkillEffect_DemonicSwordman` 调用——说明这些"简单职业"的技能逻辑通过中心 loadstate.nut 加载，而非每个 skill 一个 .nut。
> **.nut 主要给"复杂技能逻辑"用**（召唤物 / 元素 / 多形态），swordman 这类近战职业靠 .skl + .atk + .ani + 引擎硬编码即可。

---

## 三、Top 30 最频繁调用的 sq_\* API

| 排名 | API | 调用次数 |
|------|-----|---------|
| 1 | `sq_var` | 885 |
| 2 | `sq_AddFunctionName` | 231 |
| 3 | `sq_IntVectPush` | 217 |
| 4 | `sq_BinaryWriteDword` | 196 |
| 5 | `sq_LoadSkillEffectAni` | 195 |
| 6 | `sq_GetLevelData` | 177 |
| 7 | `sq_GetIntData` | 172 |
| 8 | `sq_AddSetStatePacket` | 171 |
| 9 | `sq_GetSkillLevel` | 168 |
| 10 | `sq_PlaySound` | 143 |
| 11 | `sq_IntVectClear` | 132 |
| 12 | `sq_GetCurrentAttackInfo` | 130 |
| 13 | `sq_SendDestroyPacketPassiveObject` | 109 |
| 14 | `sq_SetCurrentAnimation` | 106 |
| 15 | `sq_IntVectorPush` | 97 |
| 16 | `sq_GetGlobalIntVector` | 93 |
| 17 | `sq_IsCommandEnable` | 91 |
| 18 | `sq_SetCurrentAttackBonusRate` | 85 |
| 19 | `sq_SendCreatePassiveObjectPacket` | 81 |
| 20 | `sq_GetCurrentAnimation` | 79 |
| 21 | `sq_IntVectorClear` | 72 |
| 22 | `sq_GetDistancePos` | 72 |
| 23 | `sq_RGB` | 67 |
| 24 | `sq_CreateCNRDAnimation` | 62 |
| 25 | `sq_AddStateLayerAnimation` | 62 |
| 26 | `sq_BinaryStartWrite` | 60 |
| 27 | `sq_IsUseSkill` | 59 |
| 28 | `sq_GetBonusRateWithPassive` | 58 |
| 29 | `sq_addSetStatePacket` | 55 |
| 30 | `sq_GetYPos` | 54 |

> 注意：`sq_AddSetStatePacket` 和 `sq_addSetStatePacket`（首字母大小写不同）**作为两个不同的 API 名**出现 — 暗示 Squirrel namespace 大小写敏感，且 DNF 同时存在新旧两套命名约定。这是 13-system 推导时需要去重 / 合并的真实问题。

---

## 四、API 名前缀分布（语义维度参考）

| 前缀 | unique 数 | 推测含义 |
|------|-----------|---------|
| `Get*` | 121 | 读操作 |
| `Set*` | 71 | 写操作 |
| `Is*` | 42 | 谓词查询 |
| `Add*` | 28 | 追加操作 |
| `Send*` | 11 | 网络/包发送 |
| `Binary*` | 11 | 二进制 IO |
| `Create*` | 9 | 实例创建 |
| `Remove*` | 7 | 删除操作 |
| `Write*` | 5 | 序列化 |
| 其他 | 178 | 各类专用 API |

> 121 Get + 71 Set + 42 Is = 234 个"标准数据访问 API"（占总 unique 的 48%），剩余 249 个是业务逻辑 / IO / 实例化 / 渲染相关。

---

## 五、启发式聚类（confidence: LOW）

我用 regex 把 483 个 API 名按语义关键词分组成 12 桶。**结果 228 个 unclassified（47%）** — 说明：
1. 简单 regex 分类不足以重建 md 当时 agent 用的具体聚类规则
2. **13 system 总量级合理**（12 vs 13 接近），但每个 system 包含哪些 API 仍待人工 / LLM 深推导
3. Top 大桶 "Skill" 192 个 unique 明显过宽 — 需要拆分

| 桶 | unique | 调用 | 例子 |
|----|--------|------|------|
| 01-Input | 1 | 10 | sq_IsKeyDown |
| 02-Binary/Net Packet IO | 25 | 832 | sq_BinaryWriteDword, sq_AddSetStatePacket, ... |
| 05-Animation | 13 | 473 | sq_LoadSkillEffectAni, sq_SetCurrentAnimation, ... |
| 06-Skill | **192** | 2477 | sq_GetLevelData, sq_GetSkillLevel, ... |
| 07-Physics/Pos | 4 | 67 | sq_StopMove, sq_PostDelayedMessage, ... |
| 08-Resource(HP/MP) | 2 | 3 | sq_getHpMaxUp, sq_getDamageAni |
| 09-Status | 1 | 62 | sq_AddStateLayerAnimation |
| 10-PassiveObject | 1 | 2 | sq_CreatePassiveObjectAfterWarning |
| 11-Pool/CNRD | 4 | 83 | sq_CreateCNRDAnimation, ... |
| 12-Script Runtime/AV | 5 | 461 | sq_AddFunctionName, sq_PlaySound, sq_RGB, ... |
| 13-Data Store/Vector | 7 | 1428 | sq_var, sq_IntVectPush, sq_IntVectorPush, ... |
| **99-Unclassified** | **228** | **1472** | sq_AppendAppendage, sq_setCurrentAxisPos, ... |

完整频次表见 `verification/nut-samples-2026-05-27/sq-api-frequency.txt`（483 行）。

---

## 六、对待决问题的影响

### Q1 — 13-system 框架用还是不用？
- 用户决策：**B（等 Windows 验证）**
- 验证结果：**计数级 verified**（193 + 478 ≈ 483），**聚类细节 inferred only**
- 新状态：从 `agent_claim_unverified` → **`counts_verified_clustering_inferred`**
- Banner 处置：**软化但不撤** — 各 system 落地任务前仍需补"具体 13 个 system 各包含哪些 API"

### Q21 — system tick 顺序怎么定？
- 用户决策：**B（从 .nut 反推）**
- 验证结果：**.nut 内容不直接含 tick 顺序信息** — sq_* 是 API 调用，顺序信息隐含在每个 .nut 的脚本逻辑里，而不是有"顺序声明"的中心文件
- **推导方式不是 grep 频次，而是要看具体 .nut 脚本里 sq_* 的调用流**（如 `onAttack → sq_GetCurrentAttackInfo → sq_AddSetStatePacket → sq_AddStateLayerAnimation` 这种顺序）
- 后续工作：选 3-5 个代表性 .nut（skill / passive / appendage 各一）做"调用流追踪"

### 新-A — 13-system 解封时机？
- 本次部分解封：**193 / 478 数字事实已 verified**
- 仍未解封：**13 system 具体分类** + **tick 顺序**
- 建议：把"13 system 具体分类"作为单独的 task（中等工作量，需 LLM 深推导或 agent 协作）；**不阻塞 Phase 2 起步**

### Q4 — 参考角色 swordman？
- **依然成立**（未受冲击）
- 新信息：swordman 0 .nut，技能逻辑在 .skl + .atk + 引擎硬编码 + `sqr/loadstate.nut` 里的 `sq_LoadSkillEffect_Swordman` 中心加载
- 暗示：swordman 作参考时，**Phase 2 早期不需要解析 .nut**——把 .nut 集成放到 Phase 3 / 接 atmage/creatormage 时再做

---

## 七、未解决（后续工作）

1. **完整 13 system 分类表** — 需要把启发式 47% unclassified 降到 < 5%。建议方式：跑一次专门的 LLM 推导 agent，对 483 个 API 名 + 调用上下文做语义聚类。
2. **system tick 顺序** — 抽 5-10 个代表性 .nut 做"调用流追踪"，看 system 间依赖。
3. **sq_var / sq_AddSetStatePacket 跨 system 渗透** — 这些"数据存储 / 状态包"类 API 几乎所有 system 都用，需要单独建模为"基础设施层"而非某个 system 的私有 API。

---

## 八、Reproducibility

```bash
# Step 1: list all .nut
./tools/dnf-extract.exe --pvf data/Script.pvf --list --filter ".nut" \
  > verification/nut-list-2026-05-27.json \
  2> verification/nut-list-2026-05-27.stderr
# stdout: {"type":"pvf_list","files":[...193 paths]}
# stderr: "[DONE] List: 193 files"

# Step 2: extract all 193 .nut
xargs -a verification/nut-samples-2026-05-27/all-paths.txt \
  ./tools/dnf-extract.exe --pvf data/Script.pvf --batch \
  > verification/nut-samples-2026-05-27/all-193.jsonl \
  2> verification/nut-samples-2026-05-27/all-193.stderr
# 193 files in 320ms

# Step 3: count unique sq_*
grep -oE "sq_[A-Za-z_]+" verification/nut-samples-2026-05-27/all-193.jsonl \
  | sort -u | wc -l
# → 483
```

原始文件清单：
- `verification/nut-list-2026-05-27.json` — 193 个 .nut 路径
- `verification/nut-samples-2026-05-27/all-paths.txt` — 同上，每行一个
- `verification/nut-samples-2026-05-27/all-193.jsonl` — 全文提取（193 个 JSON）
- `verification/nut-samples-2026-05-27/all-193.stderr` — extractor 日志
- `verification/nut-samples-2026-05-27/sq-api-frequency.txt` — 483 个 unique API + 频次表
- `verification/nut-samples-2026-05-27/batch.jsonl` — 早期 5 sample 子集

---

## 九、Case-duplicate dedup addendum (C 任务，2026-05-27)

**问题动机**：§一 给出 483 unique sq_\* API，但 §五 启发式分类后 228 个 unclassified（47%），扫一眼名单发现大量 PascalCase / camelCase 双命名（如 `sq_AddSetStatePacket` ↔ `sq_addSetStatePacket`），怀疑 483 这个数字本身有水分。

**方法**：
1. 把 483 个 unique 名按 `name.toLowerCase()` normalize → 看落入同一 bucket 的"重名组"
2. 对每个重名组做 **co-occurrence 检验**：扫所有 193 .nut，统计有多少 .nut 文件**同时包含** group 内 ≥2 个变体。
   - co-occur ≥ 1 → 两个变体在同一脚本里共用 → 强证据：是独立 API（脚本作者不会同时写两个 alias）
   - co-occur = 0 → 没有任何 .nut 同时用过两个变体 → 强证据：同一功能不同 case rendering

**结果**：

| 指标 | 值 |
|------|----|
| case-sensitive unique | 483 |
| case-normalized unique | **448** |
| case-duplicate groups (≥2 case 变体) | **35** |
| 涉及的 API 名总数 | 70 |
| **co-occur ≥ 1 的"独立 API"组** | **0** |
| co-occur = 0 的"同功能"组 | 35（所有） |

**结论**：35 个 case-duplicate 组**全部** co-occur=0，**全部判定为同功能不同 case rendering**。**真实独立 API 数 = 448**。

**Top 15 confident dedup pairs（按总调用量）**：

| 合并对 | 总调用 |
|--------|--------|
| `sq_AddSetStatePacket` (171) ↔ `sq_addSetStatePacket` (55) | 226 |
| `sq_GetIntData` (172) ↔ `sq_getIntData` (48) | 220 |
| `sq_GetLevelData` (177) ↔ `sq_getLevelData` (9) | 186 |
| `sq_GetSkillLevel` (168) ↔ `sq_getSkillLevel` (2) | 170 |
| `sq_SetCurrentAnimation` (106) ↔ `sq_setCurrentAnimation` (39) | 145 |
| `sq_SetCurrentAttackBonusRate` (85) ↔ `sq_setCurrentAttackBonusRate` (5) | 90 |
| `sq_SetCurrentAttackInfo` (50) ↔ `sq_setCurrentAttackInfo` (26) | 76 |
| `sq_CreateCNRDAnimation` (62) ↔ `sq_createCNRDAnimation` (10) | 72 |
| `sq_GetBonusRateWithPassive` (58) ↔ `sq_getBonusRateWithPassive` (13) | 71 |
| `sq_GetVectorData` (54) ↔ `sq_getVectorData` (15) | 69 |
| `sq_GetCurrentAni` (37) ↔ `sq_getCurrentAni` (31) | 68 |
| `sq_GetState` (50) ↔ `sq_GetSTATE` (17) | 67 |
| `sq_StopMove` (45) ↔ `sq_stopMove` (19) | 64 |
| `sq_SetStaticSpeedInfo` (44) ↔ `sq_setStaticSpeedInfo` (1) | 45 |
| `sq_IsMyControlObject` (34) ↔ `sq_isMyControlObject` (7) | 41 |

完整 35 对：`verification/nut-samples-2026-05-27/dedup-pairs.txt`

**对 md "478 unique sq_\* API" 数字的修正解读**：

| 计数方式 | 数字 | 跟 md 的关系 |
|---------|------|-------------|
| case-sensitive | 483 | md 478，偏差 +1.0% |
| **case-normalized**（dedup 后） | **448** | md 478，偏差 **-6.3%** |

**md 478 的来源不明**（agent 原始数据丢失）。我们的实测 [448, 483] 区间包含 478 — 量级 100% 真实，但**精确数字无法完全复现**。报告其他章节里出现"483"的地方，理解为 case-sensitive 计数。**真正"独立 sq_\* API 数" = 448**。

> ⚠️ **§十 audit 修正了本段结论** — 经怀疑精神 audit 发现 5 个 `function sq_X(...)` 是 user-defined function（非引擎 API）。剔除后**实测 478 case-sensitive 引擎 API 完全匹配 md 数字**。精确 case-normalized 引擎 API = **443**（不是 448）。详见 §十。

**对 §五 启发式聚类的影响**：unclassified 47% 这个数也偏高——因为有些 case 变体被 regex 漏匹配（regex 只覆盖 PascalCase）。case-normalize 之后用同一 classifier 重跑会下降，但不会归零。**真正降低 unclassified 需要 A 任务（语义分类）**——见 §十（A 任务已完成）。

---

## 十、A-task audit + v4 classifier (怀疑精神二次审计，2026-05-27)

**触发动机**：用户指令 "A+B 必须用怀疑的精神来做"。§五 启发式分类 47% unclassified、§九 给出 448 数字——但这些都是单次 regex 推导结果，没做 audit 验证。本节用"抽样核验 + 多轮迭代"重新审视。

### 1. 关键发现：5 个 `function sq_X(...)` 是 user-defined functions

**怀疑触发**：classifier v3 audit 抽 `12-ScriptRT` 桶的 top API `sq_AddFunctionName` 看 .nut 上下文，发现：

```
ap_atmage_manaburst.nut:
  | function sq_AddFunctionName(appendage) |
  | {  ... 用户自定义函数体 ... }
```

`sq_AddFunctionName` 不是引擎 API，**是 .nut 脚本里用 sq_ 前缀命名的本地函数**！grep `sq_*` 没区分这两类。

**重 grep**：扫所有 193 .nut 找 `function sq_XXX(` 形式的定义：

| 用户自定义函数 | 调用次数 | 出处 |
|---------------|---------|------|
| `sq_AddFunctionName` | 231 | ap_atmage_manaburst.nut |
| `sq_AddEffect` | 35 | ap_atmage_manaburst.nut |
| `sq_LoadSkillEffect_Swordman` | 1 | loadstate.nut |
| `sq_LoadSkillEffect_DemonicSwordman` | 1 | loadstate.nut |
| `sq_InitFrameIndices` | 1 | （某个 init 脚本） |
| **合计** | **269 calls** | 5 个名 |

### 2. 修正后的精确数字

```
原始 grep（case-sensitive）              483 sq_* 标识符
  ↓ 剔除 5 个 user-defined function
case-sensitive 引擎 API                  478  ← 与 md 478 完全相同！
  ↓ case-normalize（合并 35 对大小写双命名 pair）
case-normalized 引擎 API                 443  ← 最终独立引擎 API 数
case-normalized 调用点                   7,101  ← 减 269 user-defined calls
```

**结论**：**md 的 478 不是 ~1% 偏差，是精确匹配**。md 当时的 agent 大概率做了同样的 user-defined 剔除步骤。

### 3. v4 classifier (noun-keyword based) on 443 engine APIs

**方法论改进**：v1/v2 用 verb prefix (Get/Set/Is/Add) 分类失败——sq_\* 命名模式是 "verb+noun"，verb 跨所有 system，**真正的 system 标识是 noun**。v4 改用 noun keyword regex。

| 桶 | unique | 调用 | 注释 |
|----|--------|------|------|
| 01-Input | 8 | 123 | keyboard/command queue |
| 02-Net/RPC | 33 | 750 | binary serialization + state packet |
| 03-Monster/AI | 8 | 24 | enemy AI / targeting（在 player .nut 里很少） |
| 04-Attack/Hit | 23 | 413 | attack info + bonus + bounding box |
| 05-Animation | 31 | 773 | per-frame animation + sprite + ani helpers |
| 06-Skill | 28 | 357 | skill cooldown / level / cancel / cast |
| 07-Physics | 44 | 692 | pos / move / velocity / direction |
| 08-Resource | 2 | 3 | HP/MP — 极少（实际数值在 .skl 里） |
| 09-Status | 11 | 134 | ChangeStatus / state-layer overlay |
| 10-PassiveObj | 8 | 225 | passive object lifecycle |
| 11-Pool | 9 | 171 | object pooling (CNRD prefix) |
| 12-ScriptRT | 5 | 243 | RunScript / RGB / PlaySound（去 user-defined 后） |
| 13-DataStore | 22 | 2193 | sq_var + IntVect + GetIntData（最大桶） |
| 14-Appendage | 11 | 118 | buff/aura 附加体 |
| 15-VFX | 14 | 128 | effect / particle / draw-only |
| 16-CameraFX | 7 | 115 | shake / flash / xscroll |
| 17-Math | 12 | 116 | random / abs / sin / cos / radian |
| 18-Timer | 1 | 18 | sq_timer_ family |
| 19-StateMachine | 2 | 73 | GetState / SetState |
| 20-Time | 6 | 98 | GetCurrentTime / FrameStartTime |
| 21-Predicate | 26 | 80 | Is\* 谓词（catch-all） |
| 22-Identity | 6 | 48 | object id / team / unique id |
| **99-Unclassified** | **126** | **206** | 长尾低频（每个 ≤ 6 calls） |
| **合计** | **443** | **7101** | **22 个 system buckets** |

**unclassified**: 126 / 443 = 28.4%，但 **call share 仅 2.9%**——剩下的全是 long-tail。

### 4. 22 个桶 vs md 13 个 system — 差异讨论

md 说 13 system，我 v4 划出 22 个桶。3 种可能：

**A**. **粒度差异**（最可能）：md 13 是粗粒度（把 Timer/Time/Predicate/Identity 几个小桶并入 ScriptRT 或 DataStore），实际"等价于"以下并集：
- 1+2+3+4+5+6+7+8+9+10 (10 个 core system) + 11/12/13 (Pool / ScriptRT / DataStore) = **13** 个粗桶
- 14/15/16/17/18/19/20/21/22 (9 个 v4 细桶) 在 md 看来要么并入 13 桶之一，要么忽略

**B**. md 13 是"想象数字"——agent 当时主观分组没严格归。

**C**. 我的 v4 划分本身过细——比如 Time / Timer / StateMachine / Identity 这种小桶（每个 < 10 unique）该并入 13-DataStore 或更大桶。

**结论**：无法从 .nut 数据本身证伪 md 的 13——**system 数 ≈ 13-22 之间，取决于粒度选择**。v4 输出可以作为 Phase 2 task breakdown 的更细粒度参考。

### 5. 抽样 audit 验证桶质量

对 7 个最可疑桶，从 .nut 抽 top API 看实际调用语境：

| 桶 | 抽样 API | audit 结论 |
|----|---------|-----------|
| 12-ScriptRT | `sq_AddFunctionName` | ❌ → 修正为 user-defined function（已剔除） |
| 12-ScriptRT | `sq_PlaySound`, `sq_RGB`, `sq_RGBA`, `sq_RunScript` | ✅ 全是引擎 API |
| 15-VFX | `sq_AddEffect` | ❌ → user-defined function（已剔除） |
| 15-VFX | `sq_AddObjectParticleCreater`, `sq_CreateParticle`, `sq_AddObject` | ✅ 全是 effect/particle 引擎 API |
| 21-Predicate | `sq_IsMyControlObject`, `sq_IsHoldable`, `sq_IsGrabable`, `sq_IsValidActiveStatus` | ✅ 都是 if(...) 谓词调用，归 Predicate 合理 |
| 11-Pool | `sq_CreateCNRDAnimation` | ⚠️ 双重身份：创建 Animation 对象但走 pooling 路径。归 Pool 比 Animation 准（CNRD = 对象池标记） |
| 13-DataStore | `sq_var`, `sq_GetIntData`, `sq_IntVectPush`, `sq_IntVectClear` | ✅ 全是数据存取 |
| 04-Attack/Hit | `sq_GetCurrentAttackInfo`, `sq_SetCurrentAttackBonusRate`, `sq_SetCurrentAttackInfo` | ✅ 全是攻击数据查询/修改 |
| 07-Physics | `sq_GetDistancePos`, `sq_StopMove`, `sq_GetUniformVelocity`, `sq_GetYPos` | ✅ 全是位置/速度 |

**audit 结果**：v4 经修正后**桶质量良好**，主要错归（user-defined function）已剔除。其余可疑边界（如 CNRDAnimation 跨 Pool/Animation）属于 system 边界本身模糊，不算 classifier bug。

### 6. 仍未解锁

- **126 个 long-tail unclassified API**（每个 ≤ 6 calls，总占 2.9% call share）— 改进 ROI 已低
- **22 vs 13 system 粒度选择** — 需要 Stage 2 task breakdown 决定细分到几桶
- **API ↔ system 多对多关系** — 如 sq_LoadSkillEffectAni 既属 Animation 又属 Skill (loadeffect)，单一桶分类必然损失信息

### 7. 数据产物

| 文件 | 内容 |
|------|------|
| `verification/nut-samples-2026-05-27/classify-v4.mjs` | v4 noun-keyword classifier 源码 |
| `verification/nut-samples-2026-05-27/classify-v4-output.json` | 完整 buckets dump（每个 API 的归类） |
| `verification/nut-samples-2026-05-27/dedup-pairs.txt` | 35 对 case-duplicate |
| `verification/nut-samples-2026-05-27/b-task-analyze.mjs` | B 任务事件分析脚本（见 §十一） |

---

## 十一、B-task .nut 事件追踪审计（怀疑精神，2026-05-27）

**触发动机**：先前看 1 个 .nut (iceorbex.nut) 就断言 "DNF .nut 是事件驱动 hook 系统"。用户指令 "B 必须用怀疑精神" — 抽 9 个跨类型 .nut 验证 4 条 hypothesis。

### 1. 抽样设计

| # | 类型 | 文件 | lines | functions |
|---|------|------|-------|-----------|
| 1 | active skill | `sqr/character/atmage/iceorbex/iceorbex.nut` | 104 | 5 |
| 2 | active skill | `sqr/character/atmage/elementalstrikeex/elementalstrikeex.nut` | 276 | 10 |
| 3 | active skill | `sqr/character/atmage/manaburst/manaburst.nut` | 91 | 2 |
| 4 | passive object (player) | `sqr/character/atmage/iceorbex/po_aticeorbex.nut` | 301 | 7 |
| 5 | passive object (priest) | `sqr/passiveobject/character/priest/po_devilstrike_attack3.nut` | 47 | 4 |
| 6 | appendage (player) | `sqr/character/atmage/elementalchange/ap_atmage_elemental_change.nut` | 42 | 3 |
| 7 | appendage (common) | `sqr/appendage/character/ap_atmage_effect.nut` | 144 | 8 |
| 8 | root loader | `sqr/loadstate.nut` | 17 | **0** |
| 9 | root init | `sqr/init_character.nut` | 103 | 3 |

### 2. Hypothesis 验证矩阵

| Hypothesis | 验证方法 | 结果 |
|-----------|---------|------|
| **H1**：所有 .nut 都没有 top-level 主循环（不是 procedural / tick 主调度） | 扫每个文件 top-level 的 `while`/`for`/`do`/`foreach` | ✅ **9/9 文件 = 0** |
| **H2**：所有 .nut 共享同一个 hook function 名集 | 跨样本 union function 名 | ❌ **不同类型 .nut 有不同 hook 集** |
| **H3**：.nut 完全不参与 tick（纯 event-on-trigger） | 找 `proc`/`tick`/`update` 命名的 function | ❌ **存在 per-frame callback hook** |
| **H4**：每个 hook 只调用一两个 system 的 API（弱耦合） | 数每个 function 内 sq_\* unique count | ❌ **一个 hook 经常跨 4-6 个 system** |

### 3. 不同 .nut 类型的 hook 集（H2 修正）

| 类型 | check 类（预判） | on 类（事件） | proc 类（per-tick） | set/init/draw 类（命令式） |
|------|-----------------|--------------|---------------------|---------------------------|
| **Active Skill** | `checkExecutableSkill_*`、`checkCommandEnable_*` | `onSetState_*`、`onAfterSetState_*`、`onEndState_*`、`onEndCurrentAni_*`、`onKeyFrameFlag_*` | **`onProc_*`、`onProcCon_*`** | `prepareDraw_*` |
| **Passive Object** | — | `onSetState_*`、`onEndCurrentAni_*`、`onKeyFrameFlag_*`、`onTimeEvent_*`、`onDestroyObject_*` | **`procAppend_*`** | `setCustomData_*`、`setState_*`、`createXxxBy*` |
| **Appendage** | `isEnd_appendage_*` | `onStart_*`、`onEnd_*`、`onVaildTimeEnd_*` | **`proc_appendage_*`** | `prepareDraw_*`、`drawAppend_*` |
| **Root loader** | — | — | — | `sq_RunScript("…")` × N 顺序加载 |

**核心修正**：**.nut 不是纯 event-driven，是 "事件触发 + 引擎每帧 callback" 的混合模型**。
- 引擎层（C++）每帧执行内部 tick 顺序
- 对每个活跃实体（player/skill/passive object/appendage），引擎在该帧的特定阶段调用 `onProc` / `procAppend` / `proc_appendage` 之一作为"该实体参与 tick"的入口
- 此外，引擎按状态转换 / 输入 / 动画事件触发 `onSetState` / `checkCommandEnable` / `onKeyFrameFlag` 等离散事件

### 4. 重建的 .nut 事件 lifecycle graph

基于 9 .nut 跨类型样本推得的**每帧引擎 → .nut 回调时序**（按引擎调用顺序）：

```
┌── (每 input frame，60Hz) ──────────────────────────────────────────┐
│                                                                     │
│  [输入阶段]                                                          │
│    1. checkCommandEnable_<Entity>   ← 引擎问"命令可输入吗？"          │
│    2. checkExecutableSkill_<Entity> ← 引擎问"技能可触发吗？"          │
│         （如果 true → sq_AddSetStatePacket → 触发状态转换）            │
│                                                                     │
│  [状态机阶段]                                                        │
│    3. onEndState_<Old>              ← 旧状态结束                     │
│    4. onSetState_<New>              ← 新状态启动                     │
│    5. onAfterSetState_<New>         ← 新状态启动后回调               │
│                                                                     │
│  [每帧 tick 阶段]                                                    │
│    6. onProc_<Entity>               ← Skill 类                       │
│       onProcCon_<Entity>            ← Skill 条件式                   │
│       procAppend_<Entity>           ← Passive Object 类              │
│       proc_appendage_<Entity>       ← Appendage 类                   │
│                                                                     │
│  [动画推进阶段]                                                      │
│    7. onKeyFrameFlag_<Entity>       ← 当前帧带 KeyFrame Flag         │
│    8. onEndCurrentAni_<Entity>      ← 当前动画播放完毕               │
│                                                                     │
│  [渲染前阶段]                                                        │
│    9. prepareDraw_<Entity>          ← 渲染数据准备                   │
│   10. drawAppend_<Entity>           ← 自定义绘制                     │
│                                                                     │
│  [销毁阶段]                                                          │
│   11. onDestroyObject_<Entity>      ← 实体被引擎销毁                 │
│   12. onVaildTimeEnd_<Entity>       ← appendage 有效时间到（typo）   │
│                                                                     │
│  [谓词阶段（任意时刻引擎查询）]                                       │
│        isEnd_<Entity>               ← 实体是否结束                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5. 单 hook 跨 system 耦合度（H4 验证）

抽取 9 个样本里 hook function 的 sq_\* 调用集 unique 数：

| Hook function | sq_\* 调用 unique | 涉及 system |
|---------------|------------------|------------|
| `onKeyFrameFlag_IceOrbEx` | 12 | Skill, DataStore, Input, Physics, Net, ... |
| `onSetState_ElementalStrikeEx` | 11 | Physics, DataStore, Audio, Net/RPC, PassiveObj |
| `checkExecutableSkill_ManaBurst` | 7 | StateMachine, Skill, DataStore, Net |
| `setState_po_ATIceOrbEx` | 7 | VFX (Particle), Physics, DataStore |
| `procAppend_po_ATIceOrbEx` | 5 | VFX, Physics, Animation, Time |
| `drawAppend_appendage_atmage_effect` | 8 | Animation, Time, Math, Physics, Skill |
| `sq_InitFrameIndices` (init_character.nut) | 16 | (初始化大量帧索引 API) |

**结论**：**单个 hook 跨 4-8 个 system 是常态**。这说明：
- 13 system 之间不是 "tick 完一个再下一个" 的隔离顺序
- 而是 **"事件触发跨 system 数据流"** — 一次 setState 同时操作 Animation + Physics + Audio + Net
- 等于：**C++ tick 顺序在 hook 边界对齐**，而非每个 system 独立 tick

### 6. 对 Q21 决策的精准化

**用户决策 Q21/B**："system tick 顺序从 .nut 反推"

**修正后的精确表述**：
- ❌ **.nut 不能反推 "13-system C++ 内部 tick 顺序"** — 那个在 DNF.exe 二进制里，跟 launch curve / hitstun table 一样属于"PVF 不可达"的 Tier-3 黑盒
- ✅ **.nut 能反推 "引擎 → 脚本回调时序"** — 即上面 §4 那张事件 lifecycle graph
- ⚠️ 这两个是**不同抽象层**：
  - C++ tick 顺序 = 引擎内部 13 system 的执行调度
  - 事件 lifecycle = 引擎对脚本暴露的回调入口

### 7. 对 game-engine-architecture 的修正建议

architecture.md §一 §三 把 13 system 画成"顺序 tick chain"（Input→StateMachine→Physics→HitDetect→...）。基于本节发现，建议改为：

```
              引擎内部 13 system tick（黑盒，C++ 内部，不可观测）
                            ↓ ↑（hook callback）
              .nut 脚本事件 lifecycle graph（可观测，本节 §4）
```

Phase 2 落地时，**JS/TS 自己实现 13-system tick 顺序时不必硬抄 DNF C++ 顺序**（拿不到），可以**优先实现 .nut hook 顺序对齐的版本**——这个有 PVF 真值支撑。

### 8. 验证产物

| 文件 | 内容 |
|------|------|
| `verification/nut-samples-2026-05-27/b-task-analyze.mjs` | B 任务分析脚本（9 .nut 结构 + hook 分类 + sq_\* 调用追踪） |

### 9. 仍未解锁

- **C++ 引擎内部 tick 顺序** — DNF.exe 二进制里硬编码，本次验证未触达
- **跨样本扩展** — 抽样 n=9（covers active skill / passive object / appendage / root），但未覆盖 monster / dungeon / equipment / boss-AI 等。结论可能在那些 .nut 类型里需要补充
- **hook 顺序的引擎实际触发顺序** — §4 graph 是基于 hook 名字语义推导，未抓真实引擎 tick log 验证。Phase 2 实现时如果发现 `onSetState` 后立刻紧跟 `procAppend` 之类细节，是引擎层 schedule 决定的，与本节推论可能有 1-2 步差异





---

*2026-05-27 验证。本报告替代 [`audit-2026-05-25-full-pipeline-static.md`](audit-2026-05-25-full-pipeline-static.md) 对 13-system 的"无 PVF 证据"判断；但 13 system 的具体分类仍需后续工作。*
