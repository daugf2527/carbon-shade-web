# Stage 1 known issues — 已知问题清单（2026-05-24）

> 由 [`2026-05-24-stage1-review.md`](2026-05-24-stage1-review.md) 复审产出。**Stage 1 在带这 3 项 P0 + 3 项 P1 + 3 项 P2 的状态下被 sign-off**。Stage 2 brainstorm 阶段允许并行思考，但 **Stage 2 实施开工前 P0 必须先解**。
>
> 处理责任：进入 Stage 2 第一个 system 实施前的 prep work。
>
> 入档原因：用户选择 sign-off Stage 1，把 P0 进 backlog 不阻断 Stage 2 brainstorm。

## P0 — 阻塞 Stage 2 实施

### P0-1: RuntimeExporter `players/<job>.json` path 冲突

**位置**: `src/dnf-native-combat/data/exporter/RuntimeExporter.ts:481-486` `chrJob()`

**症状**: 把 `parts[1]`（父目录名）当 job key，导致同一职业目录下的多 .chr 写到同一 shard，后写的覆盖前写的：

```
character/swordman/swordman.chr        → players/swordman.json
character/swordman/demonicswordman.chr → players/swordman.json  ← 覆盖
```

baseline manifest 实际 collision 路径：
- `players/swordman.json` × 2（swordman + demonicswordman）
- `players/gunner.json` × 2（gunner + atgunner）
- `players/fighter.json` × 2（fighter + atfighter）
- `players/mage.json` × 3（mage + atmage + creatormage）

5/11 个 sub-class chr 数据被覆盖丢失。

**两个修法**（开工前需确定）：
- **A**：同一职业一个 shard，内嵌 `subclasses: { demonicswordman: {...}, atswordman: {...} }`。优点：consumer 按职业组织，符合 DNF 内部职业-次职业的层级；缺点：shard 体积膨胀，atmage / creatormage 有较大 stat 差异，结构会复杂
- **B**：11 chr → 11 shard，文件名用 chr basename stem（`players/demonicswordman.json` / `players/atswordman.json` / ...）。优点：扁平、直接；缺点：consumer 需要知道职业-次职业的归属表

**Stage 2 影响**: PlayerRuntimeShape 加载 swordman.json 不知道是 swordman 主类还是 demonicswordman 次职业，**数据不可逆地丢失**。

### P0-2: manifest.files dup entries

**位置**: `src/dnf-native-combat/data/exporter/RuntimeExporter.ts`，整个 `exportRuntimeShards` 流程

**症状**: `RuntimeExporter.ts` 写 manifest 时无 dedupe（grep `dedupe|seen|visited|writtenPaths` 无匹配），同 path 多次 write 会 append 多条 entry：

```json
{
  "files": [
    { "path": "players/swordman.json", "sha256": "6107e1b3...", "sizeBytes": 275488 },
    { "path": "players/swordman.json", "sha256": "c5cbc798...", "sizeBytes": 286994 }
  ]
}
```

**Stage 2 影响**: consumer 加载 manifest 不知道哪条 sha256 是当前正确的。

**修法**: 与 P0-1 一并修（消除 path collision 后自然消除 dup entries），或在 manifest 输出前加 dedupe (last-write-wins by path)。

### P0-3 (软): dist/data/ 实物不在工作树

**位置**: `.gitignore` 整体忽略 `dist/`

**症状**: `dist/data/` 目录在当前工作树不存在。只有 `verification/dist-manifest-stage1-baseline.json` 是 manifest 副本。reviewer 无法直接 sample shard 内容（如 swordman.json 的 sourceProvenance / Tier-3 标记结构）。

**复现方式**:
```bash
DNF_PVF_PATH=/path/to/Script.pvf node scripts/stage1-baseline.mjs
```

**Stage 2 影响**: 不直接阻塞代码，但 Stage 2 brainstorm 时讨论 consumer surface 字段没法对照实物。

**修法**: 把 baseline shards 也 copy 到 `verification/baseline-shards/` 与 manifest 一起，或在 changelog 加 "复现命令" 链接。

## P1 — 不阻塞但应处理

### P1-1: dungeons baseline 0 覆盖

**位置**: `scripts/stage1-baseline.mjs:39-63` `CURATED_FILES`

**症状**: curated 列表含 1 个 .map 但 0 个 .dgn，Stage 2 DungeonRuntimeShape 没有 baseline 可对照。

**修法**: 加 1-2 个真实 .dgn 进 curated（如 `dungeon/test_lorien/test_lorien.dgn`，待样本验证）。

### P1-2: dnf-extract `--list` warm-cache 4× 性能回归

**位置**: `tools/dnf-porting-src/` 源码（具体哪个 commit 引入未定位）

**症状**: warm-cache `--list` 从 2.5s → 10s，4× 退步。`a05da0b` commit message TODO，未修。

**修法**: 跑 `node --prof tools/dnf-extract.exe --pvf … --list`，profile 之后定位热点。

### P1-3: changelog "Known debt #6" 过时

**位置**: `docs/changelog/2026-05-24-stage1-complete.md` "Known debt going into Stage 2" 第 6 项

**症状**: 写 "Validator schema check is hand-rolled — chose this over Zod"。实际 `validator.ts:31` `import { z } from "zod"`，commit `bcaf91e` 标题就是 "Zod validator"。debt 列项过时。

**修法**: 一行编辑改 changelog，标记 "已迁 Zod (commit bcaf91e)，debt 关闭"。

## P2 — 信号/清理

### P2-1: CLAUDE.md 30/31 滞后

**位置**: `CLAUDE.md` "Current state" 段

**症状**: 写 "30/31 completion gates green"，实际 `npm run completion` 31/31。

**修法**: 一字之差，写 "31/31 completion gates green"。

### P2-2: audit-verify 引文行号偏差

**位置**: `verification/audit-2026-05-24-03-36-55-fixverify/agent-ts-parser-truth-fixverify.md` ImgParser:149-159 finding

**症状**: agent 引用 `ImgParser.ts:149-159` 但 fix 实际范围是 line 149-164（`Audit ts-parser-truth F1` 注释 + hard throw）。`audit-verify.mjs` 报 CITATION_DRIFT，但 fix 本身是真实存在的。

**修法**: 让 `audit-verify.mjs` 在 evidence_excerpt 检查时允许 ±10 行 fuzzy match，或者要求 agent 引文必须 cover 完整 fix block。

### P2-3: knip 未用项

**症状**: `npm run analyze` → knip 报 24 unused exports + 48 unused types。大部分在 Phaser 渲染层（`src/game/`、`src/combat/`），与 Stage 1 数据管线无关。

**修法**: Stage 2 引擎层开发顺手清。不属于 Stage 1 责任。

## 关联文档

- 复审报告：[`2026-05-24-stage1-review.md`](2026-05-24-stage1-review.md)
- Stage 1 changelog：[`../changelog/2026-05-24-stage1-complete.md`](../changelog/2026-05-24-stage1-complete.md)
- Roadmap：[`2026-05-23-day1-17-roadmap.md`](2026-05-23-day1-17-roadmap.md)
- Stage 2 brainstorm（不被本表阻断）：[`2026-05-24-stage2-brainstorm.md`](2026-05-24-stage2-brainstorm.md)
