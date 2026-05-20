import type { Actor } from "../types.js";
import { CombatEventBus, CombatEventPriority } from "../events/CombatEventBus.js";
export class DeathLoop {
  readonly cleanupBarrier = new Set<string>();
  kill(actor: Actor, tick: number, bus: CombatEventBus, causationId?: string, correlationId?: string): void {
    if(actor.flags.dead) return;
    actor.flags.dead = true;
    actor.reactionState = "downed";
    actor.handfeel.reactionRemaining = 0;
    actor.handfeel.getUpRemaining = 0;
    actor.handfeel.downRemaining = Math.max(actor.handfeel.downRemaining, 999999);
    actor.velocity.x = 0;
    actor.velocity.z = 0;
    actor.velocity.y = 0;
    actor.position.y = 0;
    this.cleanupBarrier.add(actor.id);
    const releaseBarrier = (event: { payload: unknown }) => {
      const payload = event.payload as { actorId?: string };
      if (payload.actorId !== actor.id) return;
      this.cleanupBarrier.delete(actor.id);
      bus.off("DeathCleanupCompleted", releaseBarrier);
    };
    bus.on("DeathCleanupCompleted", releaseBarrier);
    bus.emit("ActorDied", CombatEventPriority.Death, tick, {actorId:actor.id}, {targetActorId:actor.id, causationId, correlationId});
    if(actor.currentAction) { actor.currentAction.phase="interrupted"; actor.currentAction.interrupted=true; }
    actor.currentAction = undefined;
    bus.emit("ActionInterrupted", CombatEventPriority.Interrupt, tick, {actorId:actor.id, reason:"death"}, {targetActorId:actor.id, causationId, correlationId});
    bus.emit("ActiveHitboxesCleared", CombatEventPriority.Interrupt, tick, {actorId:actor.id}, {targetActorId:actor.id, causationId, correlationId});
    bus.emit("DeathCleanupCompleted", CombatEventPriority.Cleanup, tick, {actorId:actor.id}, {targetActorId:actor.id, causationId, correlationId});
  }
  blocks(actorId: string, type: string): string | null { if(this.cleanupBarrier.has(actorId) && !["ActorDied","BuffDeathCleanup","StatusDeathCleanup","DeathCleanupCompleted","ActionInterrupted","ActiveHitboxesCleared"].includes(type)) return "death_cleanup_barrier"; return null; }
  clear(): void { this.cleanupBarrier.clear(); }
}
