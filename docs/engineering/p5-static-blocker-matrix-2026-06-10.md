# P5 Static Blocker Matrix (2026-06-10)

依据 [docs/planning/2026-06-04-engine-native-rewrite-roadmap.md](../planning/2026-06-04-engine-native-rewrite-roadmap.md)，P5 不只是 truth 迁移，还要求 static gate 脱离 `src/combat/*`。

- 数据来源: [docs/engineering/combat-retirement-audit-2026-06-10.md](./combat-retirement-audit-2026-06-10.md)
- 当前 static blocker 文件数: 15
- 一级分层: kernel-shell=15, combat-subsystems=0, replay-input=0, data-surface=0

## 分层说明

| 分层 | 文件数 | 含义 | 下一步 |
|---|---:|---|---|
| `kernel-shell` | 15 | 直接 new / 驱动 CombatKernel 或 FixedStepSimulation，是真正的 static 主阻塞。 | 优先给这组补 engine 对等 harness 或归档策略。 |
| `combat-subsystems` | 0 | 绕过 CombatKernel 但仍直接拼装 combat 子系统，适合作为中间迁移批次。 | 按功能把几条链迁到 engine core/system 对等实现。 |
| `replay-input` | 0 | 依赖 replay / 输入工具，不一定卡在主 kernel，但仍阻塞 combat 目录删除。 | 优先切到 engine replay / input 或把工具类型外提。 |
| `data-surface` | 0 | 只绑定动作表/类型/事件壳，属于最便宜的清理层。 | 先把这层从 src/combat/* 拆到 data/runtime 入口。 |

## 文件矩阵

| static test | 分层 | 当前 combat 绑定 | 迁移顺序 |
|---|---|---|---|
| `tests/static/armor.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/combo-correction.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/damage-routing.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/death-barrier-multihit.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/death-loop.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";`<br>`import { CombatEventPriority } from "../../src/combat/events/CombatEventBus.js";` | P5-D |
| `tests/static/debug-actions.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/dfo-replica.test.ts` | `kernel-shell` | `import { getAction } from "../../src/combat/actions/FrameDataAction.js";`<br>`import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/enemy-ai.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/fuzz-combat.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/handfeel-fix2.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/jump-x-cancel-stuck-airborne.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/official-api-alignment.test.ts` | `kernel-shell` | `import { getAction } from "../../src/combat/actions/FrameDataAction.js";`<br>`import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/status-buff.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/status-profile.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |
| `tests/static/tick-benchmark.test.ts` | `kernel-shell` | `import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";` | P5-D |

## 结论

1. static blocker 的真正主阻塞不是零散类型，而是 15 个直接依赖 `CombatKernel` / `FixedStepSimulation` 的 `kernel-shell` 用例。
2. `data-surface` 已清零，说明动作表/类型/事件壳这层可以独立迁出，不必和 `CombatKernel` 主迁移绑在一起。
3. `combat-subsystems` 还剩 0 个文件，适合在 engine core/system 对等实现补齐后单独迁。
4. `replay-input` 还剩 0 个文件，说明 replay / input 工具链仍是 `src/combat/` 删除前的独立尾巴。
