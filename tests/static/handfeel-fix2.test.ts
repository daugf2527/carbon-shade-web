import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const facingKernel = new CombatKernel();
const facingPlayer = facingKernel.player;
facingKernel.press("ArrowLeft");
facingKernel.tick();
assert.equal(facingPlayer.facing, "left", "Held left must turn the player left during locomotion");
facingKernel.release("ArrowLeft");
facingKernel.press("KeyX");
facingKernel.tick();
assert.equal(facingPlayer.currentAction?.lockedFacing, "left", "Attack startup must lock the current facing");
facingKernel.release("KeyX");
facingKernel.press("ArrowRight");
facingKernel.tick();
assert.equal(facingPlayer.currentAction?.lockedFacing, "left", "Movement input must not flip an active attack hitbox");

const pushKernel = new CombatKernel();
const pushPlayer = pushKernel.player;
const grunt = pushKernel.actors.find(a => a.id === "grunt")!;
pushPlayer.position.x = 150;
pushPlayer.position.z = 0;
grunt.position.x = 156;
grunt.position.z = 0;
const beforeX = pushPlayer.position.x;
pushKernel.press("ArrowRight");
pushKernel.tick();
assert.ok(pushPlayer.position.x > beforeX, "Player locomotion should keep moving while touching a soft monster");
assert.ok(grunt.position.z !== 0 || grunt.position.x !== 156, "Soft monster should yield to player occupancy");

const armorKernel = new CombatKernel();
const building = armorKernel.actors.find(a => a.id === "building")!;
building.position.x = armorKernel.player.position.x + 90;
armorKernel.requestAction(armorKernel.player, "UpwardSlash");
armorKernel.runTicks(12);
assert.equal(building.reactionState, "armor_feedback_only", "Building armor must block launch/control");
assert.ok((building.handfeel.hitFlashRemaining ?? 0) > 0, "Armor hit must still produce visible feedback");
