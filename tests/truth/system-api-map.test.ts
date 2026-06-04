/**
 * system-api-map.test.ts — P2a 真值表不变量 + .nut 第一证据可复现校验
 *
 * 验证 src/data/manifest/truth/system-api-map.ts 对 5 个 HOT 横切系统的 API 归属:
 *   T1 5 个 HOT 系统齐全且 hot
 *   T2 标志 API 归属正确 + evidence=extracted + 带 .nut sample
 *   T3 第一证据可复现:每个 extracted API 在 all-193.jsonl(.nut 提取)真实出现
 *   T4 21-Predicate 的 OOS UI/创作模式谓词被隔离(combatRelevant=false)
 *   T5 真值表内部一致性(bucket 内无重复 / callCount>0 / extracted 带 sample)
 *
 * T3 是核心:把真值表锚定到 .nut 第一证据(置信度第一级),而非静态自证。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_API_MAP,
  HOT_SYSTEM_IDS,
  bucket,
  apisForSystem,
  combatApisForSystem,
  extractedApis,
} from "../../src/data/manifest/truth/system-api-map.js";

const ROOT = process.cwd();

// 每个 HOT 系统的标志 API(extracted 主 API)
const SIGNATURE: Record<string, string> = {
  "13-DataStore": "sq_var",
  "17-Math": "sq_getRandom",
  "18-Timer": "sq_timer_",
  "20-Time": "sq_GetCurrentTime",
  "21-Predicate": "sq_IsMyControlObject",
};

// ── T1: 5 个 HOT 系统齐全 ──
for (const id of HOT_SYSTEM_IDS) {
  const b = bucket(id);
  assert.ok(b, `HOT system ${id} missing from SYSTEM_API_MAP`);
  assert.equal(b.hot, true, `${id} should be hot`);
  assert.ok(b.apis.length > 0, `${id} should declare at least one API`);
}
console.log(`T1 OK: ${HOT_SYSTEM_IDS.length} HOT systems present`);

// ── T2: 标志 API 归属 + extracted-grade ──
for (const [id, api] of Object.entries(SIGNATURE)) {
  const entry = apisForSystem(id).find((a) => a.name === api);
  assert.ok(entry, `signature API ${api} not in ${id}`);
  assert.equal(entry.evidence, "extracted", `${api} should be extracted-grade`);
  assert.ok(entry.sample, `${api} extracted must carry a .nut sample`);
  assert.equal(entry.combatRelevant, true, `${api} should be combatRelevant`);
}
console.log(`T2 OK: ${Object.keys(SIGNATURE).length} signature APIs extracted-grade`);

// ── T3: 第一证据可复现(.nut all-193.jsonl)──
// .nut 含 case variant(如 sq_isMyControlObject),故 case-insensitive 比对。
const NUT = readFileSync(
  join(ROOT, "verification/nut-samples-2026-05-27/all-193.jsonl"),
  "utf-8",
).toLowerCase();

let extractedCount = 0;
for (const a of extractedApis()) {
  assert.ok(
    NUT.includes(a.name.toLowerCase()),
    `extracted API ${a.name} not reproducible in .nut first-evidence`,
  );
  extractedCount++;
}
// 标志 API 必须全部可复现
for (const api of Object.values(SIGNATURE)) {
  assert.ok(NUT.includes(api.toLowerCase()), `signature ${api} absent from .nut first-evidence`);
}
console.log(`T3 OK: ${extractedCount} extracted APIs reproducible in .nut first-evidence`);

// ── T4: 21-Predicate OOS 隔离 ──
const predAll = apisForSystem("21-Predicate");
const predCombat = combatApisForSystem("21-Predicate");
const oos = predAll.filter((a) => !a.combatRelevant);
assert.ok(oos.length >= 3, `expected OOS UI predicates isolated, got ${oos.length}`);
for (const a of oos) {
  assert.ok(!predCombat.some((c) => c.name === a.name), `OOS ${a.name} leaked into combat predicate set`);
}
assert.ok(
  predCombat.some((a) => a.name === "sq_IsMyControlObject"),
  "control-object predicate must be combat-relevant",
);
console.log(`T4 OK: ${oos.length} OOS UI predicates isolated from 21-Predicate combat set`);

// ── T5: 内部一致性 ──
let total = 0;
for (const b of SYSTEM_API_MAP) {
  const seen = new Set<string>();
  for (const a of b.apis) {
    assert.ok(!seen.has(a.name), `duplicate API ${a.name} within ${b.id}`);
    seen.add(a.name);
    assert.ok(a.callCount > 0, `${a.name} callCount must be > 0`);
    if (a.evidence === "extracted") assert.ok(a.sample, `${a.name} extracted needs sample`);
    total++;
  }
}
console.log(`T5 OK: ${total} APIs across ${SYSTEM_API_MAP.length} buckets, no in-bucket duplicates`);

console.log("\n✅ P2a system-api-map truth test passed");
