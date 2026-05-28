/**
 * GameLoop.ts — Fixed-timestep accumulator + variable rendering (Phase 0 T0.4)
 *
 * 仿真 60 Hz 固定步长，渲染可变帧率。基于 Gaffer on Games "Fix Your Timestep!"
 * 累加器模式。借鉴 master 分支 src/combat/kernel/FixedStepSimulation.ts 的稳定
 * 模式（pauseThreshold / maxCatchUp / slow-motion / single-step）。
 *
 * **责任分工**：
 *   - GameLoop: 决定 "什么时候该 tick"
 *   - 仿真 (sim-worker / kernel): tick() 内部跑一帧业务
 *   - 渲染: 拿 alpha (interp factor) 在两帧间插值
 *
 * 浏览器 RAF deltaMs 在 16.67ms 附近抖动 (5-30ms 区间)，长帧 (>= 250ms,
 * tab 切换/断点) 视为 pause 而非补帧（防止累加器爆炸）。
 *
 * 2026-05-28 created (Phase 0 T0.4, ANI/.fbs 与 ShardLoader 一并落地).
 */

export interface Tickable {
  /** 跑一帧业务逻辑（固定 16.67ms 时间步）。 */
  tick(): void;
  /** dt 超过 pauseThresholdMs 时调用（tab 切换/断点恢复）。 */
  onLargeDelta?(deltaMs: number): void;
  /** 单帧内累计 ticks > maxCatchUpTicks 时调用（性能掉队警告）。 */
  emitLongFrameWarning?(deltaMs: number, droppedSeconds: number): void;
}

export interface GameLoopOptions {
  /** 仿真步长（秒）。默认 1/60。 */
  readonly tickRate?: number;
  /** 单帧 update 内最多补几次 tick。超过 = 渲染来不及，丢累加器。默认 4。 */
  readonly maxCatchUpTicks?: number;
  /** dt 超过此值视为 pause（tab inactive / 断点）。默认 250ms。 */
  readonly pauseThresholdMs?: number;
}

export class GameLoop {
  readonly tickRate: number;
  readonly maxCatchUpTicks: number;
  readonly pauseThresholdMs: number;

  private accumulatorSeconds = 0;
  private paused = false;
  private slowMotionFactor = 1;
  private singleStepArmed = false;

  /** 累计跑过的 tick 数（确定性 PRNG 种子用 + Replay 帧锚）。 */
  private tickCounter = 0;

  constructor(
    private readonly kernel: Tickable,
    options: GameLoopOptions = {},
  ) {
    this.tickRate = options.tickRate ?? 1 / 60;
    this.maxCatchUpTicks = options.maxCatchUpTicks ?? 4;
    this.pauseThresholdMs = options.pauseThresholdMs ?? 250;
  }

  /** 当前累计 tick 数（不可由外部 reset）。 */
  get currentTick(): number {
    return this.tickCounter;
  }

  /** 渲染插值因子 [0, 1)：0 = 上一 tick 完成时刻，接近 1 = 即将下一 tick。 */
  get alpha(): number {
    return this.accumulatorSeconds / this.tickRate;
  }

  /** 主入口 — 每个 RAF/setInterval 回调调一次，传入 ms delta。 */
  update(deltaMs: number): void {
    if (this.paused) {
      if (this.singleStepArmed) {
        this.kernel.tick();
        this.tickCounter++;
        this.singleStepArmed = false;
      }
      return;
    }

    if (deltaMs > this.pauseThresholdMs) {
      this.accumulatorSeconds = 0;
      this.kernel.onLargeDelta?.(deltaMs);
      return;
    }

    this.accumulatorSeconds += (deltaMs * this.slowMotionFactor) / 1000;

    let ticks = 0;
    while (this.accumulatorSeconds >= this.tickRate && ticks < this.maxCatchUpTicks) {
      this.kernel.tick();
      this.tickCounter++;
      this.accumulatorSeconds -= this.tickRate;
      ticks++;
    }

    if (ticks >= this.maxCatchUpTicks && this.accumulatorSeconds >= this.tickRate) {
      const dropped = this.accumulatorSeconds;
      this.accumulatorSeconds = 0;
      this.kernel.emitLongFrameWarning?.(deltaMs, dropped);
    }
  }

  setSlowMotion(factor: number): void {
    this.slowMotionFactor = Math.max(0.1, factor);
  }

  armSingleStep(): void {
    this.paused = true;
    this.singleStepArmed = true;
    this.accumulatorSeconds = 0;
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

  isPaused(): boolean {
    return this.paused;
  }
}
