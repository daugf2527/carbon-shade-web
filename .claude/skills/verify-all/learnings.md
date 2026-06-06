# Learnings: verify-all

> Append-only log. /session-debrief 跑完会向这里追加教训。
>
> 每条 entry 应回答：
> - verify-all PASS 但 CI FAIL 的 case？(说明 3 gate 和 8 gate 缺口在哪)
> - Claude 是否误信 verify-all = CI？(标 description 改不改)

| Date | Topic | Lesson |
|------|-------|--------|
| 2026-05-26 | initial | placeholder — 首次 /session-debrief append 时填 |
| 2026-06-06 | gate-runtime-truth | static:test 在 dev 机要 ~210s（并行后）：单测 `dnf-native-h5-real-pvf-probes` 跑真 Script.pvf 提取就占 197s（PVF 在场才慢，CI 缺 PVF 会 SKIP 秒退）。analyze 原给 300s 超时卡边缘假超时，已提至 420s。→ 别把"慢"归因到内存/编译，逐个测出拖尾测试 |
| 2026-06-06 | description-drift | SKILL.md 曾硬编码"41 tests"（实际 104，偏差 153%）。数字写死必漂移。→ 改成 "auto-discovered"，consistency-check 已守护 static-test-count |
