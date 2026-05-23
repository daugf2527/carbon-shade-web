import type { PvfAttribute, PvfDocument, PvfRef, PvfSection } from "./PvfDocument.js";
import type { ExtractedDocumentProvenance, PvfFact, PvfStringFact } from "./Provenance.js";

/**
 * Parsed dungeon definition, extracted from a .dgn PVF document.
 *
 * Sections observed across: jungle.dgn, goddesstemple.dgn, bloodhell.dgn
 * (Tier-1 PVF truth, dnf-extract v2.0.0, 2026-05-23).
 *
 * Semantics note: "start map" / "boss map" 4-int shape is:
 *   [mapId?, diff?, diff?, diff?] — exact meaning unconfirmed; treated as raw array.
 * Variant: goddesstemple.dgn has "start map" with only 2 ints [mapId, diff?],
 * so the array length varies across .dgn files — do not rely on fixed length.
 */
export interface DungeonDef {
  readonly kind: "dgn";
  readonly path: string;
  readonly provenance: ExtractedDocumentProvenance;
  /** structuredClone of raw sections; preserved for downstream traversal. */
  readonly sections: PvfSection[];

  // --- identity ---
  /** Dungeon display name key. PVF emits as link("") — present for reference. */
  readonly name: PvfStringFact | null;
  /** Dungeon description/explain text. PVF emits as link(""). */
  readonly explain: PvfStringFact | null;

  // --- level / progression ---
  /** Recommended level for this dungeon. Section "basis level". */
  readonly basisLevel: PvfFact<number> | null;
  /** Minimum required character level. Section "minimum required level". */
  readonly minimumRequiredLevel: PvfFact<number> | null;
  /** EXP modifier for this dungeon. Section "experience increasing point". */
  readonly experienceIncreasingPoint: PvfFact<number> | null;

  // --- layout / map ---
  /**
   * Background Y-scroll offset. Section "background pos".
   * Observed value: 80 across all 3 samples.
   */
  readonly backgroundPos: PvfFact<number> | null;

  /**
   * Starting map coordinates. Section "start map".
   * Observed: 4 ints in jungle.dgn; 2 ints in goddesstemple.dgn.
   * Semantics unconfirmed — treat as positional array only.
   */
  readonly startMap: number[] | null;

  /**
   * Boss map coordinates. Section "boss map".
   * Observed: 4 ints across all samples (semantics unconfirmed).
   */
  readonly bossMap: number[] | null;

  /**
   * Dungeon size in map units [width, height].
   * Section "size". Verified: jungle=[4,4], goddesstemple=[4,5], bloodhell=[5,4].
   */
  readonly size: { width: number; height: number } | null;

  /**
   * Room slot table. Section "map specification".
   * Mat shape: rows × 3 cols (observed: [side, idx, mapId] per row).
   * Parser throws if items.length !== rows or any row.length !== cols.
   */
  readonly mapSpecification: { rows: number; cols: number; items: number[][] } | null;

  // --- refs ---
  /**
   * Entering title animation reference. Section "entering title".
   * Emitted as ref attr (target_kind="ani"); extracted via refAttributes().
   */
  readonly enteringTitleRefs: PvfRef[];

  /**
   * Image references to external .img files not resolvable inside PVF.
   * Observed sections: "cutscene image", "minimap image", "worldmap pattern info".
   * C++ extractor marks these with `_note: "ref_ext_but_path_not_found"`.
   * resolved=false means the path was not found inside Script.pvf.
   */
  readonly imageRefs: Array<{ section: string; path: string; resolved: boolean }>;

  // --- combat / difficulty ---
  /**
   * Champion bonus level thresholds. Section "champion".
   * Pure int array (5 values observed). Semantics unconfirmed.
   */
  readonly championLevels: number[] | null;

  /**
   * Pathgate spawn object IDs. Section "pathgate object".
   * Pure int array. Semantics (paired object ids?) unconfirmed.
   */
  readonly pathgateObjects: number[] | null;

  /**
   * Event monster spawn config. Section "event monster".
   * Pure int array. Positional semantics (count, rate, mobId, ...?) unconfirmed.
   */
  readonly eventMonsters: number[] | null;

  /**
   * Minimap layout encoded as a char grid (newline-separated rows).
   * Section "greed". Example: "bbnnnnee\r\n jjhhhhmm\r\n ddnnnngg\r\n bbhhhhee"
   * Character codes (b/n/e/j/h/m/d/g/etc.) are map tile types — semantics unconfirmed.
   */
  readonly greedLayout: string | null;

  /**
   * Worldmap pattern info. Section "worldmap pattern info".
   * Raw attributes preserved (shape: int, int, str-ref, int).
   * Semantics unconfirmed — kept raw for downstream decoding.
   */
  readonly worldmapPatternInfo: PvfAttribute[] | null;

  // --- escape hatch ---
  /**
   * All sections not decoded into named fields above.
   * Keyed by section name. Includes: "special passive object item",
   * "boss map specification" (goddesstemple only), "maze info" (empty attrs),
   * and any other unrecognised sections.
   */
  readonly raw: Record<string, PvfAttribute[]>;
}
