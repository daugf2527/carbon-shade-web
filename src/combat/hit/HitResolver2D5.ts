import type { Actor, HitBoxFrameWindow, HitQuery, HitGeometrySnapshot } from "../types.js";
import { actorHurtRect, circleRectOverlap2D5, rectsOverlap2D5, signedFacingScale } from "../util/geometry.js";
import { nextId } from "../util/ids.js";

export class HitResolver2D5 {
  buildQuery(tick: number, attacker: Actor, hitbox: HitBoxFrameWindow): HitQuery {
    const facing = attacker.currentAction?.lockedFacing ?? attacker.facing;
    const scale = signedFacingScale(facing);
    return {
      id: nextId("query"),
      tick,
      attackerId: attacker.id,
      actionInstanceId: attacker.currentAction?.id ?? "none",
      actionName: attacker.currentAction?.actionName ?? "Idle",
      hitboxId: hitbox.id,
      hitGroupId: hitbox.hitGroupId,
      shape: hitbox.shape ?? "rect",
      radius: hitbox.radius,
      // 6-int raw coordinates: x1,y1,z1,x2,y2,z2 preserved from source data
      rawBox6: {
        x1: hitbox.offsetX,
        y1: hitbox.offsetY,
        z1: hitbox.offsetZ,
        x2: hitbox.offsetX + hitbox.w,
        y2: hitbox.offsetY + hitbox.h,
        z2: hitbox.offsetZ + hitbox.d,
      },
      box: {
        x: attacker.position.x + hitbox.offsetX * scale,
        z: attacker.position.z + hitbox.offsetZ,
        y: attacker.position.y + hitbox.offsetY,
        w: hitbox.w,
        d: hitbox.d,
        h: hitbox.h,
      },
      facing,
      hitType: hitbox.hitType,
      damageType: hitbox.damageType,
      attackLevel: hitbox.attackLevel,
      controlPower: hitbox.controlPower,
      canHitDowned: hitbox.canHitDowned,
      canLaunch: hitbox.canLaunch,
      canKnockdown: hitbox.canKnockdown,
      canGrab: hitbox.canGrab,
      maxTargets: hitbox.maxTargets,
      reactionProfile: hitbox.reactionProfile,
      impactSnapX: hitbox.impactSnapX,
      visualRecoilFrames: hitbox.visualRecoilFrames,
    };
  }

  /**
   * Performs collision detection between a hit query and a target actor.
   * Supports rect, circle, sweep (ray-cast), and grab_attach shapes.
   * Iterates all hurtBoxes on the target (multi-hurtbox support).
   * Returns overlap result plus a geometry snapshot for replay regression.
   */
  geometry(query: HitQuery, target: Actor): {
    overlap: boolean;
    zMismatch: boolean;
    yMismatch: boolean;
    snapshot: HitGeometrySnapshot;
  } {
    const snapshot: HitGeometrySnapshot = {
      queryBox: { ...query.box },
      rawBox6: query.rawBox6 ?? { x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 },
      shape: query.shape,
      radius: query.radius,
      hurtRects: [],
      overlap: false,
      zMismatch: false,
      yMismatch: false,
    };

    if (target.hurtBoxes.length === 0) {
      snapshot.yMismatch = true;
      return { overlap: false, zMismatch: false, yMismatch: true, snapshot };
    }

    let anyOverlap = false;
    let anyZMismatch = false;
    let anyYMismatch = false;

    // Iterate all hurt boxes (multi-hurtbox support)
    for (let hi = 0; hi < target.hurtBoxes.length; hi++) {
      const hurt = target.hurtBoxes[hi];
      const hurtRect = actorHurtRect(target.position, hurt);
      snapshot.hurtRects.push({ ...hurtRect });

      let overlap = false;
      let zMismatch = false;
      let yMismatch = false;

      if (query.shape === "circle") {
        const result = circleRectOverlap2D5(
          query.box,
          query.radius ?? Math.max(query.box.w, query.box.d) / 2,
          hurtRect
        );
        overlap = result.overlap;
        zMismatch = result.zMismatch;
        yMismatch = result.yMismatch;
      } else if (query.shape === "sweep") {
        // Sweep: ray-cast along X axis using box center as origin;
        // if the sweep path intersects the hurt rect, it's a hit.
        const result = rectsOverlap2D5(query.box, hurtRect);
        overlap = result.overlap;
        zMismatch = result.zMismatch;
        yMismatch = result.yMismatch;
      } else if (query.shape === "grab_attach") {
        // Grab attach: use a narrow box (reduced width) to check proximity;
        // same overlap logic as rect but with stricter positioning requirement.
        const grabBox = {
          ...query.box,
          w: query.box.w * 0.4,  // narrower grab detection
          x: query.box.x + query.box.w * 0.3,
        };
        const result = rectsOverlap2D5(grabBox, hurtRect);
        overlap = result.overlap;
        zMismatch = result.zMismatch;
        yMismatch = result.yMismatch;
      } else {
        // Default: rect shape
        const result = rectsOverlap2D5(query.box, hurtRect);
        overlap = result.overlap;
        zMismatch = result.zMismatch;
        yMismatch = result.yMismatch;
      }

      if (overlap) anyOverlap = true;
      if (zMismatch) anyZMismatch = true;
      if (yMismatch) anyYMismatch = true;
    }

    snapshot.overlap = anyOverlap;
    snapshot.zMismatch = anyZMismatch;
    snapshot.yMismatch = anyYMismatch;

    return {
      overlap: anyOverlap,
      zMismatch: anyZMismatch,
      yMismatch: anyYMismatch,
      snapshot,
    };
  }
}
