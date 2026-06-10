# Stage 4 Stabilization 24h Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the current Stage 4 stabilization batch so the repo is submit-ready: runtime create-path crash guarded, `InputRecorder` migration finished, strict-mode fallout settled, repo-side consistency drift removed, and browser/static/build gates re-verified.

**Architecture:** This is a stabilization pass, not a new feature phase. Keep the scope inside the existing EngineKernel runtime, replay path, test harness, and SSOT docs; do not start Stage 5 rendering work, do not redesign combat formulas, and do not reopen large dual-kernel decoupling. Prefer targeted fixes plus evidence-first verification at every checkpoint.

**Tech Stack:** TypeScript, Vite, Phaser 3, Playwright, Node.js, repo-local static test runner, markdown SSOT docs.

---

## 24h Scope

### Functional points
- Protect `CombatScene.create()` from regressing into first-frame runtime crashes.
- Finish `InputRecorder` migration from `src/combat/replay/` to `src/engine/replay/`.
- Keep `strict: true` green across runtime code and tests.
- Remove repo-owned consistency drift caused by stale file paths / stale claims.
- Re-run static, build, consistency, and browser gates on the stabilized tree.
- Sync docs so file paths and truth claims match code.

### Acceptance points
- `npm run typecheck` returns `passed: true`.
- `npm run static:test` returns `"passed": true`.
- `npm run build` returns `passed: true`.
- `npm run consistency` shows no repo-code drift for `maturity/p3.1-runtime-switch`; if anything remains, it is only the local memory drift (`memory/wiki-links`) outside repo source.
- `browser:smoke` passes.
- `browser:qa` passes for active tests, including `6.1 进战斗场景零 uncaught error（create 路径）`; expected P4-gated skips remain skips, not failures.
- All repo docs reference `src/engine/replay/InputRecorder.ts`, not the deleted combat path.

### Non-goals
- No Stage 5 sprite/NPK/rendering work.
- No new combat systems.
- No launch formula redesign.
- No large-scale dual-kernel type split.
- No cleanup of local memory files unless all repo tasks are already complete.

### 24h Timeline

| Window | Outcome |
|---|---|
| 0h-2h | Lock baseline and confirm exact remaining drifts |
| 2h-6h | Finish InputRecorder migration debt and repo consistency drift |
| 6h-10h | Harden create-path crash guards (static + browser) |
| 10h-15h | Settle strict-mode/nullability fallout in touched runtime/tests |
| 15h-20h | Full verification run with fallout fixes |
| 20h-24h | SSOT/changelog sync, checkpoint commit, handoff |

---

### Task 1: Freeze The Stabilization Baseline

**Budget:** 1-2h

**Files:**
- Modify: `scripts/consistency-check.mjs`
- Reference: `package.json`
- Reference: `CLAUDE.md`
- Reference: `docs/testing/engine-truth-coverage-matrix.md`

**Functional points**
- Reproduce the current branch state with exact commands, not assumptions.
- Confirm which failures are repo-owned versus local-memory-only.
- Confirm current WIP already keeps `typecheck`, `static:test`, and `build` green before any new edits.

**Acceptance points**
- A short note exists in the working session / commit message draft listing:
  - `typecheck = green`
  - `static:test = green`
  - `build = green`
  - `consistency = only repo drift + memory drift`
- No implementation work starts before these baselines are confirmed.

**Step 1: Reproduce the baseline**

Run:

```bash
npm run typecheck
npm run static:test
npm run build
npm run consistency
```

Expected:
- `typecheck`: JSON payload with `"passed": true`
- `static:test`: JSON payload with `"passed": true`
- `build`: JSON payload with `"passed": true`
- `consistency`: repo-side drift should point to `maturity/p3.1-runtime-switch`; local-only drift may still mention `memory/wiki-links`

**Step 2: Lock the repo-side target**

Document in the task notes:

```text
Repo-owned target drift:
- maturity/p3.1-runtime-switch

Local-only non-blocking drift:
- memory/wiki-links
```

**Step 3: Commit nothing yet**

Do not commit in this task. This task only establishes the exact finish line.

---

### Task 2: Finish InputRecorder Migration And Remove Runtime-Switch Drift

**Budget:** 3-4h

**Files:**
- Modify: `src/game/CombatScene.ts`
- Modify: `src/engine/replay/InputRecorder.ts`
- Modify: `tests/static/input-recorder.test.ts`
- Modify: `scripts/consistency-check.mjs`
- Modify: `docs/engineering/input-recorder-implementation-summary.md`
- Modify: `docs/engineering/input-recorder-guide.md`

**Functional points**
- Ensure runtime uses only `src/engine/replay/InputRecorder.ts`.
- Remove stale references to the deleted combat replay path from code checks and docs.
- Make `consistency` inspect the new engine replay path when evaluating P3.1 runtime-switch peripherals.

**Acceptance points**
- No repo file references `src/combat/replay/InputRecorder.ts`.
- `scripts/consistency-check.mjs` checks `src/engine/replay/InputRecorder.ts`.
- `npm run consistency` no longer reports `maturity/p3.1-runtime-switch`.

**Step 1: Reproduce the drift before editing**

Run:

```bash
npm run consistency
```

Expected:
- `maturity/p3.1-runtime-switch` drift reports `peripherals-adapted=false`

**Step 2: Update the runtime-switch check to the new replay path**

Apply this shape:

```ts
const peripheralsAdapted = [
  "src/game/TouchControls.ts",
  "src/engine/replay/InputRecorder.ts",
  "src/game/layers/DebugLayer.ts",
].every((p) => !/CombatKernel/.test(readTextSafe(join(ROOT, p)) || "CombatKernel"));
```

**Step 3: Update runtime imports and static test references if any stale path remains**

Keep this import shape:

```ts
import { InputRecorder } from "../engine/replay/InputRecorder.js";
```

and

```ts
import { InputRecorder } from "../../src/engine/replay/InputRecorder.js";
```

**Step 4: Update engineering docs**

Replace the old path with the new path in:
- `docs/engineering/input-recorder-implementation-summary.md`
- `docs/engineering/input-recorder-guide.md`

Required literal:

```text
src/engine/replay/InputRecorder.ts
```

**Step 5: Verify the migration closure**

Run:

```bash
rg -n "src/combat/replay/InputRecorder|src/engine/replay/InputRecorder" src tests docs scripts CLAUDE.md
npm run consistency
```

Expected:
- No remaining repo reference to `src/combat/replay/InputRecorder.ts`
- `maturity/p3.1-runtime-switch` becomes green

**Step 6: Commit**

```bash
git add src/game/CombatScene.ts src/engine/replay/InputRecorder.ts tests/static/input-recorder.test.ts scripts/consistency-check.mjs docs/engineering/input-recorder-implementation-summary.md docs/engineering/input-recorder-guide.md
git commit -m "fix(runtime): finish input recorder engine migration"
```

---

### Task 3: Harden CombatScene Create-Path Crash Guards

**Budget:** 4h

**Files:**
- Modify: `src/engine/core/MonsterScaling.ts`
- Modify: `src/engine/kernel/EngineKernel.ts`
- Test: `tests/static/engine-scene-create-smoke.test.ts`
- Test: `tests/browser/combat-qa.spec.ts`

**Functional points**
- Guarantee monsters built through the exact `CombatScene.create()` path always carry finite MP state.
- Guard the create path in static tests so regressions fail fast without requiring manual browser testing.
- Guard the browser create path against uncaught runtime errors and fake-green timeouts.

**Acceptance points**
- `monsterStatsAtLevel()` returns explicit `mpMax`.
- `EngineKernel.computeStateHash()` can hash all actors on first tick without throwing.
- Static create-path smoke test passes.
- Browser QA test `6.1` passes with:
  - `pageErrors = []`
  - no `[combatLab uncaught]` / `[combatLab unhandledrejection]`
  - `kernelReady === true`
  - `tick > 0`
  - `allMpFinite === true`

**Step 1: Keep monster stats complete**

Target code shape:

```ts
export interface MonsterStats {
  readonly hpMax: number;
  readonly mpMax: number;
  readonly physicalAttack: number;
  readonly physicalDefense: number;
  readonly moveSpeed: number;
  readonly weight: number;
}
```

and

```ts
mpMax: 0,
```

**Step 2: Keep `z` inside the state hash**

Target code shape:

```ts
`${a.id}:hp=${a.hp},mp=${a.mp.toFixed(3)},st=${a.fsm.state},x=${a.x.toFixed(3)},y=${a.y.toFixed(3)},z=${a.z.toFixed(3)}`
```

**Step 3: Guard the exact create path in static test**

Keep or add assertions like:

```ts
assert.ok(Number.isFinite(gruntStats.mpMax));
assert.ok(Number.isFinite(grunt.mp));
for (let i = 0; i < 120; i++) kernel.tick();
assert.ok(threw === null);
```

**Step 4: Guard the exact create path in browser QA**

Keep or add the zero-uncaught pattern:

```ts
page.on("pageerror", (err) => pageErrors.push(`${err.message}\n${err.stack ?? ""}`));
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
```

and the create-path assertions:

```ts
expect(pageErrors).toEqual([]);
expect(combatLabUncaught).toEqual([]);
expect(state.ready).toBe(true);
expect(state.tick).toBeGreaterThan(0);
expect(state.allMpFinite).toBe(true);
```

**Step 5: Verify targeted tests**

Run:

```bash
npm run static:test
npx playwright test tests/browser/combat-qa.spec.ts -g "6.1 进战斗场景零 uncaught error"
```

Expected:
- Static suite green
- Targeted Playwright test green

**Step 6: Commit**

```bash
git add src/engine/core/MonsterScaling.ts src/engine/kernel/EngineKernel.ts tests/static/engine-scene-create-smoke.test.ts tests/browser/combat-qa.spec.ts
git commit -m "test(runtime): guard combat scene create path"
```

---

### Task 4: Settle Strict-Mode And Nullability Fallout In Touched Code

**Budget:** 4-5h

**Files:**
- Modify: `tsconfig.json`
- Modify: `src/data/manifest/truth/types.ts`
- Modify: `src/dnf-native-combat/data/parsers/PvfDocumentLoader.ts`
- Modify: `src/engine/core/Actor.ts`
- Modify: `src/engine/core/CancelWindow.ts`
- Modify: `src/engine/core/KnockbackPhysics.ts`
- Modify: `src/engine/core/MonsterScaling.ts`
- Modify: `src/engine/core/ReactionResolver.ts`
- Modify: `src/engine/kernel/systems/CombatResolutionSystem.ts`
- Test: `tests/smoke/full-pipeline.test.ts`
- Test: `tests/static/auto-combat.test.ts`
- Test: `tests/static/manifest-provenance.test.ts`
- Test: `tests/static/runtime-evidence.test.ts`
- Test: `tests/truth/reaction-velocity.test.ts`
- Test: `tests/truth/swordman-attack1-truth.test.ts`
- Test: `tests/browser/combat-smoke.spec.ts`

**Functional points**
- Keep `strict: true` enabled, not temporarily relaxed.
- Replace unsafe null/undefined assumptions in touched runtime and test code.
- Make truth/parsing types honest where extracted fields can be `null`.
- Keep the only explicit suppression narrow and justified (`.mjs` import in browser smoke test).

**Acceptance points**
- `tsconfig.json` keeps `"strict": true`.
- `npm run typecheck` passes.
- Touched tests compile without broad `any` regressions.
- Only justified suppression is the `.mjs` import bridge in `tests/browser/combat-smoke.spec.ts`.

**Step 1: Keep strict mode on**

Required setting:

```json
"strict": true
```

**Step 2: Make nullable truth fields explicit**

Target shape:

```ts
liftUp?: PvfFact<number> | null;
pushAside?: PvfFact<number> | null;
damageBonus?: PvfFact<number> | null;
attackKind?: string | null;
```

**Step 3: Tighten process and collection typing**

Target shape:

```ts
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
```

and remove unsafe implicit object/value types in test helpers.

**Step 4: Replace unsafe access with asserted access**

Examples to keep:

```ts
const physAtk = p.physAtk;
assert.ok(physAtk !== undefined);
```

```ts
const profile = statusManifest.profiles[profileId];
assert.ok(profile);
return profile.fieldProvenance[field]?.sourceType;
```

**Step 5: Verify compile + test**

Run:

```bash
npm run typecheck
npm run static:test
```

Expected:
- Both green with `strict: true`

**Step 6: Commit**

```bash
git add tsconfig.json src/data/manifest/truth/types.ts src/dnf-native-combat/data/parsers/PvfDocumentLoader.ts src/engine/core/Actor.ts src/engine/core/CancelWindow.ts src/engine/core/KnockbackPhysics.ts src/engine/core/MonsterScaling.ts src/engine/core/ReactionResolver.ts src/engine/kernel/systems/CombatResolutionSystem.ts tests/smoke/full-pipeline.test.ts tests/static/auto-combat.test.ts tests/static/manifest-provenance.test.ts tests/static/runtime-evidence.test.ts tests/truth/reaction-velocity.test.ts tests/truth/swordman-attack1-truth.test.ts tests/browser/combat-smoke.spec.ts
git commit -m "fix(types): settle strict-mode stabilization fallout"
```

---

### Task 5: Run The Full Verification Matrix On Real Runtime Paths

**Budget:** 5h

**Files:**
- Modify: `tests/browser/combat-smoke.spec.ts` (only if fallout appears)
- Modify: `tests/browser/combat-qa.spec.ts` (only if fallout appears)
- Modify: `verification/consistency-latest.txt` (only if the repo convention is to refresh committed verification snapshots)

**Functional points**
- Verify that stabilization holds under real browser/runtime conditions, not only compile-time and static tests.
- Confirm active QA cases still pass after path/type/runtime changes.
- Confirm build artifacts still generate cleanly.

**Acceptance points**
- `npm run build` green.
- `npm run browser:smoke` green.
- `npm run browser:qa` green for active tests.
- `npm run consistency` shows only non-repo memory drift, unless local memory housekeeping is explicitly included.

**Step 1: Start the dev server**

Run in a separate terminal:

```bash
npm run dev
```

Expected:
- Vite serves on `http://127.0.0.1:5173` or `http://localhost:5173`

**Step 2: Run runtime gates in escalation order**

Run:

```bash
npm run build
npm run browser:smoke
npx playwright test tests/browser/combat-qa.spec.ts -g "6.1 进战斗场景零 uncaught error"
npm run browser:qa
npm run consistency
```

Expected:
- `build`: green
- `browser:smoke`: green
- targeted `6.1`: green
- `browser:qa`: active tests green; P4-gated cases remain skipped
- `consistency`: no repo drift remains

**Step 3: If a verification fails, fix immediately before moving on**

Rule:

```text
Do not proceed to doc sync until browser + static + consistency are all understood.
```

**Step 4: Commit**

```bash
git add tests/browser/combat-smoke.spec.ts tests/browser/combat-qa.spec.ts verification/consistency-latest.txt
git commit -m "test(qa): reverify stage4 stabilization gates"
```

If `verification/consistency-latest.txt` is not part of the repo update strategy for this branch, omit it from staging.

---

### Task 6: Sync SSOT And Cut The 24h Stabilization Checkpoint

**Budget:** 3-4h

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/testing/engine-truth-coverage-matrix.md`
- Create: `docs/changelog/2026-06-10-stage4-stabilization.md`

**Functional points**
- Record what actually changed in this stabilization batch.
- Ensure SSOT docs reflect current behavior, especially:
  - scenario `6/7` nuance
  - `x/y/z + mp/status/cooldown/knockback` in state hash
  - `InputRecorder` now lives under `src/engine/replay/`
  - browser crash guard exists and is intentional
- Produce one short changelog entry that future sessions can read instead of reconstructing from git diff.

**Acceptance points**
- `CLAUDE.md` does not contradict code or tests touched in this batch.
- `engine-truth-coverage-matrix.md` matches the current runtime and test story.
- New changelog file summarizes:
  - stabilization scope
  - verification commands
  - known non-goals / residual risks

**Step 1: Update SSOT**

Ensure `CLAUDE.md` captures the stabilized Stage 4 wording already reflected by code:

```text
121 静态测试全绿，EngineKernel 确定性保持(x/y/z + mp/status/cooldown/knockback 入 stateHash)
```

**Step 2: Add the batch changelog**

Create `docs/changelog/2026-06-10-stage4-stabilization.md` with:

```md
# 2026-06-10 Stage 4 Stabilization

- Finished InputRecorder engine-path migration
- Added create-path runtime crash guards (static + browser)
- Kept strict mode enabled and green
- Cleared repo-side runtime-switch consistency drift
- Re-verified typecheck/static/build/browser/consistency

## Residual
- local memory wiki-link drift is outside repo source
- Stage 5 not started
```

**Step 3: Final verification before checkpoint**

Run:

```bash
npm run typecheck
npm run static:test
npm run build
npm run consistency
```

Expected:
- All green except possible local-memory-only drift

**Step 4: Final checkpoint commit**

```bash
git add CLAUDE.md docs/testing/engine-truth-coverage-matrix.md docs/changelog/2026-06-10-stage4-stabilization.md
git commit -m "docs(ssot): sync stage4 stabilization checkpoint"
```

---

## Final 24h Exit Criteria

- Repo source no longer references deleted `src/combat/replay/InputRecorder.ts`.
- `maturity/p3.1-runtime-switch` drift is closed.
- `CombatScene.create()` regression is guarded in both static and browser layers.
- `strict: true` remains enabled and green.
- Browser/runtime gate has at least one explicit create-path uncaught-error guard.
- Docs/changelog match the current runtime and verification reality.

## Deferred Unless Time Remains

1. Local memory cleanup for `memory/wiki-links`.
2. Broader dual-kernel decoupling.
3. Launch/OTG/armor truth redesign.
4. Stage 5 rendering kickoff.

## Recommended Commit Sequence

1. `fix(runtime): finish input recorder engine migration`
2. `test(runtime): guard combat scene create path`
3. `fix(types): settle strict-mode stabilization fallout`
4. `test(qa): reverify stage4 stabilization gates`
5. `docs(ssot): sync stage4 stabilization checkpoint`

