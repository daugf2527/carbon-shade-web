/**
 * MovementSystem.ts — horizontal + depth + dash movement domain system (Stage 4A).
 *
 * Reads actor.intent.dir (X axis) and intent.zDir (Z depth axis). Applies
 * stats.moveSpeed as displacement; Z speed halved (DNF convention).
 *
 * Dash: double-tap same horizontal direction within DOUBLE_TAP_WINDOW ticks
 * → speed × DASH_SPEED_RATIO while held. Detection is edge-based: tracks
 * dir transitions (0→±1) as "taps" rather than continuous held state.
 *
 * Phase INPUT, registered AFTER InputSystem (so facing is already updated).
 * Determinism: pure tick-count based, no wall-clock.
 */
import { ActorState } from "../../core/ActorStateMachine.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

const Z_SPEED_RATIO = 0.5;
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

      // Edge detection: rising edge from 0 to ±1
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

      const speedMul = ds.running ? DASH_SPEED_RATIO : 1;
      const speed = actor.stats.moveSpeed * speedMul;

      if (dir !== 0) actor.x += dir * speed * dt;
      if (zDir !== 0) actor.z += zDir * actor.stats.moveSpeed * Z_SPEED_RATIO * dt;

      actor.locomotion = dir === 0 && zDir === 0 ? "idle" : ds.running ? "run" : "walk";
    }
  }
}
