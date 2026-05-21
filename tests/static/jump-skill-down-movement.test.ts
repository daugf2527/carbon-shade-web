// Test: Jump 过程中按技能，落地后 ArrowDown 是否正常
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

// Jump 10 帧后按技能（Z 键）
for (let i = 0; i < 10; i++) {
  kernel.tick();
}

console.log(`Jump 10 帧后: action=${player.currentAction}, reactionState=${player.reactionState}, y=${player.position.y}`);

kernel.press("KeyZ");
kernel.tick();
kernel.release("KeyZ");

console.log(`按 Z 后: action=${player.currentAction}, reactionState=${player.reactionState}, y=${player.position.y}`);

// 等待动作结束（最多 100 帧）
for (let i = 0; i < 100; i++) {
  kernel.tick();
  if (!player.currentAction && player.position.y === 0) {
    console.log(`动作在第 ${i} 帧结束: reactionState=${player.reactionState}`);
    break;
  }
}

console.log(`动作结束后: action=${player.currentAction}, reactionState=${player.reactionState}, y=${player.position.y}`);

// 现在按 ArrowDown 移动
kernel.press("ArrowDown");
for (let i = 0; i < 10; i++) {
  kernel.tick();
}
kernel.release("ArrowDown");

// 检查是否向下移动了
const moved = player.position.z > startZ;
console.log(`ArrowDown 移动结果: z ${startZ} → ${player.position.z}, moved=${moved}`);

assert.ok(moved, `Player should move down after Jump+Skill (z should increase from ${startZ})`);

console.log(`✓ Jump 过程中按技能后 ArrowDown 移动正常`);
