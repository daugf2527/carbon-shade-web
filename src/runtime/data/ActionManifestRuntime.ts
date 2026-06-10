import { ACTIONS, loadFromManifest } from "../../combat/actions/FrameDataAction.js";
import type { ActionName, FrameDataAction } from "./CombatDataTypes.js";

export function getDefaultActionManifest(): Record<ActionName, FrameDataAction> {
  return ACTIONS as Record<ActionName, FrameDataAction>;
}

export function installActionManifest(actions: Record<ActionName, FrameDataAction>): void {
  loadFromManifest(actions);
}
