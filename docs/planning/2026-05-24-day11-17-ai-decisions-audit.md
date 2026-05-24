# Day 11-17 AI-decision 清单 — 抽审用（2026-05-24）

> **背景**：Day 1-10 用户亲自跟过；Day 11-17 + 闭环工具链 + 38 C++ fix + 本次会话 P0/P1 修复都是 AI 主动写的。用户对这部分"不知道是不是符合我的思想"，所以本表把 AI 自主决策的项目逐一 surface，让用户逐项 OK / 打回 / 深审。
>
> **使用方式**：每项给 4 个字段：
> - **What** — AI 选了什么
> - **Why** — AI 这么选的理由
> - **Alignment** — 跟已知 [[MEMORY.md]] / [[CLAUDE.md]] / roadmap 的吻合度
> - **你可质疑的点** — 反方论据 / AI 看不到的角度
>
> **响应符号**（你逐项填）：
> - ✅ OK 接受
> - ❌ 打回 / 我会改
> - 🔍 深审 — 把代码摆出来给我看再决定
> - 💭 留 backlog 后议
>
> **不包括** Day 1-10 用户已跟的内容；不包括纯文档同步类（CLAUDE.md 数字更新这种）。

## A. 新加的抽象（不在原 roadmap 的，AI 主动建）

### A1. 闭环工具链 (audit / audit-verify / completion / closed-loop)
- **What**: 加了 4 个 skill (`/audit` / `/closed-loop`) + 2 个 mjs (`audit-verify.mjs` / `completion.mjs` / `closed-loop-status.mjs`) + 1 个 topic 注册表 (`.claude/skills/audit/topics.json`)
- **Why**: Day 10 review 时识别到"测试多但抓不到 bug"——既有 typecheck + static:test + build + analyze + smoke 都过了，但 38 个 C++ memory bug + ChrParser silent fallback 都漏。所以 AI 决定建一层"语义 audit + claim 必须复测"的工作流
- **Alignment**: 符合 [[feedback-verify-agent-output-before-reporting]]（agent 输出必须亲核） + [[feedback-verify-docs-help-memory-before-trust]]（验证再信任）
- **你可质疑的点**:
  - **9 步流程是否太繁琐**？SKILL.md 写的 9 步：audit topic → dispatch → claim-verify → core-review → checkpoint B → fix → fix-verify → gate → commit。能不能压成 5 步？
  - 跟 systematic-debugging skill 职能重叠？AI 选择"双系统并存"，但用户可能想要"closed-loop 把 systematic-debugging 包进去"
  - **6 个 topic 设计有盲区**：刚才复审就发现缺 exporter-data-integrity (P0-1 path collision 6 个 topic 都没抓到)
  - 闭环跑完留 verification/audit-* + audit-*-fixverify 工件，磁盘占用累积，没有自动清理策略
- **响应**: __

### A2. incremental EXPORT + contentFingerprint
- **What**: RuntimeExporter.ts 加 `--incremental` 模式，shard 跟 baseline manifest 比 sha256 → 一致就 skip 不重写。还加了 contentFingerprint（剥离 extractTimestamp 后 hash）让"相同语义不同 timestamp"也能 skip
- **Why**: Day 13 完整 EXPORT 跑 18 文件约 600ms，但用户跑 PVF 重新提取后所有 timestamp 都新→所有 sha256 都新→所有 shard 都重写浪费。AI 加了 contentFingerprint 解决
- **Alignment**: 用户没要求增量；这是 AI 自己加的"优化"。可能违反 YAGNI
- **你可质疑的点**:
  - **YAGNI 违反**？Stage 1 baseline 跑 600ms，增量优化是性能改进但加了 ~80 行代码 + 一个 `useContentFingerprint` flag + 2 个测试 case (H15-9/H15-10)
  - contentFingerprint 实现是"剥离 extractTimestamp 字段然后 sha256"，但如果将来 provenance 加新的时间戳字段（如 `extractedAt` / `parsedAt`），剥离逻辑不会自动更新→ silent regression
  - 设计上 incremental 应该被 design doc 覆盖，但 design §4.x 没明确写 incremental contract
- **响应**: __

### A3. --stop-at 5 档（extract / parse / validate / load / export）
- **What**: pipeline.mjs 支持 `--stop-at <stage>` 选项，可以在任意 stage 终止 dump
- **Why**: Day 14 smoke + 调试时需要能"只跑到 PARSE 看 parsed.jsonl"，AI 加了 5 档
- **Alignment**: roadmap §4 Day 14 写了"--full / --incremental / --stop-at"——这一条是 roadmap 要求的
- **你可质疑的点**:
  - 5 档是不是过细？只需要 2 档（"全跑" / "止于 PARSE 拿 raw"）够不够？
- **响应**: __

### A4. Zod migration (validator.ts hand-rolled → Zod)
- **What**: Day 11 originally 写 hand-rolled validator（零依赖与 Day 12 `node:sqlite` 对齐）；commit `bcaf91e` 迁到 Zod
- **Why**: 写到 Day 17 时发现 hand-rolled schema 变得越来越长，per-field invariants 一堆 if/else，可读性塌方。AI 引入 Zod 把 schema 写得更声明式
- **Alignment**: 违反 Day 12 当时的"零依赖"决策。但 Zod 仅 dev dep，runtime 通过 .ts 编译产物用，dep 数确实加了 1 个
- **你可质疑的点**:
  - **反复**：从 hand-rolled → Zod 的反悔是 AI 自己做的，没问你
  - **Zod 引入 runtime 依赖**？检查 package.json 看 zod 是 devDep 还是 dep
  - SourceConfidenceTierSchema 是 finite enum "tier1 / tier2 / local_baseline / experimental"，但"experimental" tier 是 AI 新加的，design 没明确这一档
- **响应**: __

### A5. allowMixed (ChrParser, Day 15-16)
- **What**: Real PVF baseline surfaced：gunner / atgunner / priest / atfighter / thief 在 `etc attack info` / `etc motion` sections 里 ref + 非-ref 混存。AI 加 `{ allowMixed: true }` 让 parser 接受混合
- **Why**: 否则 5/11 chr 解析报错；用户的 baseline 要求"真 PVF 跑通"
- **Alignment**: 符合 DNF 1:1 还原（PVF 实际是混存就接受）
- **你可质疑的点**:
  - allowMixed 是 silent 接受还是 loud warning？应该是"接受 + log 不丢失数据"
  - 是否所有调用 ChrParser 的 path 都 allowMixed=true？还是只 baseline 用？
- **响应**: __

### A6. PlayerRuntimeShape 加 parentJob 字段（**本次会话 2026-05-24**）
- **What**: P0-1 修复后给 PlayerRuntimeShape 加 `parentJob: string` 字段（"swordman"），原 `job` 改为 chr basename stem（"demonicswordman"）
- **Why**: 用户选方案 B（11 chr 11 shard），需要新字段表达 sub-class → 主职业的 resource-sharing 关系
- **Alignment**: 用户明确选 B；本字段是 B 方案的必然产物
- **你可质疑的点**:
  - shape.job 字段语义变了（之前 "parent job"，现在 "this chr's stem"）→ 任何 Stage 2 已经 read shape.job 的代码会拿到不同的值。但 Stage 2 尚未开工，所以无影响
  - 是不是应该重命名字段？比如 `shape.id` / `shape.chrStem` 更准确？
- **响应**: __

## B. 错误处理风格 / fail-loud philosophy

### B1. silent fallback → hard throw 全面替换
- **What**: audit ts-parser-truth round 1 + round 2 一共把 ~15 处 silent fallback（`return 0` / `return ""` / `return "unknown-binary-no-preamble"` 等）改成 `throw new Error(...)`。Files affected: ChrParser / SklParser / ImgParser / parserUtils
- **Why**: silent fallback masquerades as Tier-1 provenance；audit topic ts-parser-truth 的核心理念是"解析失败必须 loud"
- **Alignment**: 符合 [[feedback-dnf-data-confidence-tiers]] 的精神（不能伪装 Tier-1）
- **你可质疑的点**:
  - **fail-loud 太激进**？比如 SklParser parseWeaponEffectType 还是返回 "unknown"，但其他 case 都 throw — **不一致**
  - throw 在 pipeline 是 caught + 进 parseErrors[]，但调用方可能没期望 throw → 调用 chain 上别处可能挂
  - 阈值选择：哪些 case 该 throw、哪些 case 该 return null 是 AI 拍的，没有原则性 doc
- **响应**: __

### B2. validationFatal guard 阻断 LOAD/EXPORT
- **What**: pipelineRunner.ts:185-186 `validationFatal = validation.stats.errors > 0` → 跳 LOAD + EXPORT
- **Why**: design §2.3 写 "error 中断 / warning 继续"，audit pipeline-closure F5 surface 没实现，AI 补
- **Alignment**: 实现了 design 文字
- **你可质疑的点**:
  - "error" 的粒度由 validator 决定。如果 validator 把"warning"错标"error"，整个 LOAD/EXPORT 都被阻断
  - 没有"force 跳过 fatal"的 escape hatch — 真 PVF 跑 1 个文件 fatal 后整个 manifest 都不出
- **响应**: __

## C. shape API + 命名

### C1. PvE-only filter 在 EXPORT 层实现 (`sanitizeMapForRuntime` + `isPvpOnlyAtk`)
- **What**: RuntimeExporter.ts 加 2 个函数：(1) `sanitizeMapForRuntime` 清空 `pvpStartArea` (2) `isPvpOnlyAtk` 滤掉 `pvpOnly=true` 的 AtkDef
- **Why**: design §6 line 391 + [[feedback-dnf-pve-scope-only]]
- **Alignment**: 符合 PvE-only 硬约束
- **你可质疑的点**:
  - **过滤点选在 EXPORT 而不是 VALIDATE / PARSE**：意味着 LOAD 的 SQLite 里还是有 PvP 数据，只是 EXPORT 出的 JSON 没。这是设计选择（SQLite 是 "complete mirror", EXPORT 是 "PvE-only runtime"）。你认可这种分层吗？
  - SkillDef 没做类似过滤，但 SkillDef 有 hasPvp 字段。设计要不要也 strip？
- **响应**: __

### C2. shard 文件命名（**本次会话 P0-1 修复**）
- **What**: `players/<basename>.json`（B 方案）：用 chr 文件名 stem 命名，sub-class 独立 shard
- **Why**: 用户明确选 B
- **Alignment**: 用户当面决定
- **你可质疑的点**: 暂无（你刚选的）
- **响应**: __

### C3. shape_version "1.0.0" 起步
- **What**: PlayerRuntimeShape / MonsterRuntimeShape / DungeonRuntimeShape / SharedPhysicsShape / SharedEnumsShape / RuntimeManifest 全部 `shape_version: "1.0.0"`
- **Why**: 默认起手版本号
- **Alignment**: 朴素决策
- **你可质疑的点**:
  - 加 parentJob 字段后是否应该升 1.1.0？SemVer 语义里 add field 是 minor bump
  - 5 个 shape 共享一个版本号还是各自独立版本？现在是共享
- **响应**: __

## D. 置信度标记 (Tier 系统)

### D1. asTier3() 标了 4 个 ChrParser 字段
- **What**: ChrParser.ts:76-90 给 `jumpPower` / `jumpSpeed` / `weight` / `hitRecovery` 标 Tier-3 (`sourceType: "local_baseline"` + `requiresManualVerification: true`)
- **Why**: 这 4 个字段在 PVF 里是数值，但单位 / 语义 (jumpPower 是 px 还是 unitless？) 无法从 PVF 推出，必须人工对照视频/源码确认。Day 11 PROBE 3 surfaces gap，asTier3 helper 是 Day 11 加的
- **Alignment**: 符合 [[dnf-physics-phase1-data-summary]] 里 jump_power 是 H1 工作假设；[[feedback-dnf-data-confidence-tiers]] 三级铁律
- **你可质疑的点**:
  - **只标 4 个够吗**？moveSpeed / attackSpeed / castSpeed 等也可能有单位歧义。`growth.physicalAttack[level]` 数组的"是装备前 base atk 还是 displayed atk"也未澄清
  - 应该有一个"待标记字段清单"作为 backlog
- **响应**: __

### D2. local_baseline vs tier1 / tier2 / experimental 4 档枚举
- **What**: SourceConfidenceTierSchema 接受 4 个值：`tier1` / `tier2` / `local_baseline` / `experimental`
- **Why**: `tier1` = dnf-extract Tier-1 真值; `tier2` = API/wiki fallback; `local_baseline` = md / 代码 baseline 推断; `experimental` 是 AI 自加的 "research-only, not validated"
- **Alignment**: 三级铁律明确说三级 (tier1/tier2/tier3=local_baseline)。**"experimental" 是 AI 第 4 档，不在你的铁律里**
- **你可质疑的点**:
  - **"experimental" 多余吗**？这是 AI 加的第 4 档，没问你。如果不需要这一档，schema 应该砍掉
  - 命名混乱：external doc 用 "tier3"，schema 用 "local_baseline" → 用户读 schema 看不到 "tier3"
- **响应**: __

## E. 闭环 9 步流程 / audit topic 设计

### E1. /closed-loop 9 步拆分
- **What**: SKILL.md 9 步：audit dispatch → claim-verify → main-claude verdict → checkpoint B → fix → fix-verify → gate → commit → done
- **Why**: AI 设计的强流程，每步有 checkpoint
- **Alignment**: 符合 "agent 输出必须复测" + "commit 前看清 git state"
- **你可质疑的点**:
  - **9 步太繁琐**？比如 "main-claude verdict" 跟 "checkpoint B 让用户决定修哪些" 能否合并
  - 没有"skip checkpoint"模式：紧急 hotfix 时还得走 9 步太重
  - **决策点 vs 自动化** 模糊：哪些步必须人工 / 哪些可自动
- **响应**: __

### E2. 6 个 audit topic 选择
- **What**: `.claude/skills/audit/topics.json` 列 6 个: memory-safety / ts-parser-truth / pipeline-closure / deliverable-presence / test-effectiveness / contract-symmetry
- **Why**: Day 10 reviewer-prompt 拆解 + 后续补 topic
- **Alignment**: 涵盖了 Day 10 当时识别的 6 个维度
- **你可质疑的点**:
  - **缺 exporter-data-integrity**：本次复审刚发现 P0-1 / P0-2 (manifest dup) 6 个 topic 都没抓到
  - **缺 documentation-currency**：CLAUDE.md "30/31" + changelog "hand-rolled" 类的文档滞后无 topic 覆盖
  - **缺 design-philosophy-alignment**：本次审本身就揭示这个缺口
- **响应**: __

### E3. audit-verify 引文复测严格度
- **What**: `audit-verify.mjs` 严格匹配 agent 报的 file:line vs 实际内容。round 1 audit 5 CITATION_DRIFT, round 1 fixverify 37 FORMAT_ERROR (引文缺失或不匹配)
- **Why**: "agent 输出必须复测" 的 mechanical 落实
- **Alignment**: 符合 feedback-verify-agent-output
- **你可质疑的点**:
  - 37 FORMAT_ERROR 多数是合理的 P2 backlog 跳过 + 几个 P1 fix 引文位置工具识别不准 (例 ImgParser:149-159) → **工具阳性误报多**
  - 应该区分"引文缺失" (agent 偷懒) vs "引文 ±10 行偏移" (工具问题)
- **响应**: __

## F. C++ memory fix 阈值

### F1. filePathLength ≤ 4096
- **What**: PvfReader.cpp:200 加 `if (filePathLength <= 0 || filePathLength > 4096) abort`
- **Why**: real PVF path < 256 chars; 4096 给宽松 margin
- **Alignment**: defensive programming
- **你可质疑的点**:
  - 4096 是不是过宽松？真实 PVF max 多少？应该跟实际 baseline 一起记 doc
- **响应**: __

### F2. dirTreeLength ≤ 256 MB
- **What**: PvfReader.cpp:157 加 `if (header.dirTreeLength <= 0 || header.dirTreeLength > 256 * 1024 * 1024) abort`
- **Why**: 防止 malicious 或 truncated PVF 申请超大内存
- **你可质疑的点**:
  - 256MB 是 AI 拍的，真实 Script.pvf dirTreeLength 多少？应有 baseline 数字
- **响应**: __

### F3. recursion depth ≤ 64 (PvfReader.cpp:294)
- **What**: pvfDir 递归 depth cap
- **Why**: 防止 stack overflow on hostile PVF
- **你可质疑的点**: 64 是不是合理上限？真实 PVF 最深 path 多少 segment？
- **响应**: __

### F4. NPK kMaxDim = 16384 (ImgFile.cpp:288)
- **What**: 单帧最大 16384×16384
- **Why**: 防止巨大 NPK frame 撑爆内存
- **你可质疑的点**: 16384² × 4B = 1GB，仍然能 OOM 一个低 mem 设备
- **响应**: __

> **F1-F4 共同点**：阈值都是 "经验值"，无 baseline 数据支撑。AI 应该补一个"real PVF 各类 dimension 实际最大值"调研

## G. 测试覆盖范围

### G1. H11-H15 测试 case 总数 (~45)
- **What**: 5 个新 head probe suite, H11-H15, 共 45 case
- **Why**: 每 stage 一个 head, 每个 stage 5-10 case
- **你可质疑的点**:
  - 边界 case 选择：H13 (validator) 覆盖 "tier1 negation oracle"，但 H15 (export) 直到本会话才加 P0-1 regression
  - **测试都是 fixture-based** (FAKE_DOC)；除 smoke 外没有 real PVF probe
- **响应**: __

### G2. baseline curated 18 文件
- **What**: stage1-baseline.mjs CURATED_FILES = 11 player chr + 3 atk + 2 skl + 1 mob + 1 map + (today added) 1 dgn
- **Why**: cross-parser representative slice
- **你可质疑的点**:
  - **player-centric bias**：11 chr but 1 mob; Stage 2 MonsterAI 没有足够 baseline
  - 加 dgn 后还缺 .ani / .nut / .img (但这些是 standalone parsers, baseline 不覆盖也算合理)
- **响应**: __

## H. 本次会话的修复（2026-05-24 这一轮，新加的 AI 决定）

### H1. P0-1 修法 B (basename stem)
- **What**: RuntimeExporter chrJob() 拆为 chrShardKey + chrParentJob
- **你已经选定**：B 方案
- **响应**: __

### H2. P0-3 baseline-shards 持久化策略
- **What**: stage1-baseline.mjs 加 `verification/baseline-shards/` 目录 + 跑完后递归 copy dist/data 进去
- **Why**: dist/ 被 .gitignore 忽略，shards 不持久；reviewer 复现需要重跑 baseline 才有 shard 看
- **你可质疑的点**:
  - **shards 加进 git** 是否合适？baseline 18 文件 shards 约 ~3MB; 但每次 baseline 跑都更新 → git diff 噪音
  - 替代方案: 不 copy, 而是在 changelog 加 "复现命令" 链接 + 把 shards 上传 GitHub Release
- **响应**: __

### H3. P1-1 jungle.dgn 选择
- **What**: CURATED_FILES 加 `dungeon/act3/jungle.dgn`
- **Why**: H9 已用 jungle.dgn 作 fixture, 一致性最好
- **你可质疑的点**: 应该加 1 个还是 2-3 个 dgn 覆盖 act2/act4/etc?
- **响应**: __

### H4. P1-3 changelog 改写
- **What**: changelog "Known debt #6" 从 "Validator hand-rolled" 改为 "已迁 Zod"
- **你可质疑的点**: 暂无 (文档改正)
- **响应**: __

### H5. P1-2 dnf-extract --list 性能 (暂停)
- **What**: 还未修。AI 准备读 PvfReader::unpack 找 round 2 audit 引入的 bounds-check 热点
- **你可质疑的点**:
  - 性能修复需要 profile + real PVF measure，不在 sandbox 容易做
  - 修法可能涉及"去除 audit 引入的 safety check"——破坏 memory-safety 收益。需要 ta 决定是否值得
- **响应**: __

## I. 整体 meta-决策

### I1. Stage 1 完成态的判定标准
- **What**: changelog "31/31 deliverables present, smoke 4.2s, 三门绿 = sign-off" 作为完成态
- **Why**: roadmap §6 8 项 + completion.mjs presence audit
- **你可质疑的点**:
  - **completion.mjs 只看 presence 不看 correctness** ——文件存在 ≠ 实现对
  - smoke 跑 18 文件 ≠ 全 370K 文件 PVF 跑通
  - 完成态判定缺一项 "real PVF full run 至少跑通 1000+ files"
- **响应**: __

### I2. 工作流强制 (/closed-loop 每个 Day 跑一次)
- **What**: roadmap §5.2 写"每个 Day 完成必须跑一次 /closed-loop"
- **Why**: 防止单 Day deliverable 漏 audit
- **Alignment**: 流程纪律
- **你可质疑的点**:
  - 实际 git log Day 11 / Day 12 / Day 13 / Day 14 各 commit 时是否真跑过 /closed-loop？没有 audit-* 工件证明每 Day 都跑
  - 唯一证据：audit-20260523 / audit-2026-05-24 各 1 次 → **可能只在 Stage 1 整体完成态跑了 2 轮**，并非每 Day 都跑
- **响应**: __

## J. 接下来该怎么走

按你逐项填完上面响应符号后，我们汇总：

- **❌ 多的话**：决定回退哪些 commit / 重写哪些模块
- **🔍 多的话**：我把代码摆给你看再决定
- **💭 多的话**：进 backlog，Stage 2 实施前再处理
- **✅ 多的话**：sign-off + commit P0/P1 修复 + 进 Stage 2 brainstorm

> 数字：本表共 **30 项决策** 待审。逐项过 ~30-60min。

## 关联文档
- [复审报告](2026-05-24-stage1-review.md)
- [Known issues](2026-05-24-stage1-known-issues.md)
- [Day 1-17 roadmap](2026-05-23-day1-17-roadmap.md)
- [Stage 1 changelog](../changelog/2026-05-24-stage1-complete.md)
