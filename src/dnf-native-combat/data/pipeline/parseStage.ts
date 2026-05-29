import { basename, extname } from "node:path";
import { parseAtkDocument } from "../parsers/AtkParser.js";
import { parseChrDocument } from "../parsers/ChrParser.js";
import { parseMobDocument } from "../parsers/MobParser.js";
import { parseSklDocument } from "../parsers/SklParser.js";
import { parseDgnDocument } from "../parsers/DgnParser.js";
import { parseEtcDocument } from "../parsers/EtcParser.js";
import { parseMapDocument } from "../parsers/MapParser.js";
import { parseAniDocument } from "../parsers/AniParser.js";
import { extractNutDocument } from "../parsers/NutExtractor.js";
import { parseImgBinaryDocument } from "../parsers/ImgParser.js";
import type { AtkDef } from "../types/AtkDef.js";
import type { ChrDef } from "../types/ChrDef.js";
import type { MobDef } from "../types/MobDef.js";
import type { SkillDef } from "../types/SklDef.js";
import type { DungeonDef } from "../types/DgnDef.js";
import type { EtcDef } from "../types/EtcDef.js";
import type { MapDef } from "../types/MapDef.js";
import type { AniDef, AniDocument } from "../types/AniDef.js";
import type { NutDef, NutTextDocument } from "../types/NutDef.js";
import type { ImgDef, ImgBinaryDocument } from "../types/ImgDef.js";
import type { PvfDocument } from "../types/PvfDocument.js";

export type ParsedPvfDocument = ChrDef | MobDef | AtkDef | SkillDef | DungeonDef | EtcDef | MapDef | AniDef | NutDef | ImgDef;

/** Union of all raw chunk types emitted by dnf-extract --pipe */
export type RawPvfChunk = PvfDocument | AniDocument | NutTextDocument | ImgBinaryDocument;

// Detect the routing extension, with a special case for paths whose basename is
// just `.chr` / `.mob` / `.atk` / `.skl` / `.dgn` / `.etc` / `.map`. Node's
// path.extname returns "" for ".chr" (it treats the whole basename as a
// hidden-file name with no extension). Real PVF paths are usually deep like
// `character/swordman/swordman.chr`, but callers occasionally pass the bare
// basename (e.g. tooling, tests, or REPL usage), and silently rejecting those
// creates a surprising failure mode.
function routingExtension(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext !== "") return ext;
  const base = basename(filePath).toLowerCase();
  if (base === ".chr" || base === ".mob" || base === ".atk" ||
      base === ".skl" || base === ".dgn" || base === ".etc" ||
      base === ".map") return base;
  return "";
}

export function parsePvfDocument(document: RawPvfChunk): ParsedPvfDocument {
  // Route by type field first for the three standalone-parser types whose
  // input shapes differ from PvfDocument (T1.9: wired 2026-05-29).
  if (document.type === "animation") {
    return parseAniDocument(document as AniDocument);
  }
  if (document.type === "text") {
    return extractNutDocument(document as NutTextDocument);
  }
  if (document.type === "binary") {
    return parseImgBinaryDocument(document as ImgBinaryDocument);
  }

  // type:"document" — route by file extension
  const pvfDoc = document as PvfDocument;
  switch (routingExtension(pvfDoc.path)) {
    case ".chr":
      return parseChrDocument(pvfDoc);
    case ".mob":
      return parseMobDocument(pvfDoc);
    case ".atk":
      return parseAtkDocument(pvfDoc);
    case ".skl":
      return parseSklDocument(pvfDoc);
    case ".dgn":
      return parseDgnDocument(pvfDoc);
    case ".etc":
      return parseEtcDocument(pvfDoc);
    case ".map":
      return parseMapDocument(pvfDoc);
    default:
      // audit P1-22 (fixed 2026-05-28): previously threw; now signals via a
      // structured error class so pipelineRunner can route unknown extensions
      // into parseErrors (collected, not aborted). Real PVF contains plenty
      // of unregistered extensions (.aic / .lin / .lst / ...); throwing on
      // every one would block batch runs.
      throw new UnregisteredExtensionError(pvfDoc.path);
  }
}

/**
 * Distinct error subclass so callers can `instanceof` check to decide
 * abort-vs-collect policy. pipelineRunner treats this as a soft skip
 * (logged + collected into parseErrors). Strict CLI / probe call sites
 * may still let it propagate.
 */
export class UnregisteredExtensionError extends Error {
  readonly kind = "unregistered_extension" as const;
  constructor(readonly path: string) {
    super(`No parser registered for ${path}`);
    this.name = "UnregisteredExtensionError";
  }
}
