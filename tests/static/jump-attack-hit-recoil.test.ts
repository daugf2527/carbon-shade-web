// Test: Jump+X 击中敌人时的 z 轴反作用力
import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const kernel = new CombatKernel({ enableReplay: false });
const player = kernel.player;
const grunt = kernel.actors.find(a => a.id === "grunt")!;

// 将敌人放在玩家前方，确保能击中
grunt.position.x = player.position.x + 150;
grunt.position.z = player.position.z;
grunt.position.y = 0;

const startZ = player.position.z;
console.log(`=== 初始状态 ===`);
console.log(`玩家 z=${startZ}, 敌人 z=${grunt.position.z}`);

// 执行 Jump
kernel.press("KeyC");
kernel.tick();
kernel.release("KeyC");

// Jump 10 帧
for (let i = 0; i < 10; i++) {
  kernel.tick();
}

console.log(`\n=== Jump 10 帧后 ===`);
console.log(`玩家 z=${player.position.z}, y=${player.position.y}`);

// 按 X 触发 JumpAttack
kernel.press("KeyX");
kernel.tick();
kernel.release("KeyX");

console.log(`\n=== JumpAttack 执行过程（逐帧追踪 z 轴）===`);
let hitDetected = false;
for (let i = 0; i < 30; i++) {
  const prevZ = player.position.z;
  kernel.tick();
  const currZ = player.position.z;
  const deltaZ = currZ - prevZ;

  const frame = player.currentAction?.localFrame ?? -1;

  if (deltaZ !== 0) {
    console.log(`⚠️ 帧 ${i}: z 变化！${prevZ} → ${currZ} (Δ=${deltaZ}), localFrame=${frame}, vz=${player.velocity.z}`);
    hitDetected = true;
  }

  // 在 active window (frame 6-10) 期间特别关注
  if (frame >= 6 && frame <= 10) {
    console.log(`  帧 ${i}: localFrame=${frame}, z=${currZ}, vz=${player.velocity.z}, 敌人 z=${grunt.position.z}`);
  }

  if (!player.currentAction && player.position.y === 0) {
    console.log(`\n=== 第 ${i} 帧动作结束并落地 ===`);
    break;
  }
}

const zAfterAttack = player.position.z;
console.log(`\n=== 攻击结束后 ===`);
console.log(`玩家 z=${zAfterAttack}, 偏移=${zAfterAttack - startZ}`);
console.log(`敌人 z=${grunt.position.z}, 偏移=${grunt.position.z - startZ}`);

if (!hitDetected) {
  console.log(`\n⚠️ 未检测到 z 轴变化，可能没有击中敌人或没有反作用力`);
}

// 按 ArrowDown 尝试恢复
kernel.press("ArrowDown");
for (let i = 0; i < 20; i++) {
  kernel.tick();
}
kernel.release("ArrowDown");

const zAfterDown = player.position.z;
console.log(`\n=== 按 ArrowDown 后 ===`);
console.log(`玩家 z=${zAfterDown}, 移动了=${zAfterDown - zAfterAttack}`);

if (zAfterAttack < startZ) {
  console.log(`\n✓ 检测到向后偏移（${zAfterAttack - startZ}），这符合用户描述的 bug`);
  console.log(`ArrowDown 能否恢复：${zAfterDown > zAfterAttack ? '是' : '否'}`);
} else {
  console.log(`\n⚠️ 未检测到向后偏移，可能需要其他条件触发`);
}
