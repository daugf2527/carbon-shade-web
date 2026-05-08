import type { StatusEffectType, StatusManifest, StatusProfile } from "../../combat/types.js";
import statusManifestJson from "./status/default.json" with { type: "json" };
import pveProfileJson from "./status/pve-profile.json" with { type: "json" };

export const DEFAULT_STATUS_MANIFEST = statusManifestJson as StatusManifest;
export const STATUS_PROFILES = DEFAULT_STATUS_MANIFEST.profiles as Partial<Record<StatusEffectType, StatusProfile>>;

export interface PveStatusConfig {
  resistanceDefaults: Partial<Record<StatusEffectType, number>>;
  tolerance: { threshold: number; gainPerApplication: number; decayPerTick: number; hardControlMutex: boolean };
  schemaVersion: string;
  sourcePolicyVersion: string;
  targetVersion: string;
}
export const PVE_STATUS_CONFIG = pveProfileJson as unknown as PveStatusConfig;

export function getStatusProfile(type: StatusEffectType): StatusProfile | undefined {
  return STATUS_PROFILES[type];
}

export function getDefaultResistance(type: StatusEffectType): number {
  return PVE_STATUS_CONFIG.resistanceDefaults[type] ?? 0;
}
