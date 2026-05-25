# 全链路静态质检报告 — dnf-native 管线

**日期**: 2026-05-25  
**分支**: `dnf-native`  
**审计范围**: C++ dnf-extract (~2600 行) + TypeScript 管线 (~4900 行)  
**审计方法**: 静态代码审查（6 Agent 并行），未经动态 PVF 运行验证  
**状态**: ⚠️ 待动态验证 — 所有发现均基于静态分析，需在 Windows 上用真实 Script.pvf 跑一遍确认

---

## P0 — 立即修复（数据静默损坏 / UB / 安全边界）

### P0-1. stringtable +4 偏移可能双重跳过
- **文件**: `tools/dnf-porting-src/PvfReader.cpp:323`
- **问题**: `(char*)buffer + startPos + 4` — 若 PVF stringtable offset 约定是相对 body 而非绝对文件偏移，则每个字符串丢前 4 字节。230K+ 条目"解码成功"≠内容正确。
- **触发条件**: 取决于 Neople PVF 格式的 offset 基准约定
- **验证方法**: 用已知韩文技能名（可从 Neople Open API 或 DFO World Wiki 交叉对照），对比 `stringtable_body[startPos]` vs `stringtable_body[startPos + 4]` 的字节
- **静态置信度**: 中 — 无法从代码推断 offset 基准

### P0-2. 有符号左移 UB
- **文件**: `tools/dnf-porting-src/PvfReader.h:73-84`
- **问题**: `read<int32_t>()` 当字节 ≥0x80 时 `val << (8 * i)` 触发有符号左移溢出，C++17 UB。ARM (Termux/Android) 上编译器可产生任意结果。
- **触发条件**: 任何 PVF 文件中 int32 字段高位字节 ≥0x80（极常见：所有负数、所有 ≥2^31 的值）
- **验证方法**: 编译时加 `-fsanitize=undefined`，跑一次提取
- **静态置信度**: 高 — 代码逻辑明确，UB 确定存在

### P0-3. ani 逐帧属性 unknown type 不消费数据
- **文件**: `tools/dnf-porting-src/PvfAnimation.cpp:83-163`
- **问题**: per-frame property switch 中 type 2/4/5/6/19/20/21/22 以及 DAMAGE_BOX/ATTACK_BOX 的 default 为空 break，不消费该属性的数据 payload。流指针不错位 → 后续所有帧解析全乱。
- **触发条件**: 真实 .ani 文件中出现这些 property type
- **验证方法**: 选一个已知动画的 .ani，在 C++ 端加日志打印每个 property type，看是否有 unknown type 出现
- **静态置信度**: 中 — 不确定真实 PVF 中这些 type 是否出现

### P0-4. NpkFile::read<T>() 不检查 fread 返回值
- **文件**: `tools/dnf-porting-src/NpkFile.h:39-45`
- **问题**: `fread(&t, sizeof(T), 1, file)` 返回值不检查。截断/损坏 NPK → 未初始化内存值 → 绕过后续边界检查。
- **触发条件**: 截断或损坏的 NPK 文件
- **验证方法**: 手动截断一个 NPK 文件尾部，跑提取看是否产生垃圾数据
- **静态置信度**: 高 — 代码明确

### P0-5. Zod 零数值范围约束
- **文件**: `src/dnf-native-combat/data/validator.ts` (全文件)
- **问题**: 所有 `z.number()` 无一加 `.min()/.max()/.int()/.finite()`。NaN、Infinity、负HP、level=99999 全部通过校验入 SQLite。
- **触发条件**: 任何解析器产出越界数值
- **验证方法**: 检查现有 SQLite 数据库中是否有越界数值（`SELECT min(hp), max(hp) FROM ...`）
- **静态置信度**: 高 — grep 确认零个 .min()/.max()/.int() 调用

### P0-6. Zod 零数组长度约束
- **文件**: `src/dnf-native-combat/data/validator.ts` (全文件)
- **问题**: 所有 `z.array()` 无一加 `.min()/.max()`。growth table 可为空、widthBox 可为 `[]`。
- **触发条件**: 解析器产出空数组或异常长数组
- **验证方法**: 检查现有 SQLite 中数组字段的长度分布
- **静态置信度**: 高 — grep 确认零个 .min()/.max() 调用

### P0-7. worldmapPatternInfo 用 z.unknown()
- **文件**: `src/dnf-native-combat/data/validator.ts:444`
- **问题**: TS type 是 `PvfAttribute[] | null`，Zod 是 `z.nullable(z.array(z.unknown()))`。畸形数据穿透。
- **触发条件**: DgnParser 产出非标准 PvfAttribute
- **验证方法**: 检查现有 parse.jsonl 中 worldmapPatternInfo 的实际数据结构
- **静态置信度**: 高 — 代码明确

### P0-8. extraction_runs INSERT 在事务外
- **文件**: `src/dnf-native-combat/data/importer/SqliteImporter.ts:255-303`
- **问题**: `extraction_runs` 行在 `BEGIN` 之前插入。rollback 后留下孤立的 "completed" 运行记录，stats 与实际 pvf_files 不一致。
- **触发条件**: 任何导致事务 rollback 的导入失败
- **验证方法**: 故意造一条无法序列化的数据触发 rollback，检查 DB 中 extraction_runs 是否有对应记录
- **静态置信度**: 高 — 代码逻辑明确

---

## P1 — 应该修（功能正确性 / 健壮性 / 可观测性）

### P1-9. fread header 不检查返回值
- **文件**: `tools/dnf-porting-src/PvfReader.cpp:126,137`
- **问题**: `fread(&header, sizeof(PvfHeader), 1, file)` 失败后 header 未初始化，后续所有解析基于垃圾值
- **静态置信度**: 高

### P1-10. numFilesInDirTree 无上限
- **文件**: `tools/dnf-porting-src/PvfReader.cpp:148`
- **问题**: dirTreeLength 被 Audit F7 限制在 256MB，但 numFilesInDirTree 无单独上限
- **静态置信度**: 中 — 实际 PVF 中不会超

### P1-11. expand() 返回 nullptr 不检查
- **文件**: `tools/dnf-porting-src/PvfNode.cpp:27,40,60`
- **问题**: 三个脚本类型分支都不检查 expand() 的 nullptr 返回，直接传 nullptr 给构造函数
- **静态置信度**: 高

### P1-12. NPK loadAll 运算符优先级
- **文件**: `tools/dnf-porting-src/NpkFile.cpp:74-78`
- **问题**: `endWith(".npk") || endWith(".NPK") && !isDir` — `.npk` 文件跳过 `!isDir` 检查
- **静态置信度**: 高

### P1-13. 全局参数段 unknown type 也不消费数据
- **文件**: `tools/dnf-porting-src/PvfAnimation.cpp:33-46`
- **问题**: 同 P0-3，但是全局参数段的 LOOP/SHADOW 之外的 type
- **静态置信度**: 中

### P1-14. IMG version dispatch 不完整
- **文件**: `tools/dnf-porting-src/ImgFile.cpp:115-136`
- **问题**: switch 只处理 v4/v5/v6，v1/v2 部分处理，v3/v7+ 完全未处理
- **静态置信度**: 中 — 取决于真实 NPK 中 IMG 版本分布

### P1-15. const_cast 给 iconv 写指针
- **文件**: `tools/dnf-porting-src/PvfReader.cpp:108,118`
- **问题**: `iconv(cd, const_cast<char**>(&inbuf), ...)` — 修改 const 参数是 UB
- **静态置信度**: 高

### P1-16. 文件解密后不做 CRC 校验
- **文件**: `tools/dnf-porting-src/PvfReader.cpp:215-234`
- **问题**: 每个文件有 fileCrc32 但只用作 XOR key，不解密后验证。损坏 PVF 静默产出垃圾 JSON
- **静态置信度**: 高

### P1-17. 构造函数里 exit(1)
- **文件**: `tools/dnf-porting-src/PvfReader.cpp:64-68`
- **问题**: fopen 失败直接 exit(1)，无法优雅处理
- **静态置信度**: 高

### P1-18. CP949 硬编码
- **文件**: `tools/dnf-porting-src/PvfReader.h:42`
- **问题**: 中文(CP936)/日文(CP932) PVF 全变乱码。EncodingType enum 定义了但没切换逻辑
- **静态置信度**: 高

### P1-19. finishedAt 时间戳过早
- **文件**: `src/dnf-native-combat/data/pipeline/pipelineRunner.ts:126`
- **问题**: PARSE 后就捕获 finishedAt，VALIDATE/LOAD/EXPORT 阶段的时间戳全错
- **静态置信度**: 高

### P1-20. dnf-extract 子进程无超时
- **文件**: `src/dnf-native-combat/data/parsers/PvfDocumentLoader.ts:109`
- **问题**: spawn 无 timeout，PVF 损坏导致 C++ hang → 管线永久阻塞
- **静态置信度**: 高

### P1-21. 非 document 类型静默丢弃
- **文件**: `src/dnf-native-combat/data/parsers/PvfDocumentLoader.ts:67-86`
- **问题**: animation/text/binary 类型只 console.warn，调用方无程序化感知
- **静态置信度**: 高

### P1-22. 未知扩展名直接 throw
- **文件**: `src/dnf-native-combat/data/pipeline/parseStage.ts:53`
- **问题**: 未知扩展名 throw 无 raw fallback，新文件类型导致整批失败
- **静态置信度**: 中

### P1-23. 增量模式 N+1 SELECT
- **文件**: `src/dnf-native-combat/data/importer/SqliteImporter.ts:307`
- **问题**: 每个文件一条 SELECT，370K 文件 = 370K 次查询 ≈ 18-37 秒纯 DB 查
- **静态置信度**: 高

### P1-24. manifest 非原子写入
- **文件**: `src/dnf-native-combat/data/exporter/RuntimeExporter.ts:331`
- **问题**: writeFile 先 truncate 再写，崩溃留损坏 JSON。应用 tmp + rename 模式
- **静态置信度**: 高

### P1-25. SourceConfidenceTier 不一致
- **文件**: `src/dnf-native-combat/data/validator.ts:174-179` vs `types/Provenance.ts:8`
- **问题**: Zod 接受 `"experimental"`，TS type 只有 `"tier1" | "tier2" | "local_baseline"`
- **静态置信度**: 高

### P1-26. PvfAttributeSchema 是 passthrough
- **文件**: `src/dnf-native-combat/data/validator.ts:219`
- **问题**: 只验 `t: string`，不验 discriminated union 各分支的字段完整性
- **静态置信度**: 高

### P1-27. 成功/失败输出格式不一致
- **文件**: `scripts/pipeline.mjs:208-234`
- **问题**: 成功输出 JSON，失败输出纯文本 `"Pipeline failed: ..."`，CI 无法统一解析
- **静态置信度**: 高

### P1-28. --no-verification 名字误导
- **文件**: `scripts/pipeline.mjs:148-150`
- **问题**: 标志名暗示跳过校验，实际只跳过报告写入，校验逻辑照跑且仍能阻断 LOAD/EXPORT
- **静态置信度**: 高

---

## P2 — 择机修（边界情况 / 开发体验 / 技术债）

| # | 文件 | 问题 |
|---|------|------|
| P2-29 | `PvfReader.cpp:310-311` | 最后一个 stringtable entry 的 endPos 读越界 4 字节 |
| P2-30 | `PvfReader.cpp:197` | fileVersion 从未校验，固定假设 dir-tree entry layout |
| P2-31 | `PvfReader.cpp:235-257` | dfsCreateNode 无深度限制递归，极端路径嵌套可爆栈 |
| P2-32 | `ImgFile.cpp:165-166` | IMG v1 texture.size 无边界检查，错一位后续帧全偏 |
| P2-33 | `NpkFile.cpp:32-40` | move 构造后 offset/length 未重置，use-after-move 隐患 |
| P2-34 | `NpkFile.cpp:63` | ftell → uint32_t 截断，>4GB NPK 长度错误 |
| P2-35 | `main.cpp:519-541` | printBinaryJson 缺 provenance 字段 (extractor_version/timestamp/hash) |
| P2-36 | `main.cpp:417-423` | cancel*.skl 的 aliases 字段不在 JS PvfSection type 里 |
| P2-37 | `scripts/pipeline.mjs:72` | --full/--incremental 不互斥校验，后胜 |
| P2-38 | `scripts/pipeline.mjs:68-70` | --domain/--job/--pattern 占位标志静默忽略 |
| P2-39 | `PvfDocumentLoader.ts:121` | stdin write 不检查 backpressure (write 返回 false) |
| P2-40 | `smoke-test.mjs:40,58` | 无测试文件时 exit 0，CI 可能漏报"零测试通过" |
| P2-41 | `pipelineRunner.ts:160` | verificationOutDir null vs undefined 判断不一致 |
| P2-42 | `pipelineRunner.ts:160-167` | 验证报告按 runId 无限累积无清理 |
| P2-43 | `SqliteImporter.ts:55` | file_size 列声明了但从未填充，始终 NULL |
| P2-44 | `SqliteImporter.ts:305-330` | 全量模式不清理已从 PVF 中删除的文件行 |
| P2-45 | `validator.ts:451` | EtcDef.indexedValues key type: TS 写 `number`，Zod 验 `string` |
| P2-46 | `validator.ts` (全局) | 所有 schema 不加 .strict()，跨 kind 字段污染不可检测 |
| P2-47 | `scripts/pipeline.mjs:234` | 退出码只有 1 和 2，不区分"数据坏了"vs"工具崩了"vs"环境问题" |
| P2-48 | `scripts/export-runtime-json.mjs` | 不暴露 incremental 和 contentFingerprint 功能到 CLI |

---

## 已知已修复且确认到位的历史 Audit

C++ 端 20 个 `Audit F1-F20` 标记全部验证通过，无回退：
- F1: outChr 溢出 / F2: imgId OOB / F3: n_string.lst OOB / F5: linkId OOB
- F6: nullptr stringtable / F7: dirTreeLength cap / F8: stringtable count cap
- F9: colorBoard count cap / F10: readBytes 负数 len / F11: fileLength 溢出
- F12: indexCount cap / F13: mapImages count cap / F14: pop 递归→迭代
- F15: endWith 下溢 / F16: header.count cap / F17: n_string.lst magic assert
- F18: ftell 错误 / F19: relativeOffset 溢出 / F20: nullNode unpack throw

---

## 动态验证计划

以下 P0 问题**强烈建议**在 Windows 上用真实 `Script.pvf` + `ImagePacks2/` 跑一遍确认：

| 问题 | 验证方法 | 预期 |
|------|---------|------|
| P0-1 stringtable +4 | 取一个已知韩文技能名，hexdump 对应 stringtable_body 偏移处的字节，人工解码 CP949 → UTF-8 对照 | 若偏移正确则字符串开头是有效韩文；若双跳则开头 4 字节丢失 |
| P0-2 左移 UB | 编译加 `-fsanitize=undefined` 跑一次完整提取 | 若有 UB sanitizer 会报 |
| P0-3 ani unknown type | 选几个常见 .ani 加日志打印 property type，统计是否有 unknown type 出现 | 期望全部已知 |
| P0-4 fread 不检查 | 手动截断一个 NPK 末尾 100 字节，跑提取看结果 | 应报错而非产出垃圾 |
| P0-5/6 Zod 约束 | 查 SQLite: `SELECT MIN(hp), MAX(hp) FROM ...` 等 | 期望数值在合理范围 |
| P0-7 worldmapPatternInfo | 检查 parse.jsonl 中实际 worldmapPatternInfo 结构 | 期望全是合法 PvfAttribute |
| P0-8 事务外 INSERT | 故意喂一条不可序列化的数据触发 rollback | 期望 extraction_runs 无对应记录 |

---

## 统计

| 级别 | 数量 |
|------|------|
| P0 | 8 |
| P1 | 20 |
| P2 | 20 |
| **合计** | **48** |

---

*本报告由 6 个并行 Agent 静态代码审查生成，未经动态运行验证。明天在 Windows 上跑完真实 PVF 数据后，逐项标注"已确认"/"误报"/"不适用"。*
