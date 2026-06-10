import { computeActionsHash, computeDamageManifestHash, computeEnemyManifestHash, computeStatusManifestHash, type DamageManifest } from "../../data/manifest/hash.js";
import classicDamageProfile from "../../data/manifest/damage/classic-profile.json" with { type: "json" };
import { DEFAULT_ENEMY_MANIFEST } from "../../data/manifest/ai.js";
import { getManifestHash } from "../../data/manifest/loader.js";
import { SOURCE_POLICY_VERSION } from "../../data/manifest/schema.js";
import { ACTION_MANIFEST_DATA_SOURCE } from "../../data/manifest/sources.js";
import { DEFAULT_STATUS_MANIFEST } from "../../data/manifest/status.js";
import { ACTIONS } from "../data/ActionManifestRuntime.js";

export interface ReplayDataSources {
  actions: string;
  status: string;
  ai: string;
  damage: string;
}

export interface ReplayMetadata {
  buildHash: string;
  combatSchemaHash: string;
  manifestHash: string;
  statusManifestHash: string;
  enemyManifestHash: string;
  damageManifestHash: string;
  sourcePolicyVersion: string;
  dataSources: ReplayDataSources;
  logicFps: number;
  finalStateHash?: string;
}

export interface ReplayMetadataOptions {
  buildHash?: string;
  combatSchemaHash?: string;
  manifestHash?: string;
  statusManifestHash?: string;
  enemyManifestHash?: string;
  damageManifestHash?: string;
  sourcePolicyVersion?: string;
  dataSources?: Partial<ReplayDataSources>;
  logicFps?: number;
}

export function createReplayMetadata(options: ReplayMetadataOptions = {}): ReplayMetadata {
  const loadedManifestHash = getManifestHash();
  const manifestHash = options.manifestHash ?? options.combatSchemaHash ?? loadedManifestHash ?? computeActionsHash(ACTIONS);
  const statusManifestHash = options.statusManifestHash ?? computeStatusManifestHash(DEFAULT_STATUS_MANIFEST);
  const enemyManifestHash = options.enemyManifestHash ?? computeEnemyManifestHash(DEFAULT_ENEMY_MANIFEST);
  const damageManifestHash = options.damageManifestHash ?? computeDamageManifestHash(classicDamageProfile as DamageManifest);

  return {
    buildHash: options.buildHash ?? (typeof __BUILD_HASH__ !== "undefined" ? __BUILD_HASH__ : "local-dev"),
    combatSchemaHash: options.combatSchemaHash ?? manifestHash,
    manifestHash,
    statusManifestHash,
    enemyManifestHash,
    damageManifestHash,
    sourcePolicyVersion: options.sourcePolicyVersion ?? SOURCE_POLICY_VERSION,
    dataSources: {
      actions: options.dataSources?.actions ?? ACTION_MANIFEST_DATA_SOURCE,
      status: options.dataSources?.status ?? "src/data/manifest/status/default.json#profiles",
      ai: options.dataSources?.ai ?? "src/data/manifest/ai/enemy-default.json#profiles",
      damage: options.dataSources?.damage ?? "src/data/manifest/damage/classic-profile.json#constants",
    },
    logicFps: options.logicFps ?? 60,
  };
}
