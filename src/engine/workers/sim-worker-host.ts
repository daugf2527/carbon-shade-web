/// <reference lib="dom" />
/**
 * sim-worker-host.ts — Main-thread Web Worker launcher (Phase 2 Day 1).
 *
 * 主线程的 worker 启动器。封装 `new Worker(new URL(...))` 模板，提供
 * input/snapshot 双向消息接口。Stage 2 真用时再加 transferable ArrayBuffer
 * 优化。
 *
 * 2026-05-27 创建（用户决策 Q7 Web Worker Day 1）。
 */

import type {
  InputSnapshot,
  StateSnapshot,
  WorkerInbound,
  WorkerOutbound,
} from "./sim-worker.js";

export interface SimWorkerHost {
  readonly worker: Worker;
  postInput(snapshot: InputSnapshot): void;
  onSnapshot(callback: (snapshot: StateSnapshot) => void): void;
  onError(callback: (message: string) => void): void;
  shutdown(): void;
}

/**
 * Start a sim worker.
 *
 * @param seed Deterministic PRNG seed (Stage 2 replay reproducibility).
 * @returns SimWorkerHost — call `postInput` / register `onSnapshot` to use.
 */
export function startSimWorker(seed: number = 0): SimWorkerHost {
  // Vite resolves the URL at build time and chunks worker code separately.
  // `type: "module"` enables ES module imports inside the worker.
  const worker = new Worker(new URL("./sim-worker.ts", import.meta.url), {
    type: "module",
  });

  let snapshotCb: ((snap: StateSnapshot) => void) | null = null;
  let errorCb: ((msg: string) => void) | null = null;
  let ready = false;
  let terminateTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingInputs: InputSnapshot[] = [];

  worker.onmessage = (ev: MessageEvent<WorkerOutbound>): void => {
    const msg = ev.data;
    if (msg.type === "ready") {
      ready = true;
      // Flush any inputs queued before worker ready
      for (const queued of pendingInputs) postInbound({ type: "input", snapshot: queued });
      pendingInputs.length = 0;
    } else if (msg.type === "snapshot" && snapshotCb !== null) {
      snapshotCb(msg.snapshot);
    } else if (msg.type === "error" && errorCb !== null) {
      errorCb(msg.message);
    }
  };

  // Uncaught exceptions inside the worker (e.g. SyntaxError, ReferenceError) do
  // not arrive via postMessage — they fire ErrorEvent on the worker handle.
  worker.onerror = (ev: ErrorEvent): void => {
    if (errorCb !== null) errorCb(ev.message || "worker error (no message)");
  };

  function postInbound(msg: WorkerInbound): void {
    worker.postMessage(msg);
  }

  // Send init immediately
  postInbound({ type: "init", seed });

  return {
    worker,
    postInput(snapshot) {
      if (!ready) {
        pendingInputs.push(snapshot);
        return;
      }
      postInbound({ type: "input", snapshot });
    },
    onSnapshot(callback) {
      snapshotCb = callback;
    },
    onError(callback) {
      errorCb = callback;
    },
    shutdown() {
      postInbound({ type: "shutdown" });
      // worker.terminate() as fallback in case worker doesn't self.close() promptly.
      // Save timer id so repeated shutdown() calls don't stack multiple terminate() timers.
      if (terminateTimer !== null) return;
      terminateTimer = setTimeout(() => {
        worker.terminate();
        terminateTimer = null;
      }, 100);
    },
  };
}
