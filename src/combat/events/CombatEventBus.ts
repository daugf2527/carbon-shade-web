import { nextId } from "../util/ids.js";
import type { CombatEventType } from "./CombatEventType.js";
export enum CombatEventPriority { Death=1000, Interrupt=900, Invulnerable=850, Grab=820, HitDecision=700, Damage=650, Reaction=600, Status=500, Buff=450, ResourceCooldown=400, Feedback=100, Cleanup=50, Debug=0 }
export type CombatEventStatus = "created" | "queued" | "dispatching" | "consumed" | "blocked" | "cancelled" | "archived";
export interface CombatEvent<TPayload=unknown> { id:string; type:CombatEventType; priority:CombatEventPriority; status:CombatEventStatus; tick:number; sourceActorId?:string; targetActorId?:string; correlationId:string; parentEventId?:string; causationId?:string; payload:TPayload; tags:string[]; order:number; }
export type CombatEventHandler = (event: CombatEvent, bus: CombatEventBus) => void;
export type EventBlockPolicy = (event: CombatEvent) => string | null;
export class CombatEventBus {
  private currentQueue: CombatEvent[] = [];
  private nextQueue: CombatEvent[] = [];
  private handlers = new Map<CombatEventType, CombatEventHandler[]>();
  private order = 0;
  private flushing = false;
  readonly archive: CombatEvent[] = [];
  blockPolicy?: EventBlockPolicy;
  on(type: CombatEventType, handler: CombatEventHandler): void { const list=this.handlers.get(type) ?? []; list.push(handler); this.handlers.set(type,list); }
  off(type: CombatEventType, handler: CombatEventHandler): void {
    const list = this.handlers.get(type);
    if (!list) return;
    const next = list.filter(h => h !== handler);
    if (next.length > 0) this.handlers.set(type, next);
    else this.handlers.delete(type);
  }
  emit<T>(type: CombatEventType, priority: CombatEventPriority, tick: number, payload: T, meta: Partial<CombatEvent> = {}): CombatEvent<T> {
    const event: CombatEvent<T> = { id: nextId("evt"), type, priority, status:"queued", tick, correlationId: meta.correlationId ?? meta.causationId ?? nextId("corr"), parentEventId: meta.parentEventId, causationId: meta.causationId, sourceActorId: meta.sourceActorId, targetActorId: meta.targetActorId, payload, tags: meta.tags ?? [], order: ++this.order };
    if (this.flushing && (priority >= CombatEventPriority.Interrupt || priority === CombatEventPriority.Death)) this.currentQueue.push(event);
    else if (this.flushing) this.nextQueue.push(event);
    else this.currentQueue.push(event);
    return event;
  }
  flush(): CombatEvent[] {
    this.flushing = true;
    const flushed: CombatEvent[] = [];
    while (this.currentQueue.length > 0) {
      this.currentQueue.sort((a,b)=> b.priority-a.priority || a.order-b.order);
      const event = this.currentQueue.shift();
      if (!event) break;
      const reason = this.blockPolicy?.(event) ?? null;
      if (reason) { event.status="blocked"; event.tags.push(`blocked:${reason}`); this.archive.push(event); flushed.push(event); continue; }
      event.status = "dispatching";
      for (const h of this.handlers.get(event.type) ?? []) h(event, this);
      event.status = "consumed";
      this.archive.push(event);
      flushed.push(event);
    }
    this.flushing = false;
    this.currentQueue = this.nextQueue;
    this.nextQueue = [];
    return flushed;
  }
  drainAll(): CombatEvent[] { const drained: CombatEvent[] = []; while (this.currentQueue.length > 0 || this.nextQueue.length > 0) drained.push(...this.flush()); return drained; }
  clear(): void { this.currentQueue=[]; this.nextQueue=[]; this.archive.length=0; this.handlers.clear(); }
}
