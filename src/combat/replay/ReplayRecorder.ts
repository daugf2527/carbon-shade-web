import type { Actor } from "../types.js";
import { cloneActorSnapshot } from "../actors/ActorFactory.js";
import type { RawInputFrame } from "../input/BrowserInputState.js";
import type { CombatEvent } from "../events/CombatEventBus.js";
import { ACTIONS } from "../actions/FrameDataAction.js";
import { computeActionsHash, computeStatusManifestHash } from "../../data/manifest/hash.js";
import { DEFAULT_STATUS_MANIFEST } from "../../data/manifest/status.js";
import { SOURCE_POLICY_VERSION } from "../../data/manifest/schema.js";

export interface ReplayInputSnapshot { tick:number; held:string[]; pressed:string[]; released:string[]; }
export interface ReplayEventSnapshot { id:string; type:string; status:string; tick:number; sourceActorId?:string; targetActorId?:string; correlationId:string; tags:string[]; payload:unknown; }
export interface ReplayFrame { tick:number; actors: object[]; inputs: ReplayInputSnapshot[]; events: ReplayEventSnapshot[]; eventCount:number; stateHash:string; note?: string; }
export interface ReplayDataSources { actions:string; status:string; damage:string; }
export interface ReplayMetadata { buildHash:string; combatSchemaHash:string; manifestHash:string; statusManifestHash:string; sourcePolicyVersion:string; dataSources: ReplayDataSources; logicFps:number; finalStateHash?:string; }
export interface ReplayRecorderOptions { buildHash?:string; combatSchemaHash?:string; manifestHash?:string; statusManifestHash?:string; sourcePolicyVersion?:string; dataSources?:Partial<ReplayDataSources>; logicFps?:number; }

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
    const manifestHash = options.manifestHash ?? options.combatSchemaHash ?? computeActionsHash(ACTIONS);
    const statusManifestHash = options.statusManifestHash ?? computeStatusManifestHash(DEFAULT_STATUS_MANIFEST);
    this.metadata = {
      buildHash: options.buildHash ?? (typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'local-dev'),
      combatSchemaHash: options.combatSchemaHash ?? manifestHash,
      manifestHash,
      statusManifestHash,
      sourcePolicyVersion: options.sourcePolicyVersion ?? SOURCE_POLICY_VERSION,
      dataSources: {
        actions: options.dataSources?.actions ?? "src/combat/actions/FrameDataAction.ts#ACTIONS",
        status: options.dataSources?.status ?? "src/data/manifest/status/default.json#profiles",
        damage: options.dataSources?.damage ?? "local_baseline",
      },
      logicFps: options.logicFps ?? 60,
    };
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
