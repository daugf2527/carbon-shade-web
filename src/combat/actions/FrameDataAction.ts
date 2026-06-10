import type { ActionName, FrameDataAction } from "../types.js";
import {
  ACTIONS,
  getInstalledActionManifest,
  installActionManifest,
} from "../../runtime/data/ActionManifestRuntime.js";

export { ACTIONS };

export function loadFromManifest(actions: Record<ActionName, FrameDataAction>): void {
  installActionManifest(actions);
}

export function getAction(name: ActionName): FrameDataAction {
  return getInstalledActionManifest()[name];
}
