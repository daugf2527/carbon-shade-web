# Stage 1 数据管线设计（2026-05-22）

> 本文档是 [v2 design](2026-05-22-dnf-native-v2-design.md) 实施第一阶段的细化设计：dnf-extract 工具改造 + 5-stage pipeline + SQLite 入库 + entity-centric runtime JSON。
>
> Scope 锚定：[`docs/plans/2026-05-22-dnf-native-v2-design.md`](2026-05-22-dnf-native-v2-design.md) §0.5（PVE-only），13 system 完整 1:1，PVF 字段读但 ignore。
>
> Brainstorming 来源：4 个话题 narrow 决议（工具 / pipeline / 数据库 / 建模），用户每个决策点显式确认。

## 0. 决议总览

| 话题 | 决议 | 工时 |
|---|---|---|
| 工具 dnf-extract | **C 全重设语义化**（10 项改造，Lite 4 + Mid 4 + Deep 2 [D1+D3]）| 5-7 天 |
| Pipeline | **A 单 CLI 多模式** / VALIDATE **L2** / Stage 间 typed object / 3 级错误 / parser 串行 / mock+smoke 测试 | 5-7 天 |
| 数据库 | **node:sqlite** + **X Mirror 单表** (pvf_files) + per-domain VIEW | 1-2 天 |
| 建模 | **A entity-centric 分片** + **A PVF 1:1 shape**，零 view | 1-2 天 |
| **总计** | | **12-17 天 = 2-3 周** |

---

## 1. 工具 dnf-extract.exe 改造（10 项）

### 1.1 Lite 层（4 项）
| # | 改造 | 落地位置 |
|---|---|---|
| L1 | Defect 1 类型标注（`{t:"int",v:300}` / `{t:"float",v:1.5}` / `{t:"str","..."}` / `{t:"link",...}`）| `tools/dnf-porting-src/PvfDocument.h` + `main.cpp` printDocumentJson |
| L2 | Cancel filename 自动 dual-semantics（cancel*.skl 检测 + section 名重映射成 `cancelWindowStart` 等）| `tools/dnf-porting-src/PvfDocument.cpp` 后处理 |
| L3 | CLI: `--filter-ext <ext1,ext2>` / `--manifest <path>` / `--only-changed` / stderr 结构化进度 `[PROGRESS] {...}` | `tools/dnf-porting-src/main.cpp` arg parser |
| L4 | （L1-L3 是一组，作 baseline） | |

### 1.2 Mid 层（2 项 / 内含子项）
| # | 改造 | 输出格式 |
|---|---|---|
| M1 | Reference 标注 —— path resolve + target kind 识别 | `{t:"ref", target_kind:"atk", target_path:"monster/goblin/attackinfo/attack1.atk", raw:"attackinfo/attack1.atk"}` |
| M2 | Enum 名称解析 —— ATTACKTYPE / CUSTOM_ATTACKINFO / ELEMENT / DAMAGEACT / KNOCK_BACK_TYPE / DOWN_PARAM_TYPE | `{t:"enum", v:0, name:"physical", enum:"ATTACKTYPE"}` |

### 1.3 Deep 选项（2 项）
| # | 改造 | 说明 |
|---|---|---|
| D1 | Vector / Matrix 结构识别 | `hp max` 17 行 → typed `number[17]`；`weapon hit info` 6×6 → `number[6][6]`；PVF 自带的 row layout 自然 typed |
| D3 | Provenance 工具自报 | 每条 JSON 输出含 `extractor_version` + `extract_timestamp` + `source_pvf_hash` |

### 1.4 明确**不做**
- ❌ D2 Reference 自动 inline（增量提取难、工具变重）
- ❌ D4 int pair / coordinate 结构化（违反"通用 PVF 提取器"原则）
- ❌ System tagging（耦合 runtime，违反工具中性）
- ❌ 全图 walk 导出（pipeline EXPORT 阶段做，不归工具）

### 1.5 工具输出 schema (post-改造)
```json
{
  "path": "monster/goblin/goblin.mob",
  "type": "document",
  "extractor_version": "v2.0.0",
  "extract_timestamp": "2026-05-22T13:15:00Z",
  "source_pvf_hash": "sha256:abc123...",
  "sections": [
    {"name": "warlike", "attributes": [{"t":"int","v":60}]},
    {"name": "sight",   "attributes": [{"t":"int","v":300}]},
    {"name": "attack info", "attributes": [
      {"t":"ref","target_kind":"atk","target_path":"monster/goblin/attackinfo/attack1.atk","raw":"attackinfo/attack1.atk"},
      {"t":"int","v":18}
    ]},
    {"name": "category", "attributes": [
      {"t":"enum","v":3,"name":"human","enum":"MOB_CATEGORY"},
      {"t":"enum","v":5,"name":"goblin","enum":"MOB_CATEGORY"},
      {"t":"enum","v":12,"name":"melee_combat","enum":"MOB_CATEGORY"},
      {"t":"enum","v":15,"name":"close_passive","enum":"MOB_CATEGORY"}
    ]},
    {"name": "hp max", "attributes": [
      {"t":"vec","items":[180, 225, 270, ...], "length":17}
    ]}
  ]
}
```

---

## 2. Pipeline 5-stage 设计

### 2.1 入口 CLI（统一）

```bash
# 全量
node scripts/pipeline.mjs --pvf Script.pvf --full

# 增量（基于 manifest hash）
node scripts/pipeline.mjs --pvf Script.pvf --incremental

# 单 stage 调试
node scripts/pipeline.mjs --stop-at parse                   # 跑到 PARSE 终止，dump 到 .tmp/pipeline-debug/
node scripts/pipeline.mjs --start-at load                   # 复用之前的 PARSE 产物

# 单域 / 单作业
node scripts/pipeline.mjs --domain skills --job swordman
node scripts/pipeline.mjs --domain monsters --pattern "goblin|metacow"

# EXPORT-only
node scripts/pipeline.mjs --export-only --out dist/data/
```

### 2.2 Stage 拓扑

```
┌─────────────────────────────────────────────────────────────┐
│  EXTRACT  (dnf-extract.exe 子进程 + --pipe)                  │
│  stdin: 文件路径 / stdout: 改造后 typed JSON line             │
└──────┬──────────────────────────────────────────────────────┘
       │ typed JSON line
       ▼
┌─────────────────────────────────────────────────────────────┐
│  PARSE  (Node TS 7 parser，串行执行)                          │
│  ChrParser / SklParser / AtkParser / AniParser /              │
│  MobParser / DgnParser / MapParser                            │
│  输入: typed JSON / 输出: ParsedDef + raw + provenance        │
└──────┬──────────────────────────────────────────────────────┘
       │ ParsedDef typed object（内存）
       ▼
┌─────────────────────────────────────────────────────────────┐
│  VALIDATE  (L2 推荐)                                          │
│  Schema check (Zod) + ref 完整性 + provenance audit +         │
│  Tier-3 字段清单 + PvP 字段清单                               │
│  输出: verification/extraction-report.json + audit.json       │
│  错误模型: error 中断 / warning 继续记录 / info log            │
└──────┬──────────────────────────────────────────────────────┘
       │ validated ParsedDef
       ▼
┌─────────────────────────────────────────────────────────────┐
│  LOAD  (node:sqlite)                                          │
│  upsert pvf_files (pvf_path UNIQUE) + extraction_runs metadata │
│  使用 DatabaseSync 同步 API                                    │
└──────┬──────────────────────────────────────────────────────┘
       │ SQLite mirror DB
       ▼
┌─────────────────────────────────────────────────────────────┐
│  EXPORT  (entity-centric JSON 分片)                           │
│  walk ref → compose inline → 写 dist/data/                    │
└─────────────────────────────────────────────────────────────┘
```

#### 2.2.1 Standalone parsers (animation / text / binary) — 已知设计后退

design 默认的 PARSE stage 串行 7 个 parser 都假设单一输入类型 `PvfDocument`
(`type:"document"`)。实际 PVF 还包含三类非 document 输出：

| 输入 type | dnf-extract 模式 | parser | 接入方式 |
|---|---|---|---|
| `type:"animation"` (.ani) | document/pipe 模式产出 | `AniParser.ts` | **standalone**（不进 parseStage） |
| `type:"text"` (.nut squirrel script) | document/pipe 模式产出 | `NutExtractor.ts` | **standalone** |
| `type:"binary"` (.img neople-image) | npk + frame 模式产出 | `ImgParser.ts` | **standalone** |

**决策（2026-05-23 Pre-Day-11）**：保持 standalone — 不强行接入统一 dispatch。

理由：
1. **shape 差异本质**：document 是 sections 数组，animation 是 frames 数组，
   binary 是 base64 + headHex + sizeBytes。union 化 `parsePvfDocument` 入参
   会把 router 复杂度从 6 行 switch 推高到 type-narrowing + 多 input
   loader filter，破坏 dispatch 单一职责。
2. **调用路径不同**：Ani/Nut/Img 主要由 Stage 2 渲染层和 SKL 内联引用消费，
   不需要走"统一 PARSE Stage 输出 ParsedDef union"。各自暴露 `parseAniDocument`
   / `extractNutText` / `parseImgBinary` 入口由专门 caller 调用即可。
3. **不阻塞 VALIDATE / LOAD / EXPORT**：standalone parser 输出仍然带 provenance
   + tier1 标记，可被 VALIDATE 单独审计（Day 11 schema 注册表会列入），不破
   坏审计闭环。

`parseStage.ts` 末尾 NOTE 注释已记录此决策（commit 250fb82 前已有）。
PvfDocumentLoader 仅过滤 `type:"document"`，符合 design 单一职责。

### 2.3 关键决策

| 项 | 决议 |
|---|---|
| Stage 间接口 | 内存 typed object 传递（单 process）；`--stop-at` 时 dump JSONL 到 `.tmp/pipeline-debug/<stage>.jsonl` |
| 错误处理 | 3 级：error 中断 / warning 继续并记入 verification / info console log |
| 并行度 | PARSE 7 parser **串行**（不是性能瓶颈，开发期日志清晰）；EXPORT 可并行（entity 间独立）|
| 测试策略 | mock PVF 单元测试（每 parser 一组 fixture）+ 1 个真实 PVF 路径 smoke test（`tests/smoke/full-pipeline.test.ts`）|
| 进度报告 | EXTRACT 走 `[PROGRESS]` stderr；PARSE/VALIDATE 走 console + `.tmp/pipeline-status.json` |

### 2.4 VALIDATE L2 详细

```typescript
interface VerificationReport {
  meta: { runId, startedAt, finishedAt, pvfHash, extractorVersion };
  stats: { filesTotal, filesParsed, filesFailed, warnings: number };
  errors: Array<{ pvfPath, parser, errorCode, message }>;
  warnings: Array<{ pvfPath, field, code, message }>;
  tier3Fields: Array<{ pvfPath, field, sourceType: "local_baseline" | "experimental" }>;
  pvpFields: Array<{ pvfPath, field, ignoredInPveOnly: true, reason }>;
  refIntegrity: Array<{ from, to, status: "resolved" | "missing" | "ambiguous" }>;
}
```

输出位置: `verification/extraction-report-<runId>.json` + `verification/provenance-audit-<runId>.json`。

> **命名约定** (audit deliverable-presence F10, 2026-05-24): VerificationReport
> 的 **field name** 用 lowerCamelCase (`tier3Fields` / `pvpFields` / `refIntegrity` /
> `errors` / `warnings`), 而 **TypeScript type names** 用 PascalCase
> (`Tier3FieldEntry` / `PvpFieldEntry` / `RefEntry` / `ValidationIssue`).
> `scripts/completion.mjs` Day 11-12 gate 验证 type symbols (PascalCase exports),
> 不是 field names —— 两者各有职责，不应被合并。

---

## 3. 数据库 schema (node:sqlite)

### 3.1 表结构（X Mirror + per-domain VIEW）

```sql
-- 核心：所有 PVF 文件镜像
CREATE TABLE pvf_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pvf_path TEXT UNIQUE NOT NULL,
  extension TEXT NOT NULL,
  file_size INTEGER,
  source_pvf_hash TEXT,
  raw_json TEXT NOT NULL,         -- dnf-extract 原始 typed JSON
  parsed_json TEXT,                -- Stage 2 typed ParsedDef
  extracted_at TEXT NOT NULL,
  extractor_version TEXT,
  parsed_at TEXT,
  parser_version TEXT
);

CREATE INDEX idx_pvf_files_ext ON pvf_files(extension);
CREATE INDEX idx_pvf_files_path_pattern ON pvf_files(pvf_path);

-- 提取历史 / 增量元数据
CREATE TABLE extraction_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  pvf_hash TEXT,
  mode TEXT,                       -- 'full' | 'incremental' | 'partial'
  files_total INTEGER,
  files_extracted INTEGER,
  files_failed INTEGER,
  status TEXT                      -- 'running' | 'completed' | 'failed'
);

-- 引用关系（pipeline VALIDATE 阶段填充，开发期反向查找用）
CREATE TABLE refs (
  from_path TEXT NOT NULL,
  from_field TEXT NOT NULL,
  to_path TEXT,
  ref_type TEXT,                   -- 'atk' | 'ani' | 'skill' | 'drop_table' | ...
  confidence TEXT                  -- 'resolved' | 'inferred' | 'unresolved'
);
CREATE INDEX idx_refs_from ON refs(from_path);
CREATE INDEX idx_refs_to ON refs(to_path);

-- Per-domain VIEW (json_extract for typed 字段访问)
CREATE VIEW characters AS
  SELECT id, pvf_path,
    json_extract(parsed_json, '$.job') AS job,
    json_extract(parsed_json, '$.jumpPower.value') AS jump_power,
    json_extract(parsed_json, '$.weight.value') AS weight,
    parsed_json AS data
  FROM pvf_files WHERE extension = 'chr';

CREATE VIEW monsters AS
  SELECT id, pvf_path,
    json_extract(parsed_json, '$.name') AS name,
    json_extract(parsed_json, '$.warlike') AS warlike,
    json_extract(parsed_json, '$.sight') AS sight,
    json_extract(parsed_json, '$.weight') AS weight,
    parsed_json AS data
  FROM pvf_files WHERE extension = 'mob';

CREATE VIEW skills AS ...;
CREATE VIEW attacks AS ...;
CREATE VIEW animations AS ...;
CREATE VIEW dungeons AS ...;
CREATE VIEW maps AS ...;
```

### 3.2 库选型最终确认: `node:sqlite`

- Node.js v22.5+ 内置（当前 v25 LTS），零 npm 依赖
- Termux / Win / Linux 通吃，无编译问题
- `DatabaseSync` 同步 API，CLI 管线脚本友好
- 性能跟 better-sqlite3 同级（1× baseline），不是 WASM 的 2-4× 慢

---

## 4. Runtime 建模（entity-centric + PVF 1:1）

### 4.1 EXPORT 分片

```
dist/data/
├── players/
│   ├── swordman.json        ← chr + 所有 .skl + 所有 .ani + 所有 .atk inline
│   ├── (未来) berserker.json
│   └── (未来) priest.json
├── monsters/
│   ├── goblin.json          ← mob + atk + ani 引用全部 inline
│   ├── taumetacow.json
│   └── (其它怪物按需)
├── dungeons/
│   ├── grimseeker.json      ← dgn + map + 关联 monster ID 列表（不 inline 怪物，引用 ID）
│   └── (其它副本)
├── shared/
│   ├── physics.json         ← DEFAULT_GRAVITY_ACCEL 等全局常数
│   └── enums.json           ← ATTACKTYPE / CUSTOM_ATTACKINFO / ELEMENT
└── manifest.json            ← 索引: 每个 JSON 的 path + hash + 大小 + 关联引用
```

### 4.2 Runtime shape（PVF 1:1，零 view）

```typescript
// players/swordman.json
interface PlayerRuntimeShape {
  chr: ChrDef;                              // PVF .chr 1:1
  skills: Record<string, SklDef>;           // by skill name
  animations: Record<string, AniDef>;       // by motion name (stay / move / attack1 / ...)
  attacks: Record<string, AtkDef>;          // by atk file basename
  provenance: ProvenanceMap;                // every field 来源追溯
  shape_version: string;                    // schema 版本
}

// monsters/<id>.json
interface MonsterRuntimeShape {
  mob: MobDef;
  attacks: Record<string, AtkDef>;
  animations: Record<string, AniDef>;
  ai: AiDef | null;
  aic: AicDef | null;
  provenance: ProvenanceMap;
  shape_version: string;
}

// dungeons/<id>.json
interface DungeonRuntimeShape {
  dgn: DgnDef;
  maps: MapDef[];
  monsterRefs: string[];                    // 不 inline，runtime 各加载（避免怪物数据重复）
  provenance: ProvenanceMap;
  shape_version: string;
}
```

### 4.3 13 system 消费策略

System 直接访问 shape 字段，**无 view 中间层**：

```typescript
// PhysicsIntegrator 例:
const gravity = sharedData.physics.DEFAULT_GRAVITY_ACCEL.value;  // -1500

// MonsterAI polling loop 例:
function tickAI(monster: MonsterRuntimeShape, target: ActorState) {
  const { warlike, sight, attack_delay } = monster.mob;
  // ... 直接消费 shape 字段
}

// HitDetection 例:
function getActiveHitboxes(player: PlayerRuntimeShape, action: string, frame: number) {
  const ani = player.animations[action];
  return ani.frames[frame].atk;  // PVF 1:1, 直接读
}
```

**未来 view 需求出现时**沉淀成 helper function（`getMonsterAIParams(monster)` 之类），不另定义 view interface（YAGNI）。

### 4.4 反向查找：走 SQLite VIEW，不进 runtime

开发期问"哪些 actor 引用了 .ani X？"用 SQLite:
```sql
SELECT from_path FROM refs WHERE to_path = 'character/swordman/animation/stay.ani';
```
**不进 runtime JSON**，避免 shape 膨胀。

---

## 5. 实施顺序

```
Day 1-3: 工具 Lite 改造（Defect 1 + cancel filename + 4 CLI）
Day 4-5: 工具 Mid 改造（Reference + Enum 名）
Day 6-7: 工具 Deep 改造（D1 Vector + D3 Provenance）
Day 8-10: Pipeline 骨架（CLI + EXTRACT + PARSE）+ 7 parser（先 ChrParser/MobParser/AtkParser 三核心）
Day 11-12: VALIDATE L2 + SQLite LOAD
Day 13-14: EXPORT + manifest.json + smoke test
Day 15-17: 集成测试 + verification 产物 + 文档补完
```

**第一个 milestone (Day 7)**: 工具改造完毕，能跑出 swordman 完整 typed JSON dump 验证 schema。
**第二个 milestone (Day 10)**: PARSE 阶段跑通 3 个 typed ParsedDef（swordman.chr + goblin.mob + swordman attack3.atk）。
**第三个 milestone (Day 14)**: 全 pipeline 跑通，`dist/data/players/swordman.json` + `dist/data/monsters/goblin.json` 输出，可被未来 runtime 直接吃。

---

## 6. 与 §0.5 Scope 的检查

| 项 | 是否合规 |
|---|---|
| PVF 全字段保留 | ✅ raw_json 列保留原始，parsed_json 也按 PVF 1:1，无字段丢弃 |
| PvP 字段读但 ignore | ✅ VALIDATE 阶段 audit `ignoredInPveOnly`，EXPORT 阶段过滤不输出 runtime JSON（但 SQLite raw_json 仍含） |
| 13 system 完整 1:1 | ✅ Stage 1 不涉及引擎层；Stage 2 引擎实施时由 [v2 §3](2026-05-22-dnf-native-v2-design.md#3-dnf-native-v2-架构) 保障 |
| 工程经济性论据拒绝 | ✅ 工具不做 D2 inline / D4 结构化（保通用性），不做 system tagging（保中性） |
| 不可达部分按 H1 标 | ✅ DNF.exe 不可达的（jump_power 单位 / AI 算法 / buffer 帧数）由 parser 标 `requiresManualVerification: true` 进 ProvenanceMap |

---

## 7. 文件清单

```
新建:
  scripts/pipeline.mjs                                    # 5-stage 统一入口
  scripts/import-to-sqlite.mjs                            # LOAD 阶段独立工具（被 pipeline.mjs 调用）
  scripts/export-runtime-json.mjs                         # EXPORT 阶段独立工具
  # ── Dispatch parsers (wired into parseStage.ts switch by extension) ──
  src/dnf-native-combat/data/parsers/ChrParser.ts          # .chr
  src/dnf-native-combat/data/parsers/SklParser.ts          # .skl
  src/dnf-native-combat/data/parsers/AtkParser.ts          # .atk
  src/dnf-native-combat/data/parsers/MobParser.ts          # .mob
  src/dnf-native-combat/data/parsers/DgnParser.ts          # .dgn
  src/dnf-native-combat/data/parsers/MapParser.ts          # .map
  src/dnf-native-combat/data/parsers/EtcParser.ts          # .etc (added during Day 8-10)
  # ── Standalone parsers (NOT in parseStage dispatch — invoked separately, see §2.2.1) ──
  src/dnf-native-combat/data/parsers/AniParser.ts          # .ani — called via loadAniDocumentsViaPipe → aniDefs (CLI: --ani-file)
  src/dnf-native-combat/data/parsers/CancelDecoder.ts      # cancel*.skl post-process（如果工具 L2 不能完全覆盖）
  # ── Adapters ──
  src/dnf-native-combat/data/parsers/PvfDocumentLoader.ts  # dnf-extract stdout adapter
  src/dnf-native-combat/data/types/*.ts                    # ChrDef / SklDef / AtkDef / AniDef / MobDef / DgnDef / MapDef / EtcDef / Provenance
  dist/data/                                               # EXPORT 输出目录 (NOT src/data/manifests/ — corrected 2026-05-24, audit F1 deliverable-presence)
  src/dnf-native-combat/data/exporter/RuntimeExporter.ts   # EXPORT shard composer
  src/dnf-native-combat/data/importer/SqliteImporter.ts
  src/dnf-native-combat/data/validator.ts
  tests/static/pipeline-extract.test.ts                    # ↓ 单元测试
  tests/static/parser-chr.test.ts
  tests/static/parser-mob.test.ts
  tests/static/parser-atk.test.ts
  tests/smoke/full-pipeline.test.ts                        # 真实 PVF 路径 smoke
  tests/smoke/full-pipeline-double-run.test.ts            # double-run smoke (contentFingerprint, Day 15+ hardening)

修改:
  tools/dnf-porting-src/PvfDocument.h                      # Defect 1 + Vector 结构识别
  tools/dnf-porting-src/PvfDocument.cpp                    # cancel filename auto dual + ref / enum resolve
  tools/dnf-porting-src/main.cpp                           # printDocumentJson + CLI args + provenance 输出
  tools/dnf-porting-src/PvfNode.cpp                        # ext 路径无需改（.ai 路由已正确）
  package.json                                              # 加 zod (validator) + 可能 better-sqlite3 (作 node:sqlite fallback)
  CLAUDE.md                                                 # 更新 Phase A-D / 加 Stage 1 章节
```

---

## 8. 下一步选项

按 brainstorming skill 流程，design 已落档。接下来：

1. **Commit 落盘** —— 把这份 design + v2 §0.5 / §3 修正 + memory feedback + (可选) swordman/ 未提交数据，分批 commit
2. **走 Stage 1 实施** —— 按 §5 实施顺序开干，第一步是工具改造
3. **再 brainstorm 引擎层（Stage 2）设计** —— 13 system 各自 stub + 接口契约，作为后续依据
4. **重读检查** —— 用户再 review v2 + 本文档，修正决议

我的推荐：**先 1（commit 落盘）+ 3（brainstorm Stage 2 引擎层）**。理由：Stage 1 实施 2-3 周，期间引擎层设计可以并行 brainstorm；而 commit 把 7 处文档修正 + 2 份 design + 1 份 swordman 数据沉成 git history，是 safer baseline。
