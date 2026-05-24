import { mkdir, open, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadPvfDocumentsViaPipe } from "../parsers/PvfDocumentLoader.js";
import { parsePvfDocument, type ParsedPvfDocument } from "./parseStage.js";
import {
  buildProvenanceAudit,
  validateParsedDocuments,
  type ProvenanceAuditReport,
  type VerificationReport,
} from "../validator.js";
import {
  importToSqlite,
  type ImportMode,
  type SqliteImportResult,
} from "../importer/SqliteImporter.js";
import {
  exportRuntimeShards,
  type ExportResult,
  type RuntimeManifest,
} from "../exporter/RuntimeExporter.js";
import type { AniDef } from "../types/AniDef.js";
import type { PvfDocument } from "../types/PvfDocument.js";

export interface PipelineRunOptions {
  pvfPath: string;
  files: string[];
  debugOut: string;
  executablePath?: string;
  loadDocuments?: (files: string[]) => Promise<PvfDocument[]>;
  runId?: string;
  verificationOutDir?: string | null;
  sqliteDbPath?: string;
  sqliteMode?: ImportMode;
  /**
   * Output directory for EXPORT stage runtime JSON shards (dist/data style).
   * Default: undefined → EXPORT stage is skipped. Pass a path to enable.
   */
  exportOutDir?: string;
  /** Optional AniDef[] loaded outside the dispatch (animation parser is standalone). */
  aniDefs?: ReadonlyArray<AniDef>;
  /** Optional physics + enum content for shared/*.json shards. */
  sharedPhysics?: Record<string, unknown>;
  sharedEnums?: { tables: Record<string, Record<string, string>>; field_to_enum: Record<string, string> };
  /**
   * Optional prior manifest for incremental EXPORT (unchanged shards skipped).
   * Loader (CLI) reads existing dist/data/manifest.json and passes it through.
   */
  exportBaseManifest?: RuntimeManifest;
  /**
   * Stop pipeline at this stage. Default: undefined → run all enabled stages.
   * - "extract" — skip PARSE/VALIDATE/LOAD/EXPORT
   * - "parse" — skip VALIDATE/LOAD/EXPORT (still computes validation:null sentinel)
   * - "validate" — skip LOAD/EXPORT
   * - "load" — skip EXPORT
   * - "export" — full pipeline (default behavior)
   *
   * VALIDATE always computes when stopAt is undefined/validate/load/export (even
   * if not written to disk). For "extract"/"parse" stops, validation report
   * is an empty placeholder.
   */
  stopAt?: "extract" | "parse" | "validate" | "load" | "export";
}

export interface PipelineParseError {
  path: string;
  message: string;
}

export interface PipelineRunResult {
  stage: "extract" | "parse" | "validate" | "load" | "export";
  filesExtracted: number;
  filesParsed: number;
  parseErrors: PipelineParseError[];
  debugOut: string;
  parsed: ParsedPvfDocument[];
  validation: VerificationReport;
  provenanceAudit: ProvenanceAuditReport;
  reportPaths: {
    extractionReport: string | null;
    provenanceAudit: string | null;
  };
  sqliteImport: SqliteImportResult | null;
  exportResult: ExportResult | null;
}

export async function runExtractParsePipeline(options: PipelineRunOptions): Promise<PipelineRunResult> {
  const startedAt = new Date().toISOString();
  const stopAt = options.stopAt ?? "export";
  const stageOrder = ["extract", "parse", "validate", "load", "export"] as const;
  const stopIdx = stageOrder.indexOf(stopAt);
  const shouldRun = (s: typeof stageOrder[number]) => stageOrder.indexOf(s) <= stopIdx;

  const documents = options.loadDocuments
    ? await options.loadDocuments(options.files)
    : await loadPvfDocumentsViaPipe(options.files, {
      pvfPath: options.pvfPath,
      executablePath: options.executablePath,
    });

  // ─── PARSE stage ───────────────────────────────────────────────────────
  const parsed: ParsedPvfDocument[] = [];
  const parseErrors: PipelineParseError[] = [];
  if (shouldRun("parse")) {
    for (const document of documents) {
      try {
        parsed.push(parsePvfDocument(document));
      } catch (error) {
        parseErrors.push({
          path: document.path ?? "<unknown>",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // ─── VALIDATE stage ────────────────────────────────────────────────────
  const runId = options.runId ?? slugifyTimestamp(startedAt);
  const finishedAt = new Date().toISOString();
  const pvfHash = pickFirstDefined(documents, d => d.source_pvf_hash) ?? null;
  const extractorVersion = pickFirstDefined(documents, d => d.extractor_version) ?? null;

  const validation = shouldRun("validate")
    ? validateParsedDocuments(parsed, {
        runId, startedAt, finishedAt, pvfHash, extractorVersion, parseErrors,
      })
    : emptyValidationReport(runId, startedAt, finishedAt, pvfHash, extractorVersion);
  const provenanceAudit = buildProvenanceAudit(validation);

  // ─── Debug dumps ───────────────────────────────────────────────────────
  await mkdir(options.debugOut, { recursive: true });
  await writeJsonlStreaming(
    join(options.debugOut, "extract.jsonl"),
    documents,
    document => JSON.stringify(document),
  );
  if (shouldRun("parse")) {
    await writeJsonlStreaming(
      join(options.debugOut, "parse.jsonl"),
      parsed,
      parsedDoc => JSON.stringify(stripRawAndSections(parsedDoc)),
    );
    await writeJsonlStreaming(
      join(options.debugOut, "parse-errors.jsonl"),
      parseErrors,
      error => JSON.stringify(error),
    );
  }

  // ─── Verification reports ──────────────────────────────────────────────
  let extractionReportPath: string | null = null;
  let provenanceAuditPath: string | null = null;
  if (shouldRun("validate") && options.verificationOutDir !== null) {
    const outDir = options.verificationOutDir ?? join(options.debugOut, "..", "verification");
    await mkdir(outDir, { recursive: true });
    extractionReportPath = join(outDir, `extraction-report-${runId}.json`);
    provenanceAuditPath = join(outDir, `provenance-audit-${runId}.json`);
    await writeFile(extractionReportPath, JSON.stringify(validation, null, 2));
    await writeFile(provenanceAuditPath, JSON.stringify(provenanceAudit, null, 2));
  }

  // ─── LOAD stage ────────────────────────────────────────────────────────
  let sqliteImport: SqliteImportResult | null = null;
  if (shouldRun("load") && typeof options.sqliteDbPath === "string") {
    sqliteImport = importToSqlite(
      { dbPath: options.sqliteDbPath, mode: options.sqliteMode ?? "full" },
      documents,
      parsed,
      validation,
    );
  }

  // ─── EXPORT stage ──────────────────────────────────────────────────────
  let exportResult: ExportResult | null = null;
  if (shouldRun("export") && typeof options.exportOutDir === "string") {
    exportResult = await exportRuntimeShards({
      outDir: options.exportOutDir,
      parsed,
      aniDefs: options.aniDefs,
      meta: { pvfHash, extractorVersion, exportedAt: finishedAt },
      sharedPhysics: options.sharedPhysics,
      sharedEnums: options.sharedEnums,
      incrementalBaseManifest: options.exportBaseManifest,
    });
  }

  // ─── Determine highest completed stage ─────────────────────────────────
  // The stage actually reached reflects (a) stopAt cap AND (b) whether the
  // optional opt-in for load/export was provided.
  let highest: PipelineRunResult["stage"] = "extract";
  if (shouldRun("parse")) highest = "parse";
  if (shouldRun("validate")) highest = "validate";
  if (shouldRun("load") && sqliteImport !== null) highest = "load";
  if (shouldRun("export") && exportResult !== null) highest = "export";

  return {
    stage: highest,
    filesExtracted: documents.length,
    filesParsed: parsed.length,
    parseErrors,
    debugOut: options.debugOut,
    parsed,
    validation,
    provenanceAudit,
    reportPaths: {
      extractionReport: extractionReportPath,
      provenanceAudit: provenanceAuditPath,
    },
    sqliteImport,
    exportResult,
  };
}

function emptyValidationReport(
  runId: string, startedAt: string, finishedAt: string,
  pvfHash: string | null, extractorVersion: string | null,
): VerificationReport {
  return {
    meta: { runId, startedAt, finishedAt, pvfHash, extractorVersion },
    stats: { filesTotal: 0, filesParsed: 0, filesFailed: 0, errors: 0, warnings: 0, infos: 0 },
    errors: [], warnings: [], infos: [],
    tier3Fields: [], pvpFields: [], refIntegrity: [],
  };
}

function stripRawAndSections(parsedDoc: ParsedPvfDocument): Omit<ParsedPvfDocument, "raw" | "sections"> {
  // Different ParsedDef variants have different optional fields — strip the
  // two known heavy fields uniformly. Destructure with optional access since
  // some kinds (e.g. AniDef per the standalone parser path) lack `sections`.
  const { raw: _raw, sections: _sections, ...rest } = parsedDoc as ParsedPvfDocument & {
    raw?: unknown;
    sections?: unknown;
  };
  return rest as Omit<ParsedPvfDocument, "raw" | "sections">;
}

async function writeJsonlStreaming<T>(
  filePath: string,
  items: readonly T[],
  serialize: (item: T) => string,
): Promise<void> {
  const handle = await open(filePath, "w");
  try {
    for (const item of items) {
      await handle.write(`${serialize(item)}\n`);
    }
  } finally {
    await handle.close();
  }
}

function slugifyTimestamp(iso: string): string {
  // 2026-05-23T15:30:50.123Z → 20260523-153050
  return iso.replace(/[-:T.]/g, "").slice(0, 15);
}

function pickFirstDefined<T, V>(items: readonly T[], getter: (item: T) => V | undefined): V | undefined {
  for (const item of items) {
    const value = getter(item);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}
