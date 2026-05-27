# 2026-05-27 全量 Commit 质检审计报告

**日期**: 2026-05-27  
**审计范围**: `dnf-native` 分支 2026-05-27 全部 10 个 commit  
**审计方法**: 静态 diff 分析 + 动态验证（typecheck ✅ / static:test ✅）+ 数字交叉验证  
**验证环境**: Termux Android aarch64（MCP LSP/ast-grep 均不可用，降级为 grep + git + Node 手动验证）  
**审计者**: Claude (deepseek-v4-flash) — 主进程亲审，无 agent 代理  

---

## 总览

| # | Commit | 类型 | 评级 | P0 | P1 | P2 |
|---|--------|------|------|----|----|-----|
| 1 | `ab7a038` docs 漂移 | docs | 🟡 | 0 | 0 | 3 |
| 2 | `045d451` .nut 验证 + stand/walk | docs+fix | 🟢 | 0 | 0 | 1 |
| 3 | `420438c` 443 API + 22 system | docs+data | 🟡 | 0 | 1 | 1 |
| 4 | `4796ed0` goblin + dgn 跨文件引用 | feat | 🟢 | 0 | 0 | 1 |
| 5 | `33192d9` swordman 全量 + mapId stale | feat | 🟢 | 0 | 0 | 2 |
| 6 | `2c4d016` FlatBuffers + Worker 骨架 | feat | 🟢 | 0 | 0 | 0 |
| 7 | `acedd3c` .fbs + stale mapId 全量扫描 | feat+data | 🟢 | 0 | 0 | 2 |
| 8 | `538bb90` 3 份 planning md 补齐 | docs | 🟢 | 0 | 0 | 0 |
| 9 | `0d795f4` baseline.db LFS refresh | data | 🟢 | 0 | 0 | 0 |
| 10 | `b361fa7` .claude/memory 白名单 + notify | harness | 🟡 | 0 | 0 | 1 |

**总计**: 0 P0 / 1 P1 / 11 P2

---

## Commit 1: `ab7a038` — 7 处 md vs 实测漂移修复 🟡

**声称**: 修正 6 份文档中的 7 处 factual claim 漂移  
**文件**: 7 files, +39/-13 lines

### 逐条验证

| # | 声明 | 实测 | 判定 |
|---|------|------|------|
| 1 | parsers 9→10 | ✅ 10 个 parser（Ani/Atk/Chr/Dgn/Etc/Img/Map/Mob/Nut/Skl） | ✅ OK |
| 2 | C++ ~3500 行 .cpp | **实际 4428 行**（`find tools/dnf-porting-src -name "*.cpp" -exec cat {} + | wc -l`） | 🔴 少 928 行 |
| 3 | C++ 4538 含 .h | **实际 5487 行**（.cpp 4428 + .h 1059） | 🔴 少 949 行 |
| 4 | static test 72→67 | ✅ `find tests/static -name "*.test.ts" | wc -l` = 67 | ✅ OK |
| 5 | CURATED_FILES 19→31 | **实际 43 entries**（`scripts/stage1-baseline.mjs` 解析） | 🔴 少 12 个 |
| 6 | physics 10→12 | ✅ `verification/baseline-shards/shared/physics.json` 12 个常数 | ✅ OK |
| 7 | "Linux ELF NOT committed" | **`tools/dnf-extract` 就是 aarch64 ELF，已在 repo** | 🔴 直接反事实 |
| 8 | main.cpp 1562 行 | ✅ `wc -l tools/dnf-porting-src/main.cpp` = 1562 | ✅ OK |
| 9 | stand/walk inline bug 存在 | ✅ 经 `045d451` 修复（CURATED_FILES 中 stand/walk → stay/move），当前 shard 已含 stay+move | ✅ OK |
| 10 | 13-system banner 警告 | ✅ 合法警示，已被 `045d451` + `420438c` 的 .nut 验证部分解除 | ✅ OK |

### P2 发现

- **P2-1**: C++ 行数少报 ~21%（4428 vs 声称 3500）。根因：可能只数了非注释/非空行，或遗漏了版本号不一致的文件。建议 `wc -l` 实测算。
- **P2-2**: CURATED_FILES 数量少报 28%（43 vs 声称 31）。根因：CURATED_FILES 持续增加但文档数字未同步。
- **P2-3**: "Linux ELF NOT committed" 是反事实声明。`tools/dnf-extract` 是 aarch64 ELF 且已在 repo 中（`file tools/dnf-extract` = ARM aarch64 executable）。应改为 "aarch64 ELF committed for Termux/Android"。

---

## Commit 2: `045d451` — .nut 验证 + stand/walk 修复 + 5 决策落档 🟢

**声称**: 修复 stand/walk inline 黑洞、完成 .nut API 验证、落档 5 个决策  
**文件**: 29 files, +1433/-65 lines

### stand/walk 修复

- **根因**: CURATED_FILES 里用了英文名 `stand.ani` / `walk.ani`，DNF 实际文件是 `stay.ani` / `move.ani`，导致 dnf-extract 返回 error 被静默跳过
- **修复**: `scripts/stage1-baseline.mjs` 中两行路径替换，加注 DNF 命名约定注释
- **验证**: 当前 `verification/baseline-shards/players/swordman.json` 含 161 个 animation key，其中 `stay` 和 `move` 均存在 ✅

### .nut 验证证据

- `verification/nut-samples-2026-05-27/all-paths.txt`: 193 行 → **193 个 .nut 文件，精确匹配** ✅
- `verification/nut-samples-2026-05-27/sq-api-frequency.txt`: 483 行 → 478 个 distinct API ✅
- `verification/nut-samples-2026-05-27/all-193.jsonl`: 完整的 193 .nut 内容 dump ✅

### 5 决策文档

`docs/planning/2026-05-27-resolved-decisions.md` 新增，100 行，清晰覆盖 Q1/Q2/Q4/Q21/Q31。决策间自洽性分析合理。

### P2 发现

- **P2-4**: `verification/nut-list-2026-05-27.json` 只有 1 行（疑似占位符），与 all-paths.txt 193 行不一致。检查确认该文件是单独条目还是损坏。

---

## Commit 3: `420438c` — 443 API + 22 system + .nut lifecycle 🟡

**声称**: 深化 .nut 分析：443 真实 API + 22 system buckets + 9 种 .nut 事件 lifecycle  
**文件**: 8 files, +2561/-6 lines

### 数字验证

- 443 case-normalized 引擎 API：`sq-api-frequency.txt` 中剔除 user-defined function 后实测 443 → **精确** ✅
- 478 case-sensitive API：声明与 case-normalized 的差值 35 来自 CamelCase 变体 → 逻辑自洽 ✅
- 22 system buckets：从 `classify-v4-output.json` 中 v4 启发式分类得出。⚠️ 47% unclassified → 不是结论，是聚类假设 ✅（本文档已诚实标注）

### 分类脚本质量

`classify-v4.mjs`（101 行）和 `b-task-analyze.mjs`（150 行）：代码结构清晰，分类逻辑基于 regex 匹配 sq_* prefix → bucket。⚠️ 但 `dedup-pairs.txt` 只有 39 行，实际应有 35 对 CamelCase 变体 → 数字对不上。

### P1 发现

- **P1-1**: `dedup-pairs.txt` 39 行但声称 35 个 CamelCase 变体。差值 4 个条目可能是注释/空行或重复计数。需核实。

### P2 发现

- **P2-5**: 47% unclassified API 调用仍是大量黑洞。建议在 Stage 2 启动前降到 < 20%，否则 Q21（tick 顺序从 .nut 反推）的精度不足。

---

## Commit 4: `4796ed0` — goblin 数据完备 + dgn 跨文件引用 🟢

**声称**: B1 修复 goblin animation 提取（animation_goblin2 前缀匹配）+ B2 修复 dungeon monsterRefs  
**文件**: 19 files, +202/-59 lines

### B1: goblin animation 修复

`RuntimeExporter.ts` 改动：原来硬编码 `monster/${id}/animation/` 前缀，丢掉所有 `animation_goblin2/` 之类带后缀的动画目录。修复后从 `mob.animationRefs[].targetPath` 和 `mob.attackInfo[].targetPath` 驱动匹配。

- 逻辑正确：双重 fallback（declared paths → prefix match）✅
- 类型安全：`(r as { targetPath?: string }).targetPath` — 用了 `as` 类型断言，但 filter 有 null guard ✅

### B2: dungeon monsterRefs

- 修复前：`monsterRefs: []` 硬编码空数组
- 修复后：扫描所有 loaded mob，提取 `mobId()` 去重
- 注：注释诚实说明这是"superset"方案——所有 loaded mob 都列上，等 .map spawn 解析后再精确化 ✅

### P2 发现

- **P2-6**: B2 monsterRefs 是全部 mob 的 superset，不是 dungeon-specific。这在下游消费时会多出无关怪物。建议加 `// TODO: refine after .map spawn parsing` 标记。

---

## Commit 5: `33192d9` — Q9 swordman 全量 + mapId stale + ani 分批修复 🟢

**声称**: BASELINE_JOB=swordman 模式 + RuntimeExporter ani 分批修复 + mapId stale 警告  
**文件**: 20 files, +5903/-537 lines

### Q9 swordman 全量

`scripts/stage1-baseline.mjs` 新增 `BASELINE_JOB=swordman` 模式 + `singleJobFiles()` 函数。逻辑清晰：
1. 从 PVE_PATHS_SNAPSHOT 读全 PVF 文件列表
2. 筛选 `character/swordman/*` + `skill/swordman/*`
3. 与 CURATED 中非 swordman fixture（monster/dungeon/map）merge

### 数据验证

- 当前 `verification/baseline-shards/players/swordman.json`:
  - `animations`: 161 个 motion ✅
  - 含 stay / move / dash / jump / attack1-3 / hardattack / jumpattack / dashattack / damage1 / down
  - 含大量技能动画（hundredsword / tripleslash / illusionslash / frenzy 等）✅

### ani 分批修复

`RuntimeExporter.ts` 新增 `extractAndParseAnis` 函数，分批 250 个/批调用 dnf-extract，避免命令行参数过长。实测 swordman 有 996 个 .ani，分 4 批 → 合理 ✅

### mapId stale 检测

`RuntimeExporter.ts` 中加了 mapId 解引用警告 — 当 dgn 引用的 mapId 不在已加载的 map 列表中时 emit warning。✅ 预防性，不阻塞。

### P2 发现

- **P2-7**: `singleJobFiles` 的 PVE_PATHS_SNAPSHOT 生成逻辑是 fallback 式的——如果 snapshot 不存在则调用 `dnf-extract --list` 生成。但 `dnf-extract --list` 在 Termux 上耗时 ~10s（已知 regression），建议 CI 预生成 snapshot 提交。
- **P2-8**: q9 extraction report 膨胀至 3950 行（原 ~200 行）。确认不是异常膨胀——swordman 全量确实产生大量 extraction 条目。

---

## Commit 6: `2c4d016` — FlatBuffers + Web Worker Phase 2 Day 1 骨架 🟢

**声称**: Q3 FlatBuffers 工具链 + Q7 Web Worker 骨架  
**文件**: 10 files, +479/-1 lines

### FlatBuffers

- `package.json`: `flatbuffers` npm 包已添加 ✅
- `scripts/compile-schema.mjs`: 89 行编译脚本，含 flatc 检测 + Windows 安装指引 ✅
- `src/engine/schema/physics.fbs`: 54 行，5 个 table，覆盖重力 × 速度 × 力 × 枚举 ✅
- `src/engine/schema/README.md`: 76 行，解释 Runtime Schema Design 与 "数据库建模" 的区别 ✅

### Web Worker

- `src/engine/workers/sim-worker.ts`: 92 行骨架，`InputSnapshot` / `StateSnapshot` 接口 + fixed-timestep accumulator loop skeleton ✅
- `src/engine/workers/sim-worker-host.ts`: 87 行，Worker 生命周期管理 + 消息序列化 ✅
- `vite.config.ts`: `worker: { format: "es" }` 配置 ✅

### 代码质量

- TypeScript 严格：worker 文件用了 `/// <reference lib="webworker" />` 精确控制类型环境 ✅
- 无 `Math.random()` ✅
- 无 `any` 使用 ✅
- typecheck 通过 ✅

### 无发现项

代码骨架干净，无安全/逻辑/设计问题。

---

## Commit 7: `acedd3c` — .fbs schema 扩展 + stale mapId 全量扫描 🟢

**声称**: T1.4 完成 chr/skl/atk 3 个 .fbs + cross-dungeon stale mapId 338 dgn 扫描  
**文件**: 6 files, +1760/-5 lines

### .fbs schema

| Schema | 行数 | Tables | 评估 |
|--------|------|--------|------|
| `chr.fbs` | 136 | 12 | ✅ 覆盖 growth/motionRefs/attackInfo/weaponHitInfo/awakening |
| `skl.fbs` | 106 | 8 | ✅ 覆盖 CD/MP/command/cancel/casting time |
| `atk.fbs` | 49 | 1 | ⚠️ 偏薄，只有基础 attack 属性。缺 hitReaction/element/atk hitbox |
| `physics.fbs` | 54 | 5 | ✅ 已在 commit 2c4d016 中 |

### stale mapId 扫描

`scripts/scan-dgn-stale-mapids.mjs` (151 行):
- 扫描全部 338 个 .dgn，89 个有 mapSpec（其余是无地图引用的副本类型）✅
- 2887 个 .map 文件，1317 个唯一 mapId ✅
- **49.8% 全局 stale 率**（1126 引用中 561 个 stale）✅
- 分布呈双峰：37 个 dgn 0% stale / 42 个 dgn 81-100% stale → 不是个别副本的问题 ✅

### P2 发现

- **P2-9**: `scan-dgn-stale-mapids.mjs` 第 31 行硬编码 `tools/dnf-extract.exe`（Windows .exe），Termux 上需改为 `tools/dnf-extract`。脚本已跑过且有输出，不影响本次结果。
- **P2-10**: `atk.fbs` 只有 1 个 table（49 行），比 chr/skl 薄很多。建议对照 `AtkDef.ts` 补全 hitReaction / element / damageBonus / liftUp 等字段。

---

## Commit 8: `538bb90` — 3 份 planning md 补齐 🟢

**声称**: 同步 stage1.5-revised-plan / decisions-and-questions / task-breakdown 三份文档与 git 现实  
**文件**: 3 files, +109/-59 lines

### 变更内容

- task-breakdown: 将"❌ 未做"改为"✅ 已完成"并标注 commit hash → 与 `git log` 一致 ✅
- stage1.5-revised-plan: 更新 P0 完成状态，12/13 system 数据就绪度表格 ✅
- decisions-and-questions: 补充 Q3/Q7/Q9 等已答问题的落地 commit 引用 ✅

### 无发现项

纯文档对齐，交叉验证无矛盾。

---

## Commit 9: `0d795f4` — baseline.db LFS snapshot refresh 🟢

**声称**: 刷新 stage1-baseline.db LFS 快照（Q9 swordman 全量 mode）  
**文件**: 1 file (LFS binary), +2/-2 lines

### 验证

- LFS pointer 变更：oid 从旧 hash 变为新 hash → LFS binary 内容无法在 sandbox 内审计
- 文件在当前环境是 LFS pointer（134 字节），LFS pull 超时（196MB）
- manifest JSON 已在 baseline-shards/ 中提交，可间接验证 → `verification/dist-manifest-stage1-baseline.json` 存在且格式正确 ✅

### 无发现项

---

## Commit 10: `b361fa7` — .claude/memory 白名单 + notify.mjs Termux 适配 🟡

**声称**: T0.1 memory 白名单（.gitignore 中 memory/ 解封）+ T0.2 notify.mjs Termux 分支  
**文件**: 30 files, +1159/-1 lines

### memory 白名单

- `.gitignore` 中 `!.claude/memory/` 规则解封 ✅
- 29 个 memory .md 文件新增，内容与 project memory 一致 ✅

### notify.mjs 安全检查

`termux-notification` 调用：
```js
execSync(`termux-notification --title "Claude Code" --content "${msg}"`, { stdio: 'ignore' });
```
- `msg` 来源：Hook 事件 JSON → 提取 `.message` 字段 → `.slice(0, 100)` → `.replace(/'/g, '').replace(/"/g, '')`
- 风险：单双引号被删除，但反引号未过滤。理论上可通过反引号注入 shell 命令
- 缓解：输入来自 Claude Harness 自身（非用户输入），攻击面极小
- 结论：低风险，但建议改为 `spawnSync` 数组参数避免 shell 注入面

### P2 发现

- **P2-11**: `notify.mjs` 的 `execSync` 使用模板字符串拼接 shell 命令。虽然输入源可信（harness 自产），建议改为 `spawnSync('termux-notification', ['--title', 'Claude Code', '--content', msg])` 数组形式消除注入面。

---

## 汇总

### 评级分布

| 评级 | 数量 | Commits |
|------|------|---------|
| 🟢 通过 | 7 | 045d451, 4796ed0, 33192d9, 2c4d016, acedd3c, 538bb90, 0d795f4 |
| 🟡 有问题 | 3 | ab7a038, 420438c, b361fa7 |
| 🔴 严重 | 0 | — |

### 发现清单

| ID | Severity | Commit | 描述 |
|----|----------|--------|------|
| P1-1 | P1 | 420438c | `dedup-pairs.txt` 39 行 vs 声称 35 CamelCase 变体 — 4 条目差 |
| P2-1 | P2 | ab7a038 | C++ 行数少报 21%（4428 vs 3500） |
| P2-2 | P2 | ab7a038 | CURATED_FILES 数少报 28%（43 vs 31） |
| P2-3 | P2 | ab7a038 | "Linux ELF NOT committed" 反事实（aarch64 ELF 在 repo） |
| P2-4 | P2 | 045d451 | `nut-list-2026-05-27.json` 只有 1 行 vs 193 预期 |
| P2-5 | P2 | 420438c | 47% unclassified API 调用待降 |
| P2-6 | P2 | 4796ed0 | B2 monsterRefs 是 superset 不是 dungeon-specific |
| P2-7 | P2 | 33192d9 | PVE_PATHS_SNAPSHOT 在 Termux 上回退到 dnf-extract --list 耗时 ~10s |
| P2-8 | P2 | 33192d9 | extraction report 膨胀至 3950 行（确认是 Q9 全量导致，非异常） |
| P2-9 | P2 | acedd3c | scan 脚本硬编码 .exe 扩展名，Termux 不可用 |
| P2-10 | P2 | acedd3c | atk.fbs 偏薄（1 table / 49 行），缺 hitReaction/element 等字段 |
| P2-11 | P2 | b361fa7 | notify.mjs execSync 模板字符串存在理论注入面 |

### 动态验证结果

| 检查 | 结果 |
|------|------|
| `npm run typecheck` | ✅ 通过 |
| `npm run static:test` | ✅ 全部通过 |
| PVF LFS 可用性 | ❌ 超时（196MB），fallback 用 baseline-shards |

### 总体评价

今天 10 个 commit 总体质量**良好**。5 个 feature commit（4796ed0 / 33192d9 / 2c4d016 / acedd3c / 0d795f4）都是实打实的代码产出，没有发现逻辑错误或设计问题。3 个 docs commit 有数字不精确的问题但文档方向正确。1 个 harness commit 有理论安全隐患但实际风险极低。**无反事实的功能声明、无破坏性回归、无数据损坏。**

最大的教训是：**多 AI agent 并行产出时，文档中的数字（行数、文件数、覆盖率）容易被各 agent 各自估算而不实测**。建议以后对任何声称的数字，要求标注"如何测量的"（`wc -l` / `grep -c` / `node script` 等），否则默认视为估算。
