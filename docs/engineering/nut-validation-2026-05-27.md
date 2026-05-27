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
| **unique sq_\* API** | 478 | **483** | ✅ ~1% 偏差，可接受 |
| **sq_\* 调用点总数** | 未提 | **7,370** | (新增数据) |
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

*2026-05-27 验证。本报告替代 [`audit-2026-05-25-full-pipeline-static.md`](audit-2026-05-25-full-pipeline-static.md) 对 13-system 的"无 PVF 证据"判断；但 13 system 的具体分类仍需后续工作。*
