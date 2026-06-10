# 2026-06-10 Stage 4 Stabilization

- Finished the repo-side `InputRecorder` engine-path migration follow-up:
  - `scripts/consistency-check.mjs` now checks `src/engine/replay/InputRecorder.ts`
  - engineering docs no longer point at deleted `src/combat/replay/InputRecorder.ts`
- Re-verified the `CombatScene.create()` crash guard path:
  - static create-path smoke remains green
  - browser QA `6.1 进战斗场景零 uncaught error（create 路径）` now guards first-load uncaught/runtime boot failures explicitly
- Kept strict mode enabled and green:
  - `npm run typecheck` passed
  - `npm run static:test` passed
- Re-verified runtime/browser gates on the stabilized tree:
  - `npm run build` passed
  - `npm run browser:smoke` exited green with the existing P4-gated skip
  - `npm run browser:qa` passed for active tests; expected P4-gated cases remained skipped
- Cleared repo-side runtime-switch consistency drift:
  - `maturity/p3.1-runtime-switch` is green
  - remaining `consistency` drift is only local `memory/wiki-links`, outside repo source
- Recalibrated browser deterministic attack baselines to the current runtime reality:
  - CombatScene grunt is the LV31 scaled dungeon monster (`hp=321`), not the old 46 HP baseline
  - browser `actionTicks` include hit-stop in the measured action lifecycle

## Verification

```bash
npm run typecheck
npm run static:test
npm run build
npm run browser:smoke
npm run browser:qa
npx playwright test tests/browser/combat-qa.spec.ts -g "6.1 进战斗场景零 uncaught error"
npm run consistency
```

## Residual

- `memory/wiki-links` drift is local memory hygiene, not repo source drift
- `browser:smoke` remains an intentional skip under the existing P4 gate
- Stage 5 rendering kickoff has not started
