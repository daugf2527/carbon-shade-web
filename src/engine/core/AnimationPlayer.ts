/**
 * AnimationPlayer.ts — Frame cursor driven by per-frame delay (Phase 3 T3.4)
 *
 * Tick-driven: caller passes elapsed ms per tick (fixed 16.67ms).
 * Emits frame-boundary events for T3.5 FrameEventBus.
 */

import { flattenWeaponTimeline } from "./weaponTimelineFlattener.js";

export interface AniBox {
  readonly x1: number; readonly y1: number; readonly z1: number;
  readonly x2: number; readonly y2: number; readonly z2: number;
}

export interface AniFrame {
  readonly index: number;
  readonly delay: number; // ms
  readonly attackBoxes: readonly AniBox[];
  readonly damageBoxes: readonly AniBox[];
}

export interface AniDef {
  readonly framesCount: number;
  readonly loop: boolean;
  readonly frames: readonly AniFrame[];
  /** P3.0: launch velocity (px/s up) for liftUp attacks; 0/undefined = grounded attack. */
  readonly liftVy?: number;
  /** D-group: optional weapon timeline. When present, its per-frame attackBoxes are flattened
   *  onto `frames` at play() time (DNF body+weapon dual timeline → single engine frame cursor).
   *  Boxes are assumed already in the engine axis convention (see weaponTimelineFlattener). */
  readonly weaponTimeline?: readonly AniFrame[];
}

export type FrameEventKind = "frameEnter" | "frameExit" | "animDone";

export interface FrameEvent {
  readonly kind: FrameEventKind;
  readonly frameIndex: number;
  readonly attackBoxes: readonly AniBox[];
  readonly damageBoxes: readonly AniBox[];
}

export class AnimationPlayer {
  private anim: AniDef | null = null;
  private frameIdx = 0;
  private elapsed = 0; // ms within current frame
  private done = false;

  private listeners: Array<(ev: FrameEvent) => void> = [];

  onFrameEvent(cb: (ev: FrameEvent) => void): void {
    this.listeners.push(cb);
  }

  play(anim: AniDef): void {
    // D-group: if the action carries a weapon timeline, flatten its attackBoxes onto the body
    // frames now so the single frame cursor below exposes them via currentFrame.attackBoxes.
    if (anim.weaponTimeline && anim.weaponTimeline.length > 0) {
      const frames = flattenWeaponTimeline(anim.frames, anim.weaponTimeline);
      this.anim = { framesCount: frames.length, loop: anim.loop, frames, liftVy: anim.liftVy };
    } else {
      this.anim = anim;
    }
    this.frameIdx = 0;
    this.elapsed = 0;
    this.done = false;
    this.emit("frameEnter");
  }

  /** Advance by tickMs (fixed 16.67ms). Returns true if animation finished this tick. */
  update(tickMs: number): boolean {
    if (!this.anim || this.done) return this.done;

    this.elapsed += tickMs;
    const frame = this.anim.frames[this.frameIdx];

    while (this.elapsed >= frame.delay) {
      this.elapsed -= frame.delay;
      this.emit("frameExit");

      const next = this.frameIdx + 1;
      if (next >= this.anim.framesCount) {
        if (this.anim.loop) {
          this.frameIdx = 0;
        } else {
          this.done = true;
          this.emit("animDone");
          return true;
        }
      } else {
        this.frameIdx = next;
      }
      this.emit("frameEnter");
    }
    return false;
  }

  get currentFrame(): AniFrame | null {
    return this.anim?.frames[this.frameIdx] ?? null;
  }

  get isPlaying(): boolean {
    return this.anim !== null && !this.done;
  }

  /** P3.0: launch velocity of the current attack animation (px/s up); 0 if none. */
  get attackLiftVy(): number {
    return this.anim?.liftVy ?? 0;
  }

  private emit(kind: FrameEventKind): void {
    const f = this.anim!.frames[this.frameIdx];
    const ev: FrameEvent = { kind, frameIndex: this.frameIdx, attackBoxes: f.attackBoxes, damageBoxes: f.damageBoxes };
    for (const cb of this.listeners) cb(ev);
  }
}

/** Parse animation from shard JSON format. */
export function parseAniDef(raw: Record<string, unknown>): AniDef {
  const parseFrames = (arr: Array<Record<string, unknown>>): AniFrame[] => arr.map((f) => ({
    index: f.index as number,
    delay: f.delay as number,
    attackBoxes: (f.attackBoxes as AniBox[] | undefined) ?? [],
    damageBoxes: (f.damageBoxes as AniBox[] | undefined) ?? [],
  }));
  const frames = parseFrames(raw.frames as Array<Record<string, unknown>>);
  // D-group: optional weapon timeline (forward-compat — baseline shards don't carry it yet).
  const weaponRaw = raw.weaponTimeline as Array<Record<string, unknown>> | undefined;
  return {
    framesCount: raw.framesCount as number,
    loop: raw.loop as boolean,
    frames,
    liftVy: raw.liftVy as number | undefined,
    weaponTimeline: weaponRaw ? parseFrames(weaponRaw) : undefined,
  };
}
