// Schema validator for manifest data — validates FrameDataAction JSON manifests
// at load time, catching structural errors before they hit runtime.

import type { ActionName, FrameDataAction, FrameDataProvenanceField, Provenance } from "../../combat/types.js";

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
