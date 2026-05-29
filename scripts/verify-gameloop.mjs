#!/usr/bin/env node
/**
 * verify-gameloop.mjs — GameLoop 60Hz 稳定性验证脚本
 *
 * 模拟浏览器 RAF 环境，验证 GameLoop 的固定步长累加器是否能稳定输出 60Hz。
 * 验收标准：
 *   1. 1 秒内 tick 数应接近 60 (±1)
 *   2. alpha 插值因子在 [0, 1) 范围内
 *   3. 长帧 (>250ms) 不会导致累加器爆炸
 *   4. 慢动作 / 暂停 / 单步执行功能正常
 */

import { performance } from "node:perf_hooks";

// 内联 GameLoop 实现（从 src/engine/core/GameLoop.ts）
class GameLoop {
  constructor(kernel, options = {}) {
    this.kernel = kernel;
    this.tickRate = options.tickRate ?? 1 / 60;
    this.maxCatchUpTicks = options.maxCatchUpTicks ?? 4;
    this.pauseThresholdMs = options.pauseThresholdMs ?? 250;

    this.accumulatorSeconds = 0;
    this.paused = false;
    this.slowMotionFactor = 1;
    this.singleStepArmed = false;
    this.tickCounter = 0;
  }

  get currentTick() {
    return this.tickCounter;
  }

  get alpha() {
    return this.accumulatorSeconds / this.tickRate;
  }

  update(deltaMs) {
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

  setSlowMotion(factor) {
    this.slowMotionFactor = Math.max(0.1, factor);
  }

  armSingleStep() {
    this.paused = true;
    this.singleStepArmed = true;
    this.accumulatorSeconds = 0;
  }

  pause() {
    this.paused = true;
    this.accumulatorSeconds = 0;
  }

  resume() {
    this.paused = false;
    this.singleStepArmed = false;
    this.accumulatorSeconds = 0;
  }

  isPaused() {
    return this.paused;
  }
}

// 测试 kernel
const kernel = {
  tickCount: 0,
  largeDeltaCount: 0,
  longFrameWarningCount: 0,

  tick() {
    this.tickCount++;
  },

  onLargeDelta(deltaMs) {
    this.largeDeltaCount++;
    console.log(`  ⚠️  长帧检测: ${deltaMs.toFixed(1)}ms`);
  },

  emitLongFrameWarning(deltaMs, droppedSeconds) {
    this.longFrameWarningCount++;
    console.log(`  ⚠️  性能掉队: deltaMs=${deltaMs.toFixed(1)}ms, 丢弃 ${droppedSeconds.toFixed(3)}s`);
  },
};

console.log("GameLoop 60Hz 稳定性验证\n");
console.log("=" .repeat(60));

// Test 1: 正常 60Hz 稳定性
console.log("\n[Test 1] 正常 60Hz 稳定性");
console.log("-".repeat(60));
const loop1 = new GameLoop(kernel);
const startTick1 = loop1.currentTick;

// 模拟 1 秒的 RAF 回调（60 次，每次 ~16.67ms）
for (let i = 0; i < 60; i++) {
  loop1.update(16.67);
}

const endTick1 = loop1.currentTick;
const ticksPerSecond = endTick1 - startTick1;
console.log(`  ✓ 1 秒内 tick 数: ${ticksPerSecond} (预期 60 ±1)`);
console.log(`  ✓ alpha 插值因子: ${loop1.alpha.toFixed(3)} (预期 [0, 1))`);

if (ticksPerSecond >= 59 && ticksPerSecond <= 61) {
  console.log("  ✅ PASS: 60Hz 稳定");
} else {
  console.log(`  ❌ FAIL: tick 数偏离预期 (${ticksPerSecond} vs 60)`);
  process.exit(1);
}

// Test 2: RAF 抖动容忍度
console.log("\n[Test 2] RAF 抖动容忍度");
console.log("-".repeat(60));
const loop2 = new GameLoop(kernel);
const startTick2 = loop2.currentTick;

// 模拟抖动的 RAF (10-25ms 随机)
for (let i = 0; i < 70; i++) {
  const jitter = 10 + Math.random() * 15;
  loop2.update(jitter);
}

const endTick2 = loop2.currentTick;
const elapsed2 = (endTick2 - startTick2) / 60;
console.log(`  ✓ 累计 tick: ${endTick2 - startTick2}`);
console.log(`  ✓ 仿真时间: ${elapsed2.toFixed(2)}s`);
console.log(`  ✓ alpha: ${loop2.alpha.toFixed(3)}`);

if (loop2.alpha >= 0 && loop2.alpha < 1) {
  console.log("  ✅ PASS: alpha 在有效范围内");
} else {
  console.log(`  ❌ FAIL: alpha 越界 (${loop2.alpha})`);
  process.exit(1);
}

// Test 3: 长帧处理 (tab 切换)
console.log("\n[Test 3] 长帧处理 (>250ms)");
console.log("-".repeat(60));
const loop3 = new GameLoop(kernel);
kernel.largeDeltaCount = 0;

loop3.update(16.67);
loop3.update(500); // 模拟 tab 切换
loop3.update(16.67);

console.log(`  ✓ 长帧回调触发次数: ${kernel.largeDeltaCount}`);
if (kernel.largeDeltaCount === 1) {
  console.log("  ✅ PASS: 长帧正确处理");
} else {
  console.log(`  ❌ FAIL: 长帧回调未触发`);
  process.exit(1);
}

// Test 4: 慢动作
console.log("\n[Test 4] 慢动作 (0.5x)");
console.log("-".repeat(60));
const loop4 = new GameLoop(kernel);
loop4.setSlowMotion(0.5);
const startTick4 = loop4.currentTick;

for (let i = 0; i < 60; i++) {
  loop4.update(16.67);
}

const endTick4 = loop4.currentTick;
const slowTicks = endTick4 - startTick4;
console.log(`  ✓ 慢动作下 tick 数: ${slowTicks} (预期 ~30)`);

if (slowTicks >= 28 && slowTicks <= 32) {
  console.log("  ✅ PASS: 慢动作正确");
} else {
  console.log(`  ❌ FAIL: 慢动作 tick 数错误 (${slowTicks} vs ~30)`);
  process.exit(1);
}

// Test 5: 暂停 / 恢复
console.log("\n[Test 5] 暂停 / 恢复");
console.log("-".repeat(60));
const loop5 = new GameLoop(kernel);
const startTick5 = loop5.currentTick;

loop5.update(16.67);
loop5.pause();
loop5.update(16.67);
loop5.update(16.67);
const pausedTick = loop5.currentTick;

loop5.resume();
loop5.update(16.67);
const resumedTick = loop5.currentTick;

console.log(`  ✓ 暂停前 tick: ${startTick5}`);
console.log(`  ✓ 暂停中 tick: ${pausedTick} (应不变)`);
console.log(`  ✓ 恢复后 tick: ${resumedTick} (应增加)`);

if (pausedTick === startTick5 + 1 && resumedTick > pausedTick) {
  console.log("  ✅ PASS: 暂停 / 恢复正确");
} else {
  console.log(`  ❌ FAIL: 暂停 / 恢复逻辑错误`);
  process.exit(1);
}

// Test 6: 单步执行
console.log("\n[Test 6] 单步执行");
console.log("-".repeat(60));
const loop6 = new GameLoop(kernel);
const startTick6 = loop6.currentTick;

loop6.armSingleStep();
loop6.update(16.67);
const step1 = loop6.currentTick;

loop6.update(16.67);
const step2 = loop6.currentTick;

console.log(`  ✓ 单步前 tick: ${startTick6}`);
console.log(`  ✓ 单步后 tick: ${step1} (应 +1)`);
console.log(`  ✓ 再次 update tick: ${step2} (应不变)`);

if (step1 === startTick6 + 1 && step2 === step1) {
  console.log("  ✅ PASS: 单步执行正确");
} else {
  console.log(`  ❌ FAIL: 单步执行逻辑错误`);
  process.exit(1);
}

// 总结
console.log("\n" + "=".repeat(60));
console.log("✅ 所有测试通过 — GameLoop 60Hz 稳定性验证完成");
console.log("=".repeat(60));
console.log("\n验收标准满足:");
console.log("  ✓ 固定步长累加器正常工作");
console.log("  ✓ 60Hz tick 稳定输出");
console.log("  ✓ RAF 抖动容忍度良好");
console.log("  ✓ 长帧 / 慢动作 / 暂停 / 单步功能正常");
console.log("  ✓ alpha 插值因子在有效范围内");
console.log("\n浏览器验证: 打开 http://localhost:5173/carbon-shade-web/demo-gameloop.html");
