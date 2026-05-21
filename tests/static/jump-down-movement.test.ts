// Test: Jump 后 ArrowDown 移动是否正常
import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const kernel = new CombatKernel({ enableReplay: false });
const player = kernel.player;

// 记录初始 z 位置
const startZ = player.position.z;

// 执行 Jump
kernel.press("KeyC");
kernel.tick();
kernel.release("KeyC");

// Jump 持续 72 帧
for (let i = 0; i < 72; i++) {
  kernel.tick();
}

// Jump 应该结束了
assert.equal(player.currentAction, undefined, "Jump should end after 72 frames");
assert.equal(player.position.y, 0, "Player should be on ground after Jump");

// 现在按 ArrowDown 移动
kernel.press("ArrowDown");
for (let i = 0; i < 10; i++) {
  kernel.tick();
}
kernel.release("ArrowDown");

// 检查是否向下移动了
assert.ok(player.position.z > startZ, `Player should move down (z increased from ${startZ} to ${player.position.z})`);

console.log(`✓ Jump 后 ArrowDown 移动正常: z ${startZ} → ${player.position.z}`);
