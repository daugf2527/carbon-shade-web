// Content-addressable hash for manifest data — deterministic hash of JSON content
// that replaces hardcoded "combat-schema-v1" in ReplayRecorder.

import type { FrameDataAction, ActionName } from "../../combat/types.js";

/**
 * Deterministic stringify — sorts object keys for stable output.
 * Mirror of ReplayRecorder.stableStringify for consistency.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

/**
 * FNV-1a 32-bit hash of a string — deterministic, collision-resistant enough for content addressing.
 */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Computes a content hash from the actions manifest.
 * Returns a hex string like "a1b2c3d4".
 * Used as combatSchemaHash in ReplayRecorder — changes only when manifest content changes.
 */
export function computeActionsHash(actions: Record<ActionName, FrameDataAction>): string {
  return fnv1a(stableStringify(actions));
}
