# 事实-SOT 映射表（2026-05-28）

> **目的**：每条核心事实指定 **单一真源 (Single Source of Truth)**，其他方写 derived view 必须 link 不放数字——否则改 SOT 一处剩 N 处不知，制造横向漂移。
>
> 与 `scripts/consistency-check.mjs` 配套：consistency-check 扫"derived 是否还跟 SOT 一致"。

---

## 一、数字事实

| 事实 | SOT (权威源) | Derived 引用处 | consistency-check 覆盖 |
|---|---|---|---|
| **parser count = 10** | `src/dnf-native-combat/data/parsers/*.ts`（filesystem） | CLAUDE.md:95 "10 total" | ✅ check #1 |
| **CURATED count = 43** | `scripts/stage1-baseline.mjs` CURATED_FILES 数组 | CLAUDE.md:40 "43 curated files" | ✅ check #2 |
| **npm scripts count = 16** | `package.json` scripts 字段 | CLAUDE.md Commands 表 | ✅ check #3（覆盖率而非数量） |
| **active branch = dnf-native** | `git HEAD` | CLAUDE.md:6 "Active branch: `dnf-native`" | ✅ check #4 |
| **478 case-sensitive 引擎 API** | `docs/engineering/nut-validation-2026-05-27.md` §十 audit（行 251、行 289） | CLAUDE.md:22 / memory `22-system-truth-state.md` / `stage2-roadmap.md` / `resolved-decisions.md:51` | ✅ check #6 |
| **443 case-normalized API** | nut-validation §十 audit | 22-system-truth-state memory | ⚠️ 未覆盖 |
| **193 .nut 文件** | nut-validation §一 表格（行 15） | resolved-decisions.md / 22-system-truth-state memory / CLAUDE.md | ⚠️ 未覆盖 |
| **22 system buckets + 1 unclassified** | `verification/nut-samples-2026-05-27/classify-v4-output.json` + nut-validation §三 | 22-system-field-matrix.md / 22-system-truth-state memory / stage2-roadmap.md / CLAUDE.md | ⚠️ 未覆盖 |
| **static test count = 67** | `tests/static/**/*.test.ts`（filesystem） | (无 doc claim) | ✅ check #5（informational） |
| **memory file count = 29** | `~/.claude/projects/.../memory/*.md`（filesystem） | MEMORY.md 索引 | ✅ check #7 |
| **.fbs count = 4** | `src/engine/schema/*.fbs`（filesystem） | CLAUDE.md:15 / stage2-roadmap.md | ✅ check #11 |
| **_generated.ts count = 0** | `src/engine/schema/*_generated.ts`（filesystem） | (无 doc 显式数字) | ✅ check #11 |
| **unclassified 28% unique / 2.9% calls** | nut-validation §三 / stage2-roadmap.md:29 G1 | 22-system-truth-state memory | ⚠️ 未覆盖 |
| **49.8% dgn stale** | `docs/engineering/dgn-stale-mapids-2026-05-27.md` | stage2-roadmap.md G7 / session-debrief memory | ⚠️ 未覆盖 |
| **C++ 源码 ~3500 lines .cpp / 4538 含 .h / main.cpp 1562** | `tools/dnf-porting-src/` filesystem 求和 | CLAUDE.md:98 | ⚠️ 未覆盖（数字会漂） |
| **swordman shard 81 atk + 205 skl + 161 ani** | `verification/baseline-shards/players/swordman.json` 字段 count | CLAUDE.md / 22-system-truth-state memory / stage2-roadmap.md | ⚠️ 未覆盖 |
| **dnf-extract.exe 是仓库唯一 binary** | `git ls-files tools/dnf-extract*` | CLAUDE.md:213 | ⚠️ 未覆盖 |

---

## 二、状态事实

| 事实 | SOT | Derived |
|---|---|---|
| **Stage 1 完成** | `docs/changelog/2026-05-24-stage1-complete.md` | CLAUDE.md "Current state" / memory `stage1-complete-2026-05-24.md` |
| **Stage 2 Day 1 现状** | CLAUDE.md "Current state" §Stage 2 单元格 | memory `stage2-roadmap-2026-05-27.md` "Day 1 现状"段 / docs/planning/2026-05-27-stage2-roadmap.md Phase 0 状态列 |
| **当前 active branch** | `git HEAD` | CLAUDE.md:6 |
| **master 冻结日期 = 2026-05-21** | git log commit `f8186bc` "Pivot Combat Lab to DNF alignment" + master 之后无 commit | CLAUDE.md:6 / memory `combat-lab-dnf-alignment-pivot-2026-05-21.md` |
| **目标版本 = 70-85-classic-pre-metastasis** | CLAUDE.md:24 "Target version" | memory 多处 |
| **flatc 工具链未就绪** | `which flatc` shell 命令 | CLAUDE.md:15 / docs/planning/...roadmap Phase 0 T0.1 状态 | ✅ check #15 |
| **audit 闭环率 = 47/77 FIXED**（5-24 audit） | `verification/audit-2026-05-24-03-36-55-fixverify/*.md` verdict 行 | (无 doc 总结) | ✅ check #16 |

---

## 三、决策事实

| 决策 | SOT | Derived |
|---|---|---|
| **Q1 = B（22-system 用）** | `docs/planning/2026-05-27-resolved-decisions.md` 决策矩阵 | memory `stage2-roadmap-2026-05-27.md` / `22-system-truth-state.md` / stage2-roadmap.md |
| **Q2 = C（先扩数据再做 schema）** | resolved-decisions.md | stage2-roadmap memory |
| **Q3 = A（FlatBuffers Day 1 就用）** | resolved-decisions.md | commit 2c4d016 + acedd3c / stage2-roadmap memory |
| **Q4 = A（swordman 起步）** | resolved-decisions.md | commit 33192d9 / CLAUDE.md / memory |
| **Q7 = A（Worker Day 1 分线）** | resolved-decisions.md | commit 2c4d016 / src/engine/workers/ / stage2-roadmap memory |
| **Q9 = A+B（鬼剑士优先狂战士 BASELINE_JOB 模式）** | resolved-decisions.md | scripts/stage1-baseline.mjs / memory |
| **Q21 = B（.nut 反推事件 lifecycle 非 C++ tick）** | resolved-decisions.md + nut-validation §十一 | 22-system-truth-state memory / stage2-roadmap memory / sim-worker README |
| **Q31 = B（最小闭环 = 命中→伤害→受击→HP）** | resolved-decisions.md | stage2-roadmap memory / field-matrix doc |
| **PVE-only scope, 13/22 system 不简化** | memory `feedback-dnf-pve-scope-only.md` | CLAUDE.md DNF rule / stage2-roadmap |
| **三级置信度铁律（dnf-extract > API/wiki > md/代码）** | CLAUDE.md §"DNF/DFO reference truth rule"（行 114-126） | memory `feedback-dnf-data-confidence-tiers.md` / 多 doc |
| **DNF motion 韩语命名约定（stay/move）** | CLAUDE.md §"Known pitfalls"（行 214） | memory `dnf-costume-extraction-truth.md` / session-debrief |
| **agent 默认 sonnet，禁 haiku，opus 深推理** | memory `feedback-parallel-agents-min-sonnet.md` | session-debrief / CLAUDE.md |

---

## 四、发现的 SOT 缺位（事实出现在多处，无人是 SOT）

### 高紧迫度

1. **"22 system buckets"概念本身** — classify-v4 输出 + field-matrix + truth-state memory 都在用，但 **谁是真定义 SOT 不明**。建议：把 `docs/engineering/22-system-field-matrix.md` 列为 SOT（它有具体字段），其他改 link。
2. **swordman shard 字段统计 (81/205/161)** — 4 处引用，filesystem 是真 SOT，但每处都写死数字。Stage 2 扩数据时这数字会变，需要工具化。
3. **stage2-roadmap 时间估算 "20-25 工作日"** — 只在 roadmap 一处但**没有挂 git tag / commit ref**，违反纪律 #3。建议：开 Stage 2 时打 tag `stage2-start`，每完成一 Phase 打 tag。

### 中紧迫度

4. **"Phase 0 已完成 = T0.2 (LFS) only"** — 当前散落于 CLAUDE.md / roadmap / memory。建议：roadmap Phase 0 状态列已是 SOT（commit c74a59c 加），删除其他处的 T0.x 完成度叙述，全部 link 到 roadmap。
5. **审计累积数（48 + 12）** — CLAUDE.md 写了，但具体每个 audit 在 `verification/audit-*/` 里。考虑加 `verification/audit-index.md` 当 SOT 罗列所有 audit 报告。

---

## 五、建议改进（actionable）

### 立刻可做

1. **memory `22-system-truth-state.md` 顶部加一行 "SOT = `docs/engineering/22-system-field-matrix.md`"**，body 数字改 link
2. **memory `dnf-physics-phase1-data-summary.md` 顶部加 SOT 标注**（指向 `docs/research/2026-05-21-dnf-air-physics-phase1.md`）
3. **CLAUDE.md "Current state" 表的"Day 1 = stub" 长描述太重，改成 link 到 memory `stage2-roadmap-2026-05-27.md`** —— 一处 SOT，CLAUDE.md 写 view

### 需要工具化

4. **加 consistency check #20**：扫 `docs/engineering/nut-validation-2026-05-27.md §十` 实际输出的 478 数字 + 各 derived 处的 "478"，验证 derived 都 link 而非硬数字
5. **加 consistency check #21**：扫 memory frontmatter 是否带 SOT 标注（强制纪律 #1）

### 流程

6. **新事实 claim 三步检查表**（写入 [[feedback-claim-discipline-3-checks]]）：
   - 找 SOT？没有 → 建 SOT
   - 写 derived → 用 link，不抄数字
   - 加进 consistency-check CHECKS 数组

---

## 六、本表的 meta

- 本表自身的 SOT 就是这个文件。如有 SOT 变动，**先改这里**，再改其他。
- 本表加进 consistency-check 范畴（check #22：是否每条核心数字事实都有 SOT 列出来），实现自指闭环。
- 更新频率：每次 Stage 切换 / 大型 audit 后必更。
