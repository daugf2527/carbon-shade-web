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

const KEYS = [
  "KeyX", "KeyZ", "KeyC", "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
];

const ACTIONS = [
  "attack1", "UpwardSlash", "RagingFury", "Backstep",
  "dashattack", "jump", "MountainousWheel", "Bloodlust",
  "FrenzyToggle", "Derange", "ForceBleed", "move", "dash",
];

// --- Test 1: No-crash fuzz — random input sequences must never throw ---
{
  const SEED = 12345;
  const rng = mulberry32(SEED);
  const SEQUENCES = 50;

  let crashes = 0;
  for (let i = 0; i < SEQUENCES; i++) {
    const k = new CombatKernel({ enableReplay: true });
    const steps = 3 + Math.floor(rng() * 40);
    try {
      for (let j = 0; j < steps; j++) {
        const choice = rng();
        if (choice < 0.15) {
          k.press(KEYS[Math.floor(rng() * KEYS.length)]!);
        } else if (choice < 0.25) {
          k.release(KEYS[Math.floor(rng() * KEYS.length)]!);
        } else if (choice < 0.35) {
          const action = ACTIONS[Math.floor(rng() * ACTIONS.length)]!;
          k.requestAction(k.player, action as Parameters<typeof k.requestAction>[1]);
          k.runTicks(1 + Math.floor(rng() * 3));
        } else {
          k.runTicks(1 + Math.floor(rng() * 8));
        }
      }
    } catch (err) {
      crashes++;
      console.log(`CRASH seq ${i}: ${(err as Error).message}`);
    }
  }
  assert.equal(crashes, 0, `${crashes}/${SEQUENCES} fuzz sequences crashed`);
  console.log(`OK: 0/${SEQUENCES} fuzz sequences crashed (seed=${SEED})`);
}

// --- Test 2: Determinism — same seed must produce same final stateHash ---
{
  const SEED = 42;
  const rng = mulberry32(SEED);
  const SEQUENCES = 40;

  function runFuzzSequence(seqRng: () => number): string {
    const k = new CombatKernel({ enableReplay: true });
    const steps = 3 + Math.floor(seqRng() * 30);
    for (let j = 0; j < steps; j++) {
      const choice = seqRng();
      if (choice < 0.3) {
        k.press(KEYS[Math.floor(seqRng() * KEYS.length)]!);
      } else if (choice < 0.5) {
        k.release(KEYS[Math.floor(seqRng() * KEYS.length)]!);
      } else {
        k.runTicks(1 + Math.floor(seqRng() * 5));
      }
    }
    return k.replay.frames.at(-1)?.stateHash ?? "";
  }

  let failed = 0;
  for (let i = 0; i < SEQUENCES; i++) {
    const seedPerSeq = Math.floor(rng() * 2147483647);
    const rngA = mulberry32(seedPerSeq);
    const rngB = mulberry32(seedPerSeq);
    const hashA = runFuzzSequence(rngA);
    const hashB = runFuzzSequence(rngB);
    if (hashA !== hashB || hashA === "") {
      failed++;
      if (failed <= 3) console.log(`FAIL seq ${i}: hashA=${hashA} hashB=${hashB}`);
    }
  }
  assert.equal(failed, 0, `${failed}/${SEQUENCES} fuzz sequences failed determinism`);
  console.log(`OK: ${SEQUENCES - failed}/${SEQUENCES} sequences deterministic`);
}

// --- Test 3: Replay JSON validity — every export must be valid JSON ---
{
  const SEED = 99;
  const rng = mulberry32(SEED);
  const SEQUENCES = 30;

  for (let i = 0; i < SEQUENCES; i++) {
    const k = new CombatKernel({ enableReplay: true });
    const steps = 3 + Math.floor(rng() * 25);
    for (let j = 0; j < steps; j++) {
      const choice = rng();
      if (choice < 0.3) k.press(KEYS[Math.floor(rng() * KEYS.length)]!);
      else if (choice < 0.5) k.release(KEYS[Math.floor(rng() * KEYS.length)]!);
      else k.runTicks(1 + Math.floor(rng() * 5));
    }

    let reparsed: unknown;
    try {
      const exported = k.replay.export();
      const json = JSON.stringify(exported);
      reparsed = JSON.parse(json);
    } catch {
      throw new Error(`Seq ${i}: replay export is not valid JSON`);
    }

    const replay = reparsed as Record<string, unknown>;
    assert.equal(replay.version, "0.2-r3", `Seq ${i}: version`);
    assert.ok(typeof replay.frameCount === "number", `Seq ${i}: frameCount`);
    assert.ok(Array.isArray(replay.frames), `Seq ${i}: frames array`);
    assert.ok(typeof replay.metadata === "object" && replay.metadata !== null, `Seq ${i}: metadata`);
    const meta = replay.metadata as Record<string, unknown>;
    assert.ok(typeof meta.finalStateHash === "string" && meta.finalStateHash.length > 0, `Seq ${i}: finalStateHash`);
  }
  console.log(`OK: ${SEQUENCES} fuzz sequences produced valid replay JSON`);
}
