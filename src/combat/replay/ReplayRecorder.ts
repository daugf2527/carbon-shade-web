import type { Actor } from "../types.js";
import { cloneActorSnapshot } from "../actors/ActorFactory.js";
import type { RawInputFrame } from "../input/BrowserInputState.js";
import type { CombatEvent } from "../events/CombatEventBus.js";
import { createReplayMetadata, type ReplayDataSources, type ReplayMetadata, type ReplayMetadataOptions } from "../../runtime/replay/ReplayMetadata.js";

export interface ReplayInputSnapshot { tick:number; held:string[]; pressed:string[]; released:string[]; }
export interface ReplayEventSnapshot { id:string; type:string; status:string; tick:number; sourceActorId?:string; targetActorId?:string; correlationId:string; tags:string[]; payload:unknown; }
export interface ReplayFrame { tick:number; actors: object[]; inputs: ReplayInputSnapshot[]; events: ReplayEventSnapshot[]; eventCount:number; stateHash:string; note?: string; }
export interface ReplayRecorderOptions extends ReplayMetadataOptions {}

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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export class ReplayRecorder {
  readonly frames: ReplayFrame[]=[];
  readonly metadata: ReplayMetadata;
  constructor(options: ReplayRecorderOptions = {}) {
    this.metadata = createReplayMetadata(options);
  }
  record(tick:number, actors:Actor[], events:readonly CombatEvent[] = [], input?: RawInputFrame, note?:string): void {
    const actorSnapshots = actors.map(a=>cloneJson(cloneActorSnapshot(a)));
    const stateHash = hashString(stableStringify({ tick, actors:actorSnapshots }));
    this.frames.push({ tick, actors: actorSnapshots, inputs:cloneInput(input), events:cloneEvents(events), eventCount:events.length, stateHash, note });
  }
  export(): object {
    return { version:"0.2-r3", metadata:{ ...this.metadata, finalStateHash:this.frames.at(-1)?.stateHash }, frameCount:this.frames.length, frames:this.frames };
  }
  clear(): void { this.frames.length=0; }
}
