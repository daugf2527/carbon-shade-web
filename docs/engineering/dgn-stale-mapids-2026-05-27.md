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

## 跨副本扫描（待办）

本次只实测 jungle 一个 dgn。建议在 baseline `--pve-full` 模式下跑一次，console 收集所有 `[exporter] dgn "X": N/M mapIds...` warning，得到全副本 stale rate 统计。可能：
- jungle 75% stale 是异常高的
- 其他 dgn stale rate 是 0% 或低于 20%（更接近完整）

落档为 `verification/dgn-stale-summary.json` 是 Stage 2 启动前的好 audit gate。

## Reference

- 实测命令：`./tools/dnf-extract.exe --pvf data/Script.pvf --list --filter "3204("`
- 实测时间：2026-05-27
- 触发 task：用户决策 "jungle.dgn 8 mapId 里只有 2 个真在 PVF；其余是 design data 失活——要处理"
- 实现 commit：见 git log 含 `feat(exporter): stale mapId detection`
