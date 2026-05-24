import { spawn } from "node:child_process";
import type { PvfDocument } from "../types/PvfDocument.js";

export interface DnfExtractPipeOptions {
  pvfPath: string;
  executablePath?: string;
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

export async function loadPvfDocumentsViaPipe(
  paths: string[],
  options: DnfExtractPipeOptions,
): Promise<PvfDocument[]> {
  const executablePath = options.executablePath ?? DEFAULT_DNF_EXTRACT_PATH;
  const child = spawn(executablePath, buildDnfExtractPipeArgs(options), {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  for (const path of paths) child.stdin.write(`${path}\n`);
  child.stdin.write("quit\n");
  child.stdin.end();

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`dnf-extract --pipe exited ${exitCode}\n${stderr}`);
  }

  return parseDnfExtractPipeOutput(stdout);
}
