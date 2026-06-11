import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();
const prTemplate = readFileSync(join(ROOT, ".github", "pull_request_template.md"), "utf-8");
const workflow = readFileSync(
  join(ROOT, "docs", "engineering", "03-development-workflow-v0.1.md"),
  "utf-8",
);

for (const needle of [
  "Documentation pruning / convergence",
  "entry doc updated",
  "duplicate narrative avoided",
]) {
  assert.ok(prTemplate.includes(needle), `PR template should mention ${needle}`);
}

for (const needle of [
  "documentation-pruning-policy.md",
  "entry doc",
  "duplicate narrative",
]) {
  assert.ok(workflow.includes(needle), `workflow doc should mention ${needle}`);
}

console.log("documentation-review-gate: pruning review gate present");
