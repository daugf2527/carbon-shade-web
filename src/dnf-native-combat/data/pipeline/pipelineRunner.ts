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
}

export interface PipelineParseError {
  path: string;
  message: string;
}

export interface PipelineRunResult {
  stage: "parse" | "validate" | "load" | "export";
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
  const documents = options.loadDocuments
    ? await options.loadDocuments(options.files)
    : await loadPvfDocumentsViaPipe(options.files, {
      pvfPath: options.pvfPath,
      executablePath: options.executablePath,
    });

  const parsed: ParsedPvfDocument[] = [];
  const parseErrors: PipelineParseError[] = [];
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

  // ─── VALIDATE stage ────────────────────────────────────────────────────
  // Per design §2.2: PARSE → VALIDATE → LOAD. Always run validation; emit
  // reports only when verificationOutDir is non-null (default: enabled).
  const runId = options.runId ?? slugifyTimestamp(startedAt);
  const finishedAt = new Date().toISOString();
  // Provenance hash + extractor version come from any one document (they're
  // PVF-level, identical across all docs in the same run). Pick first defined.
  const pvfHash = pickFirstDefined(documents, d => d.source_pvf_hash) ?? null;
  const extractorVersion = pickFirstDefined(documents, d => d.extractor_version) ?? null;

  const validation = validateParsedDocuments(parsed, {
    runId,
    startedAt,
    finishedAt,
    pvfHash,
    extractorVersion,
    parseErrors,
  });
  const provenanceAudit = buildProvenanceAudit(validation);

  // ─── Debug dumps + verification reports ────────────────────────────────
  await mkdir(options.debugOut, { recursive: true });
  await writeJsonlStreaming(
    join(options.debugOut, "extract.jsonl"),
    documents,
    document => JSON.stringify(document),
  );
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

  let extractionReportPath: string | null = null;
  let provenanceAuditPath: string | null = null;
  if (options.verificationOutDir !== null) {
    const outDir = options.verificationOutDir ?? join(options.debugOut, "..", "verification");
    await mkdir(outDir, { recursive: true });
    extractionReportPath = join(outDir, `extraction-report-${runId}.json`);
    provenanceAuditPath = join(outDir, `provenance-audit-${runId}.json`);
    await writeFile(extractionReportPath, JSON.stringify(validation, null, 2));
    await writeFile(provenanceAuditPath, JSON.stringify(provenanceAudit, null, 2));
  }

  // ─── LOAD stage (opt-in) ───────────────────────────────────────────────
  // Per design §2.2 PARSE → VALIDATE → **LOAD** → EXPORT. Default is opt-in
  // via sqliteDbPath to keep tests independent of the SQLite Mirror — the
  // production CLI sets it explicitly.
  let sqliteImport: SqliteImportResult | null = null;
  let highestStage: PipelineRunResult["stage"] = "validate";
  if (typeof options.sqliteDbPath === "string") {
    sqliteImport = importToSqlite(
      { dbPath: options.sqliteDbPath, mode: options.sqliteMode ?? "full" },
      documents,
      parsed,
      validation,
    );
    highestStage = "load";
  }

  // ─── EXPORT stage (opt-in) ─────────────────────────────────────────────
  // Per design §4: entity-centric JSON shards + manifest.
  let exportResult: ExportResult | null = null;
  if (typeof options.exportOutDir === "string") {
    exportResult = await exportRuntimeShards({
      outDir: options.exportOutDir,
      parsed,
      aniDefs: options.aniDefs,
      meta: {
        pvfHash,
        extractorVersion,
        exportedAt: finishedAt,
      },
      sharedPhysics: options.sharedPhysics,
      sharedEnums: options.sharedEnums,
    });
    highestStage = "export";
  }

  return {
    stage: highestStage,
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
