import type { ActionName, FrameDataAction } from "../combat/types.js";
import { loadFromManifest } from "../combat/actions/FrameDataAction.js";
import { computeActionsHash } from "../data/manifest/hash.js";
import { loadActionsManifest } from "../data/manifest/loader.js";
import { ACTION_MANIFEST_DATA_SOURCE } from "../data/manifest/sources.js";

export interface ActionManifestRuntimeInitOptions {
  loadActions?: () => Promise<Record<ActionName, FrameDataAction>>;
}

export interface ActionManifestRuntimeInitResult {
  actions: Record<ActionName, FrameDataAction>;
  manifestHash: string;
  dataSource: typeof ACTION_MANIFEST_DATA_SOURCE;
}

export async function initializeActionManifestForRuntime(
  options: ActionManifestRuntimeInitOptions = {}
): Promise<ActionManifestRuntimeInitResult> {
  const actions = await (options.loadActions ?? loadActionsManifest)();
  loadFromManifest(actions);
  return {
    actions,
    manifestHash: computeActionsHash(actions),
    dataSource: ACTION_MANIFEST_DATA_SOURCE,
  };
}
