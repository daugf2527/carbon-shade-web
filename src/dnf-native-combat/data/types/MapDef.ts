import type { PvfAttribute, PvfDocument, PvfRef, PvfSection } from "./PvfDocument.js";
import type { ExtractedDocumentProvenance, PvfFact, PvfStringFact } from "./Provenance.js";

/**
 * Parsed shape for `.map` documents (PVF "map" type).
 *
 * Real-PVF sample shape (Tier-1, captured 2026-05-23 from map/test_lorien/4.map):
 *   - Identification: `map name` (stringtable link), `type` (str tag), `dungeon` (int id)
 *   - Camera scrolling: `near sight scroll` / `middle sight scroll` / `far sight scroll`
 *   - Player capacity: `player number` (int list, typically [min, max])
 *   - Assets: `tile` (str list), `sound` (str list)
 *   - Spawns: `monster` / `passive object` / `special passive object` / `event monster position`
 *   - AI hints: `monster specific ai` (str list, one per spawn slot)
 *   - Routing: `pathgate pos` (int quads)
 *   - Animations: `animation` (refs interleaved with positional metadata),
 *                 `background animation` (refs)
 *   - PvP: `pvp start area` (int list) — preserved per PvE-only scope rule;
 *           runtime ignores. See [[feedback-dnf-pve-scope-only]].
 *
 * Packed/structured spawn sections preserve raw PvfAttribute[] because the
 * positional layout (count → coords → tag → repeat) is not uniformly typed.
 * Stage 2 engine consumers unpack them; Stage 1 Validate just guards shape.
 */
export interface MapDef {
  kind: "map";
  path: string;
  provenance: ExtractedDocumentProvenance;
  sections: PvfSection[];

  // Identification / display
  name: PvfStringFact | null;
  mapType: PvfStringFact | null;
  dungeonId: PvfFact<number> | null;

  // Camera scroll thresholds
  nearSightScroll: PvfFact<number> | null;
  middleSightScroll: PvfFact<number> | null;
  farSightScroll: PvfFact<number> | null;

  // Simple list sections (post-validation: all attrs typed as expected)
  tiles: string[];
  playerNumber: number[];
  sounds: string[];
  monsterAiHints: string[];
  eventMonsterPositions: number[];
  pathgatePos: number[];
  pvpStartArea: number[];

  // Packed sections: PVF positional shape preserved verbatim for downstream
  // unpacking. attributes are deep-cloned to keep MapDef immutable wrt `raw`.
  monsterSpawns: PvfAttribute[];
  passiveObjects: PvfAttribute[];
  specialPassiveObjects: PvfAttribute[];

  // Refs (mixed with positional metadata per PVF convention; allowMixed=true)
  animationRefs: PvfRef[];
  backgroundAnimation: PvfRef[];

  // Misc
  greed: PvfStringFact | null;

  raw: PvfDocument;
}
