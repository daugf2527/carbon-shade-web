/**
 * EtcDef — parsed representation of a DNF .etc file.
 *
 * .etc files are character/item attribute lookup tables with 595+ instances in
 * Script.pvf, organized under character/characteretc/, etc/, aicharacter/, etc.
 *
 * Dominant structure: repeating "key value index" sections, each leading with a
 * str key followed by int pairs `(value, index)`.
 *
 * Pairing convention (Tier-1, verified 2026-05-23 against swordman.etc /
 * fighter.etc / etc/deathtower.etc):
 *   - After the leading str key, ints come in adjacent pairs: (value, index).
 *   - Even-count suffix: all ints form complete pairs →
 *       indexedValues[index] = value  for each pair.
 *   - Odd-count suffix: floor(n/2) complete pairs are parsed;
 *       the trailing orphan int is preserved in `values` but indexedValues
 *       covers only the even prefix.
 *   - 0 or 1 trailing ints (no pairs): indexedValues = null.
 *
 * Beyond "key value index", swordman/fighter.etc also contain:
 *   - "key value string" — same key-first pattern but with (str, int) pairs
 *   - "equipment index"  — single matrix attribute
 * These are captured verbatim in `raw`.
 */

import type { ExtractedDocumentProvenance } from "./Provenance.js";
import type { PvfAttribute, PvfSection } from "./PvfDocument.js";

export interface EtcKeyValueEntry {
  /** The lookup key (first str attribute of the section). */
  readonly key: string;
  /** Raw int sequence after the str key — all ints in original order. */
  readonly values: number[];
  /**
   * Parsed (value, index) pairs as a Record<index, value>.
   * Populated when there are at least 2 trailing ints (≥1 complete pair).
   * Null when there are 0 or 1 ints (no complete pair possible).
   *
   * Example — weaponsubtypeindex:
   *   raw ints: [27900,0, 27000,1, 27600,2, ...]
   *   indexedValues: { 0: 27900, 1: 27000, 2: 27600, ... }
   *
   * Example — heaviestweapon: raw ints: [3] → indexedValues: null
   */
  readonly indexedValues: Record<number, number> | null;
}

export interface EtcDef {
  readonly kind: "etc";
  readonly path: string;
  readonly provenance: ExtractedDocumentProvenance;
  /** Original document sections (structuredClone), preserved for downstream
   *  consumers that need raw shape. The pipeline runner strips this field
   *  before writing parse.jsonl to keep output compact. */
  readonly sections: PvfSection[];

  /**
   * All "key value index" sections in document order, one entry per section.
   * Preserves duplicate keys if they occur (first-wins in byKey).
   */
  readonly entries: EtcKeyValueEntry[];

  /**
   * O(1) lookup by key name. Built from entries[] at parse time; first match
   * wins when duplicate keys are present (not observed in Tier-1 samples).
   */
  readonly byKey: Record<string, EtcKeyValueEntry>;

  /**
   * Non-"key value index" sections preserved verbatim for inspection.
   * Maps section name → array of attribute lists (one per section occurrence).
   * Observed non-KVI sections: "key value string", "equipment index".
   */
  readonly raw: Record<string, PvfAttribute[][]>;
}
