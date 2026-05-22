// Head 2 — PvfDocumentLoader robustness probes.
// Pure-parser probes test parseDnfExtractPipeOutput + buildDnfExtractPipeArgs in-process.
// Subprocess probe runs spawn with a non-existent executable and asserts rejection.
// Style: probes never throw out of try/catch — log "BUG EXPOSED" / "OK" instead.

import { assert } from "./test-utils.js";
import {
  buildDnfExtractPipeArgs,
  parseDnfExtractPipeOutput,
  loadPvfDocumentsViaPipe,
} from "../../src/dnf-native-combat/data/parsers/PvfDocumentLoader.js";

let bugs = 0;
let oks = 0;
function bug(msg: string): void {
  bugs += 1;
  console.log(`BUG EXPOSED: ${msg}`);
}
function ok(msg: string): void {
  oks += 1;
  console.log(`OK: ${msg}`);
}

// ---------------------------------------------------------------------------
// buildDnfExtractPipeArgs
// ---------------------------------------------------------------------------

{
  const args = buildDnfExtractPipeArgs({ pvfPath: "D:/dnf/Script.pvf" });
  assert.deepEqual(args, ["--pvf", "D:/dnf/Script.pvf", "--pipe"]);
  ok("buildDnfExtractPipeArgs returns [--pvf, path, --pipe]");
}

{
  // Unicode + spaces in path — spawn argv handles spaces, but verify build doesn't mangle.
  const cnPath = "D:/Baidu下载/DNF客户端/Script.pvf";
  const args = buildDnfExtractPipeArgs({ pvfPath: cnPath });
  if (args[1] !== cnPath) bug(`Unicode path mangled: ${args[1]}`);
  else ok("buildDnfExtractPipeArgs preserves Unicode path verbatim");
}

// ---------------------------------------------------------------------------
// parseDnfExtractPipeOutput — boundary cases
// ---------------------------------------------------------------------------

// Probe #1: empty string
try {
  const r = parseDnfExtractPipeOutput("");
  if (r.length === 0) ok("empty stdout → [] (no crash)");
  else bug(`empty stdout returned ${r.length} docs, expected 0`);
} catch (e) {
  bug(`empty stdout threw: ${(e as Error).message}`);
}

// Probe #2: whitespace only
try {
  const r = parseDnfExtractPipeOutput("\n\n\r\n   \r\n");
  if (r.length === 0) ok("whitespace-only stdout → []");
  else bug(`whitespace-only stdout returned ${r.length} docs`);
} catch (e) {
  bug(`whitespace-only stdout threw: ${(e as Error).message}`);
}

// Probe #3: only separators, no documents
try {
  const r = parseDnfExtractPipeOutput("\n---\n\n---\n\n---\n");
  if (r.length === 0) ok("separator-only stdout → []");
  else bug(`separator-only returned ${r.length} docs`);
} catch (e) {
  bug(`separator-only threw: ${(e as Error).message}`);
}

// Probe #4: CRLF separator (Windows line endings)
try {
  const doc = JSON.stringify({
    extractor_version: "v",
    extract_timestamp: "t",
    source_pvf_hash: "h",
    path: "a.atk",
    type: "document",
    sections: [],
  });
  const out = `${doc}\r\n---\r\n${doc.replace("a.atk", "b.atk")}\r\n---\r\n`;
  const r = parseDnfExtractPipeOutput(out);
  if (r.length === 2 && r[0]?.path === "a.atk" && r[1]?.path === "b.atk")
    ok("CRLF separators correctly split into 2 docs");
  else bug(`CRLF split produced ${r.length} docs: ${JSON.stringify(r.map(d => d.path))}`);
} catch (e) {
  bug(`CRLF split threw: ${(e as Error).message}`);
}

// Probe #5: single doc with no trailing --- separator
try {
  const doc = JSON.stringify({
    extractor_version: "v",
    extract_timestamp: "t",
    source_pvf_hash: "h",
    path: "x.atk",
    type: "document",
    sections: [],
  });
  const r = parseDnfExtractPipeOutput(`${doc}\n`);
  if (r.length === 1 && r[0]?.path === "x.atk") ok("single doc no trailing --- still parses");
  else bug(`single doc no --- produced ${r.length} docs`);
} catch (e) {
  bug(`single doc no --- threw: ${(e as Error).message}`);
}

// Probe #6: single doc with trailing CRLF only (no separator)
try {
  const doc = JSON.stringify({
    extractor_version: "v", extract_timestamp: "t", source_pvf_hash: "h",
    path: "y.atk", type: "document", sections: [],
  });
  const r = parseDnfExtractPipeOutput(`${doc}\r\n`);
  if (r.length === 1) ok("single doc + CRLF (no ---) parses as 1 doc");
  else bug(`single doc + CRLF (no ---) returned ${r.length} docs`);
} catch (e) {
  bug(`single doc + CRLF threw: ${(e as Error).message}`);
}

// Probe #7: INVALID JSON — truncated brace. Verify error message includes chunk context.
try {
  parseDnfExtractPipeOutput("{ \"oops\": ");
  bug("invalid JSON did NOT throw (silent corruption)");
} catch (e) {
  const msg = (e as Error).message;
  // The current implementation just lets JSON.parse propagate; no chunk context.
  if (msg.includes("oops") || msg.includes("chunk") || msg.toLowerCase().includes("dnf-extract")) {
    ok(`invalid JSON error includes context: ${msg.slice(0, 80)}`);
  } else {
    bug(`invalid JSON error is opaque (no chunk/source context): "${msg}". Downstream debugging will be painful when the C++ tool emits a malformed frame.`);
  }
}

// Probe #8: invalid JSON in 2nd chunk — first chunk OK, second corrupt.
try {
  const goodDoc = JSON.stringify({
    extractor_version: "v", extract_timestamp: "t", source_pvf_hash: "h",
    path: "good.atk", type: "document", sections: [],
  });
  parseDnfExtractPipeOutput(`${goodDoc}\n---\n{not json}\n---\n`);
  bug("invalid 2nd chunk silently accepted");
} catch (e) {
  const msg = (e as Error).message;
  if (msg.includes("good.atk") || msg.includes("chunk") || msg.includes("index 1")) {
    ok("2nd-chunk JSON error identifies position");
  } else {
    bug(`2nd-chunk JSON error lacks index/path locator: "${msg}". Hard to find which file produced bad output.`);
  }
}

// Probe #9: error doc with missing path AND error fields
try {
  parseDnfExtractPipeOutput(`${JSON.stringify({ type: "error" })}\n---\n`);
  bug("error doc with no path/error did NOT throw");
} catch (e) {
  const msg = (e as Error).message;
  if (msg.includes("undefined")) {
    bug(`error doc missing fields produces literal "undefined" in message: "${msg}". Should fall back to a meaningful placeholder.`);
  } else if (msg.includes("unknown")) {
    ok(`error doc missing fields produces "unknown" placeholder: ${msg}`);
  } else {
    ok(`error doc missing fields throws cleanly: ${msg}`);
  }
}

// Probe #10: error doc with only `error` field, no path
try {
  parseDnfExtractPipeOutput(`${JSON.stringify({ type: "error", error: "boom" })}\n---\n`);
  bug("error doc no path did NOT throw");
} catch (e) {
  const msg = (e as Error).message;
  if (msg.includes("undefined")) {
    bug(`error doc no path shows "undefined" instead of <unknown>: "${msg}"`);
  } else {
    ok(`error doc no path throws: ${msg}`);
  }
}

// Probe #11: non-error, non-document type passes through with possibly missing `path`.
// Per C++ source: --pipe normally emits document/animation/text/error.
// But --resolve / --frame / --list emit other types. If those EVER leak into --pipe
// (or pipeline downstream), loader passes them through; parseStage will then call
// extname(undefined) and crash with a confusing TypeError.
try {
  // animation type is a legitimate --pipe output for .ani files.
  const animDoc = JSON.stringify({
    type: "animation",
    framesCount: 3,
    frames: [{ i: 0, x: 0, y: 0, delay: 100, atk: [], dmg: [], sprite: "" }],
    // NOTE: no `path` field at all in animation-mode output per C++ source.
  });
  const r = parseDnfExtractPipeOutput(`${animDoc}\n---\n`);
  if (r.length === 1) {
    const path = (r[0] as { path?: string }).path;
    if (path === undefined) {
      bug(`animation doc passes through with path=undefined. parsePvfDocument will call extname(undefined) → TypeError. Loader should at minimum warn or filter non-document types.`);
    } else {
      ok(`animation doc carries a path: ${path}`);
    }
  }
} catch (e) {
  bug(`animation doc threw unexpectedly: ${(e as Error).message}`);
}

// Probe #12: pvf_list / npk / frame / resolved_frame types (also no .atk-style path)
{
  const exoticTypes = ["pvf_list", "npk", "frame", "resolved_frame", "img", "text"];
  let leakedCount = 0;
  for (const t of exoticTypes) {
    try {
      const r = parseDnfExtractPipeOutput(`${JSON.stringify({ type: t })}\n---\n`);
      if (r.length === 1) {
        leakedCount += 1;
      }
    } catch (e) {
      // unexpected — only error type is supposed to throw
    }
  }
  if (leakedCount === exoticTypes.length) {
    bug(`${leakedCount}/${exoticTypes.length} non-document types (pvf_list/npk/frame/resolved_frame/img/text) silently pass through the loader. None of them have a 'path' field; downstream parseStage will TypeError on extname(undefined). Loader should filter or coerce.`);
  } else {
    ok(`${exoticTypes.length - leakedCount} non-document types are filtered`);
  }
}

// Probe #13: error type that's a non-string (e.g. tool emits error: number/object)
try {
  parseDnfExtractPipeOutput(`${JSON.stringify({ type: "error", path: "p.atk", error: { code: 42 } })}\n---\n`);
  bug("error with object .error did NOT throw");
} catch (e) {
  const msg = (e as Error).message;
  if (msg.includes("[object Object]")) {
    bug(`error object stringified as "[object Object]": "${msg}". Should JSON.stringify the error payload.`);
  } else {
    ok(`error object placeholder: ${msg}`);
  }
}

// Probe #14: very large stderr / mixed payload — verify behavior of trim+filter on a doc
// that has internal --- inside string data (escaped).
try {
  const doc = JSON.stringify({
    extractor_version: "v", extract_timestamp: "t", source_pvf_hash: "h",
    path: "weird.atk", type: "document",
    sections: [{ name: "data with ---", attributes: [{ t: "str", v: "value containing\n---\ninside string" }] }],
  });
  // The doc's JSON-encoded form has `\n---\n` inside a string literal.
  // Stringified JSON escapes \n → "\n" so the split regex won't see real newlines.
  const r = parseDnfExtractPipeOutput(`${doc}\n---\n`);
  if (r.length === 1) ok("doc with literal '---' inside escaped JSON string survives split");
  else bug(`doc with internal '---' split into ${r.length} chunks (split regex too eager)`);
} catch (e) {
  bug(`internal '---' doc threw: ${(e as Error).message}`);
}

// Probe #15: leading separator (doc emitted with leading blank line + ---)
try {
  const doc = JSON.stringify({
    extractor_version: "v", extract_timestamp: "t", source_pvf_hash: "h",
    path: "lead.atk", type: "document", sections: [],
  });
  const r = parseDnfExtractPipeOutput(`\n---\n${doc}\n---\n`);
  if (r.length === 1) ok("leading separator tolerated");
  else bug(`leading separator: got ${r.length} docs, expected 1`);
} catch (e) {
  bug(`leading separator threw: ${(e as Error).message}`);
}

// Probe #16: real-world pattern from C++ source — note line 1217 emits "---\n" even on filter skip
// so streams can contain MANY consecutive separators with empty chunks between them.
try {
  const doc = JSON.stringify({
    extractor_version: "v", extract_timestamp: "t", source_pvf_hash: "h",
    path: "after-skips.atk", type: "document", sections: [],
  });
  const out = `---\n---\n---\n${doc}\n---\n---\n`;
  const r = parseDnfExtractPipeOutput(out);
  if (r.length === 1 && r[0]?.path === "after-skips.atk")
    ok("multiple empty --- separators (filter-ext skip pattern) handled correctly");
  else bug(`consecutive --- separators broke parsing: ${r.length} docs`);
} catch (e) {
  bug(`consecutive --- threw: ${(e as Error).message}`);
}

// ---------------------------------------------------------------------------
// loadPvfDocumentsViaPipe — subprocess error paths (no live dnf-extract)
// ---------------------------------------------------------------------------

// Probe #17: non-existent executable. Should reject, not hang.
{
  const fakePath = "/nonexistent/path/should-not-exist-dnf-extract-xyz123";
  let resolved = false;
  let rejected = false;
  let errorMsg = "";
  try {
    const p = loadPvfDocumentsViaPipe(["dummy.atk"], {
      pvfPath: "fake.pvf",
      executablePath: fakePath,
    });
    // Add a timeout so a hanging child doesn't lock CI.
    const timed = await Promise.race([
      p.then(() => { resolved = true; return "resolved" as const; }),
      p.catch((e: Error) => { rejected = true; errorMsg = e.message; return "rejected" as const; }),
      new Promise<"timeout">(resolve => setTimeout(() => resolve("timeout"), 5000)),
    ]);
    if (timed === "timeout") {
      bug("loadPvfDocumentsViaPipe with non-existent executable did NOT settle within 5s — no timeout safety, hanging test risk");
    } else if (resolved) {
      bug("loadPvfDocumentsViaPipe with non-existent executable RESOLVED (should have rejected)");
    } else if (rejected) {
      ok(`loadPvfDocumentsViaPipe rejects on missing executable: ${errorMsg.slice(0, 80)}`);
    }
  } catch (e) {
    // Either p threw synchronously or Promise.race threw. Either way: at least it didn't hang.
    const msg = (e as Error).message;
    ok(`loadPvfDocumentsViaPipe surfaced spawn error: ${msg.slice(0, 80)}`);
  }
}

// Probe #18: platform default executable path. Loader hardcodes ".exe" on all OSes,
// but scripts/pipeline.mjs (line 6) correctly switches between win32/linux paths.
// This is a real divergence — verify by inspection of args, since the default is internal.
{
  // We can't observe `executablePath ?? "tools/dnf-extract.exe"` directly without spawning,
  // but the build args are public.
  const args = buildDnfExtractPipeArgs({ pvfPath: "x" });
  // If a user calls loadPvfDocumentsViaPipe without executablePath on Linux/macOS,
  // spawn("tools/dnf-extract.exe", ...) will fail with ENOENT. pipeline.mjs avoids
  // this by always passing executablePath; tests that drive the loader directly
  // (none currently) would hit it.
  if (process.platform !== "win32") {
    bug(`PvfDocumentLoader.ts:31 hardcodes "tools/dnf-extract.exe" as default but current platform is ${process.platform}. scripts/pipeline.mjs:6 has the correct platform switch; loader does not. Callers that omit executablePath on non-Windows will get ENOENT.`);
  } else {
    ok(`platform is win32; default "tools/dnf-extract.exe" matches. (Loader still hardcodes .exe; non-Windows callers must pass executablePath.)`);
    // Still report it as a latent bug.
    bug("LATENT: PvfDocumentLoader.ts:31 default executable is win32-only; non-Windows callers must always pass executablePath. scripts/pipeline.mjs:6 has the proper platform switch — loader should mirror it.");
  }
  // Suppress unused-var lint
  void args;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`dnf-native-h2-loader-probes: ${oks} OK / ${bugs} BUG EXPOSED entries`);
// Probes never fail the build — they just report. (Per Head 2 spec.)
