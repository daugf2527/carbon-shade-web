// Test: Jump+X 详细 z 轴追踪
import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const kernel = new CombatKernel({ enableReplay: false });
const player = kernel.player;

// 记录初始 z 位置
const startZ = player.position.z;
console.log(`=== 初始状态 ===`);
console.log(`z=${startZ}, y=${player.position.y}`);

// 执行 Jump
kernel.press("KeyC");
kernel.tick();
kernel.release("KeyC");

// Jump 10 帧
for (let i = 0; i < 10; i++) {
  kernel.tick();
}

console.log(`\n=== Jump 10 帧后 ===`);
console.log(`z=${player.position.z}, y=${player.position.y}, action=${player.currentAction?.actionName}`);

// 按 X 触发 JumpAttack
kernel.press("KeyX");
kernel.tick();
kernel.release("KeyX");

console.log(`\n=== 按 X 后，逐帧追踪 ===`);
// 追踪 JumpAttack 的每一帧
for (let i = 0; i < 30; i++) {
  const action = player.currentAction?.actionName;
  const frame = player.currentAction?.localFrame ?? -1;
  const z = player.position.z;
  const y = player.position.y;
  const vz = player.velocity.z;

  console.log(`帧 ${i}: action=${action}, localFrame=${frame}, z=${z}, y=${y.toFixed(1)}, vz=${vz}`);

  kernel.tick();

  if (!player.currentAction && player.position.y === 0) {
    console.log(`\n=== 第 ${i} 帧动作结束并落地 ===`);
    break;
  }
}

const zAfterAction = player.position.z;
console.log(`\n=== 动作结束后 ===`);
console.log(`z=${zAfterAction}, 偏移=${zAfterAction - startZ}`);

// 按 ArrowDown 20 帧
console.log(`\n=== 按 ArrowDown 20 帧 ===`);
kernel.press("ArrowDown");
for (let i = 0; i < 20; i++) {
  kernel.tick();
  if (i % 5 === 0) {
    console.log(`  第 ${i} 帧: z=${player.position.z}, reactionState=${player.reactionState}`);
  }
}
kernel.release("ArrowDown");

const zAfterDown = player.position.z;
console.log(`\n=== 按 ArrowDown 后 ===`);
console.log(`z=${zAfterDown}, 移动了=${zAfterDown - zAfterAction}`);

if (zAfterAction < startZ) {
  console.log(`\n⚠️ 检测到 z 轴向上偏移（${zAfterAction - startZ}），检查 ArrowDown 是否能恢复`);
  assert.ok(zAfterDown > zAfterAction, `ArrowDown should move player back down`);
} else if (zAfterAction > startZ) {
  console.log(`\n⚠️ 检测到 z 轴向下偏移（${zAfterAction - startZ}），这不符合用户描述`);
} else {
  console.log(`\n✓ z 轴没有偏移`);
}
