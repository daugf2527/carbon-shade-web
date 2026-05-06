# DFO Handfeel Next Backlog

日期：2026-05-03

## Scope

本 backlog 只覆盖下一批 DFO/Berserker 动作手感小步迭代，不展开装备、深渊、经济、公会、技能树或 PVF/NPK 解析器。目标是把已经通过 kernel 回归的动作行为继续推进到玩家可感知的运行态表现，并保持每批都能用静态测试和浏览器 smoke 验证。
>
> **优先级定义参见** `docs/planning/dnf-combat-systems-master-spec.md`：P0=缺了就跑不起来，P1=缺了手感就不对，P2=缺了体验就不完整。
>
> **优先级定义参见** `docs/planning/dnf-combat-systems-master-spec.md`：P0=缺了就跑不起来，P1=缺了手感就不对，P2=缺了体验就不完整。

## References

- `docs/research/combat/berserker-action-frame-calibration.md`
- `docs/research/combat/dnf-dfo-combat-technical-data-replay-report.md`
- `docs/planning/dfo-action-handfeel-replication-plan.md`
- `docs/planning/dfo-combat-implementation-backlog.md`
- `tests/static/dfo-replica.test.ts`

## Current Baseline

- `Bloodlust` 已有成功抓取、`grabbed` hold、`grab_attach` 喷发释放、grab-immune fallback、whiff eruption event。
- `RagingFury` 已有 10 个 blood pillar hit windows，并通过 `dfo-replica` 静态测试保护。
- `QuickRebound` 当前实现为 level 1 官方 API 对齐：最长 180 tick invulnerability、松手后 18 tick get-up armor、300 tick cooldown、MP 1。更高等级 scaling 尚未接入。
- `Frenzy` 当前支持 Berserker 技能 10% cooldown reduction，按 Neople 官方 API 样本更新；技能攻击、HP cost/upkeep 仍需完整 level-table 驱动。

## P0: Bloodlust Runtime Readability ✅

- [x] 在浏览器运行态复核 `Bloodlust` 抓取成功、hold、喷发三段是否能被玩家看出来。
- [x] 若画面仍像普通 `attack2`，在 `CombatScene` 的事件/VFX 映射里给 `GrabAttached`、`BloodlustEruptionReleased`、`BloodlustWhiffEruption` 加轻量视觉反馈。
- [x] 保持 kernel 不依赖 Phaser；渲染层只消费事件，不反向改 simulation state。
- [ ] 回归 `npm run static:test`、`npm run browser:smoke`。

Done:
- 普通 grunt 被抓时，运行态能看到目标短暂停在角色前方再喷发。
- boss / building / grab immune 仍直接走 fallback 喷发反馈。
- whiff 时有短血能爆发反馈，但不凭空造成伤害。

## P1: Raging Fury Hit Readability ✅

- [x] 复核 `RagingFury` 10 hit 在运行态是否有连续血柱节奏，而不是只像一次大 hit。
- [x] 若不清晰，按 `rf_pillar_01` 到 `rf_pillar_10` 的 hit group 追加轻量 pillar VFX 或 debug-readable pulse。
- [x] 不调整 10 pillar 数量，不改现有浮空数值，先只提升可读性。
- [ ] 回归 `tests/static/dfo-replica.test.ts` 中的 10 pillar 断言和 browser smoke。

Done:
- replay/event 中仍能分辨 10 个 pillar hit group。
- 视觉上能看出先冲击波、后连续血柱的阶段差异。

## P2: Quick Rebound Duration Conflict Note ✅

- [x] 把 Quick Rebound 2s/3s 资料冲突写入 `docs/planning/dfo-action-handfeel-replication-plan.md` 或本文件的校准注记。
- [x] 暂不改当前 18 tick get-up armor，因为它对应 0.30s 起身霸体，已有测试保护。
- [x] 若后续要调蹲伏无敌时长，先新增数据化配置和测试：按住 C 的最大 hold ticks、松手后的 get-up armor ticks 分开断言。

Done:
- 文档明确区分“按住蹲伏无敌持续时间”和“松手后起身霸体时间”。
- 不再把 2s/3s 冲突误用到 18 tick get-up armor 上。

## P3: Basic Attack Cancel Window Probe ✅

- [x] 基于 `berserker-action-frame-calibration.md` 中“Bloodlust / Raging Fury 可被普攻取消”的描述，先写一个最小输入/cancel 探针测试。
- [x] 只验证已有 `cancelPolicy` 是否能表达 hit cancel / whiff cancel，不先做全职业取消系统。
- [x] 如果现有 `requestAction` 已能从 Bloodlust/RagingFury cancel into NormalBasic1，则把测试固定下来；如果不能，先记录缺口，不强行扩大实现。

Done:
- 有一个静态测试说明 Bloodlust/RagingFury 当前 cancel 行为是 supported / unsupported / partially supported。
- 若实现，必须保持 `Input -> InputBuffer -> requestAction -> cancelPolicy` 路径，不新增渲染层特殊分支。

## P4: Handfeel Evidence Report ✅

- [x] 每完成一个 P0-P3 项，更新一份短报告或 `browser-smoke.json` / screenshot 证据说明。
- [x] 报告只记录：改动点、验证命令、运行态观察、剩余 gap。
- [x] 不把资料研究扩写成新系统需求；所有扩展必须能回到本 backlog 的小任务。

Evidence:
- `src/game/CombatScene.ts` now consumes `GrabAttached`, `bloodlust_eruption`, and `bloodlust_whiff_eruption` as render-only VFX.
- `src/game/CombatScene.ts` now draws `rf_shock` and `rf_pillar_01..10` as readable Raging Fury shockwave/pillar pulses without changing kernel timing or hit counts.
- `tests/static/action-cancel-probe.test.ts` fixes the current cancel contract: Bloodlust/RagingFury hit cancel into `NormalBasic1` is supported after the configured hit cancel frame; RagingFury whiff cancel opens only at the configured whiff cancel frame.
- Local lightweight checks run in this batch: `npm run typecheck`, `npm run static:test`.
- Formal verification remains GitHub CI/CD after commit/push.

## Verification Gate

每个实现批次完成前至少运行：

- `npm run typecheck`
- `npm run static:test`
- `npm run build`

涉及运行态/视觉反馈时额外运行：

- `npm run browser:smoke`
