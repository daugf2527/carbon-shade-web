import type { MapDef } from "../types/MapDef.js";
import type { PvfAttribute, PvfDocument } from "../types/PvfDocument.js";
import {
  documentProvenance,
  firstNumberFact,
  firstSection,
  firstStringFact,
  refAttributes,
  sectionNumbers,
  stringValue,
} from "./parserUtils.js";

export function parseMapDocument(document: PvfDocument): MapDef {
  if (!document.path.toLowerCase().endsWith(".map")) {
    throw new Error(`MapParser expected .map document, got ${document.path}`);
  }

  return {
    kind: "map",
    path: document.path,
    provenance: documentProvenance(document),
    sections: structuredClone(document.sections),

    name: firstStringFact(document, "map name", "stringtable-link"),
    mapType: firstStringFact(document, "type"),
    dungeonId: firstNumberFact(document, "dungeon", "id"),

    nearSightScroll: firstNumberFact(document, "near sight scroll", "px"),
    middleSightScroll: firstNumberFact(document, "middle sight scroll", "px"),
    farSightScroll: firstNumberFact(document, "far sight scroll", "px"),

    tiles: collectStrings(document, "tile"),
    playerNumber: sectionNumbers(document, "player number"),
    sounds: collectStrings(document, "sound"),
    monsterAiHints: collectStrings(document, "monster specific ai"),
    eventMonsterPositions: sectionNumbers(document, "event monster position"),
    pathgatePos: sectionNumbers(document, "pathgate pos"),
    pvpStartArea: sectionNumbers(document, "pvp start area"),

    monsterSpawns: rawAttributes(document, "monster"),
    passiveObjects: rawAttributes(document, "passive object"),
    specialPassiveObjects: rawAttributes(document, "special passive object"),

    // Real-PVF "animation" / "background animation" sections interleave refs
    // with positional metadata (e.g. [ref, "[normal]", x, y, z, ...]).
    // allowMixed: true mirrors MobParser.collectAnimationRefs convention.
    animationRefs: refAttributes(firstSection(document, "animation"), { allowMixed: true }),
    backgroundAnimation: refAttributes(firstSection(document, "background animation"), { allowMixed: true }),

    greed: firstStringFact(document, "greed"),

    raw: Object.freeze(document),
  };
}

// Pure-string section reader. Distinct from sectionNumbers in that "tile" /
// "sound" / "monster specific ai" sections legitimately contain only str/link
// attrs — non-string attrs would indicate corrupted PVF or misrouted document.
// We DO NOT throw on missing section (return []), matching collectAnimationRefs
// convention — `.map` files vary in which optional sections they carry.
function collectStrings(document: PvfDocument, sectionName: string): string[] {
  const section = firstSection(document, sectionName);
  if (!section) return [];
  const out: string[] = [];
  for (let i = 0; i < section.attributes.length; i++) {
    const attr = section.attributes[i];
    const value = stringValue(attr);
    if (value === null) {
      throw new Error(
        `[MapParser] collectStrings: section "${sectionName}" attr[${i}] has type "${attr.t}" ` +
        `(expected str/link) in ${document.path}. Real PVF emits pure-string sections; ` +
        `mixed-type content indicates corrupted input.`,
      );
    }
    out.push(value);
  }
  return out;
}

function rawAttributes(document: PvfDocument, sectionName: string): PvfAttribute[] {
  const section = firstSection(document, sectionName);
  if (!section) return [];
  return structuredClone(section.attributes);
}
