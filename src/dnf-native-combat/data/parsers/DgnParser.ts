import type { DungeonDef } from "../types/DgnDef.js";
import type { PvfAttribute, PvfDocument, PvfRef } from "../types/PvfDocument.js";
import type { PvfStringFact } from "../types/Provenance.js";
import {
  documentProvenance,
  firstSection,
  firstNumberFact,
  firstStringFact,
  refAttributes,
  sectionNumbers,
} from "./parserUtils.js";

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

export function parseDgnDocument(document: PvfDocument): DungeonDef {
  if (!document.path.toLowerCase().endsWith(".dgn")) {
    throw new Error(`[DgnParser] expected .dgn document, got ${document.path}`);
  }

  // Sections decoded into named fields (excluded from raw).
  const NAMED_SECTIONS = new Set([
    "name",
    "explain",
    "basis level",
    "minimum required level",
    "experience increasing point",
    "background pos",
    "start map",
    "boss map",
    "size",
    "map specification",
    "entering title",
    "cutscene image",
    "minimap image",
    "worldmap pattern info",
    "champion",
    "pathgate object",
    "event monster",
    "greed",
  ]);

  const raw: Record<string, PvfAttribute[]> = {};
  for (const section of document.sections) {
    if (!NAMED_SECTIONS.has(section.name)) {
      // Accumulate: multiple sections with the same name (e.g. boss map specification)
      // are merged as an array under the same key.
      if (Object.prototype.hasOwnProperty.call(raw, section.name)) {
        // Append to existing entries (duplicate section names observed in goddesstemple.dgn)
        raw[section.name] = [...raw[section.name], ...section.attributes];
      } else {
        raw[section.name] = [...section.attributes];
      }
    }
  }

  return {
    kind: "dgn",
    path: document.path,
    provenance: documentProvenance(document),
    sections: structuredClone(document.sections),

    name: parseNameOrExplain(document, "name"),
    explain: parseNameOrExplain(document, "explain"),
    basisLevel: firstNumberFact(document, "basis level", "level"),
    minimumRequiredLevel: firstNumberFact(document, "minimum required level", "level"),
    experienceIncreasingPoint: firstNumberFact(document, "experience increasing point", "multiplier"),
    backgroundPos: firstNumberFact(document, "background pos", "px"),

    startMap: parseIntArray(document, "start map"),
    bossMap: parseIntArray(document, "boss map"),
    size: parseSize(document),
    mapSpecification: parseMapSpecification(document),

    enteringTitleRefs: parseEnteringTitleRefs(document),
    imageRefs: collectImageRefs(document),

    championLevels: parseIntArray(document, "champion"),
    pathgateObjects: parseIntArray(document, "pathgate object"),
    eventMonsters: parseIntArray(document, "event monster"),
    greedLayout: parseGreedLayout(document),
    worldmapPatternInfo: parseWorldmapPatternInfo(document),

    raw,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse "name" or "explain" sections.
 * PVF emits these as link("") — the empty string is a valid value (localisation key).
 * Returns null only when the section is absent entirely.
 */
function parseNameOrExplain(document: PvfDocument, sectionName: string): PvfStringFact | null {
  return firstStringFact(document, sectionName, "link-key");
}

/**
 * Parse a section that contains only int/float attrs into a number[].
 * Returns null when the section is absent.
 * Throws when the section contains non-numeric attrs (PVF-truth invariant).
 */
function parseIntArray(document: PvfDocument, sectionName: string): number[] | null {
  const section = firstSection(document, sectionName);
  if (!section) return null;
  // sectionNumbers throws on non-int/float attrs
  const nums = sectionNumbers(document, sectionName);
  return nums.length > 0 ? nums : [];
}

/**
 * Parse section "size" → { width, height }.
 * Invariant: exactly 2 numeric attributes expected (verified across all 3 .dgn samples).
 * Throws if the section is malformed.
 */
function parseSize(document: PvfDocument): { width: number; height: number } | null {
  const section = firstSection(document, "size");
  if (!section) return null;
  const nums = sectionNumbers(document, "size");
  if (nums.length !== 2) {
    throw new Error(
      `[DgnParser] parseSize: "size" section in ${document.path} has ${nums.length} int attrs, ` +
      `expected exactly 2 ([width, height]). Real PVF emits exactly 2 ints for size; ` +
      `wrong count indicates corrupted or malformed input.`,
    );
  }
  return { width: nums[0], height: nums[1] };
}

/**
 * Parse section "map specification" → mat rows × 3 cols.
 * Invariant: mat.items.length === mat.rows, each row.length === mat.cols.
 * Throws on mismatch (PVF-truth invariant per commit bf94213).
 */
function parseMapSpecification(
  document: PvfDocument,
): { rows: number; cols: number; items: number[][] } | null {
  const section = firstSection(document, "map specification");
  if (!section) return null;
  const attr = section.attributes[0];
  if (!attr || attr.t !== "mat") {
    throw new Error(
      `[DgnParser] parseMapSpecification: "map specification" section in ${document.path} ` +
      `has no mat attribute (first attr type="${attr?.t ?? "undefined"}"). ` +
      `Real PVF emits a single mat attr for map specification.`,
    );
  }

  // TypeScript type cast: attr.t === "mat" narrows to PvfMatrixAttribute
  const matAttr = attr as { t: "mat"; rows: number; cols: number; item_type?: string; items: unknown[][] };
  const { rows, cols, items } = matAttr;

  if (!Array.isArray(items)) {
    throw new Error(
      `[DgnParser] parseMapSpecification: mat attr items is not an array in ${document.path}.`,
    );
  }
  if (items.length !== rows) {
    throw new Error(
      `[DgnParser] parseMapSpecification: mat rows=${rows} does not match items.length=${items.length} ` +
      `in ${document.path}. Real PVF mat is consistent; mismatch indicates corrupted input.`,
    );
  }

  const parsedItems: number[][] = [];
  for (let rowIdx = 0; rowIdx < items.length; rowIdx++) {
    const row = items[rowIdx];
    if (!Array.isArray(row)) {
      throw new Error(
        `[DgnParser] parseMapSpecification: mat items[${rowIdx}] is not an array in ${document.path}.`,
      );
    }
    if (row.length !== cols) {
      throw new Error(
        `[DgnParser] parseMapSpecification: mat items[${rowIdx}].length=${row.length} ` +
        `does not match cols=${cols} in ${document.path}. ` +
        `Real PVF mat rows are uniform width; mismatch indicates corrupted input.`,
      );
    }
    const parsedRow: number[] = [];
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cell = row[colIdx];
      if (typeof cell !== "number" || !Number.isFinite(cell)) {
        throw new Error(
          `[DgnParser] parseMapSpecification: mat items[${rowIdx}][${colIdx}] is not a finite number ` +
          `(got ${JSON.stringify(cell)}) in ${document.path}. ` +
          `"map specification" mat uses item_type="int"; non-numeric cell indicates corrupted input.`,
        );
      }
      parsedRow.push(cell);
    }
    parsedItems.push(parsedRow);
  }

  return { rows, cols, items: parsedItems };
}

/**
 * Extract entering title .ani refs from section "entering title".
 * Uses refAttributes() which throws on mixed ref/non-ref content.
 * Returns [] when the section is absent.
 */
function parseEnteringTitleRefs(document: PvfDocument): PvfRef[] {
  const section = firstSection(document, "entering title");
  return refAttributes(section);
}

/**
 * Collect external image references from sections that emit str attrs with
 * `_note: "ref_ext_but_path_not_found"`. Observed sections:
 *   - "cutscene image" (first str attr)
 *   - "minimap image" (first str attr)
 *   - "worldmap pattern info" (third attr is str)
 *
 * resolved=false when _note indicates path was not found in PVF.
 */
function collectImageRefs(
  document: PvfDocument,
): Array<{ section: string; path: string; resolved: boolean }> {
  const refs: Array<{ section: string; path: string; resolved: boolean }> = [];

  // Sections where the image ref is the FIRST attribute
  for (const sectionName of ["cutscene image", "minimap image"]) {
    const section = firstSection(document, sectionName);
    if (!section) continue;
    const attr = section.attributes[0];
    if (!attr || attr.t !== "str") continue;
    const strAttr = attr as { t: "str"; v: string; _note?: string };
    refs.push({
      section: sectionName,
      path: strAttr.v,
      resolved: strAttr._note !== "ref_ext_but_path_not_found",
    });
  }

  // "worldmap pattern info": shape is [int, int, str-ref, int]
  // The str attr is at index 2.
  const wmSection = firstSection(document, "worldmap pattern info");
  if (wmSection) {
    for (const attr of wmSection.attributes) {
      if (attr.t === "str") {
        const strAttr = attr as { t: "str"; v: string; _note?: string };
        refs.push({
          section: "worldmap pattern info",
          path: strAttr.v,
          resolved: strAttr._note !== "ref_ext_but_path_not_found",
        });
        break; // only first str attr
      }
    }
  }

  return refs;
}

/**
 * Parse "greed" section → minimap layout string.
 * PVF emits as a str attr containing a newline-separated char grid.
 * Returns null when the section is absent.
 */
function parseGreedLayout(document: PvfDocument): string | null {
  const fact = firstStringFact(document, "greed", "minimap-layout");
  return fact?.value ?? null;
}

/**
 * Preserve raw attributes for "worldmap pattern info".
 * Shape: [int, int, str-ref, int] — semantics unconfirmed.
 * Returns null when the section is absent.
 */
function parseWorldmapPatternInfo(document: PvfDocument): PvfAttribute[] | null {
  const section = firstSection(document, "worldmap pattern info");
  if (!section) return null;
  return [...section.attributes];
}
