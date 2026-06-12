import { assert } from "./test-utils.js";
import { buildEngineSceneKernel } from "../fixtures/engineSceneHarness.js";

const TICKS = 6000;
const MAX_AVG_US_PER_TICK = 150;

// CPU-time benchmark for the engine mainline. We use process.cpuUsage() rather than wall-clock
// time so parallel static-test children do not inflate the metric with scheduler noise.
function measureCpuUsPerTick(): number {
  const { kernel, player } = buildEngineSceneKernel(42);

  for (let i = 0; i < 120; i += 1) {
    if (i % 10 === 0) kernel.requestAction(player.id, "attack1");
    kernel.tick();
  }

  const start = process.cpuUsage();
  for (let i = 0; i < TICKS; i += 1) {
    if (i % 60 === 0) kernel.requestAction(player.id, (Math.floor(i / 60) % 2 === 0) ? "attack1" : "attack3");
    kernel.tick();
  }
  const elapsed = process.cpuUsage(start);
  return (elapsed.user + elapsed.system) / TICKS;
}

measureCpuUsPerTick();

const samples = [measureCpuUsPerTick(), measureCpuUsPerTick(), measureCpuUsPerTick()];
const minUsPerTick = Math.min(...samples);
const ticksPerSec = 1_000_000 / minUsPerTick;

console.log(`Engine CPU samples (us/tick): ${samples.map((s) => s.toFixed(1)).join(", ")}`);
console.log(`Engine min: ${minUsPerTick.toFixed(1)}us CPU/tick  (${ticksPerSec.toFixed(0)} ticks/s)`);

assert.ok(
  minUsPerTick < MAX_AVG_US_PER_TICK,
  `Engine tick CPU cost too high: min ${minUsPerTick.toFixed(1)}us/tick exceeds ${MAX_AVG_US_PER_TICK}us/tick threshold`,
);
