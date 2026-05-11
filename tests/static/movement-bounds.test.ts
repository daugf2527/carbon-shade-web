import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const maxKernel = new CombatKernel();
const maxPlayer = maxKernel.player;
maxPlayer.position.z = 179.5;
maxKernel.press("ArrowDown");
maxKernel.tick();
assert.ok(maxPlayer.position.z <= 180, "The player must be clamped to zMax");
maxKernel.release("ArrowDown");
maxKernel.tick();

const minKernel = new CombatKernel();
const minPlayer = minKernel.player;
minPlayer.position.z = -179.5;
minKernel.press("ArrowUp");
minKernel.tick();
assert.ok(minPlayer.position.z >= -180, "The player must be clamped to zMin");
minKernel.release("ArrowUp");
minKernel.tick();
