// Repro: Jump → 空中按 X (cancel 到 JumpAttack) → 角色卡在半空 y > 0 永不下落。
// 假设: Jump 上升 dy 累积到正值后被 cancel 走, JumpAttack 自身 dy 净 ~0,
//      落地后 reactionState='none', 没有任何系统把 y 拉回 0。
import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const kernel = new CombatKernel({ enableReplay: false });
const player = kernel.player;

const log = (label: string) =>
  console.log(`${label.padEnd(28)} y=${player.position.y.toFixed(2).padStart(8)} action=${player.currentAction?.actionName ?? "-"} reaction=${player.reactionState} frame=${player.currentAction?.localFrame ?? "-"}`);

log("initial");
assert.equal(player.position.y, 0, "起始 y 应为 0");

// 1) 按下 Jump
kernel.press("KeyC");
kernel.tick();
kernel.release("KeyC");
log("press Jump + tick 1");

// 2) 跳到上升中 (Jump 上升 dy 在 frame 3-24, 我们取 frame 10 附近 - 已经累积 y>0)
for (let i = 0; i < 9; i++) kernel.tick();
log("after 10 jump frames");
const yAtCancel = player.position.y;
assert.ok(yAtCancel > 0, `Jump 上升中应当 y > 0, got ${yAtCancel}`);

// 3) 空中按 X (KeyX → NormalBasic1, kernel.ts:270 会自动改写为 JumpAttack)
kernel.press("KeyX");
kernel.tick();
kernel.release("KeyX");
log("press X (cancel)");
assert.equal(player.currentAction?.actionName, "JumpAttack", "应该 cancel 到 JumpAttack");

// 4) 跑完 JumpAttack 全部 26 帧 + 缓冲 50 帧让任何潜在重力或动作恢复
for (let i = 0; i < 80; i++) {
  kernel.tick();
  if (i === 25) log("after JumpAttack 26 frames");
  if (i === 50) log("after JumpAttack +25 buffer");
}
log("after JumpAttack +55 buffer");

// 5) 此时 currentAction 应为 null, reactionState='none', y 期望 = 0
console.log("===");
console.log(`yAtCancel (jump mid-rise): ${yAtCancel}`);
console.log(`yFinal (after full settle): ${player.position.y}`);
console.log(`yFinal === 0 ? ${player.position.y === 0}`);

// 这一句是 bug 验证的核心: 期望 y 回到 0
assert.equal(player.position.y, 0, `bug: 跳跃空中 X cancel 后 y 卡在 ${player.position.y}, 期望 0`);
