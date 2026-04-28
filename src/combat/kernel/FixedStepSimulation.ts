export interface TickableKernel {
  tick(): void;
  onLargeDelta(deltaMs: number): void;
  emitLongFrameWarning(deltaMs: number): void;
}

export class FixedStepSimulation {
  readonly tickRate = 1 / 60;
  readonly maxCatchUpTicks = 4;
  readonly pauseThresholdMs = 250;

  private accumulatorSeconds = 0;
  private paused = false;
  private slowMotionFactor = 1;
  private singleStepArmed = false;

  constructor(private readonly kernel: TickableKernel) {}

  setSlowMotion(factor: number): void {
    this.slowMotionFactor = Math.max(0.1, factor);
  }

  armSingleStep(): void {
    this.paused = true;
    this.singleStepArmed = true;
    this.accumulatorSeconds = 0;
  }

  update(deltaMs: number): void {
    if (this.paused) {
      if (this.singleStepArmed) {
        this.kernel.tick();
        this.singleStepArmed = false;
      }
      return;
    }

    if (deltaMs > this.pauseThresholdMs) {
      this.accumulatorSeconds = 0;
      this.kernel.onLargeDelta(deltaMs);
      return;
    }

    this.accumulatorSeconds += (deltaMs * this.slowMotionFactor) / 1000;
    let ticks = 0;
    while (this.accumulatorSeconds >= this.tickRate && ticks < this.maxCatchUpTicks) {
      this.kernel.tick();
      this.accumulatorSeconds -= this.tickRate;
      ticks += 1;
    }

    if (ticks >= this.maxCatchUpTicks) {
      this.accumulatorSeconds = 0;
      this.kernel.emitLongFrameWarning(deltaMs);
    }
  }

  pause(): void {
    this.paused = true;
    this.accumulatorSeconds = 0;
  }

  resume(): void {
    this.paused = false;
    this.singleStepArmed = false;
    this.accumulatorSeconds = 0;
  }
}
