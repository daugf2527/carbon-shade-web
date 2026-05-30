// Manifest loader — validates runtime manifests against schema, providing
// a single source of truth for runtime data.

import type { FrameDataAction, ActionName, StatusManifest } from "../../combat/types.js";
import { ACTIONS } from "../../combat/actions/FrameDataAction.js";
import { validateEnemyManifest, validateManifest, validateStatusManifest, type ManifestValidationOptions } from "./schema.js";
import { computeActionsHash, type DamageManifest, computeDamageManifestHash } from "./hash.js";
import { DEFAULT_ENEMY_MANIFEST } from "./ai.js";
import type { EnemyManifest } from "./aiTypes.js";
import { DEFAULT_STATUS_MANIFEST } from "./status.js";

let _cachedActions: Record<ActionName, FrameDataAction> | null = null;
let _cachedHash: string | null = null;
let _cachedStatusManifest: StatusManifest | null = null;
let _cachedEnemyManifest: EnemyManifest | null = null;
let _cachedDamageManifest: DamageManifest | null = null;
let _cachedDamageManifestHash: string | null = null;

/**
 * Stage 3 T-A.5 (2026-05-30): default.json 已废弃, ACTIONS (TS 模块) 现为唯一 SOT.
 * 函数签名保留以兼容现有 async 调用方; 内部改为同步返回 ACTIONS.
 * Phase A 之后 ACTIONS 会改为从 src/data/manifest/truth/ 读 PVF 真值生成.
 */
export async function loadActionsManifest(options: ManifestValidationOptions = {}): Promise<Record<ActionName, FrameDataAction>> {
  if (_cachedActions) {
    assertValidManifest(_cachedActions, options);
    return _cachedActions;
  }
  const manifest = ACTIONS as Record<ActionName, FrameDataAction>;
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

export async function loadStatusManifest(options: ManifestValidationOptions = {}): Promise<StatusManifest> {
  if (_cachedStatusManifest) {
    assertValidStatusManifest(_cachedStatusManifest, options);
    return _cachedStatusManifest;
  }
  assertValidStatusManifest(DEFAULT_STATUS_MANIFEST, options);
  _cachedStatusManifest = DEFAULT_STATUS_MANIFEST;
  return _cachedStatusManifest;
}

function assertValidStatusManifest(manifest: StatusManifest, options: ManifestValidationOptions): void {
  const violations = validateStatusManifest(manifest, options);
  if (violations.length > 0) {
    const msg = violations.map(v => `${v.path}: ${v.message}`).join("\n  ");
    throw new Error(`Status manifest validation failed with ${violations.length} violation(s):\n  ${msg}`);
  }
}

export async function loadEnemyManifest(options: ManifestValidationOptions = {}): Promise<EnemyManifest> {
  if (_cachedEnemyManifest) {
    assertValidEnemyManifest(_cachedEnemyManifest, options);
    return _cachedEnemyManifest;
  }
  assertValidEnemyManifest(DEFAULT_ENEMY_MANIFEST, options);
  _cachedEnemyManifest = DEFAULT_ENEMY_MANIFEST;
  return _cachedEnemyManifest;
}

function assertValidEnemyManifest(manifest: EnemyManifest, options: ManifestValidationOptions): void {
  const violations = validateEnemyManifest(manifest, options);
  if (violations.length > 0) {
    const msg = violations.map(v => `${v.path}: ${v.message}`).join("\n  ");
    throw new Error(`Enemy manifest validation failed with ${violations.length} violation(s):\n  ${msg}`);
  }
}

export async function loadDamageManifest(): Promise<DamageManifest> {
  if (_cachedDamageManifest) return _cachedDamageManifest;

  let manifest: DamageManifest;
  try {
    manifest = (await import("./damage/classic-profile.json")).default as DamageManifest;
  } catch {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = dirname(fileURLToPath(import.meta.url));
    manifest = JSON.parse(readFileSync(join(__dirname, "damage", "classic-profile.json"), "utf-8")) as DamageManifest;
  }

  _cachedDamageManifest = manifest;
  _cachedDamageManifestHash = computeDamageManifestHash(manifest);
  return manifest;
}

export function getDamageManifestHash(): string | null {
  return _cachedDamageManifestHash;
}
