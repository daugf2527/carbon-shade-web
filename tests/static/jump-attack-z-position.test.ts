// Test: Jump 过程中按 X 普攻，z 轴位移问题
import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const kernel = new CombatKernel({ enableReplay: false });
const player = kernel.player;

// 记录初始 z 位置
const startZ = player.position.z;
console.log(`初始位置: z=${startZ}`);

// 执行 Jump
kernel.press("KeyC");
kernel.tick();
kernel.release("KeyC");

// Jump 10 帧后按 X 普攻
for (let i = 0; i < 10; i++) {
  kernel.tick();
}

console.log(`Jump 10 帧后: z=${player.position.z}, y=${player.position.y}, action=${player.currentAction?.actionName}`);

kernel.press("KeyX");
kernel.tick();
kernel.release("KeyX");

console.log(`按 X 后: z=${player.position.z}, y=${player.position.y}, action=${player.currentAction?.actionName}`);

// 执行普攻动作（最多 50 帧）
for (let i = 0; i < 50; i++) {
  kernel.tick();
  if (i % 10 === 0) {
    console.log(`  第 ${i} 帧: z=${player.position.z}, y=${player.position.y}, action=${player.currentAction?.actionName}`);
  }
}

console.log(`普攻结束后: z=${player.position.z}, y=${player.position.y}, action=${player.currentAction?.actionName}`);

// 等待完全落地
for (let i = 0; i < 100; i++) {
  kernel.tick();
  if (!player.currentAction && player.position.y === 0) {
    console.log(`第 ${i} 帧落地: z=${player.position.z}, reactionState=${player.reactionState}`);
    break;
  }
}

const zAfterLanding = player.position.z;
console.log(`落地后位置: z=${zAfterLanding}, 偏移=${zAfterLanding - startZ}`);

// 现在按 ArrowDown 尝试回到原位
kernel.press("ArrowDown");
for (let i = 0; i < 20; i++) {
  kernel.tick();
}
kernel.release("ArrowDown");

const zAfterDown = player.position.z;
console.log(`按 ArrowDown 后: z=${zAfterDown}, 移动了=${zAfterDown - zAfterLanding}`);

// 如果 z 位置偏移了，应该能通过 ArrowDown 恢复
if (zAfterLanding !== startZ) {
  assert.ok(zAfterDown > zAfterLanding, `ArrowDown should move player back (z should increase from ${zAfterLanding})`);
  console.log(`✓ Jump+X 导致 z 偏移 ${zAfterLanding - startZ}，但 ArrowDown 可以恢复`);
} else {
  console.log(`✓ Jump+X 没有导致 z 偏移`);
}
