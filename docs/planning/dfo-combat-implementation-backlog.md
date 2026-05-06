# DFO Combat Implementation Backlog

This backlog turns the current DFO/DNF research docs into small implementation batches for the local combat kernel. It does not authorize downloading or distributing official PVF/NPK assets.

> **状态更新 (2026-04-29):** P0 和 P1 已完成 ✅。P2 部分完成：normalized spritesheets 已落地 ✅（`SpriteFrameLibrary.ts` 支持 fixed-cell frame-index 渲染）。剩余 P2 项（skill timing extraction, sweep/grab_attach emitters, action frame calibration, stable replay hashes）为实际未完成项。
>
> **优先级定义参见** `docs/planning/dnf-combat-systems-master-spec.md`：P0=缺了就跑不起来，P1=缺了手感就不对，P2=缺了体验就不完整。

## References

- Architecture: `docs/research/combat/dnf-combat-system-reconstruction-engineering-report.md`
- Technical route: `docs/research/combat/dnf-combat-replica-implementation-technical-report.md`
- Current mechanics gap: `docs/research/combat/dnf-dfo-mechanics-gap-analysis.md`
- Action/handfeel plan: `docs/planning/dfo-action-handfeel-replication-plan.md`
- Online source index: `docs/research/reference/neople-dnf-open-api-auxiliary-material.md`

## P0: Kernel Contracts ✅

- [x] Extend `FrameDataAction` with `timeline` and `emitters` aliases while keeping existing `active` windows valid.
- [x] Treat current `HitBoxFrameWindow[]` as the first `HitEmitter[]` migration source.
- [x] Add hitbox shape metadata for `rect`, `circle`, `sweep`, and `grab_attach`; ship only `rect` and `circle` collision in this batch.
- [x] Keep old rectangle hit resolution and all `dfo-replica` tests unchanged.
- [x] Add replay export metadata: `buildHash`, `combatSchemaHash`, `logicFps`, and deterministic `stateHash`.

## P1: Status And Damage Fidelity ✅

- [x] Replace one-off Bleed application with profile-driven `applyStatus`.
- [x] Add profiles for `bleed`, `poison`, `burn`, `shock`, and `rupture`.
- [x] Keep DOT ticks on `status_tick_feedback_only`; Poison/Burn/Shock/Bleed must not trigger normal hit reaction.
- [x] Implement Burn tick splash in a 150px radius as a table-driven profile behavior.
- [x] Implement Rupture as a stack-based incoming direct damage multiplier.

## P2: Data And Calibration

- [ ] Extract more skill timing from reference material into data files instead of kernel branches.
- [ ] Add `sweep` and `grab_attach` emitters for Bloodlust held-target and projectile-like skills.
- [x] Move demo normalized sprites toward trimmed atlas or multiatlas metadata with explicit anchors. (Normalized spritesheets with fixed-cell frame-index rendering implemented in `SpriteFrameLibrary.ts`.)
- [ ] Calibrate action frame windows against captured gameplay references, not only community summaries.
- [ ] Keep replay hashes stable enough for regression tests before attempting network sync semantics.

## Done Criteria

- `npm run typecheck`
- `npm run static:test`
- `npm run build`
