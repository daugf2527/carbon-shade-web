import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const TICKS = 600; // 10 seconds of combat at 60Hz
const MAX_AVG_US_PER_TICK = 500; // 500us CPU per tick = 0.5ms (target < 2ms per CLAUDE.md)

// ── CPU-time measurement (de-flaked 2026-06-06, hardened) ────────────────────────
// This benchmark is a per-tick COST regression guard. The static-test runner executes ~100
// test files as concurrent child processes, so wall-clock timing (Date.now) flakes badly under
// CPU contention — an earlier warmup+median wall-clock version still hit 656us/tick median when
// the full suite saturated all cores (vs ~225us isolated). The fix: measure process.cpuUsage()
// (microseconds of actual CPU work), which is immune to scheduler contention — competing
// processes inflate wall-clock but NOT the CPU cycles this process spends. A genuine kernel
// regression (more work per tick) still shows up; transient machine load no longer does. We
// also warm up the JIT first and take the MIN of N samples (the least GC-disturbed run).
function measureCpuUsPerTick(): number {
  const k = new CombatKernel();
  k.press("KeyX");
  const start = process.cpuUsage();
  k.runTicks(TICKS);
  const elapsed = process.cpuUsage(start); // { user, system } in microseconds
  return (elapsed.user + elapsed.system) / TICKS;
}

// Warmup run (JIT compile hot paths) — discarded.
measureCpuUsPerTick();

// Min of 3 runs (rejects GC-pause noise; CPU time already rejects scheduler contention).
const samples = [measureCpuUsPerTick(), measureCpuUsPerTick(), measureCpuUsPerTick()];
const minUsPerTick = Math.min(...samples);
const ticksPerSec = 1_000_000 / minUsPerTick;

console.log(`CPU samples (us/tick): ${samples.map((s) => s.toFixed(1)).join(", ")}`);
console.log(`Min: ${minUsPerTick.toFixed(1)}us CPU/tick  (${ticksPerSec.toFixed(0)} ticks/s)`);

assert.ok(
  minUsPerTick < MAX_AVG_US_PER_TICK,
  `Tick CPU cost too high: min ${minUsPerTick.toFixed(1)}us/tick exceeds ${MAX_AVG_US_PER_TICK}us/tick threshold`
);
