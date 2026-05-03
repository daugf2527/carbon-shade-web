import type { RuntimeDynamicManifestRecord, RuntimeEvidenceApi } from "../evidence/RuntimeEvidence.js";

export class DynamicDataLoader {
  constructor(private readonly evidence: RuntimeEvidenceApi) {}

  recordManifest(record: RuntimeDynamicManifestRecord): void {
    this.evidence.recordDynamicManifest(record);
  }
}
