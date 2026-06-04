/**
 * AirbornePhysicsSystem.ts — Gravity integration for launched actors (Phase 4 T4.6)
 *
 * Y axis = vertical height. Gravity = DNF truth value (game units/s², ≈ px/s²).
 * Landing when y <= 0.
 */

import { DNF_PHYSICS_CONSTANTS } from "../../data/official/dnfPhysicsConstants.js";

// Truth-sourced: PVF /sqr/dnf_enum_header.nut defaultGravityAccel (-1500), not a hardcoded guess.
const GRAVITY = DNF_PHYSICS_CONSTANTS.defaultGravityAccel; // game units/s²

export interface AirborneState {
  active: boolean;
  vy: number; // px/s vertical velocity
  y: number;  // current height px
}

export function launchAirborne(launchVy: number, startY = 0): AirborneState {
  return { active: true, vy: launchVy, y: startY };
}

/** Integrate one tick. Returns true if just landed. */
export function tickAirborne(state: AirborneState, tickMs: number): boolean {
  if (!state.active) return false;
  const dt = tickMs / 1000;
  state.vy += GRAVITY * dt;
  state.y += state.vy * dt;
  if (state.y <= 0) {
    state.y = 0;
    state.vy = 0;
    state.active = false;
    return true; // landed
  }
  return false;
}
