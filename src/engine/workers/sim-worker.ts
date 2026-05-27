/// <reference lib="webworker" />
/**
 * sim-worker.ts — Simulation Logic Worker (Phase 2 Day 1 skeleton)
 *
 * 跑在浏览器 Web Worker 里。主线程通过 postMessage 喂 input snapshot，
 * worker 跑 fixed-timestep accumulator loop，产出 immutable state snapshot
 * 给主线程渲染。
 *
 * 当前只是 skeleton — 真正的 13 system tick 逻辑在 Stage 2 T3.1 启动时填充。
 *
 * 用法（主线程）：
 *   import { startSimWorker } from "./sim-worker-host.js";
 *   const host = startSimWorker();
 *   host.postInput({...});
 *   host.onSnapshot(snap => render(snap));
 *
 * 2026-05-27 创建（用户决策 Q7 Web Worker Day 1）。
 */

/** Input snapshot from main thread (one per render frame). */
export interface InputSnapshot {
  readonly frame: number;
  readonly tickTimestampMs: number;
  /** Keys pressed since last input snapshot. Stage 2 will replace with bitmask. */
  readonly keys: ReadonlyArray<string>;
}

/** Immutable state snapshot worker emits per simulation tick (60Hz). */
export interface StateSnapshot {
  readonly frame: number;
  readonly stateHash: string;
  readonly entities: ReadonlyArray<{
    readonly id: string;
    readonly position: readonly [number, number, number];
    readonly facing: number;
    readonly currentMotion: string;
  }>;
}

/** Messages worker accepts. */
export type WorkerInbound =
  | { readonly type: "init"; readonly seed: number }
  | { readonly type: "input"; readonly snapshot: InputSnapshot }
  | { readonly type: "shutdown" };

/** Messages worker emits. */
export type WorkerOutbound =
  | { readonly type: "ready" }
  | { readonly type: "snapshot"; readonly snapshot: StateSnapshot }
  | { readonly type: "error"; readonly message: string };

// === Worker lifecycle (skeleton — fills out in Stage 2 T3.1) ===

let initialized = false;
let frameCounter = 0;

self.onmessage = (ev: MessageEvent<WorkerInbound>): void => {
  const msg = ev.data;
  switch (msg.type) {
    case "init":
      // TODO Stage 2 T3.1: seed PRNG, initialize 13 system state, start tick loop.
      initialized = true;
      postOutbound({ type: "ready" });
      break;
    case "input":
      if (!initialized) {
        postOutbound({ type: "error", message: "input before init" });
        return;
      }
      // TODO Stage 2: ingest input → tick simulation → emit snapshot.
      // Skeleton just echoes a stub snapshot to verify message round-trip.
      frameCounter++;
      postOutbound({
        type: "snapshot",
        snapshot: {
          frame: frameCounter,
          stateHash: "skeleton:" + frameCounter,
          entities: [],
        },
      });
      break;
    case "shutdown":
      initialized = false;
      self.close();
      break;
  }
};

function postOutbound(msg: WorkerOutbound): void {
  // `postMessage` is on Worker global; type as DedicatedWorkerGlobalScope.
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}
