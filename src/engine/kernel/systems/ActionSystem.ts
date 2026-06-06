/**
 * ActionSystem.ts — the action→animation bridge (P3.0).
 *
 * The missing middle layer between intent and execution: AI and Input both decide
 * "do action X" but neither plays an animation. ActionSystem owns an actionName→AniDef
 * registry and a per-actor pending-request queue; each tick it dispatches the queued
 * request by calling actor.animationPlayer.play(), which produces the attackBoxes that
 * CombatResolutionSystem then reads. This is what P1's tests bypassed by calling
 * animationPlayer.play() directly.
 *
 * Phase LOGIC, but registered to run BEFORE AnimationSystem within the phase via
 * insertion (kernel keeps phase order stable; same-phase ties keep insertion order).
 * Actually we run in INPUT phase so the played animation advances the SAME tick.
 *
 * Gating: a request is honored only if the actor is interruptible (IDLE/READY/CHASE or
 * its current animation finished) — prevents an attack from restarting every tick while
 * already mid-swing. Determinism: pure queue drain in actor order, no Math.random.
 */
import type { AniDef } from "../../core/AnimationPlayer.js";
import { ActorState } from "../../core/ActorStateMachine.js";
import { isInCancelWindow, type CancelWindowConfig } from "../../core/CancelWindow.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

/** States from which a new action can start. */
const INTERRUPTIBLE = new Set<ActorState>([
  ActorState.IDLE,
  ActorState.READY,
  ActorState.CHASE,
  ActorState.RETREAT,
]);

export class ActionSystem implements EngineSystem {
  readonly name = "Action";
  readonly phase = "INPUT" as const;

  private registry = new Map<string, AniDef>();
  private pending = new Map<string, string>(); // actorId → actionName
  // Per-action cancel windows (skill-action infra §3). An action whose current frame is inside its
  // cancel window can be interrupted by a new request — the DNF cancel/combo chain. Actions without
  // an entry (e.g. basic attacks, no cancelWindow in the shard) are NOT cancelable (zero regression).
  private cancelWindows = new Map<string, CancelWindowConfig>();

  /** Register an action's animation, optionally with its PVF cancel window (skill cancel chain). */
  define(actionName: string, anim: AniDef, cancelWindow?: CancelWindowConfig): void {
    this.registry.set(actionName, anim);
    if (cancelWindow) this.cancelWindows.set(actionName, cancelWindow);
  }

  /** Request an actor perform an action next tick (overwrites any prior pending request). */
  request(actorId: string, actionName: string): void {
    this.pending.set(actorId, actionName);
  }

  tick(ctx: EngineContext): void {
    if (this.pending.size === 0) return;
    for (const actor of ctx.actors) {
      const actionName = this.pending.get(actor.id);
      if (actionName === undefined) continue;
      this.pending.delete(actor.id);

      if (actor.fsm.state === ActorState.DEAD) continue;
      // Interruptible if: in an interruptible FSM state, OR the prior animation finished, OR the
      // current action is inside its cancel window (cancel/combo chain — skill-action §3).
      const current = actor.currentActionName;
      const cancelCfg = current ? this.cancelWindows.get(current) : undefined;
      const inCancelWindow = cancelCfg
        ? isInCancelWindow(cancelCfg, actor.animationPlayer.currentFrame?.index ?? 0)
        : false;
      const interruptible =
        INTERRUPTIBLE.has(actor.fsm.state) || !actor.animationPlayer.isPlaying || inCancelWindow;
      if (!interruptible) continue;

      const anim = this.registry.get(actionName);
      if (!anim) continue;

      actor.animationPlayer.play(anim);
      actor.currentActionName = actionName;
      // Drive FSM into ATTACK so it doesn't accept a new action mid-swing.
      actor.fsm.update({
        tick: ctx.tickCount,
        hp: actor.hp,
        maxHp: actor.stats.hpMax,
        inputAttack: true,
        hitReceived: false,
        knockedDown: false,
        launchedAirborne: false,
        animationDone: false,
        targetInRange: false,
        targetInSight: false,
      });
      ctx.bus.emit("ActionStarted", { actorId: actor.id, actionName, tick: ctx.tickCount });
    }
  }

  reset(): void {
    this.pending.clear();
    // registry persists across scene resets (it's content, not runtime state).
  }
}
