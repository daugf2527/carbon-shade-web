/**
 * EnemyAISystem.ts — 03-Monster/AI domain system (P3.0).
 *
 * Per-monster threshold AI running in LOGIC phase. Each tick it computes the distance
 * from the monster to the player and decides: ATTACK (in range, cooldown ready, actor
 * interruptible) → ActionSystem.request(monsterId, "attack"); CHASE (in sight, out of
 * range) → actor.intent.dir toward player; IDLE (nothing in sight).
 *
 * Attacks are routed through ActionSystem (same as InputSystem for the player) so the
 * entire intent→animation→hit pipeline is shared between player and monster — the
 * goblin's attack produces attackBoxes that CombatResolutionSystem will apply to the
 * player. This creates the first real two-way fight in engine's native kernel.
 *
 * Determinism: pure distance math + FNV-1a PRNG (for warlike roll, P4 refinement).
 *   P3.0 warlike roll: defer — always attack if in range+ready.
 */
import { ActorState } from "../../core/ActorStateMachine.js";
import { DEFAULT_MONSTER_AI_CONFIG } from "../../core/MonsterAIConfig.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";
import type { ActionSystem } from "./ActionSystem.js";

export class EnemyAISystem implements EngineSystem {
  readonly name = "EnemyAI";
  readonly phase = "LOGIC" as const;

  private lastAttack = new Map<string, number>(); // actorId → last attack tick
  private actionNames = new Map<string, string>();  // actorId → action name (P3.0 per-actor mapping)

  /** Set the action name an actor uses when attacking (default: "attack"). */
  setAttackAction(actorId: string, actionName: string): void {
    this.actionNames.set(actorId, actionName);
  }
  // AI tuning is now read per-actor from actor.aiConfig (03-Monster/AI truth wiring); monsters
  // without a config fall back to DEFAULT_MONSTER_AI_CONFIG (the historical hardcode).

  constructor(private readonly actions: ActionSystem) {}

  tick(ctx: EngineContext): void {
    const player = ctx.player;
    for (const actor of ctx.actors) {
      if (actor.frozenFrames > 0) continue; // hit-stop: AI pauses while frozen
      if (actor.id === player.id || actor.isDead) continue;
      const state = actor.fsm.state;
      // Dead or in hitstun — cannot act.
      if (state === ActorState.DEAD || state === ActorState.HIT || state === ActorState.DOWN) continue;

      const dist = Math.abs(actor.x - player.x);
      const cfg = actor.aiConfig ?? DEFAULT_MONSTER_AI_CONFIG;

      if (dist <= cfg.attackRange) {
        actor.intent = { attack: false, dir: 0 };
        const lastAtk = this.lastAttack.get(actor.id) ?? -Infinity;
        if (ctx.tickCount - lastAtk >= cfg.attackDelayTicks) {
          // Don't request if already in ATTACK (mid-animation from prior request).
          const interruptible =
            state === ActorState.IDLE || state === ActorState.CHASE || !actor.animationPlayer.isPlaying;
          if (interruptible) {
            this.actions.request(actor.id, this.actionNames.get(actor.id) ?? "attack");
            this.lastAttack.set(actor.id, ctx.tickCount);
          }
        }
      } else if (dist <= cfg.sightRange) {
        // Chase toward player.
        actor.intent = { attack: false, dir: player.x > actor.x ? 1 : -1 };
      } else {
        // Nothing in sight — idle.
        actor.intent = { attack: false, dir: 0 };
      }
    }
  }

  reset(): void {
    this.lastAttack.clear();
  }
}
