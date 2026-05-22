import { extname } from "node:path";
import { parseAtkDocument } from "../parsers/AtkParser.js";
import { parseChrDocument } from "../parsers/ChrParser.js";
import { parseMobDocument } from "../parsers/MobParser.js";
import type { AtkDef } from "../types/AtkDef.js";
import type { ChrDef } from "../types/ChrDef.js";
import type { MobDef } from "../types/MobDef.js";
import type { PvfDocument } from "../types/PvfDocument.js";

export type ParsedPvfDocument = ChrDef | MobDef | AtkDef;

export function parsePvfDocument(document: PvfDocument): ParsedPvfDocument {
  switch (extname(document.path).toLowerCase()) {
    case ".chr":
      return parseChrDocument(document);
    case ".mob":
      return parseMobDocument(document);
    case ".atk":
      return parseAtkDocument(document);
    default:
      throw new Error(`No parser registered for ${document.path}`);
  }
}
