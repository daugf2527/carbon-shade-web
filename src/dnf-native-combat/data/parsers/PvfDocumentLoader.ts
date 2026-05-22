import { spawn } from "node:child_process";
import type { PvfDocument } from "../types/PvfDocument.js";

export interface DnfExtractPipeOptions {
  pvfPath: string;
  executablePath?: string;
}

export function buildDnfExtractPipeArgs(options: DnfExtractPipeOptions): string[] {
  return ["--pvf", options.pvfPath, "--pipe"];
}

export function parseDnfExtractPipeOutput(stdout: string): PvfDocument[] {
  return stdout
    .split(/\r?\n---\r?\n?/)
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .map(chunk => JSON.parse(chunk) as PvfDocument)
    .filter(document => document.type !== "error");
}

export async function loadPvfDocumentsViaPipe(
  paths: string[],
  options: DnfExtractPipeOptions,
): Promise<PvfDocument[]> {
  const executablePath = options.executablePath ?? "tools/dnf-extract.exe";
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
