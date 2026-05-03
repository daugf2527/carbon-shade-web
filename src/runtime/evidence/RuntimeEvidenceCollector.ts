import type {
  RuntimeAssetRecord,
  RuntimeCombatSnapshot,
  RuntimeDynamicManifestRecord,
  RuntimeEvidenceApi,
  RuntimeEvidenceSnapshot,
} from "./RuntimeEvidence.js";

export type RuntimeEvidenceCollectorOptions = {
  buildHash?: string | null;
  now?: () => number;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function upsertByKey(items: RuntimeAssetRecord[], item: RuntimeAssetRecord): void {
  const index = items.findIndex(candidate => candidate.key === item.key);
  if (index >= 0) items[index] = { ...items[index], ...item };
  else items.push(item);
}

function countEventTypes(events: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(events)) return out;
  for (const event of events) {
    const type = typeof event === "object" && event !== null && "type" in event
      ? String((event as { type?: unknown }).type ?? "unknown")
      : "unknown";
    out[type] = (out[type] ?? 0) + 1;
  }
  return out;
}

export class RuntimeEvidenceCollector implements RuntimeEvidenceApi {
  private buildHash: string | null;
  private readonly now: () => number;
  private readonly expected: RuntimeAssetRecord[] = [];
  private readonly loaded: RuntimeAssetRecord[] = [];
  private readonly failed: RuntimeAssetRecord[] = [];
  private readonly dynamicManifests: RuntimeDynamicManifestRecord[] = [];
  private combat: RuntimeCombatSnapshot = {};

  constructor(options: RuntimeEvidenceCollectorOptions = {}) {
    this.buildHash = options.buildHash ?? null;
    this.now = options.now ?? Date.now;
  }

  setBuildHash(buildHash: string | null): void {
    this.buildHash = buildHash;
  }

  recordExpectedAsset(asset: RuntimeAssetRecord): void {
    upsertByKey(this.expected, { ...asset, recordedAtMs: this.now() });
  }

  recordAssetLoaded(asset: RuntimeAssetRecord): void {
    upsertByKey(this.loaded, { ...asset, recordedAtMs: this.now() });
  }

  recordAssetFailed(asset: RuntimeAssetRecord): void {
    upsertByKey(this.failed, { ...asset, recordedAtMs: this.now() });
  }

  recordCombatSceneReady(): void {
    this.combat = { ...this.combat, sceneReady: true };
  }

  recordCombatSnapshot(snapshot: RuntimeCombatSnapshot): void {
    const replayMetadata = snapshot.replay?.metadata;
    this.combat = {
      ...this.combat,
      ...snapshot,
      finalStateHash: snapshot.finalStateHash ?? replayMetadata?.finalStateHash ?? this.combat.finalStateHash ?? null,
      combatSchemaHash: snapshot.combatSchemaHash ?? replayMetadata?.combatSchemaHash ?? this.combat.combatSchemaHash ?? null,
    };
  }

  recordDynamicManifest(manifest: RuntimeDynamicManifestRecord): void {
    const record = { ...manifest, recordedAtMs: this.now() };
    const index = this.dynamicManifests.findIndex(candidate => candidate.kind === record.kind && candidate.url === record.url);
    if (index >= 0) this.dynamicManifests[index] = { ...this.dynamicManifests[index], ...record };
    else this.dynamicManifests.push(record);
  }

  export(): RuntimeEvidenceSnapshot {
    const loadedKeys = new Set(this.loaded.map(item => item.key));
    const failedKeys = new Set(this.failed.map(item => item.key));
    const missingKeys = this.expected
      .map(item => item.key)
      .filter(key => !loadedKeys.has(key) && !failedKeys.has(key));

    return {
      schemaVersion: 1,
      buildHash: this.buildHash,
      exportedAt: new Date(this.now()).toISOString(),
      assets: {
        expected: clone(this.expected),
        loaded: clone(this.loaded),
        failed: clone(this.failed),
        missingKeys,
      },
      combat: clone(this.combat),
      dynamicManifests: clone(this.dynamicManifests),
    };
  }
}

export function getRuntimeEvidenceCollector(buildHash?: string | null): RuntimeEvidenceCollector {
  const runtime = globalThis as typeof globalThis & {
    combatLab?: { evidence?: RuntimeEvidenceCollector };
  };
  runtime.combatLab = runtime.combatLab ?? {};
  const existing = runtime.combatLab.evidence;
  if (existing instanceof RuntimeEvidenceCollector) {
    if (buildHash !== undefined) existing.setBuildHash(buildHash);
    return existing;
  }
  const collector = new RuntimeEvidenceCollector({ buildHash: buildHash ?? null });
  runtime.combatLab.evidence = collector;
  return collector;
}

export function recordKernelCombatEvidence(
  collector: RuntimeEvidenceApi,
  kernel: {
    tickCount?: number;
    scenario?: unknown;
    bus?: { archive?: unknown[] };
    replay?: { export?: () => { metadata?: Record<string, unknown>; frameCount?: number } };
  },
): void {
  const replay = kernel.replay?.export?.() ?? null;
  const events = Array.isArray(kernel.bus?.archive) ? kernel.bus.archive : [];
  collector.recordCombatSnapshot({
    tick: kernel.tickCount ?? null,
    eventCount: events.length,
    scenario: kernel.scenario ?? null,
    replay,
    eventTypes: countEventTypes(events),
  });
}
