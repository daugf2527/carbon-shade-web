# Dungeon mapSpecification stale mapId — 2026-05-27 实测发现

## 摘要

DNF PVF 的 `.dgn` 文件在 `mapSpecification` 段引用 mapId（数字 ID），但**部分 mapId 在 PVF 的 `.map` 文件命名里找不到对应**——属于设计数据失活（design data 已写入 dgn，但对应 .map 文件被清理 / 未实现 / 改用其他副本系统替代）。Stage 1 RuntimeExporter 现已加 console.warn 检测此现象（见代码注释 + RuntimeExporter line ~340）。

## 实测案例：`dungeon/act3/jungle.dgn`

`jungle.dgn.mapSpecification.items` 列出 **8 个 mapId**：
```
3204 / 3205 / 3206 / 3216 / 3229 / 3230 / 3235 / 3236
```

实测 `tools/dnf-extract.exe --pvf data/Script.pvf --list --filter "<id>("`：

| mapId | PVF 中是否存在 .map 文件 | 路径（如果存在） |
|-------|------------------------|------------------|
| 3204 | ✅ 存在 | `map/jungle/e3204(1,2).map`、`map/jungle/h3204(3,0).map` |
| 3205 | ❌ **0 文件** | — |
| 3206 | ✅ 存在 | `map/jungle/h3206(0,6).map` |
| 3216 | ❌ **0 文件** | — |
| 3229 | ❌ **0 文件** | — |
| 3230 | ❌ **0 文件** | — |
| 3235 | ❌ **0 文件** | — |
| 3236 | ❌ **0 文件** | — |

**8 个引用中 6 个 stale**（75% stale rate）。

## map 命名规则（实测）

PVF 中 jungle 副本的 map 文件命名形如：

```
map/jungle/<difficulty_prefix><mapId>(<x>,<y>)[_suffix].map
```

例：
- `map/jungle/e3204(1,2).map` — easy 难度，mapId 3204，坐标 (1,2)
- `map/jungle/h3204(3,0).map` — hard 难度，同 mapId，不同坐标
- `map/jungle/h3206(0,6).map` — hard 难度，mapId 3206
- `map/jungle/hell_jungle.map` — 特殊命名

实测 `map/jungle/` 下共 **62 个 .map 文件**，远多于 dgn 引用的 8 个 mapId。说明：
1. **多对一**：同 mapId 对应多个 .map（不同难度 e/h、不同坐标）
2. **dgn.mapSpecification.items 引用 ≠ 副本实际拥有的所有 map**——可能只是某种 "main path map" 列表

## 为什么会出现 stale

DNF 副本系统经历过多次重构。`mapSpecification` 是早期布局信息（房间 ID 列表），但当前实际副本运行可能用：

- **`startMap` / `bossMap`**（jungle 中是 `[0,3,3,3]` / `[0,0,3,0]`，4 元组似乎是坐标）
- **mapId → .map 名映射在引擎层（C++ DNF.exe）硬编码**，PVF 只提供数据 ID
- **stale ID 是历史遗留**，PVF 没维护严格的"引用都要解析"约束

## 处理决策（2026-05-27）

| 选项 | 决定 |
|------|------|
| **A. validator 报错并阻断** | ❌ 太严格，会让所有现有 .dgn 报错 |
| **B. exporter console.warn 输出 + 文档化** | ✅ **采用**（已实现，see RuntimeExporter line ~340） |
| **C. 改 .dgn 数据剔除 stale id** | ❌ 改 PVF 输入不可取（数据 truth 应保留） |
| **D. 给 dgn shape 加 staleMapIds 字段** | ⚠️ 可选 follow-up — Stage 2 引擎可能想感知 |

**当前实现**：
```ts
// RuntimeExporter.ts dungeon section
if (staleMapIds.length > 0) {
  console.warn(`[exporter] dgn "${id}": N/M mapIds referenced but no matching .map file...`);
}
```

Stage 2 runtime 如果想用 mapSpecification 做副本布局，**必须 robust 处理 stale id**（fallback / skip / 报错都行，由 Stage 2 决定）。

## 跨副本扫描结果（2026-05-27 已完成）

跑 `node scripts/scan-dgn-stale-mapids.mjs`，对全部 338 个 .dgn 计算 stale rate。原始数据在 `verification/dgn-stale-summary-2026-05-27.json`。

### 全局统计

| 指标 | 值 |
|------|----|
| .dgn 文件总数 | 338 |
| 含 `mapSpecification` 段的 .dgn | **89** (26% — 其余 249 个 .dgn 不用 mapSpec 描述布局) |
| 总 mapId references | **743** (per-dgn 去重后；未去重 raw=1,126) |
| 总 stale references | **370** (per-dgn 去重后；未去重 raw=561) |
| **全局 stale rate** | **49.8%** (去重前后一致 — 分子分母同比缩放) |

**结论一**：~74% 的 .dgn 根本不用 `mapSpecification`，可能改用 startMap/bossMap 数组 / 引擎硬编码布局 / 其他段。**mapSpecification 不是副本布局的统一接口**。

### Stale rate 分布（双峰）

| 桶 | dgn 数 | 解读 |
|----|--------|------|
| **0% (完全 OK)** | **37** | 副本数据完全维护，引用全部解析 |
| 1-20% | 0 | 真空区 — 极少有"边缘 stale" |
| 21-50% | 5 | jungle 之外的部分 stale 案例 (shadowmaze, kingsruins, vilmark 等) |
| 51-80% | 5 | jungle 在这里 (75%) |
| **81-100% (几乎全 stale)** | **42** | **deprecated dungeon**——mapSpec 是历史遗留，副本可能 EOL 或重做 |

**结论二**：双峰分布说明 DNF 副本数据维护是**全有或全无**——要么所有 mapId 都对得上（37 个干净 dgn），要么 mapSpec 整段废弃（42 个 100% stale 的）。**中间地带极少**（jungle 的 75% 算"接近废弃"）。

### 0% stale 的"干净 dgn"代表

| dgn | references |
|-----|------------|
| dungeon/act3/goddesstemple.dgn | 10 |
| dungeon/act3/bloodhell.dgn | 7 |
| dungeon/act3/breeding.dgn | 9 |
| dungeon/act7/gentdefence.dgn | 17 |
| dungeon/act2/palaceofload.dgn | 15 |
| dungeon/act6/danceingbutterfly.dgn | 14 |
| dungeon/village/grim_low/grim03.dgn | 15 |

**结论三**：**Stage 2 PVE 优先用 0% stale 的 dgn**——核心 act3 的 goddesstemple / bloodhell / breeding 都干净，act6/act7/act2 几个大型 dgn 也干净，足够 Phase 2 副本系统的覆盖度。**jungle (75% stale) 反而是个边缘案例**，不应作首选副本。

### 100% stale 的"废弃 dgn"代表

| dgn | references |
|-----|------------|
| dungeon/village/cartelarad/grozni.dgn | 25 |
| dungeon/act7/nightassault.dgn | 14 |
| dungeon/village/cartelarad/odesa.dgn | 20 |
| dungeon/act5/bwanga.dgn | 8 |
| dungeon/act7/supplycut.dgn | 11 |

42 个 81-100% stale 集中在 **village（村镇）/ event（活动）/ ancient（古龙）/ anton（安顿）/ act5+act7（高难度副本）**——这些区域多数是早期被重做或 EOL 的内容。**Phase 2 副本系统 PVE 范围内可以全部跳过**（用户决策 Q2/C "先扩数据再做" + Q31/B "最小闭环" 都不依赖这些）。

### 处理决策（基于扫描结果）

| 阶段 | 行动 |
|------|------|
| **Stage 1 (现在)** | RuntimeExporter console.warn 已加（per-dgn 输出 stale 数）。`scripts/scan-dgn-stale-mapids.mjs` 提供全局视图。**不做数据剔除**（PVF truth 保留）。 |
| **Stage 2 副本系统** | 加 `dgn.shape.staleMapIds` 字段（exporter 在写 shard 时把数组带上），让 Stage 2 引擎决定 fallback。优先用 0% stale 的 dgn（goddesstemple / bloodhell 等）。 |
| **Stage 3+** | 如需支持 deprecated dgn，需要 .map 反查机制（按 mapId → search PVF for any map with that id）。当前不做。 |

## Reference

- 实测命令：`./tools/dnf-extract.exe --pvf data/Script.pvf --list --filter "3204("`
- 实测时间：2026-05-27
- 触发 task：用户决策 "jungle.dgn 8 mapId 里只有 2 个真在 PVF；其余是 design data 失活——要处理"
- 实现 commit：见 git log 含 `feat(exporter): stale mapId detection`
