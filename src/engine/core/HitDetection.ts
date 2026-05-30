/**
 * HitDetection.ts — AABB overlap test for attackBoxes vs damageBoxes (Phase 3 T3.6)
 *
 * Boxes are in local actor space. Caller transforms to world space before calling.
 * 2.5D: x/z are horizontal plane, y is vertical (height).
 */

import type { AniBox } from "./AnimationPlayer.js";

export interface WorldBox {
  readonly x1: number; readonly y1: number; readonly z1: number;
  readonly x2: number; readonly y2: number; readonly z2: number;
}

/** Translate a local AniBox to world space given actor position and facing. */
export function toWorldBox(box: AniBox, ax: number, ay: number, az: number, facing: number): WorldBox {
  // facing=1: right (x unchanged), facing=-1: left (flip x)
  const lx1 = facing === 1 ? box.x1 : -box.x2;
  const lx2 = facing === 1 ? box.x2 : -box.x1;
  return {
    x1: ax + lx1, y1: ay + box.y1, z1: az + box.z1,
    x2: ax + lx2, y2: ay + box.y2, z2: az + box.z2,
  };
}

/** Returns true if two world-space AABB boxes overlap. */
export function aabbOverlap(a: WorldBox, b: WorldBox): boolean {
  return (
    a.x1 <= b.x2 && a.x2 >= b.x1 &&
    a.y1 <= b.y2 && a.y2 >= b.y1 &&
    a.z1 <= b.z2 && a.z2 >= b.z1
  );
}

export interface HitResult {
  readonly attackerId: string;
  readonly defenderId: string;
  readonly atkBox: WorldBox;
  readonly dmgBox: WorldBox;
}

/** Test all attacker atkBoxes against all defender dmgBoxes. Returns first hit or null. */
export function detectHit(
  attackerId: string,
  atkBoxes: readonly AniBox[],
  ax: number, ay: number, az: number, aFacing: number,
  defenderId: string,
  dmgBoxes: readonly AniBox[],
  dx: number, dy: number, dz: number, dFacing: number,
): HitResult | null {
  for (const atk of atkBoxes) {
    const wa = toWorldBox(atk, ax, ay, az, aFacing);
    for (const dmg of dmgBoxes) {
      const wd = toWorldBox(dmg, dx, dy, dz, dFacing);
      if (aabbOverlap(wa, wd)) {
        return { attackerId, defenderId, atkBox: wa, dmgBox: wd };
      }
    }
  }
  return null;
}
