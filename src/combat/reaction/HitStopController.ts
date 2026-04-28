import type { ActorId } from "../types.js";
export class HitStopController {
  private frozen = new Map<ActorId, number>();
  start(actorIds: ActorId[], frames: number): void { if (frames <= 0) return; for (const id of actorIds) this.frozen.set(id, Math.max(this.frozen.get(id) ?? 0, frames + 1)); }
  tick(): string[] { const ended:string[]=[]; for (const [id,frames] of [...this.frozen]) { const next=frames-1; if (next<=0) { this.frozen.delete(id); ended.push(id); } else this.frozen.set(id,next); } return ended; }
  isFrozen(id: ActorId): boolean { return (this.frozen.get(id) ?? 0) > 0; }
  remaining(id: ActorId): number { return this.frozen.get(id) ?? 0; }
  clear(): void { this.frozen.clear(); }
}
