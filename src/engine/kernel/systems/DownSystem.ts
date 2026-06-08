/**
 * DownSystem.ts — knockdown management system (Stage 4B-B1).
 *
 * Tracks per-actor knockdown state:
 *  - downCount: how many times knocked down recently (resets after recovery window)
 *  - getupImmunityTicks: invincibility frames after standing up
 *  - downProtection: after N consecutive knockdowns, brief immunity to further knockdowns
 *
 * Phase RESOLVE (after HitstunSystem), reads reaction.kind + FSM state.
 *
 * DNF knockdown rules (local_baseline — PVF has no knockdown counter data):
 *  - After 3 consecutive knockdowns within RESET_WINDOW, actor gains DOWN_PROTECTION ticks
 *    of knockdown immunity (can still be hit, just won't go down again)
 *  - Standing up grants GETUP_IMMUNITY ticks of total hit immunity
 *  - Counter resets after RESET_WINDOW ticks of not being knocked down
 *
 * Determinism: pure tick-count based, no wall-clock.
 */
import { ActorState } from "../../core/ActorStateMachine.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

// LOCAL_BASELINE (NOT PVF-derived, requiresManualVerification): DNF knockdown timing is hardcoded
// in DNF.exe and varies by skill level + target resistance (see docs/research/batch-b-wiki-
// calibration.md line 191 — Wiki gives no fixed seconds). 180f≈3s matches the wiki "Sleep/downed"
// duration but confidence is low. These are playable approximations, not extracted truth.
const MAX_CONSECUTIVE_DOWNS = 3;
const GETUP_IMMUNITY_TICKS = 30;    // ~0.5s invincibility after standing
const DOWN_PROTECTION_TICKS = 180;  // ~3s knockdown immunity after max downs (wiki Sleep=180f)
const RESET_WINDOW_TICKS = 300;     // ~5s — counter resets if not knocked down
const QUICK_REBOUND_COOLDOWN = 300; // ~5s between quick rebounds

interface DownState {
  downCount: number;
  lastDownTick: number;
  downProtectionRemaining: number;
  wasDown: boolean;
  lastQuickReboundTick: number;
}

export class DownSystem implements EngineSystem {
  readonly name = "Down";
  readonly phase = "RESOLVE" as const;

  private states = new Map<string, DownState>();

  private getState(actorId: string): DownState {
    let s = this.states.get(actorId);
    if (!s) {
      s = { downCount: 0, lastDownTick: -999, downProtectionRemaining: 0, wasDown: false, lastQuickReboundTick: -999 };
      this.states.set(actorId, s);
    }
    return s;
  }

  tick(ctx: EngineContext): void {
    const tick = ctx.tickCount;

    for (const actor of ctx.actors) {
      if (actor.isDead) continue;
      const ds = this.getState(actor.id);
      const isDown = actor.fsm.state === ActorState.DOWN;

      // Tick down protection timer
      if (ds.downProtectionRemaining > 0) ds.downProtectionRemaining--;
      // getup / quick-rebound i-frames are a tick-deadline (actor.invulnerableUntilTick) that
      // auto-expires against ctx.tickCount — no per-tick projection needed here (Batch 3b).

      // Detect transition INTO down
      if (isDown && !ds.wasDown) {
        ds.downCount++;
        ds.lastDownTick = tick;
        if (ds.downCount >= MAX_CONSECUTIVE_DOWNS) {
          ds.downProtectionRemaining = DOWN_PROTECTION_TICKS;
          ds.downCount = 0;
          ctx.bus.emit("DownProtectionGranted", { actorId: actor.id });
        }
      }

      // Quick rebound: while DOWN, intent.quickRebound → force stand up (with cooldown)
      if (isDown && actor.intent.quickRebound) {
        if ((tick - ds.lastQuickReboundTick) >= QUICK_REBOUND_COOLDOWN) {
          ds.lastQuickReboundTick = tick;
          if (actor.reaction?.active) {
            actor.reaction.remainingTicks = 0;
            actor.reaction.active = false;
            actor.reaction = null;
          }
          actor.fsm.force(ActorState.IDLE, tick);
          actor.invulnerableUntilTick = tick + GETUP_IMMUNITY_TICKS;
          ctx.bus.emit("QuickRebound", { actorId: actor.id });
          // Scenario observation (mirrors CombatResolutionSystem.armorHitObserved): a quick rebound
          // actually fired. Harmless in live play (flag is read only by the evidence collector).
          if (ctx.scenario) ctx.scenario.quickReboundObserved = true;
        }
      }

      // Detect transition OUT of down (getup)
      if (!isDown && ds.wasDown) {
        actor.invulnerableUntilTick = tick + GETUP_IMMUNITY_TICKS;
        ctx.bus.emit("ActorGetup", { actorId: actor.id, immunityTicks: GETUP_IMMUNITY_TICKS });
      }

      // Reset counter if long enough without being knocked down
      if (!isDown && (tick - ds.lastDownTick) > RESET_WINDOW_TICKS) {
        ds.downCount = 0;
      }

      ds.wasDown = isDown;
    }
  }

  getDownCount(actorId: string): number {
    return this.getState(actorId).downCount;
  }

  hasDownProtection(actorId: string): boolean {
    return this.getState(actorId).downProtectionRemaining > 0;
  }
}
