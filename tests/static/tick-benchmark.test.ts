import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const TICKS = 600; // 10 seconds of combat at 60Hz
const MAX_AVG_US_PER_TICK = 500; // 500us per tick = 0.5ms (target < 2ms per CLAUDE.md)

const k = new CombatKernel();
k.press("KeyX");

const start = Date.now();
k.runTicks(TICKS);
const elapsedMs = Date.now() - start;

const avgUsPerTick = elapsedMs * 1000 / TICKS;
const ticksPerSec = TICKS / (elapsedMs / 1000);

console.log(`Ran ${TICKS} ticks in ${elapsedMs.toFixed(1)}ms`);
console.log(`Average: ${avgUsPerTick.toFixed(1)}us/tick  (${ticksPerSec.toFixed(0)} ticks/s)`);

assert.ok(
  avgUsPerTick < MAX_AVG_US_PER_TICK,
  `Tick throughput too low: ${avgUsPerTick.toFixed(1)}us/tick exceeds ${MAX_AVG_US_PER_TICK}us/tick threshold`
);
