import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadPvfDocumentsViaPipe } from "../parsers/PvfDocumentLoader.js";
import { parsePvfDocument, type ParsedPvfDocument } from "./parseStage.js";
import type { PvfDocument } from "../types/PvfDocument.js";

export interface PipelineRunOptions {
  pvfPath: string;
  files: string[];
  debugOut: string;
  executablePath?: string;
  loadDocuments?: (files: string[]) => Promise<PvfDocument[]>;
}

export interface PipelineRunResult {
  stage: "parse";
  filesExtracted: number;
  filesParsed: number;
  debugOut: string;
  parsed: ParsedPvfDocument[];
}

export async function runExtractParsePipeline(options: PipelineRunOptions): Promise<PipelineRunResult> {
  const documents = options.loadDocuments
    ? await options.loadDocuments(options.files)
    : await loadPvfDocumentsViaPipe(options.files, {
      pvfPath: options.pvfPath,
      executablePath: options.executablePath,
    });
  const parsed = documents.map(document => parsePvfDocument(document));

  await mkdir(options.debugOut, { recursive: true });
  await writeFile(
    join(options.debugOut, "extract.jsonl"),
    `${documents.map(document => JSON.stringify(document)).join("\n")}\n`,
    "utf8",
  );
  await writeFile(
    join(options.debugOut, "parse.jsonl"),
    `${parsed.map(document => JSON.stringify(document)).join("\n")}\n`,
    "utf8",
  );

  return {
    stage: "parse",
    filesExtracted: documents.length,
    filesParsed: parsed.length,
    debugOut: options.debugOut,
    parsed,
  };
}
