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

export interface PipelineParseError {
  path: string;
  message: string;
}

export interface PipelineRunResult {
  stage: "parse";
  filesExtracted: number;
  filesParsed: number;
  parseErrors: PipelineParseError[];
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

  await mkdir(options.debugOut, { recursive: true });
  await writeFile(
    join(options.debugOut, "extract.jsonl"),
    documents.length > 0 ? `${documents.map(document => JSON.stringify(document)).join("\n")}\n` : "",
    "utf8",
  );
  await writeFile(
    join(options.debugOut, "parse.jsonl"),
    parsed.length > 0 ? `${parsed.map(parsedDoc => JSON.stringify(stripRawAndSections(parsedDoc))).join("\n")}\n` : "",
    "utf8",
  );
  await writeFile(
    join(options.debugOut, "parse-errors.jsonl"),
    parseErrors.length > 0 ? `${parseErrors.map(error => JSON.stringify(error)).join("\n")}\n` : "",
    "utf8",
  );

  return {
    stage: "parse",
    filesExtracted: documents.length,
    filesParsed: parsed.length,
    parseErrors,
    debugOut: options.debugOut,
    parsed,
  };
}

function stripRawAndSections(parsedDoc: ParsedPvfDocument): Omit<ParsedPvfDocument, "raw" | "sections"> {
  const { raw: _raw, sections: _sections, ...rest } = parsedDoc;
  return rest;
}
