import { readFileSync } from "node:fs";
import { assert } from "./test-utils.js";

const source = readFileSync("scripts/validate-combat-boundaries.mjs", "utf8");

assert.ok(!source.includes("grep "), "validate-combat-boundaries must not depend on grep; CI includes Windows verify");
assert.ok(!source.includes("execSync("), "validate-combat-boundaries should use Node-native filesystem scanning");

console.log("validate-combat-boundaries-portable: no shell grep dependency");
