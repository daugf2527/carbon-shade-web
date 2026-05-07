import { assert } from "./test-utils.js";
import type { HitBoxFrameWindow } from "../../src/combat/types.js";
import { createActor } from "../../src/combat/actors/ActorFactory.js";
import { HitResolver2D5 } from "../../src/combat/hit/HitResolver2D5.js";
import { HitDecisionResolver } from "../../src/combat/hit/HitDecisionResolver.js";
import { getAction } from "../../src/combat/actions/FrameDataAction.js";

function beginActiveAction(): void {
  player.currentAction = {
    id: "shape-action",
    actionName: "RagingFury",
    ownerId: player.id,
    startTick: 0,
    localFrame: 1,
    phase: "active",
    commandSource: "debug",
    lockedFacing: player.facing,
    facingLocked: true,
    movementLocked: true,
    activeHitboxIds: [],
    alreadyHitByGroup: new Map(),
    hitConfirmed: false,
    armorHitConfirmed: false,
    downedHitConfirmed: false,
    whiffed: false,
    cancelTokens: [],
    interrupted: false,
    hitStopFrozen: false,
  };
}

const player = createActor("player", "player", "player", 260, 0);
const resolver = new HitResolver2D5();
const decisions = new HitDecisionResolver();
const base = getAction("RagingFury").active[0];
assert.ok(base);

beginActiveAction();
const circleAoE: HitBoxFrameWindow = {
  ...base,
  id: "test_circle_aoe",
  hitGroupId: "test_circle_aoe",
  shape: "circle",
  offsetX: 0,
  offsetZ: 0,
  offsetY: 26,
  radius: 150,
  w: 300,
  d: 300,
  h: 80,
};

const inside = createActor("inside", "enemy", "enemy", player.position.x + 149, 0);
const outside = createActor("outside", "enemy", "enemy", player.position.x + 190, 0);
const query = resolver.buildQuery(1, player, circleAoE);

const insideGeometry = resolver.geometry(query, inside);
const insideDecision = decisions.decide(1, query, circleAoE, player, inside, insideGeometry);
assert.equal(insideGeometry.overlap, true, "150px circle AoE should overlap a target whose center is inside the radius");
assert.equal(insideDecision.accepted, true);

const outsideGeometry = resolver.geometry(query, outside);
const outsideDecision = decisions.decide(1, query, circleAoE, player, outside, outsideGeometry);
assert.equal(outsideGeometry.overlap, false, "150px circle AoE should reject a target fully outside the radius");
assert.equal(outsideDecision.accepted, false);

const rectTarget = createActor("rect-target", "enemy", "enemy", player.position.x + 70, 0);
const rectQuery = resolver.buildQuery(1, player, base);
const rectDecision = decisions.decide(1, rectQuery, base, player, rectTarget, resolver.geometry(rectQuery, rectTarget));
assert.equal(rectQuery.shape, "rect", "Legacy hitboxes should default to rect shape");
assert.equal(rectDecision.accepted, true, "Legacy rectangle hit behavior must remain intact");

const grabAttach: HitBoxFrameWindow = {
  ...base,
  id: "test_grab_attach",
  hitGroupId: "test_grab_attach",
  shape: "grab_attach",
  offsetX: 50,
  w: 100,
  d: 40,
  h: 60,
};
const grabQuery = resolver.buildQuery(1, player, grabAttach);
const grabNear = createActor("grab-near", "enemy", "enemy", player.position.x + 80, 0);
const grabEdge = createActor("grab-edge", "enemy", "enemy", player.position.x + 40, 0);
assert.equal(resolver.geometry(grabQuery, grabNear).overlap, true, "grab_attach should use the local narrowed grab window");
assert.equal(resolver.geometry(grabQuery, grabEdge).overlap, false, "grab_attach should not claim official geometry beyond the local narrowed window");
