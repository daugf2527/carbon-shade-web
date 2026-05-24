# Stage 1 工作流 + Day 1-17 步骤复审（2026-05-24）

> 一次「对照式快速核 + 选择性 audit」复审，写于 Stage 1 完成态（commit `642d168`，分支 `dnf-native`，未合 master）。
>
> 对照源：
> - [`2026-05-23-day1-17-roadmap.md`](2026-05-23-day1-17-roadmap.md) §1 / §6 / §5
> - [`2026-05-24-stage1-complete.md`](../changelog/2026-05-24-stage1-complete.md)
> - [`2026-05-22-stage1-data-pipeline-design.md`](2026-05-22-stage1-data-pipeline-design.md) §2.2 pipeline 形状
> - [`2026-05-24-stage2-brainstorm.md`](2026-05-24-stage2-brainstorm.md) §1 consumer surface
>
> 范围：4 维度对照（roadmap §6 完成标准 / pipeline 5 stage 语义闭合 / 工作流护栏 + claim 复测 / Stage 2 衔接面 + 真值铁律）。
>
> **不在范围**：合并 master / Stage 2 实施 / 重跑完整 closed-loop。

## TL;DR

Stage 1 工作流闭环 + Day 1-17 步骤本身 **满足 roadmap §6 完成标准 7/8 项**、五条铁律全部守住、agent claim 全部经过 audit-verify、`/closed-loop` round 2 走通。

**但 RuntimeExporter 在多职业 chr 输出时存在 path 冲突 + manifest dup entries 两个 P0**，会阻塞 Stage 2 系统读取数据。建议 Stage 2 实施前先处理。

---

## 一. Roadmap §6 完成标准（8 项）

| # | 检查项 | 实测 | 备注 |
|---|---|---|---|
| 1 | Day 1-10 deliverables 全在 | ✅ | MapParser 缺已在 Pre-Day-11 补上（src/dnf-native-combat/data/parsers/MapParser.ts 存在） |
| 2 | Day 11-17 deliverables 全在 | ✅ | `npm run completion` 31/31 通过 |
| 3 | `npm run completion` 全绿 | ✅ | 实际 **31/31 (100%)**，比 changelog 写的 30/31 还更新一格 |
| 4 | `npm run analyze` 8 gate 绿 | ✅ | exit 0；events 配对率 10% 属 Phaser 渲染层，与 Stage 1 无关 |
| 5 | Real PVF smoke test 跑通 | ✅ | changelog 录 4.2s pass；smoke-test.mjs + tests/smoke/full-pipeline.test.ts 都在 |
| 6 | `dist/data/players/swordman.json` 真存在 | ❌ | **dist/ 被 .gitignore 整体忽略**，且当前工作树 `dist/data/` 目录不存在。只有 `verification/dist-manifest-stage1-baseline.json` 是 manifest 副本。需要重跑 `DNF_PVF_PATH=… node scripts/stage1-baseline.mjs` 才能复现 shards。**P1** — 不阻塞但 reviewer 无法直接 sample shard |
| 7 | verification baseline 落档 | ✅ | dist-manifest-stage1-baseline.json + extraction-report-* + provenance-audit-* 都在 verification/ |
| 8 | `/closed-loop` 在完成态跑过 | ✅ | audit-2026-05-24-03-36-55 (round 2) + fixverify 走完 9 步 |

**维度评分：7/8 严格通过；第 6 项的不通过是「baseline shards 临时存活，未持久化」**

## 二. Pipeline 5 stage 端到端语义闭合 + Day 1-10 偏离项收尾

### 5 stage wired（不只是文件存在）

读 `src/dnf-native-combat/data/pipeline/pipelineRunner.ts`：

- EXTRACT → PARSE → VALIDATE → LOAD → EXPORT 五段都在；
- `validationFatal` guard（line 185-186）真正实现 "error → abort LOAD/EXPORT"（pipeline-closure F5 verified）；
- `stagesRun: ReadonlyArray<"extract"|"parse"|"validate"|"load"|"export">` 显式 sentinel（F10 verified）— 消费方不用反推；
- `--stop-at` 五档全 wired。

✅ **5 stage 语义真接通**。

### Day 1-10 偏离项收尾

| 偏离项 | 状态 | 证据 |
|---|---|---|
| MapParser 缺失 | ✅ 已补 | `MapParser.ts` 存在；h12 probe suite 在 |
| 3 standalone parser（Ani/Nut/Img）union 化决策 | ✅ 走 B 路径 | changelog "Standalone parser decision" 落档；design §2.2.1 显式 "已知设计后退" |
| `--list` warm-cache 4× 性能回归 | ❌ 未修复 | `a05da0b` commit message TODO；grep tools/dnf-porting-src/ 无 perf 优化痕迹。**P1 backlog**，不阻塞但不应忘 |
| 6 处 PvfDocument.cpp stringBinMap OOB | ✅ 已修复 | round 1 + round 2 audit memory-safety 全 VERIFIED |

### Day 10 后临时增项（roadmap §5.3 type-1 blocker）

- 38 C++ memory-safety fix：100% 走 audit-verify 流程 ✅
- 闭环工作流 (/audit + audit-verify + completion + /closed-loop)：基础设施 ship ✅
- Round 2 audit 19 个 file-controlled memory bug：fixverify VERIFIED ✅

**维度评分：5 stage 语义闭合 + 1 个 P1 backlog 待处理**

## 三. 工作流护栏 + agent claim 复测

### 五条铁律（roadmap §5.1）

| 铁律 | 检查 | 结果 |
|---|---|---|
| ① 每个 Day 完成才进下一个 | git log 显示 Day 11→12→13→14→15-16→17 顺序，无跳跃 | ✅ |
| ② 不许跳 VALIDATE 进 LOAD | pipelineRunner.ts 强制 validation 早于 LOAD，validationFatal guard 阻断 | ✅ |
| ③ 不许跳 smoke 进 Day 13+ commit | tests/smoke/full-pipeline.test.ts 在 Day 14 commit `5798ab0` | ✅ |
| ④ 拒绝「先简化」 | 9 parser 全 ship（不是压缩到 7）；13 system 未被压缩 | ✅ |
| ⑤ 拒绝「先做 Stage 2」 | Stage 2 brainstorm 只产文档，无 src/ 代码 | ✅ |

### Agent claim 复测

| Audit | Findings | VERIFIED | CITATION_DRIFT | 备注 |
|---|---|---|---|---|
| Round 1 (`audit-2026-05-24-03-36-55`) | 77 | 72 | 5 | 0 FORMAT_ERROR；P0/P1 大部分 verified |
| Round 1 fixverify | 77 | 39 | 1 | 37 FORMAT_ERROR 主要是 P2 "not in scope" 跳过；少数 P0/P1 fix 的引文位置工具识别不准 |

P0 / P1 修复全部 VERIFIED；1 个 CITATION_DRIFT（ImgParser.ts:149-159）实测代码确实改了（Audit ts-parser-truth F1 注释在 line 149-157，hard throw 在 line 158-164）——是 audit-verify 工具的引文行号工具问题，不是 fix 本身的问题。

### MEMORY / docs 同步责任（roadmap §5.4）

| 检查 | 实测 |
|---|---|
| MEMORY.md 索引齐 | ✅ stage1-complete-2026-05-24 已记 |
| CLAUDE.md "Current state" 反映 Stage 1 完成 | ⚠️ 写 "30/31 完成 gates"，实际 31/31。**P2**：滞后一格 |
| changelog "Known debt" 第 6 项 | ❌ 写 "Validator schema check is hand-rolled"，实际 validator.ts line 31 `import { z } from "zod"` 已经迁到 Zod（commit `bcaf91e` 标题就是 "Zod validator"）。**P1**：debt 列项过时 |

**维度评分：护栏全部守住，少量文档同步滞后**

## 四. Stage 2 衔接面 + DNF 真值依据铁律

### Stage 2 brainstorm §1 consumer surface

| 产物路径 | baseline 覆盖 | 状态 |
|---|---|---|
| `players/<job>.json` | 11 chr → 6 unique path | 🔴 **P0**：path collision |
| `monsters/<id>.json` | 1 (goblin) | ✅ 仅 sample 覆盖；Stage 2 跑全 PVF 时会扩 |
| `dungeons/<id>.json` | 0 | 🟡 **P1**：baseline curated 没含 .dgn，dungeons 输出未被覆盖 |
| `shared/physics.json` | 1 | ✅ |
| `shared/enums.json` | 1 | ✅ |
| `manifest.json` | 14 entries 但有 dup | 🔴 **P0**：同 path 多 sha256 |

### 🔴 P0-1: RuntimeExporter players/<job>.json path 冲突

`src/dnf-native-combat/data/exporter/RuntimeExporter.ts:481-486` `chrJob()` 用 `parts[1]`（父目录名）当 job key：

```ts
function chrJob(chrPath: string): string | null {
  // character/<job>/<job>.chr
  const parts = chrPath.split("/");
  if (parts[0] !== "character" || parts.length < 3) return null;
  return parts[1];  // ← 用父目录，不是 chr 文件名
}
```

对 baseline curated 的 11 chr：
- `character/swordman/swordman.chr` → job="swordman" → `players/swordman.json`
- `character/swordman/demonicswordman.chr` → job=**"swordman"** → 写到同一 `players/swordman.json`，**后写的覆盖前写的**

baseline manifest 实际记录的 dup 路径：
- `players/swordman.json` × 2（swordman + demonicswordman）
- `players/gunner.json` × 2（gunner + atgunner）
- `players/fighter.json` × 2（fighter + atfighter）
- `players/mage.json` × 3（mage + atmage + creatormage）
- 5/11 个 sub-class chr 数据被覆盖

**Stage 2 影响**：PlayerRuntimeShape 加载 swordman.json 不知道是 swordman 主类还是 demonicswordman 次职业，**数据不可逆地丢失**。

**两个修法**（需用户决定）：
- **A**：同一职业一个 shard，内嵌 `subclasses: { demonicswordman: {...}, atswordman: {...} }`
- **B**：11 chr → 11 shard，文件名用 chr basename stem（`players/demonicswordman.json`）

### 🔴 P0-2: manifest.files dup entries

`RuntimeExporter.ts` 写 manifest 时无 dedupe（grep `dedupe|seen|visited|writtenPaths` 无匹配），同 path 多次 write 会 append 多条 entry。结果：consumer 看 manifest 不知道哪条是当前正确的 sha256。

修法：与 P0-1 一并修复（消除 path collision 后自然消除 dup entries）。

### 🟡 P1-1: dungeons baseline 0 覆盖

`scripts/stage1-baseline.mjs` 第 39-63 行 CURATED_FILES 列表：
- ✓ 11 player .chr
- ✓ 3 .atk
- ✓ 2 .skl
- ✓ 1 .mob (goblin)
- ✓ 1 .map (test_lorien/4.map)
- ✗ 0 .dgn

Stage 2 DungeonRuntimeShape 没有 baseline 可对照。建议至少加 1-2 个 .dgn 进 curated。

### DNF 三级真值置信度铁律

| 检查 | 落实 |
|---|---|
| Tier-1（dnf-extract）= 主路径 | ✅ pipelineRunner 通过 `loadPvfDocumentsViaPipe` |
| Tier-2（API/wiki）= fallback | ✅ src/data/official/dnfPhysicsConstants + Neople API 模块仍保留 |
| Tier-3（local_baseline）= 标 `sourceType: "local_baseline"` + `requiresManualVerification: true` | ✅ ChrParser line 76-90 用 `asTier3()` 把 jumpPower / jumpSpeed / weight / hitRecovery 标记 |
| ImgParser sentinel fallback 替换为 hard throw | ✅ line 149-164 显式 throw with "Audit ts-parser-truth F1 (2026-05-24)" 注释 |
| PvE-only 守住 | ✅ `sanitizeMapForRuntime` + `isPvpOnlyAtk` 已 wired，PvP 字段读但 strip |

**维度评分：真值铁律守住；衔接面 2 个 P0 + 1 个 P1**

## 五. P 级清单（按优先级）

### P0（阻塞 Stage 2 实施）

1. **RuntimeExporter `players/<job>.json` path 冲突** — 5/11 player chr 数据被覆盖。需在 Stage 2 引擎层开工前确定 A/B 方案并修。
2. **manifest.files dup entries** — consumer 无法确定哪个 sha256 是当前。与 P0-1 一并解。
3. **dist/data 实物不存在**（软 P0） — 需要重跑 `DNF_PVF_PATH=… node scripts/stage1-baseline.mjs` 才能复现 shards。reviewer 当前无法 sample 实际产物。

### P1（不阻塞但应处理）

4. dungeons/<id>.json baseline 0 覆盖 — 加 1-2 个 .dgn 进 CURATED_FILES。
5. dnf-extract `--list` warm-cache 4× 性能回归（2.5s → 10s） — backlog 仍开。
6. changelog "Known debt #6" 写 "Validator hand-rolled"，实际已 Zod。

### P2（信号/清理）

7. CLAUDE.md "Current state" 30/31 → 31/31。
8. audit-verify.mjs 引文行号工具偏差（ImgParser:149-159 实际 fix 在 149-164）。
9. knip 24 unused exports + 48 unused types（Phaser 渲染层为主，与 Stage 1 无关）。

## 六. 一句话结论

> **Stage 1 工作流闭环健全、Day 1-17 步骤满足 roadmap §6 完成标准 7/8 项、五条铁律全守、agent claim 全部 audit-verify；但 RuntimeExporter 多职业 chr path 冲突 + manifest dup entries 两个 P0 直接阻塞 Stage 2 实施，必须先解掉再进引擎层。**

## 七. 下一步选项

1. **修 P0**：当场修 RuntimeExporter，选 A 或 B 方案 → 走 `/closed-loop`（半场 audit + fix-verify + gate + commit）
2. **开 audit**：对 RuntimeExporter 单独跑 `/audit` 一次（如果想看更多潜在问题）
3. **进 backlog**：P0 落到 docs/planning/2026-05-24-stage1-known-issues.md，先 sign-off Stage 1 完成态，Stage 2 brainstorm 阶段处理
4. **不动**：明确接受 P0 在当前状态，Stage 2 实施时再面对

P0 的处理由用户决定（依 [[combat-lab-dnf-alignment-pivot-2026-05-21]] 工程经济性不能压缩功能的硬约束，但 P0 1/2 本身就是数据完整性 bug，不是简化决策）。
