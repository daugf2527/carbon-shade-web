# P5 Static Blocker Matrix (2026-06-10)

依据 [docs/planning/2026-06-04-engine-native-rewrite-roadmap.md](../planning/2026-06-04-engine-native-rewrite-roadmap.md)，P5 不只是 truth 迁移，还要求 static gate 脱离 `src/combat/*`。

- 数据来源: [docs/engineering/combat-retirement-audit-2026-06-10.md](./combat-retirement-audit-2026-06-10.md)
- 当前 static blocker 文件数: 34
- 一级分层: kernel-shell=32, combat-subsystems=2, replay-input=0, data-surface=0

## 分层说明

| 分层 | 文件数 | 含义 | 下一步 |
|---|---:|---|---|
| `kernel-shell` | 32 | 直接 new / 驱动 CombatKernel 或 FixedStepSimulation，是真正的 static 主阻塞。 | 优先给这组补 engine 对等 harness 或归档策略。 |
| `combat-subsystems` | 2 | 绕过 CombatKernel 但仍直接拼装 combat 子系统，适合作为中间迁移批次。 | 按功能把几条链迁到 engine core/system 对等实现。 |
| `replay-input` | 0 | replay metadata / 输入工具尾巴已从 static gate 清出。 | 保持新入口落在 runtime/engine，避免测试回流到 combat facade。 |
| `data-surface` | 0 | 只绑定动作表/类型/事件壳，属于最便宜的清理层。 | 先把这层从 src/combat/* 拆到 data/runtime 入口。 |

## 文件矩阵

| static test | 分层 | 当前 combat 绑定 | 迁移顺序 |
|---|---|---|---|
| `tests/static/action-cancel-probe.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";`<br>`import type { ActionName, Actor } from "../../src/combat/types.js";` | P5-D |
| `tests/static/architecture.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";`<br>`import { FixedStepSimulation } from "../../src/combat/kernel/FixedStepSimulation.js";` | P5-D |
| `tests/static/armor.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/auto-combat.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";`<br>`import type { ActionName, Actor } from "../../src/combat/types.js";` | P5-D |
| `tests/static/combat-chain-regression.test.ts` | `combat-subsystems` | `import type { ActionName, Actor } from "../../src/combat/types.js";`<br>`import { createActor } from "../../src/combat/actors/ActorFactory.js";`<br>`import { getAction } from "../../src/combat/actions/FrameDataAction.js";`<br>`import { HitResolver2D5 } from "../../src/combat/hit/HitResolver2D5.js";`<br>`import { HitDecisionResolver } from "../../src/combat/hit/HitDecisionResolver.js";`<br>`import { DamageResolver } from "../../src/combat/damage/DamageResolver.js";`<br>`import { ReactionResolver } from "../../src/combat/reaction/ReactionResolver.js";`<br>`import { StatusEffectSystem } from "../../src/combat/status/StatusEffectSystem.js";`<br>`import { CombatEventBus } from "../../src/combat/events/CombatEventBus.js";` | P5-C |
| `tests/static/combo-correction.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/damage-routing.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/death-barrier-multihit.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/death-loop.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";`<br>`import { CombatEventPriority } from "../../src/combat/events/CombatEventBus.js";` | P5-D |
| `tests/static/debug-actions.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/dfo-replica.test.ts` | `kernel-shell` | `import { getAction } from "../../src/combat/actions/FrameDataAction.js";`<br>`import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/enemy-ai.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/fuzz-combat.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/handfeel-fix2.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/hit-shape.test.ts` | `combat-subsystems` | `import type { HitBoxFrameWindow } from "../../src/combat/types.js";`<br>`import { createActor } from "../../src/combat/actors/ActorFactory.js";`<br>`import { HitResolver2D5 } from "../../src/combat/hit/HitResolver2D5.js";`<br>`import { HitDecisionResolver } from "../../src/combat/hit/HitDecisionResolver.js";`<br>`import { getAction } from "../../src/combat/actions/FrameDataAction.js";` | P5-C |
| `tests/static/input-buffer.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/jump-attack-hit-recoil.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/jump-attack-z-detailed.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/jump-attack-z-position.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/jump-down-movement.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/jump-hit-down-movement.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/jump-skill-down-movement.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/jump-x-cancel-stuck-airborne.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/movement-bounds.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/official-api-alignment.test.ts` | `kernel-shell` | `import { getAction } from "../../src/combat/actions/FrameDataAction.js";`<br>`import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/replay-hash.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";`<br>`import { ReplayRecorder } from "../../src/combat/replay/ReplayRecorder.js";`<br>`import { createActor } from "../../src/combat/actors/ActorFactory.js";` | P5-D |
| `tests/static/replay-performance.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/replay-schema.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/replay.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/status-buff.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/status-profile.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/tick-benchmark.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/walk-run-z.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/walk-run.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |

## 结论

1. static blocker 的真正主阻塞不是零散类型，而是 32 个直接依赖 `CombatKernel` / `FixedStepSimulation` 的 `kernel-shell` 用例。
2. `data-surface` 已清零，说明动作表/类型/事件壳这层可以独立迁出，不必和 `CombatKernel` 主迁移绑在一起。
3. `combat-subsystems` 还剩 2 个文件，适合在 engine core/system 对等实现补齐后单独迁。
4. `replay-input` 已清零，说明 replay metadata 这类静态校验已能直接落在 runtime 入口，不再阻塞 `src/combat/` 删除。
