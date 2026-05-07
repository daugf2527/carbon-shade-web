import type { StatusEffectType, StatusManifest, StatusProfile } from "../../combat/types.js";
import statusManifestJson from "./status/default.json" with { type: "json" };

export const DEFAULT_STATUS_MANIFEST = statusManifestJson as StatusManifest;
export const STATUS_PROFILES = DEFAULT_STATUS_MANIFEST.profiles as Partial<Record<StatusEffectType, StatusProfile>>;

export function getStatusProfile(type: StatusEffectType): StatusProfile | undefined {
  return STATUS_PROFILES[type];
}
