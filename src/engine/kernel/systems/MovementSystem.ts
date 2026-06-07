/**
 * MovementSystem.ts — horizontal + depth + dash movement domain system (Stage 4A/4C).
 *
 * Movement velocity derived from PVF truth (dnfPhysicsConstants.ts):
 *   xVelocity = xNormalMoveVelocity × chrMoveSpeed / speedValueDefault
 *   zVelocity = yNormalMoveVelocity × chrMoveSpeed / speedValueDefault
 *
 * PVF constants: xNormalMoveVelocity=143, yNormalMoveVelocity=114, speedValueDefault=1000.
 * Swordman moveSpeed=850 → xVel=121.55 px/s, zVel=96.9 px/s (Z/X ratio = 0.797, not 0.5).
 *
 * Dash: double-tap same horizontal direction within DOUBLE_TAP_WINDOW ticks
 * → speed × DASH_SPEED_RATIO while held. Detection is edge-based.
 *
 * Phase INPUT, registered AFTER InputSystem (so facing is already updated).
 * Determinism: pure tick-count based, no wall-clock.
 */
import { ActorState } from "../../core/ActorStateMachine.js";
import { DNF_PHYSICS_CONSTANTS } from "../../../data/official/dnfPhysicsConstants.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

const { xNormalMoveVelocity, yNormalMoveVelocity, speedValueDefault } = DNF_PHYSICS_CONSTANTS;

const DASH_SPEED_RATIO = 1.6;
const DOUBLE_TAP_WINDOW = 12; // ticks (~200ms at 60Hz)

const MOBILE_STATES = new Set<string>([
  ActorState.IDLE,
  ActorState.READY,
  ActorState.CHASE,
  ActorState.RETREAT,
]);

interface DashState {
  prevDir: -1 | 0 | 1;
  lastTapDir: -1 | 0 | 1;
  lastTapTick: number;
  running: boolean;
}

export class MovementSystem implements EngineSystem {
  readonly name = "Movement";
  readonly phase = "INPUT" as const;

  private dashStates = new Map<string, DashState>();

  private getDash(actorId: string): DashState {
    let ds = this.dashStates.get(actorId);
    if (!ds) {
      ds = { prevDir: 0, lastTapDir: 0, lastTapTick: -999, running: false };
      this.dashStates.set(actorId, ds);
    }
    return ds;
  }

  tick(ctx: EngineContext): void {
    const dt = ctx.tickMs / 1000;
    const tick = ctx.tickCount;

    for (const actor of ctx.actors) {
      if (actor.isDead) { actor.locomotion = "idle"; continue; }
      if (!MOBILE_STATES.has(actor.fsm.state)) { actor.locomotion = "idle"; continue; }
      if (actor.airborne?.active) { actor.locomotion = "idle"; continue; }

      const dir = actor.intent.dir;
      const zDir = actor.intent.zDir ?? 0;
      const ds = this.getDash(actor.id);
      const isRisingEdge = dir !== 0 && ds.prevDir === 0;

      if (actor.kind === "player") {
        if (isRisingEdge) {
          if (dir === ds.lastTapDir && (tick - ds.lastTapTick) <= DOUBLE_TAP_WINDOW) {
            ds.running = true;
          }
          ds.lastTapDir = dir;
          ds.lastTapTick = tick;
        }
        if (dir === 0 && ds.running) {
          ds.running = false;
        }
      }

      ds.prevDir = dir;

      // PVF truth: velocity = normalVelocity × chrMoveSpeed / speedValueDefault
      const chrSpeed = actor.stats.moveSpeed; // PVF raw value (e.g. 850 for swordman)
      const xVel = xNormalMoveVelocity * chrSpeed / speedValueDefault;
      const zVel = yNormalMoveVelocity * chrSpeed / speedValueDefault;
      const dashMul = ds.running ? DASH_SPEED_RATIO : 1;

      if (dir !== 0) actor.x += dir * xVel * dashMul * dt;
      if (zDir !== 0) actor.z += zDir * zVel * dashMul * dt;

      actor.locomotion = dir === 0 && zDir === 0 ? "idle" : ds.running ? "run" : "walk";
    }
  }
}
