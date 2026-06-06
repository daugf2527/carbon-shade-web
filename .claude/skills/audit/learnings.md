# Learnings: audit

> Append-only log. /session-debrief 跑完会向这里追加教训。
>
> 每条 entry 应回答：
> - agent 报的 finding 哪个被 audit-verify reject? (反推 prompt 措辞)
> - cited file:line 漂移最频繁的 audit 场景？(反推到防漂移规则)
> - audit scope 设得太宽 / 太窄？

| Date | Topic | Lesson |
|------|-------|--------|
| 2026-05-26 | initial | placeholder — 首次 /session-debrief append 时填 |
| 2026-06-06 | tooling-qa-8agent | 8 agent 并行审计工具链：agent 的**修复建议**也是 UNVERIFIED。某 agent 建议 `--max-old-space-size=8192` 治 OOM，实测 303s vs 338s 无差别（无用），真根因是单测 h5 跑 197s。→ agent 的"性能/参数建议"必须运行时实测，别照搬。见 [[feedback-red-root-cause-needs-runtime-evidence]] |
| 2026-06-06 | audit-scope-framing | dnf-extract C++ 审计 agent 被 Usage Policy 拦（触发 cyber-safeguard）。prompt 写"健壮性/错误处理/crash"等词被误判攻防。→ 工具质检 prompt 要明确 framing 为"工程质量/CLI 完整性/输出分离"，避开攻防措辞 |
