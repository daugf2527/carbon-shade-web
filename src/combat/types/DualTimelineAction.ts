import type {
  ActionName,
  HitBoxFrameWindow,
  FrameWindow,
  CostProfile,
  CooldownProfile,
  RootMotionTrack,
  FieldProvenanceMap,
  ProvenanceSourceType,
  ProvenanceConfidence,
  Vec3
} from "../types.js";

/**
 * Single frame in a timeline (body or weapon).
 *
 * Design rationale:
 * - `index`: frame number in this timeline (0-based, independent from other timeline)
 * - `delay`: frame duration in ms (DNF uses 50ms per frame typically)
 * - `anchor`: sprite anchor point for rendering alignment
 * - `attackBoxes`: hitboxes active on this frame (weapon timeline)
 * - `damageBoxes`: hurtboxes active on this frame (body timeline)
 */
export interface TimelineFrame {
  index: number;
  delay: number;
  anchor: Vec3;
  sprite?: string;
  imgId?: number;
  imgParam?: number;
  attackBoxes: Array<{
    x1: number;
    y1: number;
    z1: number;
    x2: number;
    y2: number;
    z2: number;
  }>;
  damageBoxes: Array<{
    x1: number;
    y1: number;
    z1: number;
    x2: number;
    y2: number;
    z2: number;
  }>;
}

/**
 * A timeline is an independent animation sequence.
 *
 * Design rationale:
 * - Body and weapon timelines can have different frame counts
 * - Each timeline has its own frame index progression
 * - No forced alignment between body frame N and weapon frame N
 * - `framesCount`: total frames in this timeline
 * - `loop`: whether this timeline loops (typically false for combat actions)
 * - `frames`: array of TimelineFrame, indexed by frame number
 */
export interface Timeline {
  kind: "ani";
  path: string;
  framesCount: number;
  loop: boolean;
  frames: TimelineFrame[];
}

/**
 * Dual-timeline action: body animation + weapon animation play independently.
 *
 * Design rationale:
 * - Extends FrameDataAction semantics with dual timelines
 * - `bodyTimeline`: character body animation (damageBoxes for hurtboxes)
 * - `weaponTimeline`: weapon animation (attackBoxes for hitboxes)
 * - `totalFrames`: max(bodyTimeline.framesCount, weaponTimeline.framesCount)
 * - `active`: derived from weaponTimeline.frames[].attackBoxes (converted to HitBoxFrameWindow)
 * - Backward compat: existing FrameDataAction consumers can ignore timelines
 *
 * Migration path:
 * - Phase 1: Add optional `bodyTimeline`/`weaponTimeline` fields to FrameDataAction
 * - Phase 2: Write adapter to convert Timeline.attackBoxes → HitBoxFrameWindow[]
 * - Phase 3: Rendering layer consumes timelines directly
 */
export interface DualTimelineAction {
  actionName: ActionName;

  // Dual timelines (new)
  bodyTimeline: Timeline;
  weaponTimeline: Timeline;

  // Derived fields (for backward compat with FrameDataAction consumers)
  totalFrames: number;
  startup: FrameWindow[];
  active: HitBoxFrameWindow[];
  recovery: FrameWindow[];

  // Unchanged from FrameDataAction
  cancelPolicy: {
    hitCancelFrom?: number;
    whiffCancelFrom?: number;
    into?: ActionName[];
  };
  hitStopProfile: {
    frames: number;
    bossCapFrames?: number;
    buildingCapFrames?: number;
  };
  recoilProfile: {
    frames: number;
    canCancelRecoil: boolean;
  };
  rootMotion?: RootMotionTrack;
  armorWindows?: FrameWindow[];
  invulnerableWindows?: FrameWindow[];
  costProfile?: CostProfile;
  cooldownProfile?: CooldownProfile;
  feedbackProfile: {
    sound: string;
    vfx: string;
    cameraShake: number;
  };
  sourcePolicy: {
    sourceType: ProvenanceSourceType;
    confidence: ProvenanceConfidence;
    requiresManualVerification: boolean;
  };
  fieldProvenance?: FieldProvenanceMap;
  maxHoldFrames?: number;
}

/**
 * Adapter: convert Timeline attackBoxes to HitBoxFrameWindow[].
 *
 * Design rationale:
 * - Bridges dual-timeline data to existing combat kernel (HitResolutionSystem expects HitBoxFrameWindow[])
 * - Maps weapon timeline frame index → global action frame index
 * - Converts raw box6 (x1,y1,z1,x2,y2,z2) to HitBoxFrameWindow fields
 * - Fills in combat metadata (hitType, damageType, baseDamage, etc.) from action-level defaults
 *
 * TODO: This adapter needs action-level metadata (baseDamage, hitType, reactionProfile).
 * Current signature is incomplete — caller must provide these.
 */
export function timelineToHitBoxes(
  timeline: Timeline,
  actionName: ActionName,
  defaults: {
    hitType: HitBoxFrameWindow["hitType"];
    damageType: HitBoxFrameWindow["damageType"];
    baseDamage: number;
    attackLevel: number;
    controlPower: number;
    canHitDowned: boolean;
    canLaunch: boolean;
    canKnockdown: boolean;
    canGrab: boolean;
    maxTargets: number;
  }
): HitBoxFrameWindow[] {
  const hitboxes: HitBoxFrameWindow[] = [];

  for (const frame of timeline.frames) {
    for (let i = 0; i < frame.attackBoxes.length; i++) {
      const box = frame.attackBoxes[i];
      const id = `${actionName}_f${frame.index}_box${i}`;
      const hitGroupId = `${actionName}_group`;

      // Convert raw box6 to HitBoxFrameWindow
      const w = box.x2 - box.x1;
      const d = box.y2 - box.y1;
      const h = box.z2 - box.z1;
      const offsetX = (box.x1 + box.x2) / 2;
      const offsetZ = (box.y1 + box.y2) / 2;
      const offsetY = (box.z1 + box.z2) / 2;

      hitboxes.push({
        id,
        hitGroupId,
        start: frame.index,
        end: frame.index, // Single-frame hitbox
        offsetX,
        offsetZ,
        offsetY,
        w,
        d,
        h,
        ...defaults
      });
    }
  }

  return hitboxes;
}

/**
 * Type guard: check if an action has dual timelines.
 */
export function isDualTimelineAction(
  action: unknown
): action is DualTimelineAction {
  return (
    typeof action === "object" &&
    action !== null &&
    "bodyTimeline" in action &&
    "weaponTimeline" in action
  );
}
