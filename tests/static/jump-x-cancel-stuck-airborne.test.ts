import { assert } from "./test-utils.js";
import { buildEngineJumpMovementKernel, tickUntil } from "../fixtures/engineSceneHarness.js";

const { kernel, player } = buildEngineJumpMovementKernel(42);

assert.equal(player.y, 0, "起始 y 应为 0");

player.intent = { attack: false, dir: 0, button: "jump" };
kernel.tick();
player.intent = { attack: false, dir: 0 };

for (let i = 0; i < 10; i += 1) kernel.tick();
const yAtCancel = player.y;
assert.ok(yAtCancel > 0, `Jump 上升中应当 y > 0, got ${yAtCancel}`);

kernel.requestAction(player.id, "jumpattack");
kernel.tick();
assert.equal(player.currentActionName, "jumpattack", "空中 jumpattack 请求应当接管当前动作");

const settledAt = tickUntil(
  kernel,
  () => player.y === 0 && !player.airborne?.active && player.currentActionName === null,
  120,
);

assert.ok(settledAt > 0, "jumpattack 结束后应当在 120 ticks 内落地");
assert.equal(player.y, 0, `bug: jumpattack 结束后 y 卡在 ${player.y}, 期望 0`);
assert.equal(player.airborne, null, "落地后 airborne 状态应当清除");

console.log(`jump-x-cancel-stuck-airborne: cancelHeight=${yAtCancel.toFixed(2)} settledAt=${settledAt}`);
