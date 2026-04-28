import type { Rect2D5, Vec3 } from "../types.js";
export function cloneVec3(v: Vec3): Vec3 { return { x: v.x, z: v.z, y: v.y }; }
export function rectsOverlap2D5(a: Rect2D5, b: Rect2D5): {overlap: boolean; zMismatch: boolean; yMismatch: boolean} {
  const xOverlap = Math.abs(a.x - b.x) * 2 < (a.w + b.w);
  const zOverlap = Math.abs(a.z - b.z) * 2 < (a.d + b.d);
  const yOverlap = Math.abs(a.y - b.y) * 2 < (a.h + b.h);
  return { overlap: xOverlap && zOverlap && yOverlap, zMismatch: xOverlap && !zOverlap, yMismatch: xOverlap && zOverlap && !yOverlap };
}
export function actorHurtRect(position: Vec3, box: {offset: Vec3; w: number; d: number; h: number}): Rect2D5 {
  return { x: position.x + box.offset.x, z: position.z + box.offset.z, y: position.y + box.offset.y, w: box.w, d: box.d, h: box.h };
}
export function pushRect(position: Vec3, w: number, d: number): Rect2D5 { return { x: position.x, z: position.z, y: position.y, w, d, h: 1 }; }
export function signedFacingScale(facing: "left" | "right"): number { return facing === "right" ? 1 : -1; }
