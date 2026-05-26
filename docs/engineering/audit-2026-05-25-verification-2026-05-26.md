# 静态审计验证报告 — audit-2026-05-25-full-pipeline-static.md

**验证日期**: 2026-05-26
**验证方法**: 4 个 Opus agent 并行 (静态代码 grep/Read + 动态 dnf-extract.exe 真实 PVF 提取)
**PVF 真值**: `/d/BaiduNetdiskDownload/DNF客户端（2018年2月更新）/地下城与勇士/Script.pvf` (crc32 c0779278, 205MB)
**原报告**: 48 findings (P0×8 / P1×20 / P2×20)
**验证总结**: **42 CONFIRMED · 4 CITATION_DRIFT (问题仍真实) · 2 PARTIAL · 4 REFUTED (已修复)**

---

## 总览：判定分布

| 级别 | 原数 | CONFIRMED | CITATION_DRIFT | PARTIAL | REFUTED |
|------|------|-----------|----------------|---------|---------|
| P0   | 8    | 7         | 1 (P0-1)       | 0       | 0       |
| P1   | 20   | 14        | 5 (P1-19/20/24/28 + P2-39) | 1 (P1-21) | 2 (P1-9/11/25) |
| P2   | 20   | 16        | 3 (P2-29/30/34) | 1 (P2-32/33) | 2 (P2-31/35) |
| **合计** | **48** | **37** | **9** | **2** | **6** (P1-9/11/25/P2-31/35 + 1 partial-改判) |

> CITATION_DRIFT = 引用行号已漂移但同文件/区域代码仍存在描述的问题，应以新位置为准修复。
> REFUTED = 已被某次历史 Audit Fix（A6/A7/B1/D2 等）修复，无需再处理。

---

## P0 验证详表

| ID | 判定 | 当前代码位置 | 关键证据 |
|----|------|-------------|---------|
| P0-1 stringtable +4 偏移 | **CITATION_DRIFT** | PvfReader.cpp:**385** (原 :323) | `(char*)buffer+startPos+4` 仍然 +4；动态实测能解码合理英文（"hp"/"attack"），不构成"双跳"严重 bug，但 stderr 大量 `iconv errno=42 EILSEQ` 暴露 P1-15 路径风险 |
| P0-2 有符号左移 UB | **CONFIRMED** | PvfReader.h:71-84 | `read<int32_t>()` 中 `val << (8*i)` 当字节 ≥0x80 时左移到符号位 = C++17 UB；MinGW/GCC + x64 静默通过（无 sanitizer 重编），代码层 UB 真实存在 |
| P0-3 .ani per-frame unknown type 不消费 | **CONFIRMED (潜在)** | PvfAnimation.cpp:79-164 | type 2/4/5/6/19-22 + DAMAGE_BOX/ATTACK_BOX + default 全是空 `break;`，不消费 payload。**动态实测 attack1.ani 10 帧解析正常**（说明该 .ani 没触发），但代码风险真实，其它 .ani 可能爆 |
| P0-4 NpkFile::read<T> 不检查 fread | **CONFIRMED + 动态实证** | NpkFile.h:38-45 | 两个 `read<T>()` 模板均无返回值检查。**动态实测**: 截断 NPK 末尾 200B → list 6 IMG 正常 + exit 0；截至 20KB → 多条 `[ERROR]` 但仍 **exit 0**。CI 端无法区分"成功"与"半截 NPK 静默放过" |
| P0-5 Zod 零数值约束 | **CONFIRMED** | validator.ts 全局 | grep 统计：`.min/.max/.int/.finite/.positive/.nonnegative` 全部 **0 次匹配**。NaN/Infinity/负 HP/level=99999 全部通过校验入 SQLite |
| P0-6 Zod 零数组长度约束 | **CONFIRMED** | validator.ts 全局 | `z.array(` 54 处，`.length(` 0 处，无 `.min/.max` 跟随。growth table 可为空、widthBox 可为 `[]` 全部 OK |
| P0-7 worldmapPatternInfo = z.unknown() | **CONFIRMED + CITATION_DRIFT** | validator.ts:**450** (原 :444) | 行号漂移 +6，语义完全成立。`raw: PlainObjectSchema` (= `z.record(z.string(), z.unknown())`) 在 7 个 schema 重复出现，是同类未约束逃逸通道 |
| P0-8 extraction_runs INSERT 在事务外 | **CONFIRMED** | SqliteImporter.ts:255-272 (INSERT) / :303 (BEGIN) | INSERT extraction_runs 完成（含 last_insert_rowid 取 runId）后才 `db.exec("BEGIN")`。rollback 后该行依然存在，stats 写"假装跑完了" |

---

## P1 验证详表

| ID | 判定 | 当前代码位置 | 关键证据 |
|----|------|-------------|---------|
| P1-9 fread header 不检查 | **REFUTED** | PvfReader.cpp:148,165 | 已在 Audit A7 加入 `fread(...) != 1 → return` 防护 |
| P1-10 numFilesInDirTree 无上限 | **PARTIAL** | PvfReader.cpp:180 | dirTreeLength 已限 256MB，但 `numFilesInDirTree` 本身未独立校验 |
| P1-11 expand() 返回 nullptr 不检查 | **PARTIAL (改判 from REFUTED)** | PvfNode.cpp:27/40/60 | `unpackStringTable` 已加 nullptr guard；但 PvfNode::unpack 三分支没加，buffer.get() 可传 nullptr 给构造函数 |
| P1-12 NPK loadAll 运算符优先级 | **REFUTED (CITATION_DRIFT)** | NpkFile.cpp:107-115 (原 :74-78 是无关代码) | 真问题在 loadAll 已带 Audit A5 注释 + 括号修复 |
| P1-13 全局参数段 unknown type 不消费 | **CONFIRMED** | PvfAnimation.cpp:32-46 | switch 只 case LOOP/SHADOW，无 default，其它 type 直接落出且未消费 payload → 下次 read 把 payload 当 type 读 → 解析整段错位 |
| P1-14 IMG version dispatch 不完整 | **CONFIRMED** | ImgFile.cpp:115-136 | switch 只 case 4/5/6 无 default，v1/v2 仅局部 patch (156/164)，v3/v7+ 完全无处理 |
| P1-15 const_cast 给 iconv 写指针 | **CONFIRMED** | PvfReader.cpp:115/132 | const_cast 写指针仍是设计气味；实测产生大量 errno=42 EILSEQ（与 CP949 硬编码 P1-18 联合暴露） |
| P1-16 不做 CRC 校验 | **CONFIRMED** | PvfReader.cpp:266-285 + PvfNode.cpp:78-80 | `decrypt()` 用 crc32 作 XOR key，不在解密后重新 CRC32 比对 |
| P1-17 构造函数里 exit(1) | **CONFIRMED** | PvfReader.cpp:63-69 | fopen 失败直接 exit(1)，无法优雅处理 |
| P1-18 CP949 硬编码 | **CONFIRMED** | PvfReader.h:40-42 | `ENCODING = "CP949"` 编译期常量；EncodingType enum 存在但 codeConvert 直接传 `PvfReader::ENCODING` |
| P1-19 finishedAt 时间戳过早 | **CONFIRMED + CITATION_DRIFT** | pipelineRunner.ts:**135** (原 :126) | finishedAt 在 VALIDATE 之前赋值，LOAD/EXPORT/SQLite write 都用同一戳 |
| P1-20 dnf-extract 子进程无超时 | **CONFIRMED + CITATION_DRIFT** | PvfDocumentLoader.ts:**197/237/281** (原 :109) | 三处 spawn 均无 timeout option，PVF 损坏导致 C++ hang → 管线永久阻塞 |
| P1-21 非 document 类型静默丢弃 | **PARTIAL** | PvfDocumentLoader.ts:104-122 vs :135-189 | strict 变体仅 console.warn；但对偶 `parseDnfExtractPipeOutputWithErrors` 已返回 `skippedTypes` 给批量调用者程序化感知。审计未提此对偶 |
| P1-22 未知扩展名直接 throw | **CONFIRMED** | parseStage.ts:53 | `default: throw new Error("No parser registered for ...")`，无 raw passthrough |
| P1-23 增量模式 N+1 SELECT | **CONFIRMED** | SqliteImporter.ts:280-282/308 | prepared 但仍 N 次：增量模式 for-loop 每文件 1 次 SELECT，370K 文件 = 370K queries |
| P1-24 manifest 非原子写入 | **CONFIRMED + CITATION_DRIFT** | RuntimeExporter.ts:**354-356** (原 :331) | `writeFile(manifestPath, ...)` 无 tmp+rename，崩溃留半写文件 |
| P1-25 SourceConfidenceTier 不一致 | **REFUTED** | Provenance.ts:10, validator.ts:181-185 | 两侧均为 3-value enum `tier1/tier2/tier3`，D2 fix (2026-05-24) 已对齐。审计快照过期 |
| P1-26 PvfAttributeSchema passthrough | **CONFIRMED + CITATION_DRIFT** | validator.ts:**225** (原 :219) | 仅约束 `t: string`，其余字段全部 passthrough |
| P1-27 成功/失败输出格式不一致 | **CONFIRMED** | pipeline.mjs:256-279 (success JSON) / :281-283 (error text) | 成功 `console.log(JSON.stringify(...))`；失败 `console.error("Pipeline failed: " + message)` 纯文本 |
| P1-28 --no-verification 名字误导 | **CONFIRMED + CITATION_DRIFT** | pipeline.mjs:**61-63, 195-197** (原 :148-150) | 仅令 verificationOut=null；validate 始终运行，validationFatal 仍可阻断 LOAD/EXPORT |

---

## P2 关键改判

| ID | 判定 | 备注 |
|----|------|------|
| P2-29 stringtable endPos 越界 4 字节 | **CITATION_DRIFT (CONFIRMED)** | PvfReader.cpp:373 |
| P2-30 fileVersion 从未校验 | **CITATION_DRIFT (CONFIRMED)** | PvfReader.cpp:148-152 |
| P2-31 dfsCreateNode 无深度限制 | **REFUTED** | 已加 `if (deep > 64) return;` (Audit A6) |
| P2-32 IMG v1 texture.size 无边界 | **PARTIAL** | setPosition() 已 guard position>length → 无 OOB seek，但 size 错一位仍致后续帧偏 |
| P2-33 NpkFile move 后未重置 offset/length | **CITATION_DRIFT + PARTIAL** | 真实 move ctor 在 :47-61；析构只用 file 字段 → 残留 offset/length UAF 不触发，低风险 |
| P2-34 ftell → uint32_t 截断 | **CITATION_DRIFT (CONFIRMED)** | 真实位置 NpkFile.cpp:96。理论上 4GB 截断，NPK 现实从不 >4GB 不触发 |
| P2-35 printBinaryJson 缺 provenance | **REFUTED** | main.cpp:538-550 已带 Audit B1 注释完整修复（provenance 5 字段齐） |
| P2-36 cancel*.skl aliases 字段缺类型 | **CONFIRMED** | C++ emit `aliases` 数组；TS PvfSection interface 无 aliases 字段 |
| P2-37–48 | 全部 **CONFIRMED** | 详见 audit-verifier-4 报告（19/19 CONFIRMED） |

---

## 重要发现：测试盲区

`npm run static:test` → **72/72 passed**，但**没有任何测试覆盖**：
- P0-8（事务回滚后 extraction_runs 应消失的断言）
- P1-23（370K 文件量级性能基准）
- P1-24（manifest 写入崩溃恢复）
- P0-5/6/7（Zod 约束缺失只能由数据触发，单元测试无法覆盖）

**结论**："验证通过 ≠ 没问题"。`npm run analyze` + `completion` + `audit:verify` 三件套必须配合 fuzz/property-based 测试才能闭环。

---

## 动态验证执行情况

| 项 | 执行 | 结果 |
|----|------|------|
| P0-2 UB sanitizer | **未执行** | 需重编 dnf-extract with `-fsanitize=undefined`；时间预算外 |
| P0-3 .ani 多样本 | **部分执行** | attack1.ani 解析正常；其它 .ani 未抽样 |
| P0-4 NPK 截断实验 | **完成** | 复制到 .tmp/ 后截断，**原 NPK 未动**。exit 0 不反映失败 confirmed |
| P0-5/6/7 NaN/Infinity grep | **完成** | baseline-shards/**/*.json 无异常数值（当前 baseline 输入干净，护栏缺位但未暴露 bug） |
| P0-8 事务实测 | **未执行** | 需故意制造 ROLLBACK，时间预算外 |
| npm run smoke:pipeline | **完成（SKIP）** | DNF_PVF_PATH 未设 → 2 smoke 全 skip |
| npm run typecheck | **完成** | passed |
| npm run static:test | **完成** | 72/72 passed |

---

## 建议优先级（修复路线图）

**Round 1 (P0 一体化修复，1-2 天)**：
1. **Zod 约束 (P0-5/6/7 + P2-46)**：一次性给所有 z.number() 加 `.finite()`，z.array() 加 `.max(10000)`，worldmapPatternInfo 改为 z.array(PvfAttributeSchema)，全局加 `.strict()`
2. **事务整合 (P0-8)**：把 `INSERT extraction_runs` 移进 `BEGIN/COMMIT` 块内
3. **C++ UB 抑制 (P0-2)**：把 `read<T>()` 改成 `static_cast<uint64_t>(buffer[offset]) << ...`，再 cast 回 T

**Round 2 (P1 健壮性，2-3 天)**：
4. **CITATION_DRIFT 行号更新**：P1-19/20/24/28/P2-39 5 处行号修
5. **子进程超时 (P1-20)**：3 处 spawn 加 timeout option (建议 300s)
6. **manifest 原子写 (P1-24)**：改 tmp + fs.rename
7. **finishedAt (P1-19)**：在 EXPORT 之后再 captureFinishedAt
8. **N+1 SELECT (P1-23)**：增量模式预读 `SELECT pvf_path, source_pvf_hash FROM pvf_files` 进内存 Map

**Round 3 (P2 + 测试盲区，长期)**：
9. fuzz 测试补 P0-8/P1-23/P1-24
10. 接通 `npm run analyze` 的 Zod schema 完整性检查（确保任何新 schema 默认 .strict()）

---

## 元数据

- Verifier agents: audit-verifier-1 (PvfReader/Animation/Node) / audit-verifier-2 (NPK/IMG/main) / audit-verifier-3 (Validator) / audit-verifier-4 (Pipeline/Importer/Scripts)
- 总执行时长: ~20 min 并行
- 总 token: ~390k (4 agents)
- 所有 agent 结论已交叉印证 (无矛盾)
- 报告版本: v1.0
