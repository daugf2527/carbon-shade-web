/// <reference lib="webworker" />

export interface InputSnapshot {
  readonly frame: number;
  readonly tickTimestampMs: number;
  readonly keys: ReadonlyArray<string>;
}

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

export type WorkerInbound =
  | { readonly type: "init"; readonly seed: number }
  | { readonly type: "input"; readonly snapshot: InputSnapshot }
  | { readonly type: "shutdown" };

export type WorkerOutbound =
  | { readonly type: "ready" }
  | { readonly type: "snapshot"; readonly snapshot: StateSnapshot }
  | { readonly type: "error"; readonly message: string };

// FNV-1a 32-bit deterministic PRNG
class Fnv1aPrng {
  private state: number;
  constructor(seed: number) {
    // Mix seed into FNV offset basis (2166136261)
    this.state = (2166136261 ^ (seed & 0xffffffff)) >>> 0;
  }
  next(): number {
    this.state = Math.imul(this.state ^ (this.state >>> 16), 0x45d9f3b) >>> 0;
    this.state = Math.imul(this.state ^ (this.state >>> 16), 0x45d9f3b) >>> 0;
    this.state = (this.state ^ (this.state >>> 16)) >>> 0;
    return this.state / 0x100000000;
  }
  nextU32(): number {
    this.next();
    return this.state;
  }
}

const TICK_MS = 1000 / 60;

let prng: Fnv1aPrng | null = null;
let tickCounter = 0;
let tickInterval: ReturnType<typeof setInterval> | null = null;
let pendingInputs: InputSnapshot[] = [];

function postOutbound(msg: WorkerOutbound): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}

function tick(): void {
  const input = pendingInputs.shift() ?? null;
  tickCounter++;

  // stateHash: mix tick + PRNG state for determinism
  const hash = `${tickCounter}:${prng!.nextU32().toString(16)}`;

  postOutbound({
    type: "snapshot",
    snapshot: {
      frame: tickCounter,
      stateHash: hash,
      entities: [],
    },
  });

  if (input) {
    // TODO Stage 2 T3.2: feed input into StateMachine
    void input;
  }
}

self.onmessage = (ev: MessageEvent<WorkerInbound>): void => {
  const msg = ev.data;
  switch (msg.type) {
    case "init":
      prng = new Fnv1aPrng(msg.seed);
      tickCounter = 0;
      // TODO Stage 2 T3.3: initialize Actor entities from shard data
      tickInterval = setInterval(tick, TICK_MS);
      postOutbound({ type: "ready" });
      break;
    case "input":
      pendingInputs.push(msg.snapshot);
      break;
    case "shutdown":
      if (tickInterval !== null) clearInterval(tickInterval);
      self.close();
      break;
  }
};
