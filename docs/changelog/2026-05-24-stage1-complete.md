# Stage 1 Complete — DNF Data Pipeline (2026-05-24)

Stage 1 = the PVF data extraction + parse + validate + load + export pipeline,
producing entity-centric JSON shards that the future Stage 2 engine layer
consumes. **All 5 design stages (EXTRACT → PARSE → VALIDATE → LOAD → EXPORT)
are wired end-to-end, real-PVF smoke test passes in 4.2s, 30/31 completion
gates green (last 1 = this changelog).**

## Milestones

| Block | Days | Date range | Commit |
|---|---|---|---|
| C++ tool Lite (4 CLI flags + Defect 1 + cancel dual-semantics) | Day 1-3 | 2026-05-19 → 2026-05-21 | (pre-roadmap) |
| C++ tool Mid (M1 ref + M2 enum) | Day 4-5 | 2026-05-21 → 2026-05-22 | (pre-roadmap) |
| C++ tool Deep (D1 vec/mat + D3 provenance) | Day 6-7 | 2026-05-22 | (pre-roadmap) |
| Pipeline skeleton + 6+3 parsers + 11 probe suites | Day 8-10 | 2026-05-22 → 2026-05-23 | e36cf6a |
| Memory-safety audit rounds 1+2 (38 fixes) | Day 10 over | 2026-05-23 | fe6e545 / a05da0b |
| Closed-loop workflow triad (/audit + audit-verify + /closed-loop) | Day 10 over | 2026-05-23 | a827bd2 / fdaf9d4 |
| Day 1-17 retrospective + anti-drift roadmap (308 lines) | (planning) | 2026-05-23 | 250fb82 |
| Pre-Day-11 + Day 11 — MapParser + VALIDATE L2 + PvfDocument OOB | Day 11 | 2026-05-23 | e80ada3 |
| Day 12 — SQLite LOAD (Mirror + 10 per-domain VIEW) | Day 12 | 2026-05-23 | 942b91f |
| Day 13 — EXPORT entity-centric JSON shards + manifest | Day 13 | 2026-05-23 | 53d52a5 |
| Day 14 — smoke test + pipeline 全流程稳定 (--full / --incremental / --stop-at) | Day 14 | 2026-05-24 | 5798ab0 |
| Day 15-16 — baseline generator + parser fix surfaced by real PVF | Day 15-16 | 2026-05-24 | b10f3ee |
| Day 17 — 文档补完 (this entry) | Day 17 | 2026-05-24 | this commit |

## Pipeline shape (final)

```
                      ┌──────────────────────┐
PVF file paths ─────► │  EXTRACT             │ ─► PvfDocument[]
                      │  (dnf-extract --pipe)│
                      └──────────────────────┘
                                  │
                                  ▼
                      ┌──────────────────────┐
                      │  PARSE               │ ─► ParsedPvfDocument[]
                      │  parseStage.ts       │     (Chr/Mob/Atk/Skl/Dgn/Etc/Map)
                      │  + 3 standalone:     │
                      │    Ani / Nut / Img   │
                      └──────────────────────┘
                                  │
                                  ▼
                      ┌──────────────────────┐
                      │  VALIDATE L2         │ ─► VerificationReport
                      │  validator.ts        │     ProvenanceAuditReport
                      │  schema + ref +      │     (extraction-report-<runId>.json)
                      │  provenance + PvP    │     (provenance-audit-<runId>.json)
                      │  3-level err/warn/inf│
                      └──────────────────────┘
                                  │
                                  ▼
                      ┌──────────────────────┐
                      │  LOAD (opt-in)       │ ─► .tmp/pipeline.db
                      │  SqliteImporter.ts   │     pvf_files (mirror)
                      │  node:sqlite, 0 dep  │     extraction_runs
                      │                      │     refs
                      │                      │     + 10 per-domain VIEW
                      └──────────────────────┘
                                  │
                                  ▼
                      ┌──────────────────────┐
                      │  EXPORT (opt-in)     │ ─► dist/data/players/<job>.json
                      │  RuntimeExporter.ts  │     dist/data/monsters/<id>.json
                      │  PvE-only filtering  │     dist/data/dungeons/<id>.json
                      │  Incremental (sha256)│     dist/data/shared/{physics,enums}.json
                      │                      │     dist/data/manifest.json
                      └──────────────────────┘
```

## Key numbers (stage1-baseline run, real PVF, PVE-full mode @ 2026-05-27)

> **Refresh log**：原表基于 18-file curated subset（2026-05-24）。后续 commit `0d795f4`
> 切到 PVE-full（swordman 全量 + 11 player + goblin + jungle）+ commit `b6884f3`
> P1 加固后，下面是 **2026-05-27** 的真实 baseline，并由 2026-05-29 审计核对一致。

| Metric | Value (curated, 旧) | Value (PVE-full, 当前) |
|---|---|---|
| Pipeline wall-clock | 2.8 s | 4.7 s |
| Files extracted | 18 | **410** |
| Files parsed | 18 (100%) | **410 (100%)** |
| Parse errors | 0 | **0** |
| Validation errors | 0 | **0** |
| Validation warnings | 0 | **0** |
| Tier-3 fields surfaced | 44 | **439** (across 184 files) |
| PvP fields surfaced | 2 | **176** |
| Refs resolved / missing | 3 / 2086 | **n/a / 2099** (curated subset 仍排除 ref targets — 全量解析需独立一遍) |
| SQLite upserts | 18 | 410 |
| Export shards written | 15 (11 player + 1 monster + 2 shared + 1 manifest) | 14 (11 player + 1 monster + 1 dgn + manifest + shared 2) |
| `players/swordman.json` size | 244 KB | **2.29 MB** (PVE-full 全节填入；不再是 244 KB curated) |
| `players/demonicswordman.json` size | n/a | 2.30 MB |

## Overshoots beyond design

Things not in the original roadmap that became necessary, mid-flight:

- **38 C++ memory-safety fixes** (round 1: 19 in fe6e545 — iconv UB, heap
  overflow, UAF, handle leak, 48% load speedup; round 2: 19 in a05da0b —
  file-controlled memory safety). Surfaced by 7-agent C++ audit.
- **Closed-loop workflow basics** — `/audit` skill, `scripts/audit-verify.mjs`
  (mandatory claim re-check), `scripts/completion.mjs` dashboard,
  `/closed-loop` skill (9-step audit→fix→commit pipeline).
- **Pre-Day-11 cleanups** — 9 PvfReader / PvfDocument raw `stringBinMap[index]`
  sites bounds-guarded via new `PvfReader::lookupBin` helper; dead-code
  `StringLinkIndex` comment block removed.
- **ChrParser Tier-3 marks** — h4 PROBE 3 had logged the gap (parsers don't
  apply Tier-3 marks); Day 11 closed it by adding `asTier3()` helper +
  marking `jumpPower` / `jumpSpeed` / `weight` / `hitRecovery`.
- **MapParser** — design §7 listed it, audit P0 surfaced its absence; built
  Day 11 (Pre-Day-11 §3.1) with `MapDef` + 10-case h12 probe suite.
- **Standalone parser decision (Ani / Nut / Img)** — recorded as design
  §2.2.1 "已知设计后退". Union dispatch was rejected in favor of separate
  entry points because the 3 input shapes (animation / text / binary) are
  fundamentally different from `PvfDocument`.
- **ChrParser allowMixed fix (Day 15-16)** — Real PVF baseline surfaced
  that gunner / atgunner / priest / atfighter / thief have mixed ref +
  non-ref in `etc attack info` / `etc motion` sections. Switched to
  `{ allowMixed: true }`; non-ref content remains preserved in cloned
  `chr.sections`.

## Known debt going into Stage 2

Not blocking Stage 1 sign-off but recorded for the next-pass list:

- **`--list` warm-cache regression** — went from 2.5s to 10s; root cause
  un-isolated. Tracked since a05da0b commit message.
- **Incremental EXPORT timestamp noise** — shard sha256 includes
  per-field `provenance.extractTimestamp`, so PVF re-extraction generates
  fresh hashes even when content is semantically unchanged. Day 15+ work:
  add a "content fingerprint" hash that excludes timestamps for true
  incremental skip across extractor runs.
- **Standalone parser inputs not loaded by pipelineRunner** — animations,
  nut scripts, and PVF-embedded .img stubs flow through dedicated loaders.
  Stage 2 will need a unified entry that pulls all four shape categories
  (document + animation + text + binary) for runtime composition.
- **Refs resolution baseline** — 1138-2086 refs missing per baseline run
  (curated set deliberately excludes their targets). A full PVF run would
  resolve most of these, but that's not Stage 1 scope.
- **CUSTOM_ATTACKINFO enum** — only first 84 values mapped. The actual
  enum block in `dnf_enum_header.nut` may extend further; check on next
  PVF re-inspection.
- **Validator schema check migrated to Zod** — initially hand-rolled for
  zero-dep alignment with Day 12's `node:sqlite` policy, then migrated to
  Zod in commit `bcaf91e` once the per-field invariants started outweighing
  the dep-budget concern. validator.ts (`src/dnf-native-combat/data/validator.ts`)
  imports `z` and defines a `SourceConfidenceTierSchema` finite enum so
  `sourceType: "local_baseline"` can't be misspelled silently. Debt
  closed; entry kept here as a migration record.

## File inventory (new in Stage 1)

```
src/dnf-native-combat/data/
├── parsers/        (ChrParser/MobParser/AtkParser/SklParser/AniParser/
│                    DgnParser/EtcParser/MapParser/NutExtractor/ImgParser
│                    + parserUtils.ts + PvfDocumentLoader.ts)
├── types/          (Chr/Mob/Atk/Skl/Dgn/Etc/Map/Ani/Nut/Img + Provenance + PvfDocument)
├── pipeline/       (parseStage.ts + pipelineRunner.ts)
├── validator.ts    (Stage 1 VALIDATE L2)
├── importer/SqliteImporter.ts   (Stage 1 LOAD)
└── exporter/RuntimeExporter.ts  (Stage 1 EXPORT)

src/data/official/
├── dnfPhysicsConstants.ts       (Stage 1 EXPORT shared/physics.json source)
└── dnfEnumTables.ts             (Stage 1 EXPORT shared/enums.json source)

scripts/
├── pipeline.mjs                 (--pvf --file --full --incremental --stop-at)
├── import-to-sqlite.mjs         (focused LOAD CLI)
├── export-runtime-json.mjs      (focused EXPORT CLI)
├── stage1-baseline.mjs          (baseline report generator)
├── smoke-test.mjs               (tests/smoke runner)
├── completion.mjs               (Day 1-17 dashboard)
├── audit-verify.mjs             (citation re-check)
└── closed-loop-status.mjs       (workflow state machine)

tests/static/
├── dnf-native-h1-parser-probes.test.ts
├── dnf-native-h2-loader-probes.test.ts
├── dnf-native-h3-pipeline-probes.test.ts
├── dnf-native-h4-schema-audit-probes.test.ts
├── dnf-native-h5-real-pvf-probes.test.ts
├── dnf-native-h6-skl-parser-probes.test.ts
├── dnf-native-h7-ani-parser-probes.test.ts
├── dnf-native-h8-nut-extractor-probes.test.ts
├── dnf-native-h9-dgn-parser-probes.test.ts
├── dnf-native-h10-etc-parser-probes.test.ts
├── dnf-native-h11-img-parser-probes.test.ts
├── dnf-native-h12-map-parser-probes.test.ts    (Day 11 added)
├── dnf-native-h13-validator-probes.test.ts     (Day 11 added)
├── dnf-native-h14-sqlite-probes.test.ts        (Day 12 added)
└── dnf-native-h15-export-probes.test.ts        (Day 13 + Day 14 added)

tests/smoke/
└── full-pipeline.test.ts                       (Day 14, env-gated by DNF_PVF_PATH)

tools/dnf-porting-src/                          (C++ extractor source)
└── EnumTables.h                                (Day 4-5 added)
```

## Gates state at Stage 1 close

```
npm run typecheck             passed
npm run static:test           passed (75/76; tick-benchmark.test.ts microbench
                              偶发超阈 670μs/tick > 500μs，与 Stage 1 数据
                              管线无关，是 master 战斗内核的性能 microbench)
npm run build                 passed
npm run analyze               8/8 gates pass (depcruise circular=0, ...)
npm run completion            31/31 deliverables present (2026-05-29 实测)
DNF_PVF_PATH=... smoke:pipeline   PASS in 4.2s
```

## 2026-05-29 审计补遗（doc-vs-real drift 修正）

5-29 用户怀疑"Stage 1 完成"是否真的端到端。实测结果：

- **5 stage 实质（非 stub）实现** — 8 个核心文件（pipelineRunner / parseStage /
  validator / SqliteImporter / RuntimeExporter + 4 关键 parsers）逐一核查，
  全部为真实业务逻辑，无 `not implemented` / 空 catch / `return []`。
- **PVE-full baseline 实测一致** — 410 文件 / 0 错误 / 0 警告 / swordman.json
  2.29 MB / shape_version=1.0.0 / sha256+sizeBytes 都在 manifest 里。
- **31/31 deliverable 全绿** — `npm run completion` 输出。
- **3 处遗留**（不阻断 Stage 1 sign-off，但**不能再宣称"全通"**）：
  1. **3 个 standalone parser（Ani / Nut / Img）未 wired 进 pipelineRunner
     dispatch** — parseStage.ts:77-83 自己注释承认。Stage 2 Phase 1 backlog。
  2. **refIntegrity 2099 条 ref 未解析** — curated set 故意排除 ref targets，
     不算 bug；但**不能用于"全 PVF 都干净"的推论**。需独立一遍 full-PVF run
     才能证。
  3. **本表的旧数字（18 文件 / 2.8s / 244 KB）** 已被 PVE-full（commit
     `0d795f4`）覆盖 5 天才在本次审计补刷 — 典型 doc/code drift。

## What Stage 2 looks like (preview, NOT implementation)

Per [`2026-05-22-dnf-native-v2-design.md`](../plans/2026-05-22-dnf-native-v2-design.md) §3 — 13-system engine
on top of the runtime JSON shards Stage 1 emits. Brainstorm topics seeded
in `docs/planning/2026-05-24-stage2-brainstorm.md` (this commit). No code
on this side yet — per
[[combat-lab-dnf-alignment-pivot-2026-05-21]] memory, Stage 2 implementation
waits until Stage 1 is fully signed off (which means after the user
explicitly approves this changelog).
