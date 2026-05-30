// Test: Jump 过程中被打中，落地后 ArrowDown 是否正常
import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const kernel = new CombatKernel({ enableReplay: false });
const player = kernel.player;
const grunt = kernel.actors.find(a => a.id === "grunt")!;

// 将敌人移到玩家附近
grunt.position.x = player.position.x + 100;
grunt.position.z = player.position.z;

// 记录初始 z 位置
const startZ = player.position.z;

// 玩家执行 Jump
kernel.press("KeyC");
kernel.tick();
kernel.release("KeyC");

// Jump 10 帧后
for (let i = 0; i < 10; i++) {
  kernel.tick();
}

console.log(`Jump 10 帧后: action=${player.currentAction?.actionName}, reactionState=${player.reactionState}, y=${player.position.y}`);

// 敌人攻击玩家
kernel.requestAction(grunt, "attack1");
for (let i = 0; i < 20; i++) {
  kernel.tick();
}

console.log(`被打中后: action=${player.currentAction?.actionName}, reactionState=${player.reactionState}, y=${player.position.y}, reactionRemaining=${player.handfeel.reactionRemaining}`);

// 等待落地和 reactionState 恢复（最多 100 帧）
for (let i = 0; i < 100; i++) {
  kernel.tick();
  if (!player.currentAction && player.position.y === 0 && player.reactionState === "none") {
    console.log(`第 ${i} 帧恢复正常: reactionState=${player.reactionState}`);
    break;
  }
}

console.log(`恢复后: action=${player.currentAction?.actionName}, reactionState=${player.reactionState}, y=${player.position.y}`);

// 现在按 ArrowDown 移动
kernel.press("ArrowDown");
for (let i = 0; i < 10; i++) {
  kernel.tick();
}
kernel.release("ArrowDown");

// 检查是否向下移动了
const moved = player.position.z > startZ;
console.log(`ArrowDown 移动结果: z ${startZ} → ${player.position.z}, moved=${moved}`);

if (!moved) {
  console.log(`DEBUG: reactionState=${player.reactionState}, currentAction=${player.currentAction?.actionName}, reactionRemaining=${player.handfeel.reactionRemaining}`);
}

assert.ok(moved, `Player should move down after Jump+Hit (z should increase from ${startZ}, but reactionState=${player.reactionState})`);

console.log(`✓ Jump 过程中被打中后 ArrowDown 移动正常`);
