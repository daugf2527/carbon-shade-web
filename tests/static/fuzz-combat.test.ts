import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const KEYS = ["KeyX", "KeyZ", "KeyC", "KeyA", "KeyD", "KeyW", "KeyS",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

function runSequence(rng: () => number): string {
  const k = new CombatKernel();
  const steps = 5 + Math.floor(rng() * 25);
  for (let i = 0; i < steps; i++) {
    const choice = rng();
    if (choice < 0.3) {
      k.press(KEYS[Math.floor(rng() * KEYS.length)]!);
    } else if (choice < 0.5) {
      k.release(KEYS[Math.floor(rng() * KEYS.length)]!);
    } else {
      k.runTicks(1 + Math.floor(rng() * 5));
    }
  }
  return k.replay.frames.at(-1)?.stateHash ?? "";
}

const SEQUENCES = 100;
const SEED = 42;
const rng = mulberry32(SEED);

let passed = 0;
let failed = 0;
for (let i = 0; i < SEQUENCES; i++) {
  const seedPerSeq = Math.floor(rng() * 2147483647);
  const seqRng1 = mulberry32(seedPerSeq);
  const seqRng2 = mulberry32(seedPerSeq);
  const hash1 = runSequence(seqRng1);
  const hash2 = runSequence(seqRng2);
  if (hash1 === hash2 && hash1 !== "") {
    passed++;
  } else {
    failed++;
    if (failed <= 3) console.log(`FAIL seq ${i}: hash1=${hash1} hash2=${hash2}`);
  }
}

assert.equal(failed, 0, `${failed}/${SEQUENCES} sequences failed determinism check`);
console.log(`OK: ${passed}/${SEQUENCES} sequences passed determinism check (seed=${SEED})`);
