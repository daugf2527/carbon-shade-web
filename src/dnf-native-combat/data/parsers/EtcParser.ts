/**
 * EtcParser — parses DNF .etc documents (character/item attribute lookup tables).
 *
 * .etc files contain repeating "key value index" sections where each section
 * starts with a str key followed by int pairs (value, index).  Additional
 * section names ("key value string", "equipment index", etc.) are preserved in
 * EtcDef.raw without interpretation.
 *
 * Pairing convention (Tier-1 verified against swordman.etc / fighter.etc,
 * 2026-05-23):  ints after the str key come in adjacent pairs (value, index),
 * building indexedValues[index] = value.  A trailing orphan when the count is
 * odd is included in `values` but does not contribute a complete pair.
 */

import type { PvfDocument, PvfAttribute } from "../types/PvfDocument.js";
import type { EtcDef, EtcKeyValueEntry } from "../types/EtcDef.js";
import { documentProvenance, numberValue, sectionsByName, stringValue } from "./parserUtils.js";

const KVI = "key value index";

/**
 * Parse the int attributes that follow the leading str key in a
 * "key value index" section into (value, index) pairs.
 *
 * Returns null when there are fewer than 2 ints (no complete pair possible).
 */
function buildIndexedValues(ints: number[]): Record<number, number> | null {
  if (ints.length < 2) return null;
  const result: Record<number, number> = {};
  // Adjacent pairs: position 0 = value, position 1 = index, repeat.
  const pairCount = Math.floor(ints.length / 2);
  for (let i = 0; i < pairCount; i++) {
    const value = ints[i * 2];
    const index = ints[i * 2 + 1];
    result[index] = value;
  }
  return result;
}

/**
 * Parse a .etc PvfDocument into an EtcDef.
 *
 * Throws if:
 *   - document.path does not end with ".etc"
 *   - a "key value index" section's first attribute is not t:"str"
 *   - a "key value index" section contains a non-numeric attribute after the key
 */
export function parseEtcDocument(document: PvfDocument): EtcDef {
  if (!document.path.toLowerCase().endsWith(".etc")) {
    throw new Error(`EtcParser expected .etc document, got ${document.path}`);
  }

  const kviSections = sectionsByName(document, KVI);
  const entries: EtcKeyValueEntry[] = [];
  const byKey: Record<string, EtcKeyValueEntry> = {};

  for (const section of kviSections) {
    const attrs = section.attributes;

    // First attribute must be a str — it is the lookup key.
    if (attrs.length === 0 || attrs[0].t !== "str") {
      throw new Error(
        `EtcParser: "key value index" section first attribute must be t:"str", ` +
        `got t:"${attrs.length === 0 ? "(empty)" : attrs[0].t}" in ${document.path}`
      );
    }

    const key = stringValue(attrs[0]);
    if (key === null) {
      throw new Error(
        `EtcParser: "key value index" first attribute has t:"str" but null value in ${document.path}`
      );
    }

    // Remaining attributes must all be numeric (int or float).
    const intAttrs = attrs.slice(1);
    const ints: number[] = [];
    for (let i = 0; i < intAttrs.length; i++) {
      const v = numberValue(intAttrs[i]);
      if (v === null) {
        throw new Error(
          `EtcParser: "key value index" section key "${key}" attribute[${i + 1}] ` +
          `has non-numeric type "${intAttrs[i].t}" in ${document.path}`
        );
      }
      ints.push(v);
    }

    const entry: EtcKeyValueEntry = {
      key,
      values: ints,
      indexedValues: buildIndexedValues(ints),
    };

    entries.push(entry);
    // First-wins on duplicate keys (not observed in Tier-1 samples but spec'd).
    if (!(key in byKey)) {
      byKey[key] = entry;
    }
  }

  // Collect all non-KVI sections into raw, preserving duplicates.
  const raw: Record<string, PvfAttribute[][]> = {};
  for (const section of document.sections) {
    if (section.name === KVI) continue;
    if (!(section.name in raw)) {
      raw[section.name] = [];
    }
    raw[section.name].push(section.attributes);
  }

  return {
    kind: "etc",
    path: document.path,
    provenance: documentProvenance(document),
    sections: structuredClone(document.sections),
    entries,
    byKey,
    raw,
  };
}
