import type { AniBox } from "./AnimationPlayer.js";

export type HitGeometryShape = "rect" | "circle" | "sweep" | "grab_attach";

export interface HitGeometryRect {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
  readonly h: number;
  readonly d: number;
}

export interface HurtGeometryRect extends HitGeometryRect {}

export interface HitGeometryQuery {
  readonly shape: HitGeometryShape;
  readonly radius?: number;
  readonly box: HitGeometryRect;
}

export interface HitGeometryResult {
  readonly overlap: boolean;
  readonly zMismatch: boolean;
  readonly yMismatch: boolean;
}

function toRect(
  attackBox: AniBox,
  attackerX: number,
  attackerY: number,
  attackerZ: number,
  facing: 1 | -1,
): HitGeometryRect {
  const worldX1 = attackerX + (facing === 1 ? attackBox.x1 : -attackBox.x2);
  const worldX2 = attackerX + (facing === 1 ? attackBox.x2 : -attackBox.x1);
  return {
    x: (worldX1 + worldX2) / 2,
    y: attackerY + (attackBox.y1 + attackBox.y2) / 2,
    z: attackerZ + (attackBox.z1 + attackBox.z2) / 2,
    w: Math.abs(worldX2 - worldX1),
    h: Math.abs(attackBox.y2 - attackBox.y1),
    d: Math.abs(attackBox.z2 - attackBox.z1),
  };
}

export function buildHitGeometryQuery(input: {
  shape?: HitGeometryShape;
  radius?: number;
  attackBox: AniBox;
  attackerX: number;
  attackerY: number;
  attackerZ: number;
  facing: 1 | -1;
}): HitGeometryQuery {
  return {
    shape: input.shape ?? "rect",
    radius: input.radius,
    box: toRect(input.attackBox, input.attackerX, input.attackerY, input.attackerZ, input.facing),
  };
}

export function buildHitGeometryQueryFromOffset(input: {
  shape?: HitGeometryShape;
  radius?: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  w: number;
  h: number;
  d: number;
  attackerX: number;
  attackerY: number;
  attackerZ: number;
  facing: 1 | -1;
}): HitGeometryQuery {
  return {
    shape: input.shape ?? "rect",
    radius: input.radius,
    box: {
      x: input.attackerX + input.offsetX * input.facing,
      y: input.attackerY + input.offsetY,
      z: input.attackerZ + input.offsetZ,
      w: input.w,
      h: input.h,
      d: input.d,
    },
  };
}

export function rectsOverlap2D5(a: HitGeometryRect, b: HitGeometryRect): HitGeometryResult {
  const xOverlap = Math.abs(a.x - b.x) * 2 < (a.w + b.w);
  const zOverlap = Math.abs(a.z - b.z) * 2 < (a.d + b.d);
  const yOverlap = Math.abs(a.y - b.y) * 2 < (a.h + b.h);
  return {
    overlap: xOverlap && zOverlap && yOverlap,
    zMismatch: xOverlap && !zOverlap,
    yMismatch: xOverlap && zOverlap && !yOverlap,
  };
}

export function sweepRectOverlap2D5(a: HitGeometryRect, b: HitGeometryRect): HitGeometryResult {
  const swept = { ...a, w: Math.max(a.w, Math.abs(a.w) * 1.5) };
  return rectsOverlap2D5(swept, b);
}

export function circleRectOverlap2D5(circle: HitGeometryRect, radius: number, rect: HurtGeometryRect): HitGeometryResult {
  const yOverlap = Math.abs(circle.y - rect.y) * 2 < (circle.h + rect.h);
  const rectHalfW = rect.w / 2;
  const rectHalfD = rect.d / 2;
  const dx = Math.abs(circle.x - rect.x);
  const dz = Math.abs(circle.z - rect.z);
  const nearestX = Math.max(0, dx - rectHalfW);
  const nearestZ = Math.max(0, dz - rectHalfD);
  const planarOverlap = nearestX * nearestX + nearestZ * nearestZ <= radius * radius;
  return {
    overlap: planarOverlap && yOverlap,
    zMismatch: yOverlap && !planarOverlap && dx <= radius + rectHalfW,
    yMismatch: planarOverlap && !yOverlap,
  };
}

export function hitGeometryOverlap(query: HitGeometryQuery, rect: HurtGeometryRect): HitGeometryResult {
  if (query.shape === "circle") {
    return circleRectOverlap2D5(query.box, query.radius ?? Math.max(query.box.w, query.box.d) / 2, rect);
  }
  if (query.shape === "sweep") {
    return sweepRectOverlap2D5(query.box, rect);
  }
  if (query.shape === "grab_attach") {
    const grabBox: HitGeometryRect = {
      ...query.box,
      w: query.box.w * 0.4,
      x: query.box.x + query.box.w * 0.3,
    };
    return rectsOverlap2D5(grabBox, rect);
  }
  return rectsOverlap2D5(query.box, rect);
}
