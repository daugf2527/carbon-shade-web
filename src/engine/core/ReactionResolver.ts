/**
 * ReactionResolver.ts — Apply hit reaction to defender Actor (Phase 3 T3.8)
 *
 * Reads AtkDef flags (liftUp/pushAside) to decide reaction type.
 * Hitstun duration from local_baseline: 600ms base / 16.67ms per tick ≈ 36 ticks.
 */

import { Actor } from "./Actor.js";
import { ActorState } from "./ActorStateMachine.js";

export interface AtkFlags {
  readonly liftUp?: boolean;
  readonly pushAside?: boolean;
  readonly hitstunMs?: number; // override; default 600ms
}

const DEFAULT_HITSTUN_MS = 600;
const TICK_MS = 1000 / 60;

export interface ReactionState {
  active: boolean;
  remainingTicks: number;
  kind: "hit" | "down" | "airborne";
}

export function applyHitReaction(
  defender: Actor,
  flags: AtkFlags,
  damage: number,
  tick: number,
): ReactionState {
  defender.hp = Math.max(0, defender.hp - damage);

  const hitstunTicks = Math.round((flags.hitstunMs ?? DEFAULT_HITSTUN_MS) / TICK_MS);

  let kind: ReactionState["kind"];
  if (flags.liftUp) {
    kind = "airborne";
  } else if (flags.pushAside) {
    kind = "down";
  } else {
    kind = "hit";
  }

  const ctx = {
    tick,
    hp: defender.hp,
    maxHp: defender.stats.hpMax,
    inputAttack: false,
    hitReceived: true,
    knockedDown: kind === "down",
    launchedAirborne: kind === "airborne",
    animationDone: false,
    targetInRange: false,
    targetInSight: false,
  };
  defender.fsm.update(ctx);

  return { active: true, remainingTicks: hitstunTicks, kind };
}

/** Tick down hitstun; when done, push animationDone transition. */
export function tickReaction(defender: Actor, reaction: ReactionState, tick: number): void {
  if (!reaction.active) return;
  reaction.remainingTicks--;
  if (reaction.remainingTicks <= 0) {
    reaction.active = false;
    if (defender.hp > 0) {
      defender.fsm.update({
        tick,
        hp: defender.hp,
        maxHp: defender.stats.hpMax,
        inputAttack: false,
        hitReceived: false,
        knockedDown: false,
        launchedAirborne: false,
        animationDone: true,
        targetInRange: false,
        targetInSight: false,
      });
    } else {
      defender.fsm.force(ActorState.DEAD, tick);
    }
  }
}
