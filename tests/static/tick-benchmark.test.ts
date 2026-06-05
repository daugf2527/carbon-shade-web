import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const TICKS = 600; // 10 seconds of combat at 60Hz
const MAX_AVG_US_PER_TICK = 500; // 500us per tick = 0.5ms (target < 2ms per CLAUDE.md)

// ── Steady-state measurement (de-flaked 2026-06-06) ──────────────────────────────
// The earlier single-shot timing was flaky around the 500us threshold: in isolation it
// oscillated 593us (cold) / 371us / 328us across back-to-back runs. The 593us was a
// cold-JIT artifact on the FIRST run, NOT the real per-tick cost. A 60Hz game loop runs
// continuously (always JIT-warm), so steady-state — not cold-start — is the cost that
// matters. We therefore warm up first, then take the MEDIAN of N timed runs to absorb
// transient machine-load spikes. A genuine perf regression still fails: a 2× slowdown
// pushes even the warm median well past 500us.
function measureUsPerTick(): number {
  const k = new CombatKernel();
  k.press("KeyX");
  const start = Date.now();
  k.runTicks(TICKS);
  const elapsedMs = Date.now() - start;
  return elapsedMs * 1000 / TICKS;
}

// Warmup run (JIT compile hot paths) — timing discarded.
measureUsPerTick();

// Median of 3 timed runs.
const samples = [measureUsPerTick(), measureUsPerTick(), measureUsPerTick()].sort((a, b) => a - b);
const medianUsPerTick = samples[1];
const ticksPerSec = 1_000_000 / medianUsPerTick;

console.log(`Samples (us/tick): ${samples.map((s) => s.toFixed(1)).join(", ")}`);
console.log(`Median: ${medianUsPerTick.toFixed(1)}us/tick  (${ticksPerSec.toFixed(0)} ticks/s)`);

assert.ok(
  medianUsPerTick < MAX_AVG_US_PER_TICK,
  `Tick throughput too low: median ${medianUsPerTick.toFixed(1)}us/tick exceeds ${MAX_AVG_US_PER_TICK}us/tick threshold`
);
