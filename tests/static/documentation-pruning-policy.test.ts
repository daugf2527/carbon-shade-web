import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();
const policy = readFileSync(
  join(ROOT, "docs", "engineering", "documentation-pruning-policy.md"),
  "utf-8",
);
const docsReadme = readFileSync(join(ROOT, "docs", "README.md"), "utf-8");
const sot = readFileSync(join(ROOT, "docs", "engineering", "sot-map.md"), "utf-8");

for (const needle of [
  "# Documentation Pruning Policy",
  "## Canonical Trunk Docs",
  "## Archive Rules",
  "## Narrative Rules",
]) {
  assert.ok(policy.includes(needle), `policy should include ${needle}`);
}

for (const needle of [
  "2026-06-04-engine-native-rewrite-roadmap.md",
  "combat-retirement-audit-2026-06-10.md",
  "documentation-pruning-policy.md",
]) {
  assert.ok(docsReadme.includes(needle), `docs README should point at ${needle}`);
}

assert.ok(
  sot.includes("documentation-pruning-policy.md"),
  "sot map should point to the pruning policy for doc ownership rules",
);

console.log("documentation-pruning-policy: trunk docs and policy references present");
