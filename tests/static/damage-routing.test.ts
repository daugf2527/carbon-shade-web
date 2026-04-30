import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const k = new CombatKernel();
const grunt = k.actors.find(a => a.id === "grunt")!;

k.status.applyBleed(grunt, "player", "ForceBleed", k.tickCount, k.bus, 1);
k.runTicks(35);

const bleedDamageIds = new Set(
  k.bus.archive
    .filter(e => e.type === "DamageApplied" && (e.payload as Record<string, unknown>).sourceKind === "status_dot")
    .map(e => e.correlationId)
);
assert.ok(bleedDamageIds.size > 0, "Bleed DOT must produce at least one DamageApplied event");

const bleedReactions = k.bus.archive.filter(
  e => e.type === "ReactionRequested" && bleedDamageIds.has(e.correlationId)
);
assert.equal(bleedReactions.length, 0,
  `Expected 0 ReactionRequested from status_dot, got ${bleedReactions.length}`);

const bleedHitStops = k.bus.archive.filter(
  e => e.type === "HitStopStarted" && bleedDamageIds.has(e.correlationId)
);
assert.equal(bleedHitStops.length, 0,
  `Expected 0 HitStopStarted from status_dot, got ${bleedHitStops.length}`);
