export type RuntimeAssetRecord = {
  key: string;
  url?: string;
  error?: string;
  recordedAtMs?: number;
};

export type RuntimeDynamicManifestStatus = "loaded" | "failed" | "fallback";

export type RuntimeDynamicManifestRecord = {
  kind: string;
  url: string;
  status: RuntimeDynamicManifestStatus;
  hash?: string;
  version?: string;
  loadedAtTick?: number;
  fallbackReason?: string;
  recordedAtMs?: number;
};

export type RuntimeReplayEvidence = {
  metadata?: {
    buildHash?: string;
    combatSchemaHash?: string;
    finalStateHash?: string;
    [key: string]: unknown;
  };
  frameCount?: number;
};

export type RuntimeCombatSnapshot = {
  sceneReady?: boolean;
  bootSceneReady?: boolean;
  tick?: number | null;
  eventCount?: number;
  scenario?: unknown;
  replay?: RuntimeReplayEvidence | null;
  eventTypes?: Record<string, number>;
  finalStateHash?: string | null;
  combatSchemaHash?: string | null;
};

export type RuntimeAssetEvidence = {
  expected: RuntimeAssetRecord[];
  loaded: RuntimeAssetRecord[];
  failed: RuntimeAssetRecord[];
  missingKeys: string[];
};

export type RuntimeEvidenceSnapshot = {
  schemaVersion: 1;
  buildHash: string | null;
  exportedAt: string;
  assets: RuntimeAssetEvidence;
  combat: RuntimeCombatSnapshot;
  dynamicManifests: RuntimeDynamicManifestRecord[];
};

export type RuntimeEvidenceApi = {
  export(): RuntimeEvidenceSnapshot;
  recordExpectedAsset(asset: RuntimeAssetRecord): void;
  recordAssetLoaded(asset: RuntimeAssetRecord): void;
  recordAssetFailed(asset: RuntimeAssetRecord): void;
  recordCombatSceneReady(): void;
  recordCombatSnapshot(snapshot: RuntimeCombatSnapshot): void;
  recordDynamicManifest(manifest: RuntimeDynamicManifestRecord): void;
};
