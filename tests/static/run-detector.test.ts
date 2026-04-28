import { assert } from "./test-utils.js";
import { RunCommandDetector } from "../../src/combat/input/RunCommandDetector.js";
import type { RawInputFrame } from "../../src/combat/input/BrowserInputState.js";

function frame(tick: number, held: string[] = [], pressed: string[] = [], released: string[] = []): RawInputFrame {
  return {
    tick,
    held: new Set(held),
    pressed: new Set(pressed),
    released: new Set(released),
  };
}

const detector = new RunCommandDetector();

const walkOnly = detector.detect(frame(1, ["ArrowRight"], ["ArrowRight"]), "right");
assert.equal(walkOnly.length, 1, "First press must emit Walk");
assert.equal(walkOnly[0]?.actionName, "Walk");

const release = detector.detect(frame(2, [], [], ["ArrowRight"]), "right");
assert.equal(release.length, 0, "Release alone must not emit Run");

const secondTap = detector.detect(frame(3, ["ArrowRight"], ["ArrowRight"]), "right");
assert.equal(secondTap.length, 0, "Second tap inside the window should arm Run without emitting it immediately");

const run = detector.detect(frame(4, ["ArrowRight"], [], []), "right");
assert.equal(run.length, 1, "Held second tap must emit Run after the hold threshold");
assert.equal(run[0]?.actionName, "Run");

detector.reset();

const firstTap = detector.detect(frame(10, ["ArrowRight"], ["ArrowRight"]), "right");
assert.equal(firstTap.length, 1, "After reset the first press should emit Walk again");

const lateRelease = detector.detect(frame(11, [], [], ["ArrowRight"]), "right");
assert.equal(lateRelease.length, 0);

const outsideWindow = detector.detect(frame(22, ["ArrowRight"], ["ArrowRight"]), "right");
assert.equal(outsideWindow.length, 1, "A tap outside the double-tap window should stay Walk");
assert.equal(outsideWindow[0]?.actionName, "Walk");

detector.reset();

detector.detect(frame(30, ["ArrowRight"], ["ArrowRight"]), "right");
detector.detect(frame(31, [], [], ["ArrowRight"]), "right");
const shortHoldArm = detector.detect(frame(32, ["ArrowRight"], ["ArrowRight"]), "right");
assert.equal(shortHoldArm.length, 0, "Run should not emit until the second tap is held for at least 2 frames");
const shortHoldRelease = detector.detect(frame(33, [], [], ["ArrowRight"]), "right");
assert.equal(shortHoldRelease.length, 0, "Releasing before the hold threshold must not emit Run");
