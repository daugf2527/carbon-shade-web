/**
 * weaponTimelineFlattener.ts — Merge a weapon timeline's attackBoxes into body frames (D-group).
 *
 * DNF actions play TWO independent animations: a body timeline (character, carries damageBoxes /
 * hurtboxes) and a weapon timeline (carries attackBoxes / hitboxes). combat models this with
 * DualTimelineAction (src/combat/types/DualTimelineAction.ts). The engine's AnimationPlayer reads
 * ONE frame cursor (currentFrame.attackBoxes), so this flattener pre-merges the weapon timeline's
 * attackBoxes onto the body frames at load time — keeping the AnimationPlayer.currentFrame API
 * unchanged while letting weapon-authored hitboxes drive CombatResolutionSystem.
 *
 * ── SCOPE (D1, the deliberately-simplified merge) ────────────────────────────────
 * Frame-index lockstep: weapon frame i's attackBoxes append to body frame i's. This assumes the
 * two timelines advance in step (same per-frame delay) — the documented D1 simplification.
 * TRUE independent dual-frame-index advance (body frame 3 while weapon frame 5) is Phase-3
 * render-layer work, explicitly out of scope here.
 *
 * ── AXIS CONVENTION (precondition, NOT done here) ────────────────────────────────
 * combat and engine SWAP the y/z box axes (combat: y=depth, z=height; engine: y=height, z=depth —
 * see HitDetection.ts "x/z are horizontal plane, y is vertical"). This flattener does NO axis
 * transform: it assumes both timelines' boxes are already in the ENGINE convention (as every
 * engine AniBox is). Converting raw PVF weapon boxes to the engine convention is an
 * extraction-pipeline concern, upstream of this merge.
 *
 * ── DATA STATUS (honest) ─────────────────────────────────────────────────────────
 * The baseline shard currently carries NO weapon-timeline data (16.2% BLOCKED — weapon attackBox
 * extraction is incomplete; swordman body animations have empty attackBoxes). So at runtime no
 * AniDef yet supplies a weaponTimeline and this flattener is dormant machinery awaiting data. Its
 * merge logic is nonetheless deterministic + unit-tested, so when weapon data lands it Just Works.
 */

import type { AniBox, AniFrame } from "./AnimationPlayer.js";

/**
 * Merge weapon-timeline attackBoxes into body frames by frame index (D1 lockstep).
 *
 * - Body frames drive timing (delay) + hurtboxes (damageBoxes); weapon contributes attackBoxes.
 * - For index i present in both: result[i] = body[i] with attackBoxes = body[i] ++ weapon[i].
 * - Weapon longer than body: extra weapon frames are appended (attackBoxes from weapon, no
 *   damageBoxes), so late weapon hitboxes are not dropped.
 * - Body longer than weapon: trailing body frames pass through unchanged.
 * Pure + deterministic: index-ordered, no mutation of inputs, no randomness.
 */
export function flattenWeaponTimeline(
  bodyFrames: readonly AniFrame[],
  weaponFrames: readonly AniFrame[],
): AniFrame[] {
  const total = Math.max(bodyFrames.length, weaponFrames.length);
  const out: AniFrame[] = [];
  for (let i = 0; i < total; i++) {
    const body = bodyFrames[i];
    const weapon = weaponFrames[i];
    const weaponBoxes: readonly AniBox[] = weapon?.attackBoxes ?? [];

    if (body) {
      out.push({
        index: i,
        delay: body.delay,
        // Body's own attackBoxes (usually empty) + weapon's attackBoxes for this frame.
        attackBoxes: weaponBoxes.length ? [...body.attackBoxes, ...weaponBoxes] : body.attackBoxes,
        damageBoxes: body.damageBoxes,
      });
    } else {
      // Past the end of the body timeline — keep the weapon's hitboxes alive on a body-less frame.
      out.push({
        index: i,
        delay: weapon!.delay,
        attackBoxes: weaponBoxes,
        damageBoxes: [],
      });
    }
  }
  return out;
}
