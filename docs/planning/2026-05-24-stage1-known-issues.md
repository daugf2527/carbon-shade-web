# Stage 1 known issues — 已知问题清单（2026-05-24）

> 由 [`2026-05-24-stage1-review.md`](2026-05-24-stage1-review.md) 复审产出。**Stage 1 在带这 3 项 P0 + 3 项 P1 + 3 项 P2 的状态下被 sign-off**。Stage 2 brainstorm 阶段允许并行思考，但 **Stage 2 实施开工前 P0 必须先解**。
>
> 处理责任：进入 Stage 2 第一个 system 实施前的 prep work。
>
> 入档原因：用户选择 sign-off Stage 1，把 P0 进 backlog 不阻断 Stage 2 brainstorm。
>
> **2026-05-24 22:00 状态更新**：所有 P0、P1-1、P1-3、P2-1 均已 RESOLVED（commit `2539b9c` + 后续修复）；新发现 typed-cell 适配漏洞 B1/B2 已修，B3 经实测撤回（无 bug）。新增 `tests/static/dnf-native-typed-cell-regression.test.ts` 守 ChrParser matrix + DgnParser mat 接 typed cell（3/3 passed）。Baseline 重跑通过：11 个独立 player shard、0 dup paths、0 parse/validation errors。剩余 open：P1-2 / P2-2 / P2-3。

## P0 — 阻塞 Stage 2 实施

### P0-1: RuntimeExporter `players/<job>.json` path 冲突 ✅ RESOLVED (commit `2539b9c`)

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

**采用修法 B**（扁平命名）：`chrJob()` 拆为 `chrShardKey()` (取 basename → 11 独立 shard) + `chrParentJob()` (取父目录 → 共享子资源前缀)。`PlayerRuntimeShape` 加 `parentJob` 字段，consumer 仍能恢复 resource-sharing key。`H15-11` regression test 守住 invariant：同父目录多 chr 写独立 shard + manifest 无 dup paths。

**Verified (2026-05-24 22:00)**: baseline 重跑后 11 个独立 player shard 全归档，0 dup paths，每个 shard 真实大小不一（atmage 184KB / creatormage 102KB / swordman 275KB），证实 sub-class 数据未丢失。

### P0-2: manifest.files dup entries ✅ RESOLVED (commit `2539b9c`)

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

**修法**: 与 P0-1 一并修（消除 path collision 后自然消除 dup entries）。已 verified：`dist-manifest-stage1-baseline.json` 现 15 entries 全 unique。

### P0-3 (软): dist/data/ 实物不在工作树 ✅ RESOLVED (commit `2539b9c` + .gitignore whitelist)

**位置**: `.gitignore` 整体忽略 `dist/` / `verification/`

**症状**: `dist/data/` 目录在当前工作树不存在。只有 `verification/dist-manifest-stage1-baseline.json` 是 manifest 副本。reviewer 无法直接 sample shard 内容（如 swordman.json 的 sourceProvenance / Tier-3 标记结构）。

**复现方式**:
```bash
DNF_PVF_PATH=/path/to/Script.pvf node scripts/stage1-baseline.mjs
```

**Stage 2 影响**: 不直接阻塞代码，但 Stage 2 brainstorm 时讨论 consumer surface 字段没法对照实物。

**修法**: `stage1-baseline.mjs` 把 `dist/data/*` copy 到 `verification/baseline-shards/`（commit `2539b9c`），`.gitignore` 用 `verification/*` 通配 + 白名单让 `verification/baseline-shards/**` 进 git。reviewer 现在可直接读 11 个 player shard 实物。

## 新发现 — typed-cell 适配漏洞 (audit F4 ↔ B3 冲突)

> 2026-05-24 22:00 验证 baseline 重跑时实测发现。根因：commit `bcaf91e` 的 audit F4 把 `?? ""` silent coerce 改成 hard throw，但同期 audit B3 把 C++ `printLeafValue` 改成 always-typed `{t,v}` 后，F4 设的 invariant "Real PVF emits pure-str cells" 已不成立。同类 hard throw 漏适配。

### B1: ChrParser.parseWeaponWav typed cell ✅ RESOLVED (今日)

**位置**: `src/dnf-native-combat/data/parsers/ChrParser.ts:214/220`

**症状**: `typeof row[0] !== "string"` 拒了 typed cell `{t:"str",v:"r_dagger"}`。实测 thief.chr 真 PVF mat cell 即此格式 → baseline 重跑挂在 thief.chr，整个 EXPORT 跳过。

**修法**: 新增 `parserUtils.extractLeafString` (镜像 `extractLeafNumber`)，接 bare 与 typed 双格式。matrix 分支改用 helper。

### B2: DgnParser.parseMapSpecification typed cell ✅ RESOLVED (今日)

**位置**: `src/dnf-native-combat/data/parsers/DgnParser.ts:187`

**症状**: `typeof cell !== "number"` 拒了 typed cell `{t:"int",v:1}`。实测 jungle.dgn 真 PVF mat cell 即此格式 → 同样阻塞 baseline。

**修法**: 改用已存在的 `extractLeafNumber` (它已支持双格式)。

### B3 (误判): AniParser hitbox row typed cell — 无 bug

**位置**: `src/dnf-native-combat/data/parsers/AniParser.ts:82`

**初判**: `typeof row[i] !== "number"` 同样模式，以为也漏适配 typed cell。

**实测撤回**: 用 `dnf-extract --file character/swordman/animation/attack1.ani` 提取真 PVF 数据，确认 .ani hitbox 仍 emit bare numbers `[-30,-5,-6,30,10,107]`。C++ B3 audit 改的是 `printLeafValue` 在 PvfDocument vec/mat leaf 输出格式，**.ani 走独立 `PvfAnimation` 流程不受 B3 影响**。AniParser 的检查正确，无须改。

**回归保护**: `tests/static/dnf-native-typed-cell-regression.test.ts` 守 ChrParser matrix + DgnParser mat 接 typed cell，3/3 passed。不覆盖 AniParser（因为 .ani 不该走 typed-cell 路径）。

## P1 — 不阻塞但应处理

### P1-1: dungeons baseline 0 覆盖 ✅ RESOLVED (commit `2539b9c`)

**位置**: `scripts/stage1-baseline.mjs:39-63` `CURATED_FILES`

**症状**: curated 列表含 1 个 .map 但 0 个 .dgn，Stage 2 DungeonRuntimeShape 没有 baseline 可对照。

**修法**: 加入 `dungeon/act3/jungle.dgn`。Verified：`baseline-shards/dungeons/jungle.json` 已生成。

### P1-2: dnf-extract `--list` warm-cache 4× 性能回归 — Open

**位置**: `tools/dnf-porting-src/` 源码（具体哪个 commit 引入未定位）

**症状**: warm-cache `--list` 从 2.5s → 10s，4× 退步。`a05da0b` commit message TODO，未修。

**修法**: 跑 `node --prof tools/dnf-extract.exe --pvf … --list`，profile 之后定位热点。

### P1-3: changelog "Known debt #6" 过时 ✅ RESOLVED (commit `2539b9c`)

**位置**: `docs/changelog/2026-05-24-stage1-complete.md` "Known debt going into Stage 2" 第 6 项

**症状**: 写 "Validator schema check is hand-rolled — chose this over Zod"。实际 `validator.ts:31` `import { z } from "zod"`，commit `bcaf91e` 标题就是 "Zod validator"。debt 列项过时。

**修法**: 已在 commit `2539b9c` 中标记为 "已迁 Zod (commit bcaf91e)，debt 关闭"。

## P2 — 信号/清理

### P2-1: CLAUDE.md 30/31 滞后 ✅ RESOLVED (今日)

**位置**: `CLAUDE.md` "Current state" 段

**症状**: 写 "30/31 completion gates green"，实际 `npm run completion` 31/31。

**修法**: 一字之差，改为 "31/31 completion gates green"。

### P2-2: audit-verify 引文行号偏差 — Open

**位置**: `verification/audit-2026-05-24-03-36-55-fixverify/agent-ts-parser-truth-fixverify.md` ImgParser:149-159 finding

**症状**: agent 引用 `ImgParser.ts:149-159` 但 fix 实际范围是 line 149-164（`Audit ts-parser-truth F1` 注释 + hard throw）。`audit-verify.mjs` 报 CITATION_DRIFT，但 fix 本身是真实存在的。

**修法**: 让 `audit-verify.mjs` 在 evidence_excerpt 检查时允许 ±10 行 fuzzy match，或者要求 agent 引文必须 cover 完整 fix block。

### P2-3: knip 未用项 — Open

**症状**: `npm run analyze` → knip 报 24 unused exports + 48 unused types。大部分在 Phaser 渲染层（`src/game/`、`src/combat/`），与 Stage 1 数据管线无关。

**修法**: Stage 2 引擎层开发顺手清。不属于 Stage 1 责任。

## 关联文档

- 复审报告：[`2026-05-24-stage1-review.md`](2026-05-24-stage1-review.md)
- Stage 1 changelog：[`../changelog/2026-05-24-stage1-complete.md`](../changelog/2026-05-24-stage1-complete.md)
- Roadmap：[`2026-05-23-day1-17-roadmap.md`](2026-05-23-day1-17-roadmap.md)
- Stage 2 brainstorm（不被本表阻断）：[`2026-05-24-stage2-brainstorm.md`](2026-05-24-stage2-brainstorm.md)
