/**
 * ResourceSystem.ts — 08-Resource domain system (MP regen + cooldown), kernel-integrated.
 *
 * Phase LOGIC (early): regenerate every actor's MP toward mpMax and decrement skill cooldowns,
 * BEFORE later phases (a skill check this frame sees up-to-date MP/cooldown). Mirrors the
 * tick-based determinism of StatusSystem (09-Status): no wall clock, stable iteration, state on
 * the Actor (actor.mp + actor.cooldowns) so it folds into the kernel stateHash.
 *
 * Spend path: requestSkill(actorId, skillId, mpCost, cooldownMs) queues a spend attempt, drained
 * each tick via trySpendForSkill (ActionSystem-style queue). A successful spend deducts MP +
 * starts the cooldown and emits SkillFired; a failed one (not enough MP / on cooldown) emits
 * SkillFizzled. The caller resolves cost/cooldown from skill truth data (consumeMp/coolTime).
 *
 * SCOPE: pure resource bookkeeping — it does NOT play the skill animation (that is ActionSystem's
 * job). Wiring a skill button → requestSkill + requestAction is a scene/input concern (future).
 */
import { regenMp, trySpendForSkill } from "../../core/ResourcePool.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

interface SkillSpendRequest {
  readonly actorId: string;
  readonly skillId: string;
  readonly mpCost: number;
  readonly cooldownMs: number;
}

export class ResourceSystem implements EngineSystem {
  readonly name = "Resource";
  readonly phase = "LOGIC" as const;

  private pendingSpends: SkillSpendRequest[] = [];

  /** Queue a skill-spend attempt; resolved next tick. cost/cooldown come from skill truth data. */
  requestSkill(actorId: string, skillId: string, mpCost: number, cooldownMs: number): void {
    this.pendingSpends.push({ actorId, skillId, mpCost, cooldownMs });
  }

  tick(ctx: EngineContext): void {
    // 1. Resolve queued skill spends (deterministic FIFO order).
    if (this.pendingSpends.length > 0) {
      for (const req of this.pendingSpends) {
        const actor = ctx.actors.find((a) => a.id === req.actorId);
        if (!actor || actor.isDead) continue;
        const fired = trySpendForSkill(actor, actor.cooldowns, req.skillId, req.mpCost, req.cooldownMs);
        ctx.bus.emit(fired ? "SkillFired" : "SkillFizzled", {
          actorId: actor.id, skillId: req.skillId, mpCost: req.mpCost, tick: ctx.tickCount,
        });
      }
      this.pendingSpends.length = 0;
    }

    // 2. Regen MP + decrement cooldowns for every live actor.
    for (const actor of ctx.actors) {
      if (actor.isDead) continue;
      const regenSpeed = actor.stats.mpRegenSpeed ?? 0;
      if (regenSpeed > 0 && actor.mp < actor.stats.mpMax) {
        actor.mp = regenMp(actor.mp, actor.stats.mpMax, regenSpeed);
      }
      actor.cooldowns.tick();
    }
  }

  reset(): void {
    this.pendingSpends.length = 0;
  }
}
