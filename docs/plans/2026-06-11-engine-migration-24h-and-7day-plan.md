# Engine Migration 24h And 7-Day Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** In the next 24 hours, remove the last runtime-facing `src/combat` edges and open the highest-leverage engine-first test migration path; in the next 7 days, convert the current engine runtime switch into a real validation-mainline switch.

**Architecture:** The codebase is already in a split state: the live scene runs `EngineKernel`, but the scene shell still imports two `src/combat` artifacts and the validation trunk still leans on `CombatKernel`. The plan therefore moves in two ordered lanes: first close the runtime shell gap in `CombatScene`, then migrate truth/static blockers by bucket instead of attempting a big-bang `src/combat` delete.

**Tech Stack:** TypeScript, Phaser 3, Node.js static tests, engine kernel systems, runtime debug/evidence surfaces, markdown governance docs.

---

## Evidence Baseline

- Fresh audit on 2026-06-11: `node scripts/combat-retirement-audit.mjs --output json`
- Current counts:
  - `src/combat` files: `46`
  - runtime external combat edges: `1` file / `2` imports
  - truth blockers: `3`
  - static blockers: `34`
- Runtime combat edges are both in `src/game/CombatScene.ts`:
  - `import type { DebugSnapshot } from "../combat/debug/DebugOverlay.js";`
  - `import { FixedStepSimulation } from "../combat/kernel/FixedStepSimulation.js";`
- Scene-shell bridge debt is concrete, not inferred:
  - `src/game/CombatScene.ts:270-314` defines action animations locally
  - `src/game/CombatScene.ts:535-537` stubs `GrabAttached` and `VfxRequested`
  - `src/game/CombatScene.ts:570-573` stubs `StatusApplied`
- Static blocker trunk is concentrated, not diffuse:
  - `docs/engineering/p5-static-blocker-matrix-2026-06-10.md` shows `kernel-shell=32`, `combat-subsystems=2`, `replay-input=0`, `data-surface=0`
- Existing engine-side footholds already exist and should be used instead of inventing new harnesses:
  - `tests/static/engine-input-action-loop.test.ts`
  - `tests/static/engine-scenario-replay.test.ts`
  - `tests/static/engine-resource.test.ts`
  - `tests/static/engine-status-dot.test.ts`

## 24h Outcome

- Remove the last runtime-facing `src/combat` imports from `CombatScene`.
- Add a runtime-owned fixed-step shell and fully switch `CombatScene` typing to runtime debug types.
- Convert one truth blocker batch and one static blocker batch to engine-owned coverage so the next 7 days are not blocked by missing harnesses.
- Publish a tightened branch narrative so follow-up work uses one authoritative migration口径.

## 7-Day Outcome

- Shift validation trunk away from `CombatKernel` in waves, starting with truth and the `kernel-shell` bucket.
- Reduce scene-local runtime bridging by moving action definitions and event surfaces toward runtime/engine ownership.
- Finish with an updated blocker count, not only qualitative progress claims.

## Non-Goals

- Do not delete `src/combat/` this week.
- Do not redesign the whole action-data model before the last runtime imports are removed.
- Do not broaden into Stage 4 presentation polish unrelated to migration blockers.
- Do not touch dirty user-owned docs unless the task explicitly requires them.

---

### Task 1: Lock The Runtime Shell Off `src/combat`

**Files:**
- Create: `src/runtime/loop/FixedStepSimulation.ts`
- Modify: `src/game/CombatScene.ts`
- Modify: `tests/static/architecture.test.ts`
- Test: `tests/static/runtime-evidence.test.ts`

**Step 1: Write the failing test**

Add or extend a static assertion in `tests/static/architecture.test.ts` to fail while `CombatScene` still imports combat runtime shell artifacts.

```typescript
assert.ok(
  !source.includes('../combat/kernel/FixedStepSimulation.js'),
  'CombatScene should not import combat FixedStepSimulation',
);
assert.ok(
  !source.includes('../combat/debug/DebugOverlay.js'),
  'CombatScene should not import combat DebugSnapshot types',
);
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx tests/static/architecture.test.ts`
Expected: FAIL mentioning `CombatScene` still imports combat runtime shell artifacts.

**Step 3: Write minimal implementation**

Create a runtime-owned loop shell matching the existing `TickableKernel` contract.

```typescript
export interface TickableKernel {
  tick(): void;
  onLargeDelta(deltaMs: number): void;
  emitLongFrameWarning(deltaMs: number): void;
}

export class FixedStepSimulation {
  readonly tickRate = 1 / 60;
  readonly maxCatchUpTicks = 4;
  readonly pauseThresholdMs = 250;
  // same accumulator / pause semantics as the combat copy
}
```

Update `src/game/CombatScene.ts` to:

```typescript
import type { DebugSnapshot } from "../runtime/debug/DebugSnapshot.js";
import { FixedStepSimulation } from "../runtime/loop/FixedStepSimulation.js";
```

and construct it without the `import("../combat/...").TickableKernel` cast.

**Step 4: Run test to verify it passes**

Run:
- `node --import tsx tests/static/architecture.test.ts`
- `node --import tsx tests/static/runtime-evidence.test.ts`

Expected:
- PASS
- no runtime-facing import from `CombatScene` to `src/combat`

**Step 5: Commit**

```bash
git add src/runtime/loop/FixedStepSimulation.ts src/game/CombatScene.ts tests/static/architecture.test.ts tests/static/runtime-evidence.test.ts
git commit -m "refactor(p5): remove combat runtime shell imports"
```

---

### Task 2: Prove The Runtime Switch With A Scene-Smoke Gate

**Files:**
- Modify: `tests/static/engine-scene-create-smoke.test.ts`
- Modify: `tests/browser/combat-smoke.spec.ts`
- Reference: `src/game/CombatScene.ts`

**Step 1: Write the failing test**

Extend the create/smoke coverage so it fails unless the scene can be created using the runtime-owned loop and debug types.

```typescript
assert.equal(scene.kernel.constructor.name, "EngineKernel");
assert.equal(scene.simulation.constructor.name, "FixedStepSimulation");
assert.ok(scene.kernel.debugSnapshot(), "scene should expose engine debug snapshot");
```

**Step 2: Run test to verify it fails**

Run:
- `node --import tsx tests/static/engine-scene-create-smoke.test.ts`
- `npx playwright test tests/browser/combat-smoke.spec.ts`

Expected: FAIL if the runtime shell switch is incomplete or if scene construction still depends on combat-only types.

**Step 3: Write minimal implementation**

Only patch if Task 1 was not sufficient. Keep the scene wiring boring:

```typescript
this.simulation = new FixedStepSimulation(this.kernel);
const snapshot = this.kernel.debugSnapshot(this.lastTickCostMs) as DebugSnapshot;
```

**Step 4: Run test to verify it passes**

Run:
- `node --import tsx tests/static/engine-scene-create-smoke.test.ts`
- `npx playwright test tests/browser/combat-smoke.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/static/engine-scene-create-smoke.test.ts tests/browser/combat-smoke.spec.ts src/game/CombatScene.ts
git commit -m "test(p5): lock engine scene create path"
```

---

### Task 3: Migrate The Truth Trunk Off Combat

**Files:**
- Modify: `tests/truth/reaction-velocity.test.ts`
- Modify: `tests/truth/swordman-attack1-truth.test.ts`
- Modify: `tests/truth/swordman-reaction-formulas.test.ts`
- Create if needed: `tests/truth/engine-swordman-attack1-truth.test.ts`
- Reference: `tests/static/engine-input-action-loop.test.ts`
- Reference: `tests/static/engine-scenario-replay.test.ts`

**Step 1: Write the failing test**

First convert the audit gate into a concrete fail condition by expecting zero truth blockers after this batch.

```typescript
assert.equal(
  payload.summary.truthImportCount,
  0,
  "truth migration batch should clear remaining combat truth blockers",
);
```

in a temporary branch-local variant of the truth migration assertion, or add a dedicated migration test if you do not want to rewrite the audit expectation immediately.

**Step 2: Run test to verify it fails**

Run:
- `node --import tsx tests/truth/reaction-velocity.test.ts`
- `node --import tsx tests/truth/swordman-attack1-truth.test.ts`
- `node --import tsx tests/truth/swordman-reaction-formulas.test.ts`
- `node scripts/combat-retirement-audit.mjs --output json`

Expected:
- existing truth tests still import combat and therefore represent the current blocker set

**Step 3: Write minimal implementation**

Port each test to engine surfaces instead of combat surfaces.

Use existing engine footholds:

```typescript
const kernel = buildScenarioKernel(42);
const scenario = kernel.runDeterministicScenario();
const replay = kernel.replay.export();
```

For reaction-velocity assertions, bind to engine actor state and replay hashes rather than `src/combat/reaction/ReactionResolver.js`.

For attack1 truth, assert:

```typescript
assert.ok(grunt.hp < startHp);
assert.ok(grunt.hp > 0);
assert.ok(kernel.bus.archive.some((e) => e.type === "HitConfirmed"));
```

For reaction formulas, use engine-side observable reactions from `CombatResolutionSystem`, `AirborneSystem`, and replay/determinism outputs.

**Step 4: Run test to verify it passes**

Run:
- `node --import tsx tests/truth/reaction-velocity.test.ts`
- `node --import tsx tests/truth/swordman-attack1-truth.test.ts`
- `node --import tsx tests/truth/swordman-reaction-formulas.test.ts`
- `node scripts/combat-retirement-audit.mjs --output json`

Expected:
- the three truth tests PASS
- audit truth blocker count drops from `3` to `0`

**Step 5: Commit**

```bash
git add tests/truth/reaction-velocity.test.ts tests/truth/swordman-attack1-truth.test.ts tests/truth/swordman-reaction-formulas.test.ts
git commit -m "test(p5): move remaining truth blockers to engine"
```

---

### Task 4: Open The Static Migration Trunk With One `kernel-shell` Batch

**Files:**
- Modify: `tests/static/action-cancel-probe.test.ts`
- Modify: `tests/static/architecture.test.ts`
- Modify: `tests/static/auto-combat.test.ts`
- Modify: `docs/engineering/p5-static-blocker-matrix-2026-06-10.md`
- Test: `tests/static/p5-static-blocker-matrix.test.ts`

**Step 1: Write the failing test**

Tighten the blocker-matrix assertion so the first static batch must leave the original counts.

```typescript
assert.ok(
  source.includes("| `kernel-shell` | 29 |"),
  "first static migration batch should reduce kernel-shell blockers by three files",
);
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx tests/static/p5-static-blocker-matrix.test.ts`
Expected: FAIL because the matrix still reports `kernel-shell=32`.

**Step 3: Write minimal implementation**

Port only one coherent batch, not a random scatter.

- `action-cancel-probe.test.ts`: move onto `ActionSystem` + `EngineKernel`
- `architecture.test.ts`: keep as a migration guard, not a `CombatKernel` behavior test
- `auto-combat.test.ts`: rebuild on engine loop helpers and scene-ready engine actors

Prefer adapting the existing engine harnesses from:

```typescript
buildScene(seed);
buildScenarioKernel(seed);
```

instead of introducing another parallel fake kernel.

**Step 4: Run test to verify it passes**

Run:
- `node --import tsx tests/static/action-cancel-probe.test.ts`
- `node --import tsx tests/static/architecture.test.ts`
- `node --import tsx tests/static/auto-combat.test.ts`
- `node --import tsx tests/static/p5-static-blocker-matrix.test.ts`

Expected:
- PASS
- blocker matrix updated from `kernel-shell=32` to `kernel-shell=29`

**Step 5: Commit**

```bash
git add tests/static/action-cancel-probe.test.ts tests/static/architecture.test.ts tests/static/auto-combat.test.ts docs/engineering/p5-static-blocker-matrix-2026-06-10.md tests/static/p5-static-blocker-matrix.test.ts
git commit -m "test(p5): open kernel-shell static migration batch"
```

---

### Task 5: 24h Verification And Narrative Convergence

**Files:**
- Modify only if needed: `docs/planning/2026-06-04-engine-native-rewrite-roadmap.md`
- Modify only if needed: `docs/engineering/combat-retirement-audit-2026-06-10.md`
- Reference: `docs/plans/2026-06-11-engine-migration-24h-and-7day-plan.md`

**Step 1: Write the failing test**

If you update branch narrative docs, first express the expected new state in a doc-label or audit guard.

```typescript
assert.equal(payload.summary.runtimeImportCount, 0);
assert.equal(payload.summary.truthImportCount, 0);
```

**Step 2: Run test to verify it fails**

Run: `node scripts/combat-retirement-audit.mjs --output json`
Expected: FAIL against the old expectations until Tasks 1-4 are complete.

**Step 3: Write minimal implementation**

Only after Tasks 1-4 land:
- update audit-linked narrative docs to reflect the new counts
- keep one authoritative wording: runtime combat edges cleared, truth blockers cleared, static blockers reduced but still active

Do not relabel speculative future work as completed.

**Step 4: Run test to verify it passes**

Run:
- `node scripts/combat-retirement-audit.mjs --output json`
- `npm run typecheck`
- `npm run static:test`

Expected:
- runtime import count `0`
- truth import count `0`
- static import count below `34`
- typecheck green
- static suite green

**Step 5: Commit**

```bash
git add docs/planning/2026-06-04-engine-native-rewrite-roadmap.md docs/engineering/combat-retirement-audit-2026-06-10.md
git commit -m "docs(p5): converge migration narrative after 24h batch"
```

---

## 7-Day Plan

### Day 1: Runtime shell cleared and scene smoke locked

**Files:**
- `src/runtime/loop/FixedStepSimulation.ts`
- `src/game/CombatScene.ts`
- `tests/static/architecture.test.ts`
- `tests/static/engine-scene-create-smoke.test.ts`

**Targets:**
- runtime external combat edges: `1 file / 2 imports -> 0`
- browser/static create-path guards green

**Verification:**
- `node scripts/combat-retirement-audit.mjs --output json`
- `node --import tsx tests/static/architecture.test.ts`
- `node --import tsx tests/static/engine-scene-create-smoke.test.ts`

### Day 2: Truth blockers cleared

**Files:**
- `tests/truth/reaction-velocity.test.ts`
- `tests/truth/swordman-attack1-truth.test.ts`
- `tests/truth/swordman-reaction-formulas.test.ts`

**Targets:**
- truth blockers: `3 -> 0`
- engine truth trunk becomes authoritative

**Verification:**
- `node --import tsx tests/truth/reaction-velocity.test.ts`
- `node --import tsx tests/truth/swordman-attack1-truth.test.ts`
- `node --import tsx tests/truth/swordman-reaction-formulas.test.ts`
- `node scripts/combat-retirement-audit.mjs --output json`

### Day 3: First `kernel-shell` static wave

**Files:**
- `tests/static/action-cancel-probe.test.ts`
- `tests/static/architecture.test.ts`
- `tests/static/auto-combat.test.ts`
- `docs/engineering/p5-static-blocker-matrix-2026-06-10.md`

**Targets:**
- `kernel-shell` blockers: `32 -> 29`

**Verification:**
- `node --import tsx tests/static/action-cancel-probe.test.ts`
- `node --import tsx tests/static/auto-combat.test.ts`
- `node --import tsx tests/static/p5-static-blocker-matrix.test.ts`

### Day 4: Second `kernel-shell` static wave

**Files:**
- `tests/static/input-buffer.test.ts`
- `tests/static/movement-bounds.test.ts`
- `tests/static/walk-run.test.ts`
- `tests/static/walk-run-z.test.ts`
- `tests/static/jump-*.test.ts`

**Targets:**
- move the locomotion / jump cluster together
- avoid partial migration where movement assertions still split across kernels

**Verification:**
- run the touched movement/jump tests directly
- update blocker matrix counts

### Day 5: Replay and determinism wave

**Files:**
- `tests/static/replay.test.ts`
- `tests/static/replay-hash.test.ts`
- `tests/static/replay-schema.test.ts`
- `tests/static/replay-performance.test.ts`

**Targets:**
- put replay assertions entirely on `EngineKernel.replay`
- use existing `engine-scenario-replay` patterns instead of replaying combat snapshots

**Verification:**
- touched replay tests
- `npm run static:test`

### Day 6: Combat-subsystems wave and event-surface debt

**Files:**
- `tests/static/combat-chain-regression.test.ts`
- `tests/static/hit-shape.test.ts`
- `src/game/CombatScene.ts`
- `src/engine/kernel/EngineKernel.ts`
- `src/engine/kernel/systems/StatusSystem.ts`

**Targets:**
- migrate the two `combat-subsystems` blockers
- either implement or explicitly reframe the scene stubs:
  - `GrabAttached`
  - `VfxRequested`
  - `StatusApplied`

**Verification:**
- touched subsystem tests green
- event assertions added where functionality is now real

### Day 7: Action-definition bridge reduction and new baseline

**Files:**
- `src/game/CombatScene.ts`
- `src/runtime/data/ActionManifestRuntime.ts`
- `docs/engineering/p5-static-blocker-matrix-2026-06-10.md`
- `docs/engineering/combat-retirement-audit-2026-06-10.md`

**Targets:**
- reduce or isolate `CombatScene.defineActions()` as the next bridge debt
- publish the new blocker baseline:
  - runtime blockers `0`
  - truth blockers `0`
  - static blockers materially below `34`

**Verification:**
- `node scripts/combat-retirement-audit.mjs --output json`
- `npm run typecheck`
- `npm run static:test`

---

## Week-End Exit Criteria

- `CombatScene` no longer imports from `src/combat`.
- combat retirement audit reports:
  - `runtimeImportCount = 0`
  - `truthImportCount = 0`
  - `staticImportCount < 34`
- blocker matrix is updated to actual post-migration counts.
- no new migration claim is left without a matching test or audit count.

## Risk Notes

- Highest risk is false progress through doc relabeling without blocker count movement. This plan treats audit counts and direct test imports as the source of truth.
- Second risk is creating a third harness. Reuse `buildScene()` and `buildScenarioKernel()` patterns already in engine tests.
- Third risk is scattering static migrations across unrelated files. Keep waves aligned to blocker buckets.

## Command Pack

```bash
node scripts/combat-retirement-audit.mjs --output json
node --import tsx tests/static/architecture.test.ts
node --import tsx tests/static/engine-scene-create-smoke.test.ts
node --import tsx tests/static/p5-static-blocker-matrix.test.ts
node --import tsx tests/truth/reaction-velocity.test.ts
node --import tsx tests/truth/swordman-attack1-truth.test.ts
node --import tsx tests/truth/swordman-reaction-formulas.test.ts
npm run typecheck
npm run static:test
```
