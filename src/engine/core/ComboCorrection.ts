/**
 * ComboCorrection.ts — Snap attacker/target positions on hit (Phase 4 T4.5)
 *
 * DNF combo correction: when a hit lands, pull the target toward the attacker's
 * attack point so subsequent hits connect. Max snap distance = snapRange px.
 */

export interface Vec2 { x: number; z: number; }

const SNAP_RANGE = 60; // px — max correction distance

export function applyComboCorrection(
  attacker: Vec2,
  target: Vec2,
  facing: number, // attacker facing: 1=right, -1=left
): Vec2 {
  const atkPoint = { x: attacker.x + facing * 40, z: attacker.z };
  const dx = atkPoint.x - target.x;
  const dz = atkPoint.z - target.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist <= SNAP_RANGE) return target; // already close enough

  const ratio = SNAP_RANGE / dist;
  return {
    x: target.x + dx * (1 - ratio),
    z: target.z + dz * (1 - ratio),
  };
}
