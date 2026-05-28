# 2026-05-28 远程更新代码质检

**日期**: 2026-05-28  
**范围**: `a3fa65c..95eb84c` — 44 文件变更（7 新 + 33 修改 + 4 test）  
**方法**: 逐文件 diff 审读 + 静态分析 + 与审计发现交叉对照

---

## 总览

| # | 文件 | 类型 | 行数 | 评级 |
|---|------|------|------|------|
| 1 | `src/engine/core/GameLoop.ts` | 新增 | +127 | 🟢 |
| 2 | `src/engine/loader/ShardLoader.ts` | 新增 | +117 | 🟢 |
| 3 | `src/engine/schema/ani.fbs` | 新增 | +73 | 🟢 |
| 4 | `scripts/consistency-check.mjs` | 新增 | +495 | 🟡 |
| 5-8 | `tests/static/four-way-consistency-*.ts` | 新增 | +220 | 🟢 |
| 9-10 | `classify-v2.mjs` / `classify-v3.mjs` | 新增 | +239 | 🟢 |
| 11 | `.claude/hooks/notify.mjs` | 修改 | +19/-14 | 🟢 |
| 12 | `src/.../RuntimeExporter.ts` | 修改 | +23/-7 | 🟢 |
| 13 | `src/.../PvfDocumentLoader.ts` | 修改 | +78/-14 | 🟢 |
| 14 | `src/.../parseStage.ts` | 修改 | +21/-2 | 🟢 |
| 15 | `src/.../pipelineRunner.ts` | 修改 | +14/-6 | 🟢 |
| 16 | `src/engine/workers/sim-worker-host.ts` | 修改 | +14/-2 | 🟢 |
| 17 | `scripts/stage1-baseline.mjs` | 修改 | +2/0 | 🟢 |
| 18 | `tests/static/dnf-native-h15-export-probes.test.ts` | 修改 | +106 | 🟢 |
| 19-33 | 15 个文档文件 | 修改 | — | 🟢 |

---

## 一、新增代码逐文件审查

### 1. GameLoop.ts — 🟢 优秀

**设计**: 标准 Gaffer on Games "Fix Your Timestep!" 固定步长累加器。

| 特性 | 实现 |
|------|------|
| tickRate | 1/60 秒（16.67ms） |
| maxCatchUpTicks | 4（防止死亡螺旋） |
| pauseThresholdMs | 250ms（tab 切换检测） |
| slowMotion | `setSlowMotion(factor)` 调试用 |
| singleStep | `armSingleStep()` 逐帧调试 |
| alpha 插值 | `accumulatorSeconds / tickRate` 渲染用 |
| tickCounter | 确定性 PRNG 种子 + Replay 帧锚 |

**边界处理**:
- `deltaMs > pauseThreshold` → 重置累加器，调用 `onLargeDelta` 回调
- `ticks >= maxCatchUpTicks && accumulator 仍有剩余` → 丢弃剩余时间，调用 `emitLongFrameWarning`
- `pause()` / `resume()` 均重置 `accumulatorSeconds = 0`

**代码质量**:
- 全部 `readonly` 接口，无 `any`，无 `Math.random`
- 借鉴 master 分支 `FixedStepSimulation.ts` 稳定模式
- 中英双语注释，术语准确

### 2. ShardLoader.ts — 🟢 优秀

**设计**: Manifest 驱动的异步 shard 加载器，内存缓存 + 可注入 fetch。

| 特性 | 实现 |
|------|------|
| Manifest | `loadManifest()` 延迟加载，首次 `loadShard` 时触发 |
| 缓存 | `Map<string, unknown>` 去重 |
| 可测性 | `fetchImpl` 可注入 mock |
| 发现 | `listShards()` / `listShardsByKind(kind)` |
| 清理 | `clearCache()` 测试用 |

**接口签名**:
```ts
loadShard<T = unknown>(shardPath: string): Promise<T>
```
泛型支持 typed 使用方。

**错误处理**: 每个 fetch 检查 `res.ok`，错误信息含 manifest 中可用 shard 列表前 5 个。

**缺口**: manifest 中的 `sha256` 字段未在加载时校验。P2。

### 3. ani.fbs — 🟢 优秀

**布局**:

| 类型 | FlatBuffer 类型 | 说明 |
|------|----------------|------|
| Hitbox6 | `struct` (6×int32) | POD 布局，省内存，与 C++ `PvfAnimation.cpp:54-59` 对齐 |
| Anchor | `struct` (2×int32) | 脚底锚点 |
| AniFrame | `table` | 逐帧数据，HOT→COLD 排序 |
| AniDef | `table` + `root_type` | 顶层，含 `file_identifier "ANID"` + `schema_version` |

**HOT/WARM/COLD 分层**: 与我们的 `22-system-field-matrix.md §一` 一致。

**引用**: 正确 `include "chr.fbs"` 复用 Provenance。

### 4. consistency-check.mjs — 🟡 良好但有硬编码

**功能**: 跨 4 层一致性检查（PARSERS/BASELINE/FBS/SIM-WORKER）— 覆盖 7 个门。

**问题**: 第 27 行：
```js
const MEMORY_DIR = join(HOME, ".claude/projects/D--carbon-shade-web/memory");
```
此路径仅存在于作者机器上。在其他环境运行 `npm run consistency` 会报错。P2 — 建议改为环境变量或跳过不存在的目录。

### 5-8. four-way-consistency 测试 — 🟢

4 个测试文件覆盖 CURATED_FILES 计数 / parser 产出 / .fbs 编译 / sim-worker stub 四路一致性。`EXPECTED_COUNT = 45` 与当前 CURATED_FILES 一致。

### 9-10. classify-v2/v3 — 🟢

v2 (115 行) 和 v3 (124 行) 是 classify-v4 的前身版本，保留用于审计轨迹。纯数据脚本，无运行时依赖。

---

## 二、修改代码逐文件审查

### 11. notify.mjs — 🟢 修了 P2-11

**我们的审计发现**: `execSync` 模板字符串注入面（P2-11）

**远程修复**:
- Termux 分支: ``execSync(`termux-notification --content "${msg}"`)`` → `spawnSync('termux-notification', ['--content', msg])` ✅
- Windows 分支: `execSync` → `spawnSync` + PowerShell 单引号转义（`''`）✅
- `msg` 落底: `execSync("msg ...")` → `spawnSync('msg', [...])` ✅
- 移除了不再需要的 `.replace(/'/g, '').replace(/"/g, '')` 清洗 ✅

### 12. RuntimeExporter.ts — 🟢 修了 P1-24 + 标注 s4 P2

**P1-24（原子写 manifest）**: 
```ts
// 旧: await writeFile(manifestPath, JSON.stringify(manifest));
// 新: tmp + rename (POSIX 原子)
const manifestTmpPath = `${manifestPath}.tmp`;
await writeFile(manifestTmpPath, JSON.stringify(manifest, null, 2));
await rename(manifestTmpPath, manifestPath);
```

**s4 P2（怪物 ID 前缀碰撞）**: 加了详细的 TODO 注释，承认风险并在不重叠时无害。

### 13. PvfDocumentLoader.ts — 🟢 修了 P1-20

**P1-20（spawn 无超时，PVF 损坏无限 hang）**:
- 新增 `spawnWithTimeout()` 函数（53 行）
- 默认 60s 超时，可配置（`timeoutMs`）
- SIGKILL 后清晰报错 `"dnf-extract --pipe killed after ${timeoutMs}ms timeout"`
- 同时应用于 `loadPvfDocumentsViaPipe` 和 `loadAniDocumentsViaPipe`

### 14. parseStage.ts — 🟢 修了 P1-22

**P1-22（未知扩展名 throw 阻塞 batch）**:
- 从 `throw new Error(...)` 改为 `throw new UnregisteredExtensionError(path)`
- 新增 `UnregisteredExtensionError` 类，带 `kind = "unregistered_extension"` 标记
- `pipelineRunner` 可 `instanceof` 检查决定 abort-vs-collect 策略

### 15. pipelineRunner.ts — 🟢 修了 P1-19

**P1-19（finishedAt 时间戳在 VALIDATE 前捕获，不含 EXPORT 耗时）**:
- `finishedAt` 移到 EXPORT 完成之后捕获
- `validationStartedAt` 用于 VALIDATE 阶段的时间标记
- `validation.meta.finishedAt` 补写入真实结束时间

### 16. sim-worker-host.ts — 🟢 修了 s6 的 2 个 P2

**s6 P2-7（无 onerror handler）**: 新增 `worker.onerror` → 转发给 `errorCb` ✅

**s6 P2-8（setTimeout 堆积）**: 新增 `terminateTimer` 变量，重复 `shutdown()` 调用不再堆积定时器 ✅

### 17. stage1-baseline.mjs — 🟢

CURATED_FILES 从 43 → 45：新增 `damage2.ani` 和 `overturn.ani`。

### 18. dnf-native-h15-export-probes.test.ts — 🟢

新增 106 行 export probe 测试，覆盖 manifest 写出 + 原子性 + shard 内容校验。

---

## 三、审计发现修复追踪

| 审计发现 | 严重度 | 状态 | 修复 commit |
|---------|--------|------|------------|
| P1-19 finishedAt 时间戳 | P1 | ✅ 已修复 | `pipelineRunner.ts` |
| P1-20 spawn 无超时 | P1 | ✅ 已修复 | `PvfDocumentLoader.ts` |
| P1-22 未知扩展名阻塞 | P1 | ✅ 已修复 | `parseStage.ts` |
| P1-24 非原子写 manifest | P1 | ✅ 已修复 | `RuntimeExporter.ts` |
| P2-11 notify.mjs 注入面 | P2 | ✅ 已修复 | `notify.mjs` |
| s6 P2-7 sim-worker 无 onerror | P2 | ✅ 已修复 | `sim-worker-host.ts` |
| s6 P2-8 setTimeout 堆积 | P2 | ✅ 已修复 | `sim-worker-host.ts` |
| s4 P2 怪物 ID 前缀碰撞 | P2 | ⏳ TODO 标注 | `RuntimeExporter.ts` |

**7/8 已修，1 个 TODO 标注。**

---

## 四、遗留的 P2

| ID | 文件 | 描述 |
|----|------|------|
| P2-new-1 | `consistency-check.mjs:27` | 硬编码 `~/.claude/projects/D--carbon-shade-web/memory` 路径 |
| P2-new-2 | `ShardLoader.ts` | manifest sha256 字段未校验 |
| P2-new-3 | `CLAUDE.md:102` | 一处仍写 "43 curated files"，实测 45 |

---

## 五、总体评价

远程代码质量**非常好**。7 个审计发现（4 个 P1 + 3 个 P2）在 24 小时内被修掉。3 个新核心文件（GameLoop / ShardLoader / ani.fbs）都是生产级骨架代码，设计决策与我们的字段矩阵一致且互相引用。无新增 `any`、无新增 `Math.random`、typecheck 通过。
