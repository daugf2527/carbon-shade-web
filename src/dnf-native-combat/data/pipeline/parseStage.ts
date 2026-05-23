import { basename, extname } from "node:path";
import { parseAtkDocument } from "../parsers/AtkParser.js";
import { parseChrDocument } from "../parsers/ChrParser.js";
import { parseMobDocument } from "../parsers/MobParser.js";
import { parseSklDocument } from "../parsers/SklParser.js";
import type { AtkDef } from "../types/AtkDef.js";
import type { ChrDef } from "../types/ChrDef.js";
import type { MobDef } from "../types/MobDef.js";
import type { SkillDef } from "../types/SklDef.js";
import type { PvfDocument } from "../types/PvfDocument.js";

export type ParsedPvfDocument = ChrDef | MobDef | AtkDef | SkillDef;

// Detect the routing extension, with a special case for paths whose basename is
// just `.chr` / `.mob` / `.atk` / `.skl`. Node's path.extname returns "" for
// ".chr" (it treats the whole basename as a hidden-file name with no extension).
// Real PVF paths are usually deep like `character/swordman/swordman.chr`, but
// callers occasionally pass the bare basename (e.g. tooling, tests, or REPL
// usage), and silently rejecting those creates a surprising failure mode.
function routingExtension(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext !== "") return ext;
  const base = basename(filePath).toLowerCase();
  if (base === ".chr" || base === ".mob" || base === ".atk" || base === ".skl") return base;
  return "";
}

export function parsePvfDocument(document: PvfDocument): ParsedPvfDocument {
  switch (routingExtension(document.path)) {
    case ".chr":
      return parseChrDocument(document);
    case ".mob":
      return parseMobDocument(document);
    case ".atk":
      return parseAtkDocument(document);
    case ".skl":
      return parseSklDocument(document);
    default:
      throw new Error(`No parser registered for ${document.path}`);
  }
}

// NOTE: AniParser (.ani) and NutExtractor (.nut) are implemented in
// ../parsers/AniParser.ts and ../parsers/NutExtractor.ts but NOT wired into
// this dispatch. Their input shapes (AniDocument / NutTextDocument) diverge
// from PvfDocument — the C++ extractor emits type:"animation" and type:"text"
// JSON, while PvfDocumentLoader.ts currently filters to type:"document" only.
// To wire them in, extend PvfDocumentLoader's filter + widen this dispatch's
// input to a union (PvfDocument | AniDocument | NutTextDocument). Tracked
// for the next integration pass.
