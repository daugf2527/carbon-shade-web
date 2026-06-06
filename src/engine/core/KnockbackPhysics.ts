/**
 * KnockbackPhysics.ts — Horizontal knockback work-state + friction integration.
 *
 * Fills the "P4 GAP" ReactionResolver documented: horizontal knockback (velocityX) had no engine
 * model. This mirrors AirbornePhysicsSystem's proven pattern EXACTLY — a dedicated per-actor work
 * state (KnockbackState, like AirborneState) carrying a single horizontal velocity, integrated each
 * tick with friction decay. It does NOT add a velocity tri-axis to Actor (that WOULD risk the
 * stateHash contract); actor.x is an existing field that simply gets advanced, the same way
 * actor.y is advanced by airborne. So this needs no architectural decision — an earlier note that
 * called horizontal knockback "architecture-deciding (breaks stateHash)" was a misjudgement: it
 * conflated "add velocity.{x,y,z} to Actor" with "add a knockback work-state", which are different.
 *
 * ── TRUTH SOURCING (CLAUDE.md confidence tiers) ──────────────────────────────────
 *   initial velocityX  = pushAside × pushBack × facing × weightFactor   (same formula family as
 *                        the vertical launch already shipped). pushAside ← atk (PVF tier3, e.g.
 *                        attack1=30 px/s), pushBack ← weaponHitInfo[slot] (PVF, slot0=0 slot3=0.2).
 *   friction (decay)   = LOCAL_BASELINE 0.72/tick — PVF carries no horizontal-friction constant
 *                        (dnfPhysicsConstants has none); mirrored from combat ReactionProfiles
 *                        light_stagger.horizontalFriction. requiresManualVerification.
 *
 * Note: basic swordman attacks route to weaponHitInfo slot0 whose pushBack is 0 → velocityX 0 →
 * no knockback (matches current behavior, zero regression). Non-zero-pushBack attacks (slot3=0.2)
 * actually knock back. We do NOT fall back to pushAside.value when pushBack=0 (unlike vertical
 * launch): pushBack=0 IS the truth that those attacks don't push horizontally — inventing a push
 * would be local_baseline guessing.
 */

/** Below this |vx| (px/s) the slide is considered stopped. */
const KNOCKBACK_STOP_THRESHOLD = 5;

/** Per-tick horizontal friction multiplier — LOCAL_BASELINE (combat light_stagger 0.72). */
export const KNOCKBACK_FRICTION = 0.72;

export interface KnockbackState {
  active: boolean;
  vx: number; // px/s horizontal velocity (signed: + right, - left)
  x: number;  // current x px (mirrors actor.x; KnockbackSystem syncs them)
}

/** Begin a knockback slide from `startX` at horizontal velocity `vx` (signed). */
export function applyKnockback(vx: number, startX: number): KnockbackState {
  return { active: true, vx, x: startX };
}

/**
 * Integrate one tick: x += vx*dt, then decay vx by friction. Returns true when the slide just
 * stopped (|vx| fell below threshold) so the caller can clear the handle. Deterministic.
 */
export function tickKnockback(state: KnockbackState, tickMs: number): boolean {
  if (!state.active) return false;
  const dt = tickMs / 1000;
  state.x += state.vx * dt;
  state.vx *= KNOCKBACK_FRICTION;
  if (Math.abs(state.vx) < KNOCKBACK_STOP_THRESHOLD) {
    state.vx = 0;
    state.active = false;
    return true; // stopped
  }
  return false;
}
