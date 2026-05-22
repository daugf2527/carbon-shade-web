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
});

assert.equal(run.stage, "parse");
assert.equal(run.filesExtracted, 1);
assert.equal(run.filesParsed, 1);
assert.equal(run.parsed[0]?.kind, "atk");

console.log("pipeline-extract: loader args and parse routing assertions passed");
