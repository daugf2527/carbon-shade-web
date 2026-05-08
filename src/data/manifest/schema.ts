// Schema validator for manifest data — validates FrameDataAction JSON manifests
// at load time, catching structural errors before they hit runtime.

import type { ActionName, FrameDataAction, FrameDataProvenanceField, Provenance, StatusEffectType, StatusManifest, StatusProfile, StatusProvenanceField } from "../../combat/types.js";
import type { DamageManifest } from "./hash.js";
import type { EnemyManifest, EnemyManifestField, EnemyManifestId, EnemyRuntimeProfile } from "./aiTypes.js";

export const SOURCE_POLICY_VERSION = "source-policy-v1";

const allowedSourceTypes = new Set<Provenance["sourceType"]>([
  "official_api",
  "official_page",
  "dfo_wiki",
  "local_baseline",
  "needs_calibration",
  "experimental",
]);
const runtimeBlockedSourceTypes = new Set<Provenance["sourceType"]>(["needs_calibration", "experimental"]);
const requiredRuntimeFields: FrameDataProvenanceField[] = [
  "totalFrames",
  "active",
  "hitbox",
  "reactionProfile",
  "hitStopProfile",
  "recoilProfile",
  "cancelPolicy",
  "feedbackProfile",
];
const implementedRuntimeStatusTypes = new Set<StatusEffectType>(["bleed", "poison", "burn", "shock", "rupture", "stun", "freeze", "stone", "bind", "sleep", "slow", "defense_down", "attack_down", "curse"]);
const requiredStatusFields: StatusProvenanceField[] = ["durationFrames", "maxStacks", "dispelPolicy"];
const implementedRuntimeEnemyIds = new Set<EnemyManifestId>(["grunt", "dummy", "imp", "boss", "building"]);
const requiredEnemyFields: EnemyManifestField[] = [
  "detectRange",
  "attackRange",
  "preAttackFrames",
  "postCooldown",
  "moveSpeedPerTick",
  "loseAggroRange",
  "hp",
  "damage",
  "armor",
];

export interface ManifestValidationOptions {
  profile?: "runtime" | "archive";
}

export interface SchemaViolation {
  path: string;
  message: string;
}

/**
 * Validates a single FrameDataAction record.
 * Returns array of violations (empty = valid).
 */
export function validateAction(
  name: ActionName,
  action: FrameDataAction,
  options: ManifestValidationOptions = {}
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  const p = (field: string) => `${name}.${field}`;
  const profile = options.profile ?? "runtime";

  // totalFrames must be >= 1
  if (typeof action.totalFrames !== "number" || action.totalFrames < 1) {
    violations.push({ path: p("totalFrames"), message: `totalFrames must be >= 1, got ${action.totalFrames}` });
  }

  // active hitboxes: window frames must be within [1, totalFrames]
  for (const hb of action.active) {
    if (hb.start < 1 || hb.start > action.totalFrames) {
      violations.push({ path: p(`active[${hb.id}].start`), message: `start=${hb.start} out of range [1, ${action.totalFrames}]` });
    }
    if (hb.end < 1 || hb.end > action.totalFrames) {
      violations.push({ path: p(`active[${hb.id}].end`), message: `end=${hb.end} out of range [1, ${action.totalFrames}]` });
    }
    if (hb.start > hb.end) {
      violations.push({ path: p(`active[${hb.id}]`), message: `start=${hb.start} > end=${hb.end}` });
    }
  }

  // cancelPolicy.into[] must reference known action names (validated at load time via cross-reference)
  // startup/recovery windows must not overlap with active windows
  for (const w of action.startup) {
    if (w.start < 1 || w.end > action.totalFrames) {
      violations.push({ path: p("startup"), message: `startup [${w.start},${w.end}] out of range [1,${action.totalFrames}]` });
    }
    // Check overlap with active
    for (const hb of action.active) {
      if (w.start <= hb.end && w.end >= hb.start) {
        violations.push({ path: p("startup"), message: `startup [${w.start},${w.end}] overlaps active hitbox ${hb.id} [${hb.start},${hb.end}]` });
      }
    }
  }
  for (const w of action.recovery) {
    if (w.start < 1 || w.end > action.totalFrames) {
      violations.push({ path: p("recovery"), message: `recovery [${w.start},${w.end}] out of range [1,${action.totalFrames}]` });
    }
    for (const hb of action.active) {
      if (w.start <= hb.end && w.end >= hb.start) {
        violations.push({ path: p("recovery"), message: `recovery [${w.start},${w.end}] overlaps active hitbox ${hb.id} [${hb.start},${hb.end}]` });
      }
    }
  }

  // invulnerableWindows must be within totalFrames
  if (action.invulnerableWindows) {
    for (const w of action.invulnerableWindows) {
      if (w.start < 1 || w.end > action.totalFrames) {
        violations.push({ path: p("invulnerableWindows"), message: `[${w.start},${w.end}] out of range [1,${action.totalFrames}]` });
      }
    }
  }

  const provenanceFields = new Set<FrameDataProvenanceField>(requiredRuntimeFields);
  if (action.rootMotion) provenanceFields.add("rootMotion");
  if (action.costProfile) provenanceFields.add("costProfile");
  if (action.cooldownProfile) provenanceFields.add("cooldownProfile");
  for (const field of provenanceFields) {
    const provenance = action.fieldProvenance?.[field];
    if (!provenance) {
      violations.push({ path: p(`fieldProvenance.${field}`), message: "missing field-level provenance" });
      continue;
    }
    violations.push(...validateProvenance(p(`fieldProvenance.${field}`), provenance, profile));
  }

  return violations;
}

function validateProvenance(path: string, provenance: Provenance, profile: "runtime" | "archive"): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  if (!allowedSourceTypes.has(provenance.sourceType)) {
    violations.push({ path, message: `unknown sourceType "${String(provenance.sourceType)}"` });
  }
  if (profile === "runtime" && runtimeBlockedSourceTypes.has(provenance.sourceType)) {
    violations.push({ path, message: `sourceType "${provenance.sourceType}" is not allowed in runtime manifests` });
  }
  if (!provenance.sourceRef) violations.push({ path, message: "sourceRef is required" });
  if (!provenance.capturedAt) violations.push({ path, message: "capturedAt is required" });
  if (!provenance.version) violations.push({ path, message: "version is required" });
  if (typeof provenance.requiresCalibration !== "boolean") {
    violations.push({ path, message: "requiresCalibration must be boolean" });
  }
  return violations;
}

/**
 * Validates the full actions manifest, including cross-action references.
 */
export function validateManifest(
  actions: Record<ActionName, FrameDataAction>,
  options: ManifestValidationOptions = {}
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  const knownNames = new Set(Object.keys(actions));

  for (const [name, action] of Object.entries(actions) as [ActionName, FrameDataAction][]) {
    violations.push(...validateAction(name, action, options));

    // Cross-reference cancelPolicy.into[]
    if (action.cancelPolicy?.into) {
      for (const target of action.cancelPolicy.into) {
        if (!knownNames.has(target)) {
          violations.push({ path: `${name}.cancelPolicy.into`, message: `references unknown action "${target}"` });
        }
      }
    }

    // Cross-reference cooldownProfile.actionName
    if (action.cooldownProfile?.actionName && !knownNames.has(action.cooldownProfile.actionName)) {
      violations.push({ path: `${name}.cooldownProfile.actionName`, message: `references unknown action "${action.cooldownProfile.actionName}"` });
    }
  }

  return violations;
}

export function validateStatusProfile(
  type: StatusEffectType,
  profile: StatusProfile,
  options: ManifestValidationOptions = {}
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  const runtimeProfile = options.profile ?? "runtime";
  const p = (field: string) => `profiles.${type}.${field}`;

  if (profile.type !== type) {
    violations.push({ path: p("type"), message: `profile type "${profile.type}" does not match key "${type}"` });
  }
  if (typeof profile.durationFrames !== "number" || profile.durationFrames < 1) {
    violations.push({ path: p("durationFrames"), message: `durationFrames must be >= 1, got ${profile.durationFrames}` });
  }
  if (profile.tickIntervalFrames !== undefined && (typeof profile.tickIntervalFrames !== "number" || profile.tickIntervalFrames < 1)) {
    violations.push({ path: p("tickIntervalFrames"), message: `tickIntervalFrames must be >= 1, got ${profile.tickIntervalFrames}` });
  }
  if (profile.dotDamagePerStack !== undefined && (typeof profile.dotDamagePerStack !== "number" || profile.dotDamagePerStack < 0)) {
    violations.push({ path: p("dotDamagePerStack"), message: `dotDamagePerStack must be >= 0, got ${profile.dotDamagePerStack}` });
  }
  if (typeof profile.maxStacks !== "number" || profile.maxStacks < 1) {
    violations.push({ path: p("maxStacks"), message: `maxStacks must be >= 1, got ${profile.maxStacks}` });
  }
  if (profile.splashRadius !== undefined && (typeof profile.splashRadius !== "number" || profile.splashRadius < 0)) {
    violations.push({ path: p("splashRadius"), message: `splashRadius must be >= 0, got ${profile.splashRadius}` });
  }
  if (profile.splashDamagePerStack !== undefined && (typeof profile.splashDamagePerStack !== "number" || profile.splashDamagePerStack < 0)) {
    violations.push({ path: p("splashDamagePerStack"), message: `splashDamagePerStack must be >= 0, got ${profile.splashDamagePerStack}` });
  }
  if (profile.incomingDirectDamageMultiplierPerStack !== undefined && (typeof profile.incomingDirectDamageMultiplierPerStack !== "number" || profile.incomingDirectDamageMultiplierPerStack < 0)) {
    violations.push({ path: p("incomingDirectDamageMultiplierPerStack"), message: `incomingDirectDamageMultiplierPerStack must be >= 0, got ${profile.incomingDirectDamageMultiplierPerStack}` });
  }

  const provenanceFields = new Set<StatusProvenanceField>(requiredStatusFields);
  if (profile.tickIntervalFrames !== undefined) provenanceFields.add("tickIntervalFrames");
  if (profile.dotDamagePerStack !== undefined) provenanceFields.add("dotDamagePerStack");
  if (profile.splashRadius !== undefined) provenanceFields.add("splashRadius");
  if (profile.splashDamagePerStack !== undefined) provenanceFields.add("splashDamagePerStack");
  if (profile.incomingDirectDamageMultiplierPerStack !== undefined) provenanceFields.add("incomingDirectDamageMultiplierPerStack");
  for (const field of provenanceFields) {
    const provenance = profile.fieldProvenance?.[field];
    if (!provenance) {
      violations.push({ path: p(`fieldProvenance.${field}`), message: "missing field-level provenance" });
      continue;
    }
    violations.push(...validateProvenance(p(`fieldProvenance.${field}`), provenance, runtimeProfile));
  }

  return violations;
}

export function validateStatusManifest(
  manifest: StatusManifest,
  options: ManifestValidationOptions = {}
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  if (manifest.manifestVersion !== "status-manifest-v1") {
    violations.push({ path: "manifestVersion", message: `expected status-manifest-v1, got ${String(manifest.manifestVersion)}` });
  }
  if (manifest.sourcePolicyVersion !== SOURCE_POLICY_VERSION) {
    violations.push({ path: "sourcePolicyVersion", message: `expected ${SOURCE_POLICY_VERSION}, got ${String(manifest.sourcePolicyVersion)}` });
  }

  for (const [type, profile] of Object.entries(manifest.profiles) as [StatusEffectType, StatusProfile][]) {
    if (!implementedRuntimeStatusTypes.has(type)) {
      violations.push({ path: `profiles.${type}`, message: "status type is not implemented in the runtime profile" });
      continue;
    }
    violations.push(...validateStatusProfile(type, profile, options));
  }

  for (const type of implementedRuntimeStatusTypes) {
    if (!manifest.profiles[type]) {
      violations.push({ path: `profiles.${type}`, message: "implemented status is missing from runtime manifest" });
    }
  }

  return violations;
}

export function validateEnemyProfile(
  id: EnemyManifestId,
  profile: EnemyRuntimeProfile,
  options: ManifestValidationOptions = {}
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  const runtimeProfile = options.profile ?? "runtime";
  const p = (field: string) => `profiles.${id}.${field}`;

  if (profile.id !== id) {
    violations.push({ path: p("id"), message: `profile id "${profile.id}" does not match key "${id}"` });
  }
  for (const field of ["detectRange", "attackRange", "preAttackFrames", "postCooldown", "moveSpeedPerTick", "loseAggroRange", "hp", "damage"] as const) {
    const value = profile[field];
    if (typeof value !== "number" || value < 0) {
      violations.push({ path: p(field), message: `${field} must be a non-negative number, got ${value}` });
    }
  }
  if (!["none", "super_armor", "boss_super_armor", "building_armor"].includes(profile.armor)) {
    violations.push({ path: p("armor"), message: `unknown armor "${String(profile.armor)}"` });
  }

  for (const field of requiredEnemyFields) {
    const provenance = profile.fieldProvenance?.[field];
    if (!provenance) {
      violations.push({ path: p(`fieldProvenance.${field}`), message: "missing field-level provenance" });
      continue;
    }
    violations.push(...validateProvenance(p(`fieldProvenance.${field}`), provenance, runtimeProfile));
  }

  return violations;
}

export function validateEnemyManifest(
  manifest: EnemyManifest,
  options: ManifestValidationOptions = {}
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  if (manifest.manifestVersion !== "enemy-manifest-v1") {
    violations.push({ path: "manifestVersion", message: `expected enemy-manifest-v1, got ${String(manifest.manifestVersion)}` });
  }
  if (manifest.sourcePolicyVersion !== SOURCE_POLICY_VERSION) {
    violations.push({ path: "sourcePolicyVersion", message: `expected ${SOURCE_POLICY_VERSION}, got ${String(manifest.sourcePolicyVersion)}` });
  }

  for (const [id, profile] of Object.entries(manifest.profiles) as [EnemyManifestId, EnemyRuntimeProfile][]) {
    if (!implementedRuntimeEnemyIds.has(id)) {
      violations.push({ path: `profiles.${id}`, message: "enemy id is not implemented in the runtime profile" });
      continue;
    }
    violations.push(...validateEnemyProfile(id, profile, options));
  }

  for (const id of implementedRuntimeEnemyIds) {
    if (!manifest.profiles[id]) {
      violations.push({ path: `profiles.${id}`, message: "implemented enemy is missing from runtime manifest" });
    }
  }

  return violations;
}
