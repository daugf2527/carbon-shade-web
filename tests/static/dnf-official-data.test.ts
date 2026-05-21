// Phase 3 data-layer integrity tests.
// Verifies: completeness, three-tuple schema, tier-correctness, and the
// arithmetic identity that ties H1 peakHeight to RAW jumpPower + gravity.
import { assert } from "./test-utils.js";
import {
  DNF_PHYSICS_RAW, DNF_GRAVITY_PER_TICK_60HZ, DNF_AXIS_CONVENTION, DNF_PHYSICS_API,
  DNF_CHARACTER_STATS_RAW, DNF_JUMP_DERIVED_H1,
  SWORDMAN_ATK_RAW, SWORDMAN_ATK_DERIVED,
} from "../../src/data/official/dnf/index.js";

const EXPECTED_JOBS = [
  "swordman","demonicswordman","gunner","atgunner","priest",
  "fighter","atfighter","mage","atmage","creatormage","thief",
];

const EXPECTED_ATK = [
  "attack1","attack2","attack3","hardattack","jumpattack","dashattack","hitback",
];

const EXPECTED_DERIVED_ATK = ["attack3","hardattack","jumpattack","hitback"];

// ---------------------------------------------------------------------------
// 1. completeness
// ---------------------------------------------------------------------------
for (const job of EXPECTED_JOBS) {
  assert.ok(job in DNF_CHARACTER_STATS_RAW, `RAW missing job: ${job}`);
  assert.ok(job in DNF_JUMP_DERIVED_H1, `H1 missing job: ${job}`);
}
for (const atk of EXPECTED_ATK) {
  assert.ok(atk in SWORDMAN_ATK_RAW, `RAW missing atk: ${atk}`);
}
for (const atk of EXPECTED_DERIVED_ATK) {
  assert.ok(atk in SWORDMAN_ATK_DERIVED, `DERIVED missing atk: ${atk}`);
}

// ---------------------------------------------------------------------------
// 2. three-tuple schema {value, unit, provenance}
// ---------------------------------------------------------------------------
function checkTriple(label: string, obj: unknown): void {
  const o = obj as Record<string, unknown>;
  assert.ok(o && typeof o.value === "number", `${label}: missing numeric value`);
  assert.ok(typeof o.unit === "string" && o.unit.length > 0, `${label}: missing unit`);
  const p = o.provenance as Record<string, unknown> | undefined;
  assert.ok(p && typeof p.sourceType === "string", `${label}: missing provenance.sourceType`);
  assert.ok(typeof p.sourceRef === "string", `${label}: missing provenance.sourceRef`);
  assert.ok(typeof p.confidence === "string", `${label}: missing provenance.confidence`);
}

for (const [k, v] of Object.entries(DNF_PHYSICS_RAW)) checkTriple(`physics.${k}`, v);
checkTriple("DNF_GRAVITY_PER_TICK_60HZ", DNF_GRAVITY_PER_TICK_60HZ);
for (const [job, stats] of Object.entries(DNF_CHARACTER_STATS_RAW)) {
  for (const [f, v] of Object.entries(stats as object)) checkTriple(`stats.${job}.${f}`, v);
}
for (const [job, h1] of Object.entries(DNF_JUMP_DERIVED_H1)) {
  for (const [f, v] of Object.entries(h1 as object)) checkTriple(`H1.${job}.${f}`, v);
}
for (const [atk, raw] of Object.entries(SWORDMAN_ATK_RAW)) {
  for (const [f, v] of Object.entries(raw as object)) checkTriple(`atk-raw.${atk}.${f}`, v);
}
for (const [atk, der] of Object.entries(SWORDMAN_ATK_DERIVED)) {
  for (const [f, v] of Object.entries(der as object)) checkTriple(`atk-der.${atk}.${f}`, v);
}

// ---------------------------------------------------------------------------
// 3. tier correctness — H1 derived MUST be experimental + requiresManualVerification
// ---------------------------------------------------------------------------
for (const [job, h1] of Object.entries(DNF_JUMP_DERIVED_H1)) {
  for (const [f, v] of Object.entries(h1 as unknown as Record<string, { provenance: Record<string, unknown> }>)) {
    const p = v.provenance;
    assert.equal(p.sourceType, "experimental",
      `H1.${job}.${f}: sourceType must be experimental, got ${p.sourceType}`);
    assert.ok(p.requiresManualVerification === true,
      `H1.${job}.${f}: requiresManualVerification must be true`);
    assert.ok(typeof p.hypothesis === "string" && (p.hypothesis as string).length > 0,
      `H1.${job}.${f}: hypothesis must be named`);
    assert.ok(typeof p.falsifiableBy === "string" && (p.falsifiableBy as string).length > 0,
      `H1.${job}.${f}: falsifiableBy must describe how to disprove`);
  }
}

// RAW jumpPower / jumpSpeed MUST mark unit ambiguous (pending .exe closure)
for (const [job, stats] of Object.entries(DNF_CHARACTER_STATS_RAW)) {
  assert.equal(stats.jumpPower.unit, "ambiguous", `RAW ${job}.jumpPower unit must be 'ambiguous'`);
  assert.equal(stats.jumpSpeed.unit, "ambiguous", `RAW ${job}.jumpSpeed unit must be 'ambiguous'`);
}

// Atk RAW + derived MUST stay pvf_extraction (units closed, no hypothesis)
for (const [atk, raw] of Object.entries(SWORDMAN_ATK_RAW)) {
  const r = raw as { liftUp: { unit: string; provenance: { sourceType: string } } };
  assert.equal(r.liftUp.unit, "px/s", `atk ${atk}.liftUp unit must be px/s`);
  assert.equal(r.liftUp.provenance.sourceType, "pvf_extraction",
    `atk ${atk}.liftUp sourceType must stay pvf_extraction`);
}
for (const [atk, der] of Object.entries(SWORDMAN_ATK_DERIVED)) {
  const d = der as { peakHeight: { provenance: { sourceType: string } } };
  assert.equal(d.peakHeight.provenance.sourceType, "pvf_extraction",
    `atk-der ${atk}.peakHeight stays pvf_extraction (pure arithmetic, no hypothesis)`);
}

// ---------------------------------------------------------------------------
// 4. arithmetic identity: H1 peakHeight = v0² / (2*|g|)
// ---------------------------------------------------------------------------
const gAbs = Math.abs(DNF_PHYSICS_RAW.defaultGravityAccel.value);
for (const [job, h1] of Object.entries(DNF_JUMP_DERIVED_H1)) {
  const v0 = h1.initialZVelocity.value;
  const expectedPeak = (v0 * v0) / (2 * gAbs);
  const expectedRise = v0 / gAbs;
  assert.ok(Math.abs(h1.peakHeight.value - expectedPeak) < 1e-6,
    `H1.${job}.peakHeight: expected ${expectedPeak}, got ${h1.peakHeight.value}`);
  assert.ok(Math.abs(h1.riseTime.value - expectedRise) < 1e-6,
    `H1.${job}.riseTime: expected ${expectedRise}, got ${h1.riseTime.value}`);
}

// ---------------------------------------------------------------------------
// 5. cross-file arithmetic: SWORDMAN_ATK_DERIVED.peakHeight = liftUp² / 2g
// ---------------------------------------------------------------------------
for (const atk of EXPECTED_DERIVED_ATK) {
  const raw = (SWORDMAN_ATK_RAW as Record<string, { liftUp: { value: number } }>)[atk];
  const der = (SWORDMAN_ATK_DERIVED as Record<string, { peakHeight: { value: number } }>)[atk];
  const expected = (raw.liftUp.value * raw.liftUp.value) / (2 * gAbs);
  assert.ok(Math.abs(der.peakHeight.value - expected) < 1e-6,
    `${atk} peakHeight: expected ${expected}, got ${der.peakHeight.value}`);
}

// ---------------------------------------------------------------------------
// 6. gravity-per-tick consistency
// ---------------------------------------------------------------------------
const expectedTickGravity = DNF_PHYSICS_RAW.defaultGravityAccel.value / (60 * 60);
assert.ok(Math.abs(DNF_GRAVITY_PER_TICK_60HZ.value - expectedTickGravity) < 1e-9,
  `gravity per tick mismatch: expected ${expectedTickGravity}, got ${DNF_GRAVITY_PER_TICK_60HZ.value}`);

// ---------------------------------------------------------------------------
// 7. axis convention + API map present
// ---------------------------------------------------------------------------
assert.equal(DNF_AXIS_CONVENTION.z, "height (jump / vertical axis)");
assert.ok("setZVelocity" in DNF_PHYSICS_API);
assert.ok("setCurrentAttackUpForce" in DNF_PHYSICS_API);

console.log("dnf-official-data: all 7 assertion groups passed");
