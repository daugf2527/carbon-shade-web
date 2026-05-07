// Manifest loader — loads and validates JSON manifests at startup,
// providing a single source of truth for runtime data.

import type { FrameDataAction, ActionName } from "../../combat/types.js";
import { validateManifest, type ManifestValidationOptions } from "./schema.js";
import { computeActionsHash } from "./hash.js";

// Dynamic import for JSON — in Node tests this works with assert { type: "json" },
// in browser/Vite this is handled by the bundler's JSON plugin.
// We use a wrapper that tries both paths.

let _cachedActions: Record<ActionName, FrameDataAction> | null = null;
let _cachedHash: string | null = null;

/**
 * Loads the actions manifest from JSON.
 * Caches result in memory — call once at startup.
 */
export async function loadActionsManifest(options: ManifestValidationOptions = {}): Promise<Record<ActionName, FrameDataAction>> {
  if (_cachedActions) {
    assertValidManifest(_cachedActions, options);
    return _cachedActions;
  }

  // Vite handles JSON imports natively; Node needs assert
  let manifest: Record<ActionName, FrameDataAction>;
  try {
    // Vite path — works in browser dev/prod
    manifest = (await import("./actions/default.json")).default as Record<ActionName, FrameDataAction>;
  } catch {
    // Node path — works in test environment
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = dirname(fileURLToPath(import.meta.url));
    manifest = JSON.parse(readFileSync(join(__dirname, "actions", "default.json"), "utf-8")) as Record<ActionName, FrameDataAction>;
  }

  assertValidManifest(manifest, options);

  _cachedActions = manifest;
  _cachedHash = computeActionsHash(manifest);
  return manifest;
}

function assertValidManifest(manifest: Record<ActionName, FrameDataAction>, options: ManifestValidationOptions): void {
  const violations = validateManifest(manifest, options);
  if (violations.length > 0) {
    const msg = violations.map(v => `${v.path}: ${v.message}`).join("\n  ");
    throw new Error(`Manifest validation failed with ${violations.length} violation(s):\n  ${msg}`);
  }
}

/**
 * Returns the content hash of the currently loaded manifest.
 * Returns null if manifest hasn't been loaded yet.
 */
export function getManifestHash(): string | null {
  return _cachedHash;
}

/**
 * Synchronous accessor — only works after loadActionsManifest() has been called.
 * Throws if manifest not yet loaded.
 */
export function getActions(): Record<ActionName, FrameDataAction> {
  if (!_cachedActions) {
    throw new Error("Manifest not loaded — call loadActionsManifest() first");
  }
  return _cachedActions;
}

/**
 * Synchronous single-action accessor.
 */
export function getAction(name: ActionName): FrameDataAction {
  const actions = getActions();
  const action = actions[name];
  if (!action) {
    throw new Error(`Action "${name}" not found in manifest`);
  }
  return action;
}
