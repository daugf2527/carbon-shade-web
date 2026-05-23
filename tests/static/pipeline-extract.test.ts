import { assert } from "./test-utils.js";
import {
  buildDnfExtractPipeArgs,
  parseDnfExtractPipeOutput,
} from "../../src/dnf-native-combat/data/parsers/PvfDocumentLoader.js";
import { parsePvfDocument } from "../../src/dnf-native-combat/data/pipeline/parseStage.js";
import { runExtractParsePipeline } from "../../src/dnf-native-combat/data/pipeline/pipelineRunner.js";

const args = buildDnfExtractPipeArgs({ pvfPath: "D:/dnf/Script.pvf" });
assert.deepEqual(args, ["--pvf", "D:/dnf/Script.pvf", "--pipe"]);

const output = [
  JSON.stringify({
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-22T07:00:00Z",
    source_pvf_hash: "fixture-hash",
    path: "character/swordman/attackinfo/attack3.atk",
    type: "document",
    sections: [{ name: "lift up", attributes: [{ t: "int", v: 300 }] }],
  }),
  "---",
  "",
].join("\n");

const documents = parseDnfExtractPipeOutput(output);
assert.equal(documents.length, 1);
assert.equal(documents[0]?.path, "character/swordman/attackinfo/attack3.atk");

const errorOutput = [
  JSON.stringify({ type: "error", path: "missing/path/not-found.atk", error: "not found" }),
  "---",
  "",
].join("\n");
assert.throws(
  () => parseDnfExtractPipeOutput(errorOutput),
  /missing\/path\/not-found\.atk.*not found/,
);

const parsed = parsePvfDocument(documents[0]!);
assert.equal(parsed.kind, "atk");
assert.equal(parsed.path, "character/swordman/attackinfo/attack3.atk");

const run = await runExtractParsePipeline({
  pvfPath: "fixture.pvf",
  files: ["character/swordman/attackinfo/attack3.atk"],
  debugOut: ".tmp/pipeline-test-debug",
  loadDocuments: async () => documents,
  // Day 11+: pipeline now goes EXTRACT → PARSE → VALIDATE. Disable
  // verification report writes for this loader-focused test (we don't want
  // to pollute the repo-level verification/ dir during static tests).
  verificationOutDir: null,
});

// Day 11 raised the highest-completed stage from "parse" to "validate"
// (VALIDATE L2 is integrated into pipelineRunner per design §2.2).
assert.equal(run.stage, "validate");
assert.equal(run.filesExtracted, 1);
assert.equal(run.filesParsed, 1);
assert.equal(run.parsed[0]?.kind, "atk");
// Validation report must be present and report zero failures for the happy path.
assert.equal(run.validation.stats.filesParsed, 1);
assert.equal(run.validation.stats.filesFailed, 0);
assert.equal(run.validation.stats.errors, 0);

console.log("pipeline-extract: loader args and parse routing assertions passed");
