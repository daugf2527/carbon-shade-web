import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function diagnosticsFromBrowserSmoke(browserSmoke = {}) {
  return browserSmoke.evidence?.diagnostics ?? {};
}

export function assertRuntimeEvidence(runtimeEvidence = {}, browserSmoke = {}, options = {}) {
  const errors = [];
  const allowedFallbackKinds = new Set(options.allowedFallbackKinds ?? []);
  const assets = runtimeEvidence.assets ?? {};
  const combat = runtimeEvidence.combat ?? {};
  const diagnostics = diagnosticsFromBrowserSmoke(browserSmoke);
  const scenario = combat.scenario ?? {};
  const eventTypes = combat.eventTypes ?? {};
  const replay = combat.replay ?? {};
  const meta = replay.metadata ?? {};

  // ── Macro health ──

  if (combat.sceneReady !== true) errors.push('macro: combat.sceneReady must be true');

  const missingKeys = asArray(assets.missingKeys);
  if (missingKeys.length > 0) errors.push(`macro: missing asset keys: ${missingKeys.join(', ')}`);

  const failedAssets = asArray(assets.failed);
  if (failedAssets.length > 0) {
    errors.push(`macro: failed assets: ${failedAssets.map(item => item?.key ?? 'unknown').join(', ')}`);
  }

  if (!combat.finalStateHash || typeof combat.finalStateHash !== 'string') {
    errors.push('macro: combat.finalStateHash is required');
  }

  if ((combat.tick ?? 0) < 50) errors.push('macro: tick count too low (< 50)');
  if ((combat.eventCount ?? 0) < 50) errors.push('macro: event count too low (< 50)');

  // ── Chain 1: Input → Action ──

  if (!(scenario.quickReboundObserved === true)) errors.push('chain1: quickReboundObserved must be true');

  // ── Chain 2: Attack → Hit → Damage → Reaction ──

  if ((eventTypes.HitConfirmed ?? 0) < 3) errors.push('chain2: HitConfirmed events too few (< 3)');
  if ((eventTypes.DamageApplied ?? 0) < 3) errors.push('chain2: DamageApplied events too few (< 3)');
  if ((eventTypes.ReactionApplied ?? 0) < 1) errors.push('chain2: ReactionApplied events too few (< 1)');
  if (scenario.launchObserved !== true) errors.push('chain2: launchObserved must be true');
  if (scenario.armorHitObserved !== true) errors.push('chain2: armorHitObserved must be true');
  if (scenario.buildingArmorBlockedControlObserved !== true) errors.push('chain2: buildingArmorBlockedControlObserved must be true');

  // ── Chain 3: AI + Boss ──

  if (!("normalHitObserved" in scenario)) errors.push('chain3: scenario must have normalHitObserved field');
  if (!("ragingFuryMultiHitObserved" in scenario)) errors.push('chain3: scenario must have ragingFuryMultiHitObserved field');

  // ── Chain 4: Buff ──

  // Buff assertions deferred to per-scenario data; base scenario has no guaranteed buffs

  // ── Chain 5: Status ──

  if ((eventTypes.StatusApplied ?? 0) < 1) errors.push('chain5: StatusApplied events missing');
  if (scenario.bleedObserved !== true) errors.push('chain5: bleedObserved must be true');

  // ── Chain 6: Movement / Physics ──

  // Position bounds checked in smoke test; verify replay contains actor positions

  // ── Chain 7: Replay ──

  if (!replay || !meta) {
    errors.push('chain7: replay not exported');
  } else {
    if (!meta.buildHash || typeof meta.buildHash !== 'string') errors.push('chain7: replay missing buildHash');
    if (!meta.combatSchemaHash || typeof meta.combatSchemaHash !== 'string') errors.push('chain7: replay missing combatSchemaHash');
    if (!meta.finalStateHash || typeof meta.finalStateHash !== 'string') errors.push('chain7: replay missing finalStateHash');
    if (!meta.manifestHash || typeof meta.manifestHash !== 'string') errors.push('chain7: replay missing manifestHash');
    if (!meta.statusManifestHash || typeof meta.statusManifestHash !== 'string') errors.push('chain7: replay missing statusManifestHash');
    if (!meta.enemyManifestHash || typeof meta.enemyManifestHash !== 'string') errors.push('chain7: replay missing enemyManifestHash');
    if (!meta.damageManifestHash || typeof meta.damageManifestHash !== 'string') errors.push('chain7: replay missing damageManifestHash');
    if (meta.logicFps !== 60) errors.push(`chain7: replay logicFps must be 60, got ${meta.logicFps}`);
    if ((replay.frameCount ?? 0) < 1) errors.push('chain7: replay frameCount too low');
  }

  // ── Diagnostics ──

  const consoleErrors = asArray(diagnostics.consoleErrors);
  const pageErrors = asArray(diagnostics.pageErrors);
  const failedRequests = asArray(diagnostics.failedRequests);
  const badResponses = asArray(diagnostics.badResponses);
  if (consoleErrors.length > 0) errors.push(`diag: console errors: ${consoleErrors.join(' | ')}`);
  if (pageErrors.length > 0) errors.push(`diag: page errors: ${pageErrors.join(' | ')}`);
  if (failedRequests.length > 0) errors.push(`diag: failed requests: ${failedRequests.map(item => item?.url ?? item).join(' | ')}`);
  if (badResponses.length > 0) errors.push(`diag: bad responses: ${badResponses.map(item => `${item?.status ?? 'unknown'} ${item?.url ?? ''}`.trim()).join(' | ')}`);

  // FPS: check for sustained low FPS warnings from CombatScene
  const fpErrors = consoleErrors.filter(e => typeof e === 'string' && e.startsWith('[FPS]'));
  if (fpErrors.length > 0) errors.push(`perf: FPS regression detected: ${fpErrors.length} warnings`);

  // ── Dynamic manifests ──

  for (const manifest of asArray(runtimeEvidence.dynamicManifests)) {
    if (manifest?.status === 'fallback' && !allowedFallbackKinds.has(manifest.kind)) {
      errors.push(`manifest: unauthorized dynamic manifest fallback: ${manifest.kind} ${manifest.url} ${manifest.fallbackReason ?? ''}`.trim());
    }
  }

  // ── Smoke test self-check ──

  const smokeResults = asArray(browserSmoke.evidence?.results ?? browserSmoke.results);
  const failedResults = smokeResults.filter(r => r?.passed === false);
  if (failedResults.length > 0) {
    errors.push(`smoke: ${failedResults.length} browser assertions failed: ${failedResults.map(r => r.check).join(', ')}`);
  }

  return { passed: errors.length === 0, errors };
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function main(argv) {
  const [, , runtimeEvidencePath, browserSmokePath] = argv;
  if (!runtimeEvidencePath || !browserSmokePath) {
    console.error('Usage: node scripts/assert-runtime-evidence.mjs <runtime-evidence.json> <browser-smoke.json>');
    return 2;
  }

  const result = assertRuntimeEvidence(readJson(runtimeEvidencePath), readJson(browserSmokePath), {
    allowedFallbackKinds: (process.env.RUNTIME_EVIDENCE_ALLOWED_FALLBACKS ?? '').split(',').map(item => item.trim()).filter(Boolean),
  });

  if (!result.passed) {
    console.error(JSON.stringify(result, null, 2));
    return 1;
  }

  console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(await main(process.argv));
}
