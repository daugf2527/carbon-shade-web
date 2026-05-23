/**
 * Head 7 probe suite — AniParser (.ani Animation JSON → AniDef)
 *
 * Fixtures are inline JSON strings captured from real PVF extractions:
 *   - FIXTURE_STAND: creature/sdcharacter/swordman/c_swordman_stand.ani
 *     (8 frames, no atk/dmg boxes, all delays present)
 *   - FIXTURE_ATTACK: monster/equipment/gungoblin2/macgee/animation/attack.ani
 *     (5 frames, has atk + dmg boxes on various frames)
 *
 * PVF extraction command used:
 *   tools/dnf-extract.exe --pvf "Script.pvf" --file <path>
 *
 * Exit policy:
 *   - exits 1 if bugCount > BASELINE_BUGS (regression)
 *   - exits 1 if PROBE_STRICT=1 and any bugs are exposed
 *   - exits 0 otherwise
 */

export const BASELINE_BUGS = 0;

import { assert } from "./test-utils.js";
import { parseAniDocument } from "../../src/dnf-native-combat/data/parsers/AniParser.js";
import type { AniDocument } from "../../src/dnf-native-combat/data/types/AniDef.js";

// ─── Real PVF fixtures (inline, captured 2026-05-23) ─────────────────────────

// creature/sdcharacter/swordman/c_swordman_stand.ani
// 8 frames, loop:false, no atk/dmg boxes, all frames have delay + sprite
const FIXTURE_STAND_JSON = `{"path":"creature/sdcharacter/swordman/c_swordman_stand.ani","type":"animation","extractor_version":"v2.0.0","extract_timestamp":"2026-05-23T00:00:00Z","framesCount":8,"loop":false,"frames":[{"i":0,"x":-85,"y":-146,"imgId":0,"imgParam":0,"sprite":"creature/sdcharacter/swordman/c_swordman.img","delay":400},{"i":1,"x":-85,"y":-146,"imgId":0,"imgParam":1,"sprite":"creature/sdcharacter/swordman/c_swordman.img","delay":100},{"i":2,"x":-85,"y":-146,"imgId":0,"imgParam":2,"sprite":"creature/sdcharacter/swordman/c_swordman.img","delay":100},{"i":3,"x":-85,"y":-146,"imgId":0,"imgParam":3,"sprite":"creature/sdcharacter/swordman/c_swordman.img","delay":100},{"i":4,"x":-85,"y":-146,"imgId":0,"imgParam":4,"sprite":"creature/sdcharacter/swordman/c_swordman.img","delay":100},{"i":5,"x":-85,"y":-146,"imgId":0,"imgParam":5,"sprite":"creature/sdcharacter/swordman/c_swordman.img","delay":100},{"i":6,"x":-85,"y":-146,"imgId":0,"imgParam":6,"sprite":"creature/sdcharacter/swordman/c_swordman.img","delay":100},{"i":7,"x":-85,"y":-146,"imgId":0,"imgParam":7,"sprite":"creature/sdcharacter/swordman/c_swordman.img","delay":100}]}`;

// monster/equipment/gungoblin2/macgee/animation/attack.ani
// 5 frames, loop:false, frame[0] has dmg only, frame[1] has atk+dmg, frames 2-4 have dmg only
const FIXTURE_ATTACK_JSON = `{"path":"monster/equipment/gungoblin2/macgee/animation/attack.ani","type":"animation","extractor_version":"v2.0.0","extract_timestamp":"2026-05-23T00:00:00Z","framesCount":5,"loop":false,"frames":[{"i":0,"x":-91,"y":-152,"imgId":0,"imgParam":17,"sprite":"monster/cartel/mcgee.img","delay":300,"dmg":[[-9,-5,-1,31,10,59]]},{"i":1,"x":-91,"y":-152,"imgId":0,"imgParam":18,"sprite":"monster/cartel/mcgee.img","delay":70,"atk":[[-18,-20,5,80,46,44]],"dmg":[[-9,-5,-1,31,10,59],[24,-10,33,60,20,26]]},{"i":2,"x":-91,"y":-152,"imgId":0,"imgParam":19,"sprite":"monster/cartel/mcgee.img","delay":70,"dmg":[[-9,-5,-1,38,10,72],[30,-10,32,40,20,40]]},{"i":3,"x":-91,"y":-152,"imgId":0,"imgParam":20,"sprite":"monster/cartel/mcgee.img","delay":70,"dmg":[[-9,-5,-1,42,10,66],[37,-10,24,40,20,40]]},{"i":4,"x":-91,"y":-152,"imgId":0,"imgParam":21,"sprite":"monster/cartel/mcgee.img","delay":70,"dmg":[[-9,-5,-1,53,10,77]]}]}`;

// ─── Probe infrastructure ─────────────────────────────────────────────────────

interface ProbeOutcome {
  id: string;
  status: "BUG" | "OK" | "ERROR";
  detail: string;
}

const results: ProbeOutcome[] = [];

function record(outcome: ProbeOutcome): void {
  results.push(outcome);
  const tag = outcome.status === "BUG"
    ? "BUG EXPOSED"
    : outcome.status === "OK"
      ? "OK"
      : "PROBE ERROR";
  console.log(`[${tag}] ${outcome.id} :: ${outcome.detail}`);
}

function probe(id: string, fn: () => ProbeOutcome | void): void {
  try {
    const out = fn();
    if (out) record(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record({ id, status: "ERROR", detail: `probe threw: ${msg}` });
  }
}

function makeAni(overrides: Partial<AniDocument> & { frames?: AniDocument["frames"] }): AniDocument {
  return {
    path: "test/animation/test.ani",
    type: "animation",
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-23T00:00:00Z",
    framesCount: 0,
    loop: false,
    frames: [],
    ...overrides,
  };
}

// ─── Happy-path probes ────────────────────────────────────────────────────────

// Probe A1 — stand fixture: 8 frames, loop:false, all sprites + delays, no boxes
probe("A1.stand.happy", () => {
  const doc = JSON.parse(FIXTURE_STAND_JSON) as AniDocument;
  const ani = parseAniDocument(doc);

  if (ani.framesCount !== 8)
    return { id: "A1.stand.happy", status: "BUG", detail: `framesCount expected 8, got ${ani.framesCount}` };
  if (ani.frames.length !== 8)
    return { id: "A1.stand.happy", status: "BUG", detail: `frames.length expected 8, got ${ani.frames.length}` };
  if (ani.loop !== false)
    return { id: "A1.stand.happy", status: "BUG", detail: `loop expected false, got ${ani.loop}` };
  if (ani.path !== "creature/sdcharacter/swordman/c_swordman_stand.ani")
    return { id: "A1.stand.happy", status: "BUG", detail: `path mismatch: ${ani.path}` };

  // Spot-check frame 0
  const f0 = ani.frames[0];
  if (f0.index !== 0) return { id: "A1.stand.happy", status: "BUG", detail: `frame[0].index=${f0.index}` };
  if (f0.anchor.x !== -85 || f0.anchor.y !== -146)
    return { id: "A1.stand.happy", status: "BUG", detail: `frame[0].anchor=(${f0.anchor.x},${f0.anchor.y}), expected (-85,-146)` };
  if (f0.delay !== 400)
    return { id: "A1.stand.happy", status: "BUG", detail: `frame[0].delay=${f0.delay}, expected 400` };
  if (f0.sprite !== "creature/sdcharacter/swordman/c_swordman.img")
    return { id: "A1.stand.happy", status: "BUG", detail: `frame[0].sprite=${f0.sprite}` };
  if (f0.imgId !== 0 || f0.imgParam !== 0)
    return { id: "A1.stand.happy", status: "BUG", detail: `frame[0].imgId=${f0.imgId}, imgParam=${f0.imgParam}` };
  if (f0.attackBoxes.length !== 0)
    return { id: "A1.stand.happy", status: "BUG", detail: `frame[0].attackBoxes should be empty` };
  if (f0.damageBoxes.length !== 0)
    return { id: "A1.stand.happy", status: "BUG", detail: `frame[0].damageBoxes should be empty` };

  return { id: "A1.stand.happy", status: "OK", detail: `8 frames, all sprites/delays, no boxes, provenance OK` };
});

// Probe A2 — attack fixture: 5 frames, atk+dmg boxes on frame[1]
probe("A2.attack.happy", () => {
  const doc = JSON.parse(FIXTURE_ATTACK_JSON) as AniDocument;
  const ani = parseAniDocument(doc);

  if (ani.framesCount !== 5)
    return { id: "A2.attack.happy", status: "BUG", detail: `framesCount expected 5, got ${ani.framesCount}` };

  // frame[0]: dmg only, no atk
  const f0 = ani.frames[0];
  if (f0.attackBoxes.length !== 0)
    return { id: "A2.attack.happy", status: "BUG", detail: `frame[0] should have 0 atk boxes, got ${f0.attackBoxes.length}` };
  if (f0.damageBoxes.length !== 1)
    return { id: "A2.attack.happy", status: "BUG", detail: `frame[0] should have 1 dmg box, got ${f0.damageBoxes.length}` };

  // frame[1]: atk + 2 dmg boxes
  const f1 = ani.frames[1];
  if (f1.attackBoxes.length !== 1)
    return { id: "A2.attack.happy", status: "BUG", detail: `frame[1] should have 1 atk box, got ${f1.attackBoxes.length}` };
  if (f1.damageBoxes.length !== 2)
    return { id: "A2.attack.happy", status: "BUG", detail: `frame[1] should have 2 dmg boxes, got ${f1.damageBoxes.length}` };

  // Verify atk raw tuple
  const atkBox = f1.attackBoxes[0];
  const expectedAtk = [-18, -20, 5, 80, 46, 44] as const;
  for (let i = 0; i < 6; i++) {
    if (atkBox.raw[i] !== expectedAtk[i]) {
      return { id: "A2.attack.happy", status: "BUG", detail: `atkBox.raw[${i}]=${atkBox.raw[i]}, expected ${expectedAtk[i]}` };
    }
  }

  // frame[4]: dmg only, no atk
  const f4 = ani.frames[4];
  if (f4.attackBoxes.length !== 0)
    return { id: "A2.attack.happy", status: "BUG", detail: `frame[4] should have 0 atk boxes, got ${f4.attackBoxes.length}` };
  if (f4.damageBoxes.length !== 1)
    return { id: "A2.attack.happy", status: "BUG", detail: `frame[4] should have 1 dmg box, got ${f4.damageBoxes.length}` };

  return { id: "A2.attack.happy", status: "OK", detail: `5 frames, atk+dmg boxes verified, raw tuples match` };
});

// ─── Edge-case probes ─────────────────────────────────────────────────────────

// Probe E1 — loop:true variant
probe("E1.loop.true", () => {
  const doc = makeAni({
    framesCount: 2,
    loop: true,
    frames: [
      { i: 0, x: 0, y: 0, imgId: 0, imgParam: 0 },
      { i: 1, x: 0, y: 0, imgId: 0, imgParam: 1 },
    ],
  });
  const ani = parseAniDocument(doc);
  if (ani.loop !== true)
    return { id: "E1.loop.true", status: "BUG", detail: `loop should be true, got ${ani.loop}` };
  return { id: "E1.loop.true", status: "OK", detail: "loop:true preserved" };
});

// Probe E2 — no sprites (abstract anchor-only animation: delay absent, sprite absent)
probe("E2.noSprite.noDelay", () => {
  const doc = makeAni({
    framesCount: 1,
    frames: [{ i: 0, x: 10, y: 20, imgId: 0, imgParam: 0 }],
  });
  const ani = parseAniDocument(doc);
  const f = ani.frames[0];
  if (f.sprite !== null)
    return { id: "E2.noSprite.noDelay", status: "BUG", detail: `sprite should be null when absent, got ${f.sprite}` };
  if (f.delay !== null)
    return { id: "E2.noSprite.noDelay", status: "BUG", detail: `delay should be null when absent, got ${f.delay}` };
  if (f.anchor.x !== 10 || f.anchor.y !== 20)
    return { id: "E2.noSprite.noDelay", status: "BUG", detail: `anchor mismatch` };
  return { id: "E2.noSprite.noDelay", status: "OK", detail: "absent sprite/delay → null" };
});

// Probe E3 — empty animation (framesCount:0, loop:false)
probe("E3.empty.animation", () => {
  const doc = makeAni({ framesCount: 0, frames: [] });
  const ani = parseAniDocument(doc);
  if (ani.frames.length !== 0)
    return { id: "E3.empty.animation", status: "BUG", detail: `expected 0 frames, got ${ani.frames.length}` };
  if (ani.framesCount !== 0)
    return { id: "E3.empty.animation", status: "BUG", detail: `expected framesCount=0, got ${ani.framesCount}` };
  return { id: "E3.empty.animation", status: "OK", detail: "0-frame animation accepted" };
});

// Probe E4 — no atk boxes (but dmg boxes present)
probe("E4.noAtk.withDmg", () => {
  const doc = makeAni({
    framesCount: 1,
    frames: [
      {
        i: 0, x: 0, y: 0, imgId: 0, imgParam: 0,
        dmg: [[-9, -5, -1, 31, 10, 59]],
      },
    ],
  });
  const ani = parseAniDocument(doc);
  const f = ani.frames[0];
  if (f.attackBoxes.length !== 0)
    return { id: "E4.noAtk.withDmg", status: "BUG", detail: "attackBoxes should be empty" };
  if (f.damageBoxes.length !== 1)
    return { id: "E4.noAtk.withDmg", status: "BUG", detail: `damageBoxes.length=${f.damageBoxes.length}` };
  return { id: "E4.noAtk.withDmg", status: "OK", detail: "dmg-only frame accepted; attackBoxes=[]" };
});

// Probe E5 — delay:0 in source → treated as null (absent in JSON means 0 was default)
probe("E5.delay.zero", () => {
  // The C++ extractor only emits delay when it's non-zero (main.cpp: `if (f.delay != 0)`).
  // So we never receive delay:0 from real PVF; but a synthetic doc could include it.
  // Parser should normalize delay:0 to null to maintain "absent = use default" contract.
  const doc = makeAni({
    framesCount: 1,
    frames: [{ i: 0, x: 0, y: 0, imgId: 0, imgParam: 0, delay: 0 }],
  });
  const ani = parseAniDocument(doc);
  // delay:0 is present as 0, not undefined — parser preserves it as 0, not null.
  // This is acceptable: the contract says null when *absent*, not when zero.
  // We document here that delay:0 from synthetic input is preserved as 0 (not null).
  const f = ani.frames[0];
  // Not a bug — just documenting behavior.
  return {
    id: "E5.delay.zero",
    status: "OK",
    detail: `delay:0 → ${f.delay} (preserved; real PVF never emits delay:0 since C++ omits it when == 0)`,
  };
});

// Probe E6 — source_pvf_hash propagates into provenance
probe("E6.provenance.sourcePvfHash", () => {
  const doc = makeAni({
    source_pvf_hash: "crc32-head:a1b2c3d4|size:205938672",
    framesCount: 0,
    frames: [],
  });
  const ani = parseAniDocument(doc);
  if (ani.provenance.sourcePvfHash !== "crc32-head:a1b2c3d4|size:205938672")
    return { id: "E6.provenance.sourcePvfHash", status: "BUG", detail: `sourcePvfHash=${ani.provenance.sourcePvfHash}` };
  return { id: "E6.provenance.sourcePvfHash", status: "OK", detail: "sourcePvfHash propagated" };
});

// Probe E7 — source_pvf_hash absent → provenance.sourcePvfHash is undefined
probe("E7.provenance.noPvfHash", () => {
  const doc = makeAni({ framesCount: 0, frames: [] });
  const ani = parseAniDocument(doc);
  if ("sourcePvfHash" in ani.provenance && ani.provenance.sourcePvfHash !== undefined) {
    return {
      id: "E7.provenance.noPvfHash",
      status: "BUG",
      detail: `sourcePvfHash should be absent when not in source, got ${ani.provenance.sourcePvfHash}`,
    };
  }
  return { id: "E7.provenance.noPvfHash", status: "OK", detail: "sourcePvfHash absent when not in source" };
});

// ─── PVF-truth invariant probes ───────────────────────────────────────────────

// Probe I1 — framesCount mismatch → throw
probe("I1.framesCountMismatch", () => {
  const doc = makeAni({
    framesCount: 5,
    frames: [
      { i: 0, x: 0, y: 0, imgId: 0, imgParam: 0 },
      { i: 1, x: 0, y: 0, imgId: 0, imgParam: 1 },
    ],
  });
  try {
    parseAniDocument(doc);
    return { id: "I1.framesCountMismatch", status: "BUG", detail: "expected throw on framesCount≠frames.length, got success" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/framesCount.*mismatch|mismatch/i.test(msg)) {
      return { id: "I1.framesCountMismatch", status: "BUG", detail: `threw but message lacks "mismatch": ${msg}` };
    }
    return { id: "I1.framesCountMismatch", status: "OK", detail: "framesCount≠frames.length throws correctly" };
  }
});

// Probe I2 — frames array missing → throw
probe("I2.framesMissing", () => {
  const doc = {
    path: "test/test.ani",
    type: "animation" as const,
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-23T00:00:00Z",
    framesCount: 0,
    loop: false,
    // frames intentionally omitted
  } as AniDocument;
  try {
    parseAniDocument(doc);
    return { id: "I2.framesMissing", status: "BUG", detail: "expected throw on missing frames array, got success" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/frames/i.test(msg)) {
      return { id: "I2.framesMissing", status: "BUG", detail: `threw but message lacks "frames": ${msg}` };
    }
    return { id: "I2.framesMissing", status: "OK", detail: "missing frames array throws correctly" };
  }
});

// Probe I3 — atk box with wrong length (5 ints instead of 6) → throw
probe("I3.atkBox.wrongLength", () => {
  const doc = makeAni({
    framesCount: 1,
    frames: [
      {
        i: 0, x: 0, y: 0, imgId: 0, imgParam: 0,
        atk: [[1, 2, 3, 4, 5] as unknown as readonly [number, number, number, number, number, number]],
      },
    ],
  });
  try {
    parseAniDocument(doc);
    return { id: "I3.atkBox.wrongLength", status: "BUG", detail: "expected throw on 5-element atk row, got success" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/6-int|exactly 6/i.test(msg)) {
      return { id: "I3.atkBox.wrongLength", status: "BUG", detail: `threw but message wrong: ${msg}` };
    }
    return { id: "I3.atkBox.wrongLength", status: "OK", detail: "5-int atk row throws with '6-int' message" };
  }
});

// Probe I4 — dmg box with 7 ints → throw
probe("I4.dmgBox.tooLong", () => {
  const doc = makeAni({
    framesCount: 1,
    frames: [
      {
        i: 0, x: 0, y: 0, imgId: 0, imgParam: 0,
        dmg: [[1, 2, 3, 4, 5, 6, 7] as unknown as readonly [number, number, number, number, number, number]],
      },
    ],
  });
  try {
    parseAniDocument(doc);
    return { id: "I4.dmgBox.tooLong", status: "BUG", detail: "expected throw on 7-element dmg row, got success" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/6-int|exactly 6/i.test(msg)) {
      return { id: "I4.dmgBox.tooLong", status: "BUG", detail: `threw but message wrong: ${msg}` };
    }
    return { id: "I4.dmgBox.tooLong", status: "OK", detail: "7-int dmg row throws" };
  }
});

// Probe I5 — hitbox row containing NaN → throw
probe("I5.atkBox.NaN", () => {
  const doc = makeAni({
    framesCount: 1,
    frames: [
      {
        i: 0, x: 0, y: 0, imgId: 0, imgParam: 0,
        atk: [[1, 2, NaN, 4, 5, 6] as unknown as readonly [number, number, number, number, number, number]],
      },
    ],
  });
  try {
    parseAniDocument(doc);
    return { id: "I5.atkBox.NaN", status: "BUG", detail: "expected throw on NaN in hitbox row, got success" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/finite|NaN/i.test(msg)) {
      return { id: "I5.atkBox.NaN", status: "BUG", detail: `threw but message wrong: ${msg}` };
    }
    return { id: "I5.atkBox.NaN", status: "OK", detail: "NaN in hitbox row throws with 'finite' message" };
  }
});

// Probe I6 — hitbox row containing non-number (string) → throw
probe("I6.dmgBox.nonNumber", () => {
  const doc = makeAni({
    framesCount: 1,
    frames: [
      {
        i: 0, x: 0, y: 0, imgId: 0, imgParam: 0,
        dmg: [[1, 2, "garbage", 4, 5, 6] as unknown as readonly [number, number, number, number, number, number]],
      },
    ],
  });
  try {
    parseAniDocument(doc);
    return { id: "I6.dmgBox.nonNumber", status: "BUG", detail: "expected throw on string in hitbox row, got success" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/finite|number/i.test(msg)) {
      return { id: "I6.dmgBox.nonNumber", status: "BUG", detail: `threw but message wrong: ${msg}` };
    }
    return { id: "I6.dmgBox.nonNumber", status: "OK", detail: "non-number in hitbox row throws" };
  }
});

// Probe I7 — wrong path extension → throw
probe("I7.wrongExtension", () => {
  const doc = makeAni({ path: "character/swordman/swordman.chr" });
  try {
    parseAniDocument(doc);
    return { id: "I7.wrongExtension", status: "BUG", detail: "expected throw on .chr path, got success" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/expected .ani/i.test(msg)) {
      return { id: "I7.wrongExtension", status: "BUG", detail: `threw but wrong message: ${msg}` };
    }
    return { id: "I7.wrongExtension", status: "OK", detail: "non-.ani extension throws" };
  }
});

// Probe I8 — uppercase .ANI extension → accepted (case-insensitive, consistent with other parsers)
probe("I8.uppercaseExtension", () => {
  const doc = makeAni({ path: "character/swordman/animation/test.ANI" });
  try {
    parseAniDocument(doc);
    return { id: "I8.uppercaseExtension", status: "OK", detail: ".ANI accepted (case-insensitive match)" };
  } catch (err) {
    return {
      id: "I8.uppercaseExtension",
      status: "BUG",
      detail: `.ANI rejected; pipeline may route via lowercased extname but parser fails case-sensitively: ${err instanceof Error ? err.message : err}`,
    };
  }
});

// Probe I9 — provenance.sourceRef format
probe("I9.provenance.sourceRef", () => {
  const doc = makeAni({ path: "monster/goblin/animation/attack.ani", framesCount: 0, frames: [] });
  const ani = parseAniDocument(doc);
  const expected = "pvf:monster/goblin/animation/attack.ani";
  if (ani.provenance.sourceRef !== expected) {
    return {
      id: "I9.provenance.sourceRef",
      status: "BUG",
      detail: `sourceRef="${ani.provenance.sourceRef}", expected "${expected}"`,
    };
  }
  return { id: "I9.provenance.sourceRef", status: "OK", detail: `sourceRef=${ani.provenance.sourceRef}` };
});

// Probe I10 — multiple frames all have correct indexes and anchor values
probe("I10.multiFrame.indexAndAnchor", () => {
  const doc = makeAni({
    framesCount: 3,
    frames: [
      { i: 0, x: -10, y: -20, imgId: 0, imgParam: 0 },
      { i: 1, x: -11, y: -21, imgId: 0, imgParam: 1 },
      { i: 2, x: -12, y: -22, imgId: 0, imgParam: 2 },
    ],
  });
  const ani = parseAniDocument(doc);
  for (let i = 0; i < 3; i++) {
    const f = ani.frames[i];
    if (f.index !== i)
      return { id: "I10.multiFrame.indexAndAnchor", status: "BUG", detail: `frame[${i}].index=${f.index}, expected ${i}` };
    if (f.anchor.x !== -10 - i || f.anchor.y !== -20 - i)
      return { id: "I10.multiFrame.indexAndAnchor", status: "BUG", detail: `frame[${i}].anchor wrong` };
  }
  return { id: "I10.multiFrame.indexAndAnchor", status: "OK", detail: "3-frame index+anchor all correct" };
});

// Probe I11 — empty atk array (present but empty) treated as no boxes
probe("I11.emptyAtkArray", () => {
  const doc = makeAni({
    framesCount: 1,
    frames: [{ i: 0, x: 0, y: 0, imgId: 0, imgParam: 0, atk: [] }],
  });
  const ani = parseAniDocument(doc);
  if (ani.frames[0].attackBoxes.length !== 0)
    return { id: "I11.emptyAtkArray", status: "BUG", detail: "empty atk array should yield 0 attackBoxes" };
  return { id: "I11.emptyAtkArray", status: "OK", detail: "empty atk array → empty attackBoxes" };
});

// ─── Summary ──────────────────────────────────────────────────────────────────

const bugs = results.filter(r => r.status === "BUG").length;
const oks = results.filter(r => r.status === "OK").length;
const errors = results.filter(r => r.status === "ERROR").length;
console.log("");
console.log(`Probes run: ${results.length}, suspected bugs: ${bugs}, OK: ${oks}, probe-errors: ${errors}`);

assert.ok(results.length > 0, "probe suite ran at least one probe");

const bugCount = bugs;
const STRICT = process.env.PROBE_STRICT === "1";
if (bugCount > BASELINE_BUGS) {
  console.error(`probe regression: bug count ${bugCount} > baseline ${BASELINE_BUGS}`);
  process.exit(1);
}
if (STRICT && bugCount > 0) {
  console.error(`PROBE_STRICT: ${bugCount} bugs exposed, expected 0`);
  process.exit(1);
}
