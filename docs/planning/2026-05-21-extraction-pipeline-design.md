# DNF 数据提取全自动管线设计

> 2026-05-21。基于 dnf-extract 能力评估（`2026-05-21-dnf-extract-assessment.md`）和现有脚本审计结果，设计闭环的 PVF → SQLite → Runtime JSON 自动化管线。

## 0. 现状审计：现有工具盘点

### 工具矩阵

| 工具 | 语言 | 输入 | 输出 | 解析深度 |
|------|------|------|------|---------|
| **dnf-extract** | C++ | PVF / NPK | stdout JSON（一行一个文件） | .ani 完整解析 / .skl .mob .atk .chr 结构化但无类型 / .nut 文本 / .img 二进制 metadata |
| **extract-assets.mjs** | Node | PVF / NPK | 原始字节写到磁盘 | ❌ 零解析，纯解压+解密 |
| **generate-actions.mjs** | Node | PVF + .tmp/test-js/ 编译产物 | FrameDataAction JSON | .skl → SklAnalyzer → SklToActionMapper（语义分析） |
| **extract-actions.mjs** | Node | FrameDataAction.ts 源码 | actions/default.json | 从 JS eval 提取 inline 数据 |
| **extract-equipment-layer.mjs** | Node | PVF + NPK | 装备层 PNG | .ani sprite 引用 → NPK frame 像素 |

### 现状问题

1. **C++ 和 Node 两条线各跑各的**：dnf-extract 提取原始 JSON，Node 端 SklAnalyzer/AniAnalyzer 独立解析，没有统一的中间格式
2. **没有统一管线入口**：每个脚本接口不同，手动拼流程
3. **dnf-extract 输出有缺陷**：Document JSON 无类型标注（待修），.ai 未入 text 路径（待验证）
4. **无数据库层**：输出全是文件/JSON，查询依赖文件系统
5. **无增量能力**：每次全量读 PVF
6. **解析器覆盖不完整**：SklAnalyzer 有，但无 MobAnalyzer / ChrAnalyzer / AtkAnalyzer / DgnAnalyzer / EtcAnalyzer
7. **无校验层**：提取 → 入库中间没有 schema 校验、引用完整性检查

## 1. 目标管线拓扑

```
┌──────────────┐
│  Script.pvf  │
│ ImagePacks2/ │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│  Stage 1: EXTRACT  (dnf-extract C++, --pipe)    │
│  ───────────────────────────────────────────    │
│  修复后输出: 带类型标注的 JSON lines             │
│  扩展名 → 4 条解析路径 (Ani/Text/Binary/Doc)     │
│  stderr: 进度, stdout: 数据 (永不混合)           │
└──────┬──────────────────────────────────────────┘
       │ stdout JSON stream
       ▼
┌─────────────────────────────────────────────────┐
│  Stage 2: PARSE  (Node.js, per-format)          │
│  ───────────────────────────────────────────    │
│  AniParser   ← .ani JSON → AnimFrames           │
│  SklParser   ← .skl JSON → SkillDef             │
│  MobParser   ← .mob JSON → MonsterDef            │
│  AtkParser   ← .atk JSON → AttackDef             │
│  ChrParser   ← .chr JSON → CharacterDef          │
│  DgnParser   ← .dgn JSON → DungeonDef            │
│  EtcParser   ← .etc JSON → ItemDef/DropDef       │
│  NutExtractor← .nut JSON → SquirrelText          │
│  ImgParser   ← binary .img → TextureMeta         │
└──────┬──────────────────────────────────────────┘
       │ typed intermediate objects
       ▼
┌─────────────────────────────────────────────────┐
│  Stage 3: VALIDATE                              │
│  ───────────────────────────────────────────    │
│  Schema check (per type, Zod/JSON Schema)        │
│  Ref integrity (skill.aniRef → animation exists) │
│  Provenance audit (all fields have sourceRef)    │
│  Checksum gate (manifest hash = last run?)       │
└──────┬──────────────────────────────────────────┘
       │ validated objects
       ▼
┌─────────────────────────────────────────────────┐
│  Stage 4: LOAD  (SQLite)                        │
│  ───────────────────────────────────────────    │
│  镜像模型: 一个 DNF 文件类型 = 一张表             │
│  raw_json 列保留原始提取结果                      │
│  parsed 列存 Stage 2 的结构化数据                 │
│  引用关系通过 VIEW / 迁移脚本逐步建立             │
└──────┬──────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│  Stage 5: EXPORT  (SQLite → runtime JSON)       │
│  ───────────────────────────────────────────    │
│  Per-domain 导出:                                │
│    actions.json     (combat runtime)             │
│    monsters.json    (combat runtime)             │
│    characters.json  (combat runtime)             │
│    items.json       (inventory/loot)             │
│    dungeons.json    (dungeon generation)          │
│  按需分片: 小 JSON 片段，适合网络加载              │
└─────────────────────────────────────────────────┘
```

## 2. 各 Stage 详细设计

### Stage 1: EXTRACT（C++ dnf-extract 修复 + 增强）

**前置依赖**：
- 修复缺陷 1（Document 属性类型标注）— 见 `2026-05-21-dnf-extract-assessment.md` §3 缺陷 1
- 验证/修复缺陷 2（.ai 入 text 路径）— 同上 §3 缺陷 2

**输入**：
- `Script.pvf`（必需）
- stdin：逐行文件路径（--pipe 模式）

**输出**（stdout，每行一个 JSON）：
```json
{"path":"skill/swordman/gorecross.skl","type":"document","sections":[
  {"name":"skill","attributes":[
    {"t":"int","v":240},
    {"t":"str","v":"gore_cross"},
    {"t":"float","v":1.5}
  ]}
]}
```

**增强项**（本次管线设计新增，不在现有 dnf-extract 范围）：

1. **--filter-ext <ext1,ext2,...>**：按扩展名过滤 --list / --pipe 输入，省去外部 grep
2. **--manifest <path>**：输出提取清单 JSON（文件列表 + 每个文件的 hash + 时间戳），供增量对比
3. **--only-changed**：配合 --manifest，只提取上次运行后变更/新增的文件
4. **stderr 结构化进度**：`[PROGRESS] {"current":N,"total":M,"file":"..."}` 供上游消费

**I/O 协议**（已有，保持不变）：
- stdout：一行 JSON per file，"---" 分隔
- stderr：`[LOG]` / `[READY]` / `[DONE]` / `[ERROR]` 进度行

### Stage 2: PARSE（Node.js per-format analyzers）

**现有可复用的**：
- `SklAnalyzer.ts` — .skl 语义解析（cancel 窗口、hitbox 时间线）
- `AniAnalyzer.ts` — .ani 帧数据解析
- `SklToActionMapper.ts` — .skl + .ani → FrameDataAction

**需要新建的**：

| 新模块 | 输入格式 | 输出类型 | 依赖 |
|--------|---------|---------|------|
| `MobParser.ts` | .mob Document JSON | `MonsterDef` | 需先抽样验证 .mob 字段结构 |
| `AtkParser.ts` | .atk Document JSON | `AttackDef` | 已知 lift_up/back_force/hit_count 等字段 |
| `ChrParser.ts` | .chr Document JSON | `CharacterDef` | Phase 1 已有 .chr dump 知识 |
| `DgnParser.ts` | .dgn Document JSON | `DungeonDef` | 需先抽样验证 |
| `EtcParser.ts` | .etc Document JSON | `ItemDef \| DropDef` | 需先抽样验证 |
| `NutExtractor.ts` | .nut Text JSON | `{path, content, encoding}` | 简单，纯文本透传 |

**设计原则**：
- 每个 Parser 是独立模块，接收 Stage 1 的 JSON 对象，返回 typed TS object
- Parser 不负责 I/O，只做数据转换
- 未知字段保留在 `raw: Record<string, unknown>` 字段中，不丢弃
- 所有 Parser 输出包含 `sourceProvenance` 元数据

**Types 示例**：
```typescript
// src/extraction/types.ts

interface ParsedEntry<T> {
  pvfPath: string;
  extension: string;
  rawJson: object;        // Stage 1 原始输出（不可变）
  parsed: T;              // Stage 2 结构化数据
  sourceProvenance: {
    extractedAt: string;  // ISO timestamp
    extractorVersion: string;
    confidence: "high" | "medium" | "low";
  };
  warnings: string[];
}

interface MonsterDef {
  id: number;
  name: string;
  level: number;
  hp: number;
  // ... 待 .mob 抽样后确定完整 schema
}

interface AttackDef {
  skillName: string;
  attacks: Array<{
    liftUp: number;       // px/s
    backForce: number;    // px/s
    maxHit: number;
    hitRecovery: number;  // frames
    // ...
  }>;
}
```

### Stage 3: VALIDATE

**三层校验**：

```
Layer A: Schema 校验
  → Zod schema per output type
  → 缺失必填字段 → reject (移入 error log)
  → 多余字段 → warn + 保留在 raw

Layer B: 引用完整性
  → skill.aniRef → 对应 .ani 文件是否存在
  → monster.dropTableId → 对应 .etc 是否存在
  → 交叉引用图，用 depcruise 风格输出

Layer C: Provenance 审计
  → 每个 runtime-facing 字段必须有 sourceProvenance
  → 检出 sourceType: "local_baseline" 的字段，生成待替换清单
  → 统计: 多少 % 字段已对齐真值
```

**输出**：
- `verification/extraction-report.json`：完整的通过/警告/错误清单
- `verification/provenance-audit.json`：待替换的 local_baseline 字段列表
- stderr：摘要（如 `VALIDATE: 2341 files, 98% pass, 12 errors, 47 warnings`）

### Stage 4: LOAD（SQLite 镜像模型）

**表结构**：

```sql
-- 核心：每个 PVF 文件一条记录
CREATE TABLE pvf_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pvf_path TEXT UNIQUE NOT NULL,
  extension TEXT NOT NULL,
  file_size INTEGER,
  crc32 INTEGER,
  raw_json TEXT NOT NULL,          -- Stage 1 原始输出
  parsed_json TEXT,                -- Stage 2 结构化输出 (nullable until parsed)
  extracted_at TEXT NOT NULL,
  extractor_version TEXT
);

-- 按域拆分的视图/物化表（查询优化）
CREATE VIEW animations AS
  SELECT id, pvf_path,
    json_extract(parsed_json, '$.framesCount') AS frame_count,
    json_extract(parsed_json, '$.loop') AS loop,
    parsed_json AS data
  FROM pvf_files WHERE extension = 'ani';

CREATE VIEW skills AS
  SELECT id, pvf_path,
    json_extract(parsed_json, '$.skillId') AS skill_id,
    json_extract(parsed_json, '$.actionName') AS action_name,
    parsed_json AS data
  FROM pvf_files WHERE extension = 'skl';

CREATE VIEW monsters AS
  SELECT id, pvf_path,
    json_extract(parsed_json, '$.id') AS monster_id,
    json_extract(parsed_json, '$.name') AS name,
    parsed_json AS data
  FROM pvf_files WHERE extension = 'mob';

CREATE VIEW characters AS ...
CREATE VIEW attacks AS ...
CREATE VIEW dungeons AS ...
CREATE VIEW items AS ...

-- 引用关系表（逐步建立）
CREATE TABLE refs (
  from_path TEXT NOT NULL,
  from_field TEXT NOT NULL,
  to_path TEXT,                    -- nullable if unresolvable
  ref_type TEXT,                   -- 'ani_ref' | 'drop_table' | 'skill_link' | ...
  confidence TEXT                  -- 'resolved' | 'inferred' | 'unresolved'
);

-- 提取历史（增量支持）
CREATE TABLE extraction_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  pvf_hash TEXT,
  files_total INTEGER,
  files_extracted INTEGER,
  files_errors INTEGER,
  status TEXT                     -- 'running' | 'completed' | 'failed'
);
```

**Importer 脚本**：`scripts/import-to-sqlite.mjs`
- 消费 Stage 1 stdout stream，逐行 SQL INSERT
- 使用 `node:sqlite`（Node.js 内置，v22.5+ / 当前 v25.8.2，零依赖）
- 支持断点续传（按 pvf_path 幂等 upsert）
- 进度条输出

### Stage 5: EXPORT（SQLite → Runtime JSON）

**导出脚本**：`scripts/export-runtime-json.mjs`

**导出策略**：

```
按域导出（运行时按需加载）:
  dist/data/actions/swordman.json     ← 仅 swordman 的技能
  dist/data/monsters/low-level.json   ← 按等级分段
  dist/data/monsters/boss.json
  dist/data/characters.json           ← 全量（小）
  dist/data/items/equipment.json
  dist/data/items/consumables.json
  dist/data/dungeons/<id>.json        ← 按副本单文件

manifest.json                         ← 索引: 每个 JSON 的 path + hash + 大小
```

**为什么导出而不是运行时直读 SQLite**：浏览器不能读 SQLite。开发阶段用 SQLite 查询，发布时导出为 JSON 片段，按需 fetch。

## 3. 统一 CLI 入口

所有管线通过一个统一入口触发：

```bash
# 全量管线（首次运行或重建数据库）
node scripts/pipeline.mjs --pvf Script.pvf --npk-dir ImagePacks2/ --full

# 增量管线（只提取变更文件）
node scripts/pipeline.mjs --pvf Script.pvf --npk-dir ImagePacks2/ --incremental

# 只跑到某个 stage
node scripts/pipeline.mjs --stop-at parse   # 只提取+解析，不入库
node scripts/pipeline.mjs --stop-at load    # 只入库，不导出

# 从某个 stage 开始（复用之前的输出）
node scripts/pipeline.mjs --start-at parse  # 假设 extract 已完成

# 单域提取
node scripts/pipeline.mjs --domain skills --job swordman
node scripts/pipeline.mjs --domain monsters --level-range 1-30

# 导出模式（从已有 SQLite 导出 JSON）
node scripts/pipeline.mjs --export-only --out dist/data/
```

## 4. 与现有代码的关系

```
保留:
  tools/dnf-extract                 → Stage 1 引擎（需修复缺陷1+2）
  src/extraction/SklAnalyzer.ts     → Stage 2 的 SklParser 基础
  src/extraction/AniAnalyzer.ts     → Stage 2 的 AniParser 基础
  src/extraction/SklToActionMapper.ts → Stage 2 (复用逻辑)
  src/extraction/PvfParser.ts       → TypeScript 侧 PVF 读取（Stage 2 中辅助用）

替换/废弃:
  scripts/extract-actions.mjs       → 被 Stage 2 SklParser + Stage 5 export 替代
  scripts/generate-actions.mjs      → 被 pipeline.mjs 替代（功能合并）
  tools/extract-assets.mjs          → 被 pipeline.mjs 替代（功能合并）

新增:
  scripts/pipeline.mjs              → 统一 CLI 入口
  scripts/import-to-sqlite.mjs      → Stage 4
  scripts/export-runtime-json.mjs   → Stage 5
  src/extraction/MobParser.ts       → Stage 2
  src/extraction/AtkParser.ts       → Stage 2
  src/extraction/ChrParser.ts       → Stage 2
  src/extraction/DgnParser.ts       → Stage 2
  src/extraction/EtcParser.ts       → Stage 2
  src/extraction/NutExtractor.ts    → Stage 2
  src/extraction/types.ts           → 共享类型定义
  src/extraction/validator.ts       → Stage 3
  tests/static/pipeline-*.test.ts   → 管线各阶段测试
```

## 5. 执行顺序（建议）

```
Phase A: 基础设施
  A1. 修复 dnf-extract 缺陷 1（Document 类型标注）
  A2. 抽样验证 .mob .dgn .map .etc .ai（确认缺陷 2）
  A3. 视验证结果修复缺陷 2（.ai 入 text 路径）
  A4. 重新编译 dnf-extract（Linux aarch64）
  A5. 写 src/extraction/types.ts 共享类型

Phase B: Stage 2 解析器
  B1. NutExtractor（最简单，纯文本透传）
  B2. AtkParser（.atk 结构已知，Phase 1 研究充分）
  B3. ChrParser（.chr 结构已知，Phase 1 研究充分）
  B4. MobParser（需 .mob 抽样后定 schema）
  B5. DgnParser（需 .dgn 抽样后定 schema）
  B6. EtcParser（需 .etc 抽样后定 schema）
  B7. 重构 SklAnalyzer 为独立 SklParser（适配 Stage 1 JSON 输入格式）

Phase C: Stage 3-5 管道
  C1. validator.ts（schema + 引用完整性）
  C2. import-to-sqlite.mjs
  C3. export-runtime-json.mjs
  C4. pipeline.mjs 统一 CLI

Phase D: 全量跑通
  D1. 全量提取 Script.pvf → SQLite
  D2. provenance 审计 → 统计真值覆盖 %
  D3. 导出第一批 runtime JSON
  D4. CI 集成（pipeline validate 作为 pre-commit 可选检查）
```

## 6. 已定设计决策

### 6.1 SQLite 库选型：`node:sqlite`（内置）

**决策日期**：2026-05-21。

**选择**：`node:sqlite`（Node.js 内置 `DatabaseSync`）。

**理由**：
- 当前环境 Node.js v25.8.2，已内置 SQLite（v22.5.0 起可用，v25.7.0+ Release Candidate）
- **零 npm 依赖**：`import { DatabaseSync } from "node:sqlite"` 即可，无需 `npm install`
- **原生性能**：C/C++ 实现，与 better-sqlite3 同级（1× baseline），不是 WASM 的 2-4× 慢
- **三环境统一**：Termux (aarch64) / Windows / Linux 都是装 Node.js 就有，不存在编译问题
- **同步 API**：`DatabaseSync` 适合 CLI 管线脚本，不需要 async/await

**用法示例**：
```js
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("./dnf-data.sqlite");
db.exec("CREATE TABLE IF NOT EXISTS ...");
const stmt = db.prepare("INSERT INTO ... VALUES (?, ?, ?)");
stmt.run(val1, val2, val3);
```

**排除了的选项**：
- `better-sqlite3`：需要 node-gyp 编译 C++ binding，Termux 上可能翻车
- `sql.js`（WASM）：性能 2-4× 慢，但纯 WASM 跨平台最好（已不需要，因为 `node:sqlite` 内置了）

**开发/生产分离**：
- 开发阶段：`node:sqlite` → `.sqlite` 文件，结构化查询
- 发布阶段：`Stage 5 EXPORT` → 分片 JSON，浏览器 fetch

### 6.2 管线设计决策（已定）

**决策日期**：2026-05-21。

#### 决策 1：Stage 2 解析器输入源

| 选项 | 结论 |
|------|------|
| A: 消费 dnf-extract stdout JSON | **✅ 采用** |
| B: 直接用 PvfParser.ts 读 PVF | ✗ |

**理由**：C++ 提取器和 Node 解析器解耦，各自独立演进。中间 JSON 层序列化开销 < 管线总耗时 5%，可忽略。出问题时 JSON 肉眼可查。

#### 决策 2：parsed_json 存储方式

| 选项 | 结论 |
|------|------|
| A: 一整列 JSON + VIEW 拆字段 | **✅ 采用** |
| B: 拆成多个 SQL 列 | ✗ |

**理由**：镜像模型原则——不丢失原始信息。Parser 升级后只 update 一列，无需 migrate 表结构。SQLite `json_extract()` VIEW 提供字段级查询体验。

#### 决策 3：`.nut` → JS 转换阶段

| 选项 | 结论 |
|------|------|
| A: Stage 2 当场转 | ✗ |
| B: 入库后再转 | **✅ 采用** |

**理由**：`.nut` 原文保留在 `texts` 表不可变。AI 翻译器迭代改进时只重跑翻译逻辑，不需重新提取 PVF。

#### 决策 4：精灵/纹理纳入管线

| 选项 | 结论 |
|------|------|
| A: 纳入管线 | **✅ 采用** |
| B: 管线只管数据，精灵单独处理 | ✗ |

**理由**：`.ani` 中 `sprite` 引用和 `imgParam` 参数需要 NPK/IMG 帧数据才能完整解析。ImParser 只入库 metadata（帧尺寸、格式、路径映射），PNG 像素数据按需导出，不存 SQLite。

### 6.3 阶段间通信方式

```
Stage 1 (C++ dnf-extract)
  │ stdout JSON lines
  ▼
Stage 2 (Node.js → 内存对象)
  │ 同进程
  ▼
Stage 3 (Node.js → 内存对象)
  │ 同进程
  ▼
Stage 4 (Node.js → node:sqlite)
  │ 从 SQLite 读取
  ▼
Stage 5 (Node.js → JSON 文件)
```

| 通道 | 通信方式 | 说明 |
|------|---------|------|
| Stage 1→2 | **stdout/stdin pipe** | dnf-extract 已提供 --pipe 模式，不动它 |
| Stage 2→3 | **同进程内存** | 解析完直接传 typed object，无 I/O |
| Stage 3→4 | **同进程直接写** | 校验通过后同一进程写 SQLite |
| Stage 4→5 | **SQLite → 文件** | 从库导出分片 JSON |

Stage 1 是独立 C++ 子进程，Stage 2-5 在单个 Node.js 进程中完成。零多余文件 I/O。

### 6.4 决策汇总

| # | 决策 | 结论 |
|---|------|------|
| 1 | Stage 2 输入源 | 消费 dnf-extract stdout JSON（解耦） |
| 2 | SQLite 库 | `node:sqlite` 内置模块（零安装） |
| 3 | parsed_json 存储 | 一整列 JSON + VIEW 拆字段 |
| 4 | .nut → JS 阶段 | 入库后再转（原文保留） |
| 5 | 精灵/纹理 | 纳入管线（metadata 入库，像素按需导出） |

**以上决策均已敲定，不再变动。**

## 7. 参考

- dnf-extract 能力评估：`docs/planning/2026-05-21-dnf-extract-assessment.md`
- Phase 3 数据层设计：`docs/plans/2026-05-21-dnf-data-layer-design.md`
- DNF native kernel 设计：`docs/plans/2026-05-21-dnf-native-kernel-design.md`
- 现有提取脚本：`scripts/generate-actions.mjs` `tools/extract-assets.mjs`
- 提取模块：`src/extraction/SklAnalyzer.ts` `src/extraction/AniAnalyzer.ts` `src/extraction/SklToActionMapper.ts`
