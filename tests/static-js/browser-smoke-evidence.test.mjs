import assert from 'node:assert/strict';
import {
  buildBrowserSmokePayload,
  summarizeRuntimeEvidence,
} from '../../scripts/browser-smoke-evidence.mjs';

const runtimeEvidence = {
  buildHash: 'abc1234',
  assets: {
    expected: [
      { key: 'player_berserker_norm', url: 'assets/sprites/normalized/player_berserker_norm.png' },
      { key: 'goblin_norm', url: 'assets/sprites/normalized/goblin_norm.png' },
    ],
    loaded: [
      { key: 'player_berserker_norm', url: 'assets/sprites/normalized/player_berserker_norm.png' },
    ],
    failed: [
      { key: 'missing_norm', url: 'assets/sprites/normalized/missing_norm.png', error: '404' },
    ],
  },
  combat: {
    sceneReady: true,
    tick: 42,
    eventCount: 7,
    scenario: { normalHitObserved: true },
    replay: {
      metadata: { finalStateHash: 'deadbeef', combatSchemaHash: 'schema-a' },
      frameCount: 3,
    },
    eventTypes: { HitConfirmed: 2, DamageApplied: 2, GrabSucceeded: 1 },
  },
};

const summary = summarizeRuntimeEvidence(runtimeEvidence, {
  consoleErrors: ['boom'],
  pageErrors: ['page exploded'],
  failedRequests: [{ url: 'http://localhost/missing.png', failure: 'net::ERR_FAILED' }],
  badResponses: [{ url: 'http://localhost/api', status: 500 }],
});

assert.equal(summary.assets.expectedCount, 2);
assert.equal(summary.assets.loadedCount, 1);
assert.deepEqual(summary.assets.missingKeys, ['goblin_norm']);
assert.equal(summary.assets.failed.length, 1);
assert.equal(summary.combat.sceneReady, true);
assert.equal(summary.combat.finalStateHash, 'deadbeef');
assert.equal(summary.combat.eventTypes.GrabSucceeded, 1);
assert.equal(summary.diagnostics.consoleErrorCount, 1);
assert.equal(summary.diagnostics.pageErrorCount, 1);
assert.equal(summary.diagnostics.failedRequestCount, 1);
assert.equal(summary.diagnostics.badResponseCount, 1);

const payload = buildBrowserSmokePayload({
  passed: true,
  url: 'http://localhost:5173/carbon-shade-web/',
  timestamp: '2026-05-03T00:00:00.000Z',
  results: [{ check: 'page_loaded', passed: true }],
  runtimeEvidence,
  diagnostics: {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    badResponses: [],
  },
});

assert.equal(payload.evidence.assets.expectedCount, 2);
assert.equal(payload.evidence.combat.finalStateHash, 'deadbeef');
assert.equal(payload.evidence.diagnostics.consoleErrorCount, 0);
assert.equal(payload.results[0].check, 'page_loaded');

console.log('browser smoke evidence tests passed');
