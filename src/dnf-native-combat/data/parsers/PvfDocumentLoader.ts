import { spawn } from "node:child_process";
import type { PvfDocument } from "../types/PvfDocument.js";
import type { AniDocument } from "../types/AniDef.js";
import type { NutTextDocument } from "../types/NutDef.js";
import type { ImgBinaryDocument } from "../types/ImgDef.js";
import type { RawPvfChunk } from "../pipeline/parseStage.js";

export interface DnfExtractPipeOptions {
  pvfPath: string;
  executablePath?: string;
  /**
   * Audit P1-20 (fixed 2026-05-28): wall-clock timeout in ms. PVF corruption
   * (e.g. malformed dirtree, infinite loop in iconv) can hang spawn forever.
   * Default 60_000 (60s) — generous enough for the largest single PVF file
   * extraction observed (~5s) but short enough to surface hangs in CI.
   * Pass 0 to disable (legacy behavior).
   */
  timeoutMs?: number;
}

/**
 * Audit P1-20 helper: spawn dnf-extract with a timeout watchdog. Returns a
 * `kill()` to be called when the child process settles, plus the timer id
 * so caller can clear it. If the timeout fires before the child exits,
 * the child is SIGKILLed; the promise chain surfaces a clear error.
 */
function spawnWithTimeout(
  executablePath: string,
  args: string[],
  timeoutMs: number,
): { child: ReturnType<typeof spawn>; clearWatchdog: () => void; timedOut: () => boolean } {
  const child = spawn(executablePath, args, {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let didTimeOut = false;
  const handle: ReturnType<typeof setTimeout> | null =
    timeoutMs > 0
      ? setTimeout(() => {
          didTimeOut = true;
          // SIGKILL — SIGTERM may not be honored if child is in C++ tight loop.
          child.kill("SIGKILL");
        }, timeoutMs)
      : null;
  return {
    child,
    clearWatchdog: () => {
      if (handle !== null) clearTimeout(handle);
    },
    timedOut: () => didTimeOut,
  };
}

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Audit pipeline-closure F6 (2026-05-24): for batch / pipeline use, callers
 * need to collect per-doc errors rather than abort on the first
 * `type:"error"` chunk. parseDnfExtractPipeOutputWithErrors returns both
 * the successful documents AND the captured errors, leaving abort policy
 * to the caller. The legacy parseDnfExtractPipeOutput keeps throw-on-first
 * semantics so H2 fixtures and any "strict" call sites stay unchanged.
 */
export interface DnfExtractPipeError {
  chunkIndex: number;
  path: string;
  message: string;
}

export interface DnfExtractPipeBatchResult {
  documents: PvfDocument[];
  errors: DnfExtractPipeError[];
  /** Counts of non-document types that were skipped (animation/text/binary/etc). */
  skippedTypes: Record<string, number>;
}

export function buildDnfExtractPipeArgs(options: DnfExtractPipeOptions): string[] {
  return ["--pvf", options.pvfPath, "--pipe"];
}

// Platform-aware default — dnf-extract is built as `.exe` on Windows and a
// bare ELF on Linux/macOS. Mirror scripts/pipeline.mjs:6 so non-Windows
// callers that omit executablePath don't ENOENT on a stray .exe suffix.
export const DEFAULT_DNF_EXTRACT_PATH = process.platform === "win32"
  ? "tools/dnf-extract.exe"
  : "tools/dnf-extract";

export function parseDnfExtractPipeOutput(stdout: string): PvfDocument[] {
  // Each document fragment is terminated by a `---` line. Between fragments,
  // the C++ tool can emit additional standalone `---` lines (one per filter
  // skip; see dnf-extract source line 1217). A regex split on `---` plus
  // newlines mangles consecutive separators ("---\n---\n" leaves a bare "---"
  // token that JSON.parse then chokes on). Tokenize line-by-line instead and
  // group lines between `---` separators into chunks.
  const lines = stdout.split(/\r?\n/);
  const chunks: string[] = [];
  let buffer: string[] = [];
  for (const line of lines) {
    if (line === "---") {
      if (buffer.length > 0) {
        chunks.push(buffer.join("\n"));
        buffer = [];
      }
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length > 0) chunks.push(buffer.join("\n"));

  const documents: PvfDocument[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    if (!chunk) continue;
    let document: PvfDocument & { error?: unknown };
    try {
      document = JSON.parse(chunk) as PvfDocument & { error?: unknown };
    } catch (parseError) {
      const preview = chunk.length > 80 ? `${chunk.slice(0, 80)}…` : chunk;
      const reason = parseError instanceof Error ? parseError.message : String(parseError);
      throw new Error(
        `dnf-extract pipe: JSON.parse failed for chunk index ${i} ` +
        `(preview: ${JSON.stringify(preview)}): ${reason}`,
      );
    }
    if (document.type === "error") {
      const path = typeof document.path === "string" && document.path.length > 0
        ? document.path
        : "<unknown>";
      // The C++ tool typically emits a string `error`, but defend against
      // object payloads (e.g. structured error codes) by JSON-stringifying
      // non-string values. Otherwise `${object}` produces "[object Object]".
      const errorPayload = typeof document.error === "string"
        ? document.error
        : document.error === undefined
          ? "unknown error"
          : JSON.stringify(document.error);
      throw new Error(`dnf-extract error for ${path} (chunk index ${i}): ${errorPayload}`);
    }
    documents.push(document);
  }
  // Audit F10 (ts-parser-truth) / F1 (pipeline-closure), 2026-05-24:
  // The bare `.filter(d => d.type === "document")` silently dropped any
  // `animation` / `text` / `binary` / `img` / `frame` / `resolved_frame`
  // chunk a caller had piped through this loader, leaving zero trace.
  // Standalone parsers (AniParser / NutExtractor / ImgParser) own those
  // types; reaching the document loader is a caller-side mismatch but not
  // a fatal one (e.g. H2/H5 explicitly mix types). Surface the skip via
  // stderr warning instead of throwing — the user sees what was dropped
  // and can correct routing.
  const documentTyped: PvfDocument[] = [];
  const nonDocumentTypes = new Map<string, number>();
  for (const doc of documents) {
    if (doc.type === "document") {
      documentTyped.push(doc);
    } else {
      nonDocumentTypes.set(doc.type, (nonDocumentTypes.get(doc.type) ?? 0) + 1);
    }
  }
  if (nonDocumentTypes.size > 0) {
    const summary = Array.from(nonDocumentTypes.entries())
      .map(([t, n]) => `${t}×${n}`)
      .join(", ");
    console.warn(
      `[PvfDocumentLoader] skipped ${documents.length - documentTyped.length} ` +
      `non-document chunk(s) [${summary}]. Route .ani via AniParser, .nut via NutExtractor, ` +
      `and IMG binaries via ImgParser. This loader handles only type:"document".`,
    );
  }
  return documentTyped;
}

/**
 * Batch-friendly variant of parseDnfExtractPipeOutput. Per audit
 * pipeline-closure F6 (2026-05-24): a single corrupt chunk should not
 * abort an entire pipeline batch — most callers want to log the error,
 * skip the failing path, and process the rest. This collects error chunks
 * into `errors[]` and returns successful documents alongside, leaving the
 * abort decision to the caller (pipelineRunner uses it; H2 strict tests
 * keep calling the throw-on-first variant above).
 */
export function parseDnfExtractPipeOutputWithErrors(stdout: string): DnfExtractPipeBatchResult {
  const lines = stdout.split(/\r?\n/);
  const chunks: string[] = [];
  let buffer: string[] = [];
  for (const line of lines) {
    if (line === "---") {
      if (buffer.length > 0) {
        chunks.push(buffer.join("\n"));
        buffer = [];
      }
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length > 0) chunks.push(buffer.join("\n"));

  const documents: PvfDocument[] = [];
  const errors: DnfExtractPipeError[] = [];
  const skippedTypes: Record<string, number> = {};

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    if (!chunk) continue;
    let document: PvfDocument & { error?: unknown };
    try {
      document = JSON.parse(chunk) as PvfDocument & { error?: unknown };
    } catch (parseError) {
      const preview = chunk.length > 80 ? `${chunk.slice(0, 80)}…` : chunk;
      const reason = parseError instanceof Error ? parseError.message : String(parseError);
      errors.push({
        chunkIndex: i,
        path: "<unparseable>",
        message: `JSON.parse failed (preview ${JSON.stringify(preview)}): ${reason}`,
      });
      continue;
    }
    if (document.type === "error") {
      const path = typeof document.path === "string" && document.path.length > 0
        ? document.path
        : "<unknown>";
      const errorPayload = typeof document.error === "string"
        ? document.error
        : document.error === undefined
          ? "unknown error"
          : JSON.stringify(document.error);
      errors.push({ chunkIndex: i, path, message: errorPayload });
      continue;
    }
    if (document.type === "document") {
      documents.push(document);
    } else {
      skippedTypes[document.type] = (skippedTypes[document.type] ?? 0) + 1;
    }
  }
  return { documents, errors, skippedTypes };
}

export async function loadPvfDocumentsViaPipe(
  paths: string[],
  options: DnfExtractPipeOptions,
): Promise<PvfDocument[]> {
  const executablePath = options.executablePath ?? DEFAULT_DNF_EXTRACT_PATH;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // audit P1-20 (fixed 2026-05-28): spawn wrapped with watchdog. PVF corruption
  // can hang in C++ tight loops (iconv/dirtree). SIGKILL after timeoutMs.
  const { child, clearWatchdog, timedOut } = spawnWithTimeout(
    executablePath,
    buildDnfExtractPipeArgs(options),
    timeoutMs,
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  // audit P2-39 (2026-05-25): stdin.write() return value unchecked — large path list can backpressure.
  for (const path of paths) child.stdin.write(`${path}\n`);
  child.stdin.write("quit\n");
  child.stdin.end();

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  clearWatchdog();

  if (timedOut()) {
    throw new Error(
      `dnf-extract --pipe killed after ${timeoutMs}ms timeout (audit P1-20). ` +
        `PVF may be corrupt or path list too large. Increase timeoutMs or check PVF integrity.\n${stderr}`,
    );
  }
  if (exitCode !== 0) {
    throw new Error(`dnf-extract --pipe exited ${exitCode}\n${stderr}`);
  }

  return parseDnfExtractPipeOutput(stdout);
}

/**
 * Audit pipeline-closure F6 (2026-05-24): graceful variant for batch
 * pipelines. A single corrupted PVF entry no longer aborts the whole
 * EXTRACT stage; per-chunk errors are returned alongside the documents
 * so pipelineRunner can fold them into its parseErrors stream (parallel
 * to the per-document PARSE-stage try/catch).
 */
export async function loadPvfDocumentsViaPipeWithErrors(
  paths: string[],
  options: DnfExtractPipeOptions,
): Promise<DnfExtractPipeBatchResult> {
  const executablePath = options.executablePath ?? DEFAULT_DNF_EXTRACT_PATH;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // audit P1-20 (fixed 2026-05-28): spawn watchdog.
  const { child, clearWatchdog, timedOut } = spawnWithTimeout(
    executablePath,
    buildDnfExtractPipeArgs(options),
    timeoutMs,
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  // audit P2-39 (2026-05-25): stdin.write() return value unchecked — large path list can backpressure.
  for (const path of paths) child.stdin.write(`${path}\n`);
  child.stdin.write("quit\n");
  child.stdin.end();

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  clearWatchdog();

  if (timedOut()) {
    throw new Error(
      `dnf-extract --pipe killed after ${timeoutMs}ms timeout (audit P1-20).\n${stderr}`,
    );
  }
  if (exitCode !== 0) {
    throw new Error(`dnf-extract --pipe exited ${exitCode}\n${stderr}`);
  }
  return parseDnfExtractPipeOutputWithErrors(stdout);
}

/**
 * Audit pipeline-closure F2 (2026-05-24): the pipeline CLI accepts .ani files
 * via `--ani-file`, but AniParser is standalone (per design §2.2.1 — .ani
 * does not flow through parseStage dispatch). This helper walks the
 * dnf-extract `--pipe` output, filters for `type:"animation"` chunks, and
 * returns them as `AniDocument[]` ready for `parseAniDocument()`. Symmetric
 * with `loadPvfDocumentsViaPipe` for documents.
 *
 * `type:"error"` chunks throw (matches the strict variant of the document
 * loader). Other non-animation chunks (e.g. text/binary) are silently
 * skipped with a stderr warning so the user can spot routing mistakes.
 */
export async function loadAniDocumentsViaPipe(
  paths: string[],
  options: DnfExtractPipeOptions,
): Promise<AniDocument[]> {
  const executablePath = options.executablePath ?? DEFAULT_DNF_EXTRACT_PATH;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // audit P1-20 (fixed 2026-05-28): spawn watchdog for .ani extraction too.
  const { child, clearWatchdog, timedOut } = spawnWithTimeout(
    executablePath,
    buildDnfExtractPipeArgs(options),
    timeoutMs,
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  // audit P2-39 (2026-05-25): stdin.write() return value unchecked — large path list can backpressure.
  for (const path of paths) child.stdin.write(`${path}\n`);
  child.stdin.write("quit\n");
  child.stdin.end();

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  clearWatchdog();

  if (timedOut()) {
    throw new Error(
      `dnf-extract --pipe (ani) killed after ${timeoutMs}ms timeout (audit P1-20).\n${stderr}`,
    );
  }
  if (exitCode !== 0) {
    throw new Error(`dnf-extract --pipe (ani) exited ${exitCode}\n${stderr}`);
  }
  return parseDnfExtractPipeOutputAnimations(stdout);
}

/**
 * Parse dnf-extract pipe stdout, returning only `type:"animation"` chunks
 * as `AniDocument[]`. Errors throw; non-animation/non-error chunks are
 * counted and warned via stderr (mirror of parseDnfExtractPipeOutput's
 * non-document skip behaviour).
 */
export function parseDnfExtractPipeOutputAnimations(stdout: string): AniDocument[] {
  const lines = stdout.split(/\r?\n/);
  const chunks: string[] = [];
  let buffer: string[] = [];
  for (const line of lines) {
    if (line === "---") {
      if (buffer.length > 0) {
        chunks.push(buffer.join("\n"));
        buffer = [];
      }
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length > 0) chunks.push(buffer.join("\n"));

  const animations: AniDocument[] = [];
  const skippedTypes = new Map<string, number>();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    if (!chunk) continue;
    // Parse as untyped first so we can branch on the runtime `type` field
    // (AniDocument's `type: "animation"` literal would otherwise reject the
    // "error" / other-type checks below at typecheck time).
    let parsedRaw: { type?: string; error?: unknown; path?: unknown } & Record<string, unknown>;
    try {
      parsedRaw = JSON.parse(chunk) as { type?: string; error?: unknown; path?: unknown } & Record<string, unknown>;
    } catch (parseError) {
      const preview = chunk.length > 80 ? `${chunk.slice(0, 80)}…` : chunk;
      const reason = parseError instanceof Error ? parseError.message : String(parseError);
      throw new Error(
        `dnf-extract pipe (ani): JSON.parse failed for chunk index ${i} ` +
        `(preview: ${JSON.stringify(preview)}): ${reason}`,
      );
    }
    if (parsedRaw.type === "error") {
      const path = typeof parsedRaw.path === "string" && parsedRaw.path.length > 0
        ? parsedRaw.path
        : "<unknown>";
      const errorPayload = typeof parsedRaw.error === "string"
        ? parsedRaw.error
        : parsedRaw.error === undefined
          ? "unknown error"
          : JSON.stringify(parsedRaw.error);
      throw new Error(`dnf-extract error for ${path} (chunk index ${i}): ${errorPayload}`);
    }
    if (parsedRaw.type === "animation") {
      animations.push(parsedRaw as unknown as AniDocument);
    } else {
      const t = parsedRaw.type ?? "<missing-type>";
      skippedTypes.set(t, (skippedTypes.get(t) ?? 0) + 1);
    }
  }

  if (skippedTypes.size > 0) {
    const summary = Array.from(skippedTypes.entries())
      .map(([t, n]) => `${t}×${n}`)
      .join(", ");
    console.warn(
      `[PvfDocumentLoader] loadAniDocumentsViaPipe: skipped ${
        Array.from(skippedTypes.values()).reduce((a, b) => a + b, 0)
      } non-animation chunk(s) [${summary}]. ` +
      `Only .ani paths should be passed to --ani-file. Other types (document/text/binary) ` +
      `belong to --file.`,
    );
  }
  return animations;
}

/**
 * T1.9 (2026-05-29): Parse dnf-extract pipe stdout, collecting ALL chunk types
 * (document / animation / text / binary) into a single RawPvfChunk[].
 *
 * Default semantics mirror parseDnfExtractPipeOutput (throw-on-first-error)
 * so that pipelineRunner inherits the same error contract as the legacy
 * document-only loader. Callers that need batch error collection should
 * use parseDnfExtractPipeOutputWithErrors instead and post-process.
 */
export function parseDnfExtractPipeOutputAllChunks(stdout: string): RawPvfChunk[] {
  const lines = stdout.split(/\r?\n/);
  const rawChunks: string[] = [];
  let buffer: string[] = [];
  for (const line of lines) {
    if (line === "---") {
      if (buffer.length > 0) {
        rawChunks.push(buffer.join("\n"));
        buffer = [];
      }
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length > 0) rawChunks.push(buffer.join("\n"));

  const chunks: RawPvfChunk[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    const raw = rawChunks[i].trim();
    if (!raw) continue;
    let parsed: { type?: string; error?: unknown; path?: unknown } & Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch (parseError) {
      const preview = raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
      const reason = parseError instanceof Error ? parseError.message : String(parseError);
      throw new Error(
        `dnf-extract pipe: JSON.parse failed for chunk index ${i} ` +
        `(preview: ${JSON.stringify(preview)}): ${reason}`,
      );
    }
    if (parsed.type === "error") {
      const path = typeof parsed.path === "string" && parsed.path.length > 0 ? parsed.path : "<unknown>";
      const msg = typeof parsed.error === "string"
        ? parsed.error
        : parsed.error === undefined
          ? "unknown error"
          : JSON.stringify(parsed.error);
      throw new Error(`dnf-extract error for ${path} (chunk index ${i}): ${msg}`);
    }
    // Accept document / animation / text / binary — all are valid RawPvfChunk variants
    chunks.push(parsed as unknown as RawPvfChunk);
  }
  return chunks;
}

/**
 * T1.9 (2026-05-29): Spawn dnf-extract --pipe and return ALL chunk types as
 * RawPvfChunk[]. Used by pipelineRunner when ani/nut/img dispatch is enabled.
 * Throw-on-first-error semantics — mirrors loadPvfDocumentsViaPipe.
 */
export async function loadAllChunksViaPipe(
  paths: string[],
  options: DnfExtractPipeOptions,
): Promise<RawPvfChunk[]> {
  const executablePath = options.executablePath ?? DEFAULT_DNF_EXTRACT_PATH;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { child, clearWatchdog, timedOut } = spawnWithTimeout(executablePath, buildDnfExtractPipeArgs(options), timeoutMs);

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });

  for (const path of paths) child.stdin.write(`${path}\n`);
  child.stdin.write("quit\n");
  child.stdin.end();

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  clearWatchdog();

  if (timedOut()) {
    throw new Error(`dnf-extract --pipe killed after ${timeoutMs}ms timeout (audit P1-20).\n${stderr}`);
  }
  if (exitCode !== 0) {
    throw new Error(`dnf-extract --pipe exited ${exitCode}\n${stderr}`);
  }
  return parseDnfExtractPipeOutputAllChunks(stdout);
}
