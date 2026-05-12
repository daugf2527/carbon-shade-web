// SklAnalyzer — Semantic analyzer for .skl bytecode files.
// Parses the flat PvfScriptCommand stream into structured SklSkillDef objects.
//
// The .skl bytecode format (parsed by PvfScriptParser) is a flat stream of
// 5-byte commands: [1B typeFlag][4B data]. This analyzer groups them into
// sections and extracts identifiable skill properties.
//
// Current coverage: section grouping, ani file reference extraction,
// string resolution, basic property collection. Full field mapping
// requires community PVF documentation and is a Batch C task.

import { PvfScriptParser } from "./PvfScriptParser.js";
import type { PvfScriptCommand, PvfScriptFile, SklSkillDef } from "./types.js";

/** Known skill property command IDs (from community PVF documentation).
 *  These are the command values that appear after section markers
 *  in .skl files. Mapping is incomplete — unverified fields are tracked. */
const KNOWN_PROPERTY_IDS: Record<number, string> = {
  // Common skill metadata (community-sourced, unverified)
  0x00: "skillId",
  0x01: "jobId",
  0x02: "level",
  0x03: "maxLevel",
  0x04: "coolTime",
  0x05: "castTime",
  0x06: "consumeMp",
  0x07: "cubeCost",
  0x08: "commandInput",
  0x09: "iconIndex",
  0x0A: "aniIndex",
  // Skill type / flags
  0x10: "skillType",
  0x11: "damageType",
  0x12: "elementType",
  // Animation references (command IDs that hold .ani paths)
  0x20: "castAni",
  0x21: "hitAni",
  0x22: "effectAni",
};

/** Section IDs found in cancel*.skl files (reverse-engineered from DNF Script.pvf,
 *  2026-05). These section markers encode cancel window configuration:
 *  - 371543: cancel window start frame (e.g. Gorecross=50, Backstep=70, Smasher=10)
 *  - 241483: cancel window duration in frames (e.g. Gorecross=20, Bloodsword=40)
 *  - 371546: cancel group/type (0-4, e.g. Gorecross=2, Vaneslash=0, Backstep=4)
 *  - 371547: weapon-type bitmask (6 bits; [1,1,1,1,1,1]=universal)
 *  - 371549: allowed target slot list ([3]=single, [0-4]=all 5 hotbar slots)
 *  - 18696: skill level required for cancel (always 1 in cancel files)
 *  - 5978:  skill category string ID ("12149"=cancel category, "12350"=skill name)
 *  - 371586: subclass additional skill refs (demonic swordman advanced classes)
 *  - 18419: animation frame refs (string ID + int frame-number pairs)
 *  - 371575: file terminator (checksum)
 * See docs/research/pvf-ani-toolchain-research.md and crt-002-frame-evidence.md
 * for background on why cancel windows were previously thought unextractable. */
const CANCEL_SECTION_IDS: Record<number, string> = {
  371543: "cancelWindowStart",
  241483: "cancelWindowDuration",
  371546: "cancelGroup",
  371547: "cancelWeaponMask",
  371549: "cancelTargetSlots",
  18696:  "cancelRequiredLevel",
  5978:   "cancelCategoryString",
  371586: "cancelSubclassRefs",
  18419:  "cancelAnimFrameRefs",
  371575: "cancelFileTerminator",
};

/** Extract potential .ani file references from command streams.
 *  Matches patterns like "character/swordman/effect/animation/..." */
function looksLikeAniPath(value: string): boolean {
  return /\.(ani|img|act|ptl)$/i.test(value)
    || /\/animation\//i.test(value)
    || /^sprite\//i.test(value)
    || /^character\//i.test(value);
}

export class SklAnalyzer {
  /**
   * Analyze a parsed .skl file and extract structured skill data.
   *
   * @param scriptFile — parsed output from PvfScriptParser.parse()
   * @param stringTable — optional string lookup map (index → text)
   * @param sourcePath — source file path for provenance
   */
  static analyze(
    scriptFile: PvfScriptFile,
    stringTable?: Map<number, string>,
    sourcePath?: string,
  ): SklSkillDef {
    const commands = scriptFile.commands;
    const unverifiedFields: string[] = [];
    const aniFileRefs: string[] = [];
    const props: Record<string, number | string> = {};
    let currentSection = 0;

    // Track string link indices for resolution
    const stringRefs: Array<{ commandIdx: number; stringIdx: number }> = [];

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]!;

      switch (cmd.type) {
        case "section":
          // Section markers define new property groups
          // The int value is the section number
          if (typeof cmd.value === "number") {
            currentSection = cmd.value;
          }
          break;

        case "command":
          // Command values are property identifiers
          // Next one or two commands typically hold the value
          if (typeof cmd.value === "number") {
            const propName = KNOWN_PROPERTY_IDS[cmd.value] ?? `cmd_0x${cmd.value.toString(16).padStart(2, "0")}`;
            if (!KNOWN_PROPERTY_IDS[cmd.value]) {
              unverifiedFields.push(propName);
            }

            // Look ahead for the property value (int/float/string/stringLink)
            if (i + 1 < commands.length) {
              const nextCmd = commands[i + 1]!;
              if (nextCmd.type === "int" || nextCmd.type === "intEx") {
                props[propName] = nextCmd.value as number;
              } else if (nextCmd.type === "float") {
                props[propName] = nextCmd.value as number;
              } else if (nextCmd.type === "string") {
                const strVal = nextCmd.value as string;
                props[propName] = strVal;
                if (looksLikeAniPath(strVal)) {
                  aniFileRefs.push(strVal);
                }
              } else if (nextCmd.type === "stringLinkIndex") {
                stringRefs.push({
                  commandIdx: i,
                  stringIdx: nextCmd.value as number,
                });
              }
            }
          }
          break;

        case "stringLink":
          // Direct string link with index — resolve via stringtable
          if (typeof cmd.value === "number" && stringTable) {
            const resolved = stringTable.get(cmd.value);
            if (resolved) {
              if (looksLikeAniPath(resolved)) {
                aniFileRefs.push(resolved);
              }
            }
          }
          break;

        case "string":
          // Standalone string value (not preceded by a command marker)
          if (typeof cmd.value === "string" && looksLikeAniPath(cmd.value)) {
            aniFileRefs.push(cmd.value);
          }
          break;
      }
    }

    // Build the skill definition
    const name = (props["name"] as string)
      ?? stringTable?.get(props["skillId"] as number)
      ?? (sourcePath ? sourcePath.replace(/^.*[\\/]skill_[^_]+_/, "").replace(/\.skl$/, "") : undefined);

    return {
      skillId: (props["skillId"] as number) ?? 0,
      name,
      jobId: props["jobId"] as number | undefined,
      coolTimeMs: props["coolTime"] as number | undefined,
      castTimeMs: props["castTime"] as number | undefined,
      consumeMp: props["consumeMp"] as number | undefined,
      cubeCost: props["cubeCost"] as number | undefined,
      maxLevel: props["maxLevel"] as number | undefined,
      aniFileRefs: [...new Set(aniFileRefs)],
      sourcePath,
      commandCount: commands.length,
      magicValid: scriptFile.magicValid,
      unverifiedFields: unverifiedFields.length > 0
        ? [...new Set(unverifiedFields)]
        : undefined,
    };
  }

  /**
   * Load and parse a .skl file buffer, then analyze it.
   * Convenience method combining PvfScriptParser.parse() + analyze().
   */
  static parseAndAnalyze(
    buf: Buffer,
    stringTable?: Map<number, string>,
    sourcePath?: string,
  ): SklSkillDef {
    const scriptFile = PvfScriptParser.parse(buf);
    return SklAnalyzer.analyze(scriptFile, stringTable, sourcePath);
  }

  /**
   * Build a string lookup table from extracted stringtable.bin and n_string.lst data.
   *
   * @param stringTableBuf — raw stringtable.bin buffer
   * @param nStringLstBuf — raw n_string.lst buffer (binary bytecode format)
   * @returns Map of index → resolved string value
   */
  static buildStringTable(
    stringTableBuf: Buffer,
    nStringLstBuf: Buffer,
  ): Map<number, string> {
    const result = new Map<number, string>();

    // Parse stringtable.bin with EUC-KR decoding (handles dual offset modes)
    const stringEntries = PvfScriptParser.parseStringTable(stringTableBuf);
    for (const entry of stringEntries) {
      result.set(entry.index, entry.string);
    }

    // Parse n_string.lst (binary bytecode format — NOT text)
    const lstMap = PvfScriptParser.parseNStringLst(nStringLstBuf);

    // Merge n_string.lst key-value pairs: try "name" → resolved name
    for (const [sectionIndex, pairs] of lstMap) {
      const name = pairs.get("name") ?? pairs.get("Name") ?? pairs.get("skillName");
      if (name) {
        // Use section index as key; stringtable may also have entries at this index
        if (!result.has(sectionIndex)) {
          result.set(sectionIndex, name);
        }
      }
      // Also merge individual pairs that look like name mappings
      for (const [key, value] of pairs) {
        if (key && value && !key.startsWith("_")) {
          // Index this by a hash of the key for cross-reference
          // The exact mapping scheme depends on how DNF references these
        }
      }
    }

    return result;
  }
}
