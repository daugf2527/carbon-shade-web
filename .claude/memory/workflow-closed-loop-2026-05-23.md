---
name: workflow-closed-loop-2026-05-23
description: "项目闭环三件套（analyze + completion + audit-verify）— 解决'测试多但抓不到 bug'问题"
metadata: 
  node_type: memory
  type: project
  originSessionId: a7230054-2ed9-4909-bc39-1a466f33595a
---

# Carbon Shade 工作流闭环（2026-05-23 建立）

## 问题

用户 2026-05-23 指出："测试文件写了一大堆，能测试出来的问题极少。很多问题都是让 agent 独立扫出来的。完整工作流闭环方案好像每个单点多少都有，但是不太好用。"

诊断：
- H1-H11 + npm run static:test 66 测试全过 —— 但今天的 7-agent C++ audit 抓的 19 个 P0/P1 bug 没一个被它们抓到（iconv UB / GlobalTable rehash UAF / NpkFile 句柄泄漏 / NutExtractor `"unknown"` 撒谎 / 6-int hitbox 语义猜错 / Day 11-13 没做但 audit 报表通过 / ...）
- 共同 pattern：测试**测一致性**（"parser X 处理 fixture Y 输出 expected Z"），不测真值。 fixture 和 expected 都是同一只手写的，自洽就过。
- 整个工作流"每个单点都有"（typecheck / static:test / build / depcruise / knip / event-trace / pipeline-dump / manifest-consumers）但全是被动 check，没主动 challenge。

## 解法：闭环三件套

### 1. `npm run analyze`（已有，8 gate）

被动 gate，抓表面：typecheck / static:test / build / depcruise-circular / knip / event-trace / pipeline-dump / manifest-consumers。**保留作为日常 CI。**

### 2. `npm run completion`（新，`scripts/completion.mjs`）

PRESENCE check —— 不验对错，只验"该建的建没建"。映射 `docs/plans/2026-05-22-stage1-data-pipeline-design.md` §5 Day 1-17 deliverable，逐项 grep / file-exists / CLI invoke / runGate 检查，输出 markdown 表 + `.tmp/completion.json`。

**什么时候用**：
- "Day N 完成了吗？" → 一行命令出答案
- pivot / 阶段切换前回头查"前面声称完成的真完成了吗"
- 给 CI 加 9 号 gate（信息性，不阻断）

**不解决**：实现是否正确（presence ≠ correctness）。

### 3. `/audit` skill + `npm run audit:verify`（新）

Agent-driven semantic audit with MANDATORY verification。

**工作流**：
1. `/audit` 在 Claude session 里触发（读 `.claude/audit-topics.json` → 并发 Sonnet agent → 各 agent 输出 `verification/audit-<ts>/agent-*.md`）
2. `node scripts/audit-verify.mjs verification/audit-<ts>/` 自动 re-read 每个 finding 的 cited file:line，对比 `evidence_excerpt` 跟真实代码，盖戳 `VERIFIED` / `CITATION_DRIFT` / `FILE_MISSING` / `FORMAT_ERROR`
3. SUMMARY.md 里只有 `VERIFIED` 的才算事实——**unverified 的 P0/P1 不能当 bug 上报**

**铁律**（per [[feedback-verify-agent-output-before-reporting]]）：
**Agent 的具体声明是 UNVERIFIED 直到 audit-verify 通过。** Verify 步骤不可跳。

**Finding 格式**（agent 必须严格遵守，否则 audit-verify 标 FORMAT_ERROR）：
```
## FINDING <num>
**severity**: P0 | P1 | P2
**claim**: <one-line>
**citation**: <relative/path>:<lineStart>-<lineEnd>
**evidence_excerpt**:
\`\`\`
<verbatim from the cited lines, no paraphrase>
\`\`\`
**reasoning**: <why>
---
```

audit-verify 用宽容白空规范化 + soft substring 匹配，所以引文可以比 cited 范围窄或宽，但内容不能撒谎。

**初始 topic**（`.claude/skills/audit/topics.json`）6 个：
- memory-safety（C++ dnf-extract）
- ts-parser-truth（silent-drop / sentinel-lie）
- pipeline-closure（EXTRACT→PARSE 完整性）
- deliverable-presence（vs 设计文档）
- test-effectiveness（找 tautological probe）
- contract-symmetry（C++ printX 跨函数对齐）

可扩。

## 三件套定位

| 工具 | 抓什么 | 漏什么 | 用法 |
|---|---|---|---|
| `npm run analyze` | 表面：类型、循环依赖、死代码、构建 | 语义对错 | CI 每次跑 |
| `npm run completion` | "该有的有没有" | 有了但对不对 | pivot / 阶段切换前 |
| `/audit` + `audit:verify` | 语义、跨语言、设计契约偏差 | 太贵跑不频繁 | 阶段闭环 / 重大改动后 |

## 关键原则

1. **不写 cargo cult memory**。本来我（2026-05-23 会话）打算把"17 条 meta-methods"全落档，被用户当面挑战：好几条恰好是"测试多 但抓不到 bug"的根源（H1-H11 分层、BASELINE_BUGS=0、Real-PVF fixtures inlined）—— 这些**写起来很专业，但只测自洽，不测真值**。
2. **测试自洽 ≠ 实现正确**。需要外部 oracle（H5 真 PVF 整合测试是唯一靠谱的 H，因为 PVF 是外部信源）。
3. **Agent audit 入工作流但必须复测**。Ad-hoc agent audit 比所有 H 测试加起来都有效，但 ad-hoc 意味着不稳定。固化进 skill + verify 脚本，让"找问题"和"信结论"分离。
4. **完成度盘要诚实**。Day 11-13 没做就是没做，不能因为"测试都过了"就以为完成了——测试只能验已实现的，不能验该实现的。
5. **主进程 Claude = reviewer + implementer，不再加一层 agent**。子进程 audit agent 是 broad parallel discovery；引文复测是 audit-verify.mjs auto；**结论核 + 修复 + 修后复测都是主进程亲为**——用 Read/Grep/Edit 直接做。再加一层"reviewer agent"是过度设计，会引入新的不可信源。
   信任链 = `子 agent (探针) → audit-verify (机器复测引文) → 主 Claude (判定+执行) → re-dispatch 同 topic agent (修后复测)`。

## 参考

- [[feedback-verify-agent-output-before-reporting]] — verification 铁律
- [[feedback-parallel-agents-min-sonnet]] — agent 起步线
- [[feedback-dnf-data-confidence-tiers]] — 三级证据等级（同源精神）
- `.claude/skills/audit/SKILL.md` — audit 工作流详细
- `.claude/skills/audit/topics.json` — topic 注册表
- `scripts/completion.mjs` — Day 1-17 完成度
- `scripts/audit-verify.mjs` — claim 复测
- `docs/plans/2026-05-22-stage1-data-pipeline-design.md` §5 — Day deliverable 源
