import type { Actor } from "../types.js";
import { cloneActorSnapshot } from "../actors/ActorFactory.js";
import type { RawInputFrame } from "../input/BrowserInputState.js";
import type { CombatEvent } from "../events/CombatEventBus.js";

export interface ReplayInputSnapshot { tick:number; held:string[]; pressed:string[]; released:string[]; }
export interface ReplayEventSnapshot { id:string; type:string; status:string; tick:number; sourceActorId?:string; targetActorId?:string; correlationId:string; tags:string[]; payload:unknown; }
export interface ReplayFrame { tick:number; actors: object[]; inputs: ReplayInputSnapshot[]; events: ReplayEventSnapshot[]; eventCount:number; note?: string; }

function cloneJson<T>(value:T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneInput(input?: RawInputFrame): ReplayInputSnapshot[] {
  if (!input) return [];
  return [{ tick:input.tick, held:[...input.held], pressed:[...input.pressed], released:[...input.released] }];
}

function cloneEvents(events: readonly CombatEvent[]): ReplayEventSnapshot[] {
  return events.map(event => ({
    id:event.id,
    type:event.type,
    status:event.status,
    tick:event.tick,
    sourceActorId:event.sourceActorId,
    targetActorId:event.targetActorId,
    correlationId:event.correlationId,
    tags:[...event.tags],
    payload:cloneJson(event.payload)
  }));
}

export class ReplayRecorder {
  readonly frames: ReplayFrame[]=[];
  record(tick:number, actors:Actor[], events:readonly CombatEvent[] = [], input?: RawInputFrame, note?:string): void {
    this.frames.push({ tick, actors: actors.map(a=>cloneJson(cloneActorSnapshot(a))), inputs:cloneInput(input), events:cloneEvents(events), eventCount:events.length, note });
  }
  export(): object { return { version:"0.2-r3", frameCount:this.frames.length, frames:this.frames }; }
  clear(): void { this.frames.length=0; }
}
