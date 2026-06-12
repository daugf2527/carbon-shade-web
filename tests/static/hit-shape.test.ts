import { assert } from "./test-utils.js";
import {
  buildHitGeometryQueryFromOffset,
  hitGeometryOverlap,
  type HitGeometryQuery,
  type HurtGeometryRect,
} from "../../src/engine/core/HitGeometry.js";

function hurtRect(x: number, y: number, z: number, w = 36, h = 48, d = 22): HurtGeometryRect {
  return { x, y, z, w, h, d };
}

function query(
  shape: HitGeometryQuery["shape"],
  overrides: Partial<{
    radius: number;
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
  }> = {},
): HitGeometryQuery {
  return buildHitGeometryQueryFromOffset({
    shape,
    offsetX: 0,
    offsetY: 0,
    offsetZ: -30,
    w: 300,
    h: 80,
    d: 60,
    attackerX: 260,
    attackerY: 0,
    attackerZ: 0,
    facing: 1,
    ...overrides,
  });
}

{
  const circleAoE = query("circle", {
    offsetX: 0,
    offsetY: 26,
    offsetZ: 0,
    w: 300,
    h: 80,
    d: 300,
    radius: 150,
  });
  const inside = hurtRect(260 + 149, 26, 0);
  const outside = hurtRect(260 + 190, 26, 0);

  const insideGeometry = hitGeometryOverlap(circleAoE, inside);
  assert.equal(insideGeometry.overlap, true, "150px circle AoE should overlap a target whose center is inside the radius");

  const outsideGeometry = hitGeometryOverlap(circleAoE, outside);
  assert.equal(outsideGeometry.overlap, false, "150px circle AoE should reject a target fully outside the radius");
}

{
  const rectQuery = query("rect", {
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    w: 50,
    h: 80,
    d: 60,
  });
  const rectTarget = hurtRect(260 + 20, 26, 0);
  const rectGeometry = hitGeometryOverlap(rectQuery, rectTarget);
  assert.equal(rectQuery.shape, "rect", "Legacy hitboxes should default to rect shape");
  assert.equal(rectGeometry.overlap, true, "Legacy rectangle hit behavior must remain intact");
}

{
  const grabQuery = query("grab_attach", {
    offsetX: 50,
    offsetY: 0,
    offsetZ: 0,
    w: 100,
    h: 60,
    d: 40,
  });
  const grabNear = hurtRect(260 + 80, 26, 0);
  const grabEdge = hurtRect(260 + 40, 26, 0);
  assert.equal(hitGeometryOverlap(grabQuery, grabNear).overlap, true, "grab_attach should use the local narrowed grab window");
  assert.equal(hitGeometryOverlap(grabQuery, grabEdge).overlap, false, "grab_attach should not claim official geometry beyond the local narrowed window");
}

{
  const sweepQuery = query("sweep", {
    offsetX: 40,
    offsetY: 0,
    offsetZ: 0,
    w: 80,
    h: 60,
    d: 40,
  });
  const rectEquivalentQuery = query("rect", {
    offsetX: 40,
    offsetY: 0,
    offsetZ: 0,
    w: 80,
    h: 60,
    d: 40,
  });
  const sweepEdge = hurtRect(260 + 117, 26, 0);
  assert.equal(hitGeometryOverlap(rectEquivalentQuery, sweepEdge).overlap, false, "baseline rect should miss the edge target");
  assert.equal(hitGeometryOverlap(sweepQuery, sweepEdge).overlap, true, "sweep should extend the active path along X and catch the edge target");
}
