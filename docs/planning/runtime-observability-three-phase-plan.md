# Runtime Observability And CI Evidence Three-Phase Plan

> **Goal:** 标准化测试、调试、CI/CD 证据链，让动态资源和动态战斗数据加载能被远端 CI 直接验证。
>
> **Architecture:** 通用测试、trace、报告、artifact 交给 Playwright Test 和 GitHub Actions；项目只维护少量领域 evidence schema，用来表达资产、动态数据、combat replay、事件分布这些开源工具不知道的事实。
>
> **Tech Stack:** Playwright Test, GitHub Actions artifacts, TypeScript, existing combat event archive/replay, optional OpenTelemetry/Allure only after core evidence stable.

---

## Current State

- `npm run browser:smoke` 已能产出 `verification/browser-smoke.json`，包含 asset load、combat scene、scenario、replay hash、event type、console/network diagnostics。
- browser smoke 仍是手写 Node + Playwright API 脚本，不是标准 Playwright Test runner。
- CI 已上传 screenshot 和 `browser-smoke.json`，但没有统一 trace zip、runtime evidence 单独 artifact、JUnit/HTML report。
- 领域证据还散在 `BootScene`、`CombatScene`、`scripts/browser-smoke.mjs`、`scripts/browser-smoke-evidence.mjs`，需要收敛为稳定 collector。

## Target Shape

CI 每次 run 应固定产出：

```text
verification/browser-smoke.json
verification/runtime-evidence.json
verification/scenario-screenshot.png
test-results/playwright/
.tmp/static-test-results.json
```

失败时应能直接回答：

- 页面有没有启动、canvas 有没有出现、CombatScene 有没有进入。
- 哪些 sprite / manifest 预期加载，哪些实际加载，哪些失败或 fallback。
- deterministic scenario 是否完整跑过。
- replay `finalStateHash` 是否存在。
- console、page error、network failed request、HTTP 4xx/5xx 有没有出现。
- Bloodlust / RagingFury / status / cooldown 等关键事件是否进入 event archive。

---

## Phase 1: Standardize Browser Smoke On Playwright Test

**Goal:** 用 Playwright Test runner 替代手写浏览器测试控制流，保留当前 smoke 能力，但获得标准 trace、report、retry、artifact 结构。

**Open-source first:**

- Use `@playwright/test` for browser smoke specs.
- Use Playwright built-in `trace: "retain-on-failure"` or `on-first-retry`.
- Use Playwright built-in JSON/JUnit/HTML reporters where useful.
- Keep GitHub `actions/upload-artifact` for artifacts.

**Files:**

- Create: `playwright.config.ts`
- Create: `tests/browser/combat-smoke.spec.ts`
- Modify: `package.json`
- Modify: `.github/workflows/combat-lab-ci.yml`
- Keep temporarily: `scripts/browser-smoke.mjs`

**Work items:**

1. Add `@playwright/test` dev dependency if the current `playwright` package does not expose the test runner cleanly.
2. Add `playwright.config.ts` with:
   - `testDir: "tests/browser"`
   - base URL from local Vite server
   - `webServer` starting Vite on port 5173
   - `trace: "retain-on-failure"`
   - screenshot/video only on failure unless explicitly needed
   - reporters: `list`, `json`, `junit`
3. Port current smoke checks into Playwright specs:
   - page loads
   - canvas exists
   - enter CombatScene via Enter
   - run deterministic scenario
   - assert `window.combatLab.kernel` exists
   - assert no console/page/network errors
4. Keep `npm run browser:smoke` but point it to Playwright Test:
   - `playwright test tests/browser/combat-smoke.spec.ts`
5. CI uploads:
   - `test-results/`
   - `playwright-report/`
   - existing `verification/*.json`

**Acceptance:**

- GitHub CI browser-smoke job passes.
- Failed browser smoke automatically has Playwright trace artifact.
- No loss of current `browser-smoke.json` fields.

**Risk control:**

- Keep old `scripts/browser-smoke.mjs` for one phase as fallback.
- Do not rewrite combat runtime or replay.
- Do not add Allure in this phase.

---

## Phase 2: Runtime Evidence Collector

**Goal:** 把当前 evidence 从脚本和 scene 里抽成稳定 runtime API，使本地、CI、GitHub Pages、未来动态加载都读同一份证据。

**Open-source first:**

- Use Playwright only for browser capture and assertion.
- Use TypeScript types for schema.
- Keep custom code limited to domain facts that generic tools cannot infer.

**Files:**

- Create: `src/runtime/evidence/RuntimeEvidence.ts`
- Create: `src/runtime/evidence/RuntimeEvidenceCollector.ts`
- Modify: `src/main.ts`
- Modify: `src/game/BootScene.ts`
- Modify: `src/game/CombatScene.ts`
- Modify: `scripts/browser-smoke-evidence.mjs`
- Create: `tests/static/runtime-evidence.test.ts`
- Create or update: `tests/browser/combat-smoke.spec.ts`

**Schema baseline:**

```ts
export interface RuntimeEvidence {
  version: "runtime-evidence-v1";
  build: {
    buildHash: string | null;
    combatSchemaHash: string | null;
    timestamp: string | null;
  };
  assets: {
    expected: AssetEvidence[];
    loaded: AssetEvidence[];
    failed: AssetFailureEvidence[];
    missingKeys: string[];
  };
  dynamicData: {
    manifests: DataManifestEvidence[];
    loaded: DataLoadEvidence[];
    fallbackUsed: DataFallbackEvidence[];
  };
  combat: {
    sceneReady: boolean;
    tick: number | null;
    eventCount: number;
    eventTypes: Record<string, number>;
    scenario: Record<string, boolean> | null;
    replayFrameCount: number;
    finalStateHash: string | null;
  };
}
```

**Work items:**

1. Add failing static test for collector normalization:
   - expected assets + loaded assets produce empty `missingKeys`
   - missing asset produces key in `missingKeys`
   - combat event archive produces `eventTypes`
   - replay export contributes `finalStateHash`
2. Implement `RuntimeEvidenceCollector`:
   - `recordExpectedAsset`
   - `recordAssetLoaded`
   - `recordAssetFailed`
   - `recordCombatSceneReady`
   - `recordCombatSnapshot`
   - `recordDynamicManifest`
   - `export`
3. Expose collector as:
   - `window.combatLab.evidence.export()`
   - `window.combatLab.evidence.record...` only if needed by runtime loaders
4. Make `BootScene` use collector for sprite loading.
5. Make `CombatScene` publish scene ready and combat snapshot.
6. Make Playwright browser test write:
   - `verification/runtime-evidence.json`
   - `verification/browser-smoke.json` containing summary plus diagnostics

**Acceptance:**

- `runtime-evidence.json` exists in CI artifact.
- It contains stable `version`, `assets`, `dynamicData`, `combat`.
- Current normalized sprite sheets are verified through collector.
- `browser-smoke.json` is a summary, not the only source of truth.

**Risk control:**

- Collector must not mutate combat simulation state.
- Collector must be render/runtime-side only.
- Combat kernel remains Phaser-free.

---

## Phase 3: Dynamic Data Trace And CI Gates

**Goal:** 当 action manifest、sprite manifest、combat tuning、status profile 改成动态加载后，CI 能证明加载来源、版本、hash、fallback 是否符合预期。

**Open-source first:**

- Use Playwright Test assertions for browser behavior.
- Use GitHub artifact retention for evidence history.
- Use Node built-in `crypto` or Web Crypto for small content hash.
- Do not introduce OpenTelemetry until there is a real long-running tracing need.

**Files:**

- Create: `src/runtime/data/DynamicDataLoader.ts`
- Create: `src/runtime/data/hash.ts`
- Modify: future dynamic manifest loaders under `src/data/` or `public/assets/combat-data/`
- Create: `scripts/assert-runtime-evidence.mjs`
- Create: `tests/static-js/runtime-evidence-assert.test.mjs`
- Modify: `.github/workflows/combat-lab-ci.yml`

**Dynamic data evidence event:**

```ts
{
  kind: "action_manifest" | "sprite_manifest" | "combat_tuning" | "status_profile";
  url: string;
  status: "loaded" | "failed" | "fallback";
  hash: string | null;
  version: string | null;
  loadedAtTick: number | null;
  fallbackReason?: string;
}
```

**Work items:**

1. Add `scripts/assert-runtime-evidence.mjs`:
   - fail if `combat.sceneReady !== true`
   - fail if `assets.missingKeys.length > 0`
   - fail if `assets.failed.length > 0`
   - fail if `combat.finalStateHash` is missing
   - fail if diagnostics contain console/page/network errors
   - fail if dynamic manifest fallback appears without explicit allowlist
2. Add CI step after browser smoke:
   - `node scripts/assert-runtime-evidence.mjs verification/runtime-evidence.json verification/browser-smoke.json`
3. Add dynamic loader wrapper:
   - on success records `loaded + hash + version`
   - on failure records `failed`
   - if fallback used records `fallback + reason`
4. For each future dynamic manifest, add one browser test:
   - expected manifest loaded
   - fallback not used
   - action count / sprite key count matches expectation

**Acceptance:**

- CI fails when dynamic manifest 404s but app silently falls back.
- CI fails when expected sprite/action data is missing.
- CI report explains failure through JSON, not only screenshots.
- Dynamic data changes become reviewable by hash/version/evidence diff.

**Risk control:**

- Do not migrate all TS data to JSON in this phase.
- Add loader wrapper first, then migrate one manifest at a time.
- Fallback is allowed only with explicit evidence and allowlist.

---

## Optional Later: Reporting And Long-Running Observability

Only consider after Phases 1-3 are stable:

- **Allure Report:** useful if test report readability becomes the blocker. Not needed for first standardized pipeline.
- **OpenTelemetry JS:** useful if runtime spans need to cross browser, backend, CDN, asset loader, replay server. Too heavy for the current local combat demo.
- **Grafana Loki/Tempo:** useful for deployed multi-user environments, not for current GitHub CI artifact-driven validation.

## Execution Order

1. Phase 1 commit: Playwright Test runner and artifact standardization.
2. Phase 2 commit: RuntimeEvidenceCollector and stable `runtime-evidence.json`.
3. Phase 3 commit: evidence assertion gate and dynamic data trace contract.

Each phase should be pushed separately and verified by GitHub CI before starting the next one.
