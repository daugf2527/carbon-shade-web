function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function byKey(items) {
  return new Map(asArray(items).filter(item => item?.key).map(item => [item.key, item]));
}

export function summarizeRuntimeEvidence(runtimeEvidence = {}, diagnostics = {}) {
  const assets = runtimeEvidence.assets ?? {};
  const expected = asArray(assets.expected);
  const loaded = asArray(assets.loaded);
  const failed = asArray(assets.failed);
  const loadedByKey = byKey(loaded);
  const failedByKey = byKey(failed);
  const missingKeys = expected
    .map(item => item?.key)
    .filter(key => key && !loadedByKey.has(key) && !failedByKey.has(key));
  const combat = runtimeEvidence.combat ?? {};
  const replay = combat.replay ?? {};
  const metadata = replay.metadata ?? {};

  return {
    buildHash: runtimeEvidence.buildHash ?? metadata.buildHash ?? null,
    assets: {
      expectedCount: expected.length,
      loadedCount: loaded.length,
      failedCount: failed.length,
      expected,
      loaded,
      failed,
      missingKeys,
    },
    combat: {
      sceneReady: Boolean(combat.sceneReady),
      tick: combat.tick ?? null,
      eventCount: combat.eventCount ?? 0,
      scenario: combat.scenario ?? null,
      replayFrameCount: replay.frameCount ?? 0,
      finalStateHash: metadata.finalStateHash ?? null,
      combatSchemaHash: metadata.combatSchemaHash ?? null,
      manifestHash: metadata.manifestHash ?? null,
      statusManifestHash: metadata.statusManifestHash ?? null,
      enemyManifestHash: metadata.enemyManifestHash ?? null,
      damageManifestHash: metadata.damageManifestHash ?? null,
      eventTypes: combat.eventTypes ?? {},
    },
    diagnostics: {
      consoleErrorCount: asArray(diagnostics.consoleErrors).length,
      pageErrorCount: asArray(diagnostics.pageErrors).length,
      failedRequestCount: asArray(diagnostics.failedRequests).length,
      badResponseCount: asArray(diagnostics.badResponses).length,
      consoleErrors: asArray(diagnostics.consoleErrors),
      pageErrors: asArray(diagnostics.pageErrors),
      failedRequests: asArray(diagnostics.failedRequests),
      badResponses: asArray(diagnostics.badResponses),
    },
  };
}

export function buildBrowserSmokePayload({
  passed,
  url,
  timestamp,
  results,
  runtimeEvidence,
  diagnostics,
  error,
}) {
  return {
    passed: Boolean(passed),
    url,
    timestamp,
    ...(error ? { error } : {}),
    results: asArray(results),
    evidence: summarizeRuntimeEvidence(runtimeEvidence, diagnostics),
  };
}
