import type { Rect2D5, Vec3 } from "../types.js";
export function cloneVec3(v: Vec3): Vec3 { return { x: v.x, z: v.z, y: v.y }; }
export function rectsOverlap2D5(a: Rect2D5, b: Rect2D5): {overlap: boolean; zMismatch: boolean; yMismatch: boolean} {
  const xOverlap = Math.abs(a.x - b.x) * 2 < (a.w + b.w);
  const zOverlap = Math.abs(a.z - b.z) * 2 < (a.d + b.d);
  const yOverlap = Math.abs(a.y - b.y) * 2 < (a.h + b.h);
  return { overlap: xOverlap && zOverlap && yOverlap, zMismatch: xOverlap && !zOverlap, yMismatch: xOverlap && zOverlap && !yOverlap };
}
export function sweepRectOverlap2D5(a: Rect2D5, b: Rect2D5): {overlap: boolean; zMismatch: boolean; yMismatch: boolean} {
  const swept = { ...a, w: Math.max(a.w, Math.abs(a.w) * 1.5) };
  return rectsOverlap2D5(swept, b);
}
export function circleRectOverlap2D5(circle: Rect2D5, radius: number, rect: Rect2D5): {overlap: boolean; zMismatch: boolean; yMismatch: boolean} {
  const yOverlap = Math.abs(circle.y - rect.y) * 2 < (circle.h + rect.h);
  const rectHalfW = rect.w / 2;
  const rectHalfD = rect.d / 2;
  const dx = Math.abs(circle.x - rect.x);
  const dz = Math.abs(circle.z - rect.z);
  const nearestX = Math.max(0, dx - rectHalfW);
  const nearestZ = Math.max(0, dz - rectHalfD);
  const planarOverlap = nearestX * nearestX + nearestZ * nearestZ <= radius * radius;
  const zMismatch = yOverlap && !planarOverlap && dx <= radius + rectHalfW;
  return { overlap: planarOverlap && yOverlap, zMismatch, yMismatch: planarOverlap && !yOverlap };
}
export function actorHurtRect(position: Vec3, box: {offset: Vec3; w: number; d: number; h: number}): Rect2D5 {
  return { x: position.x + box.offset.x, z: position.z + box.offset.z, y: position.y + box.offset.y, w: box.w, d: box.d, h: box.h };
}
export function pushRect(position: Vec3, w: number, d: number): Rect2D5 { return { x: position.x, z: position.z, y: position.y, w, d, h: 1 }; }
export function signedFacingScale(facing: "left" | "right"): number { return facing === "right" ? 1 : -1; }
