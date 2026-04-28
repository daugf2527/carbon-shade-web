import assert from "node:assert/strict";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const kernel = new CombatKernel({ enableReplay: true });
kernel.runTicks(8);

assert.equal(kernel.replay.frames.length, 8);
for (const frame of kernel.replay.frames) {
  assert.equal(
    frame.events.every(event => event.tick === frame.tick),
    true,
    "Replay frames should store only newly flushed events for that frame, not the full archive history",
  );
}
