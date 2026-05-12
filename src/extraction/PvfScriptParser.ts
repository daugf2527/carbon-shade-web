// PvfScriptParser — bytecode script parser for DNF PVF .skl files.
// Parses the .skl bytecode format (magic 0xB0 0xD0, 9 script types),
// equipment.lst, and stringtable.bin / n_string.lst.
//
// Pure TypeScript, depends only on ByteReader and types.

import { ByteReader } from "./ByteReader.js";
import type { PvfScriptCommand, PvfScriptFile, PvfScriptType, EquipmentDefinition } from "./types.js";

/** Magic bytes for .skl files. */
const SKL_MAGIC_B0 = 0xb0;
const SKL_MAGIC_D0 = 0xd0;

/** Script type flag → type name mapping (from chunk.md). */
const SCRIPT_TYPE_MAP: Record<number, PvfScriptType> = {
  2: "int",
  3: "intEx",
  4: "float",
  5: "section",
  6: "command",
  7: "string",
  8: "commandSeparator",
  9: "stringLinkIndex",
  10: "stringLink",
};

export class PvfScriptParser {
  /**
   * Parse a .skl file's bytecode into structured script chunks.
   */
  static parse(buf: Buffer): PvfScriptFile {
    const reader = new ByteReader(buf);

    if (reader.remaining < 2) {
      return { magicValid: false, commands: [] };
    }

    // Verify magic bytes 0xB0 0xD0
    const b0 = reader.readUint8();
    const b1 = reader.readUint8();
    const magicValid = b0 === SKL_MAGIC_B0 && b1 === SKL_MAGIC_D0;

    const commands: PvfScriptCommand[] = [];

    // Parse alternating 1B type flag + 4B data value
    while (reader.remaining >= 5) {
      const typeFlag = reader.readUint8();
      const dataStart = reader.position;
      const rawData = reader.readBytes(4);
      const dataValue = new DataView(rawData.buffer, rawData.byteOffset, 4).getUint32(0, true);

      const type = SCRIPT_TYPE_MAP[typeFlag] ?? `unknown(${typeFlag})`;

      let value: number | string = dataValue;

      // For float type, interpret as 32-bit float
      if (typeFlag === 4) {
        value = Number(new DataView(rawData.buffer, rawData.byteOffset, 4).getFloat32(0, true).toFixed(6));
      }

      commands.push({
        type: type as PvfScriptType,
        value,
        raw: { typeFlag, data: new Uint8Array(rawData) },
      });
    }

    // Handle remaining bytes (< 5) — incomplete command at end
    if (reader.remaining > 0) {
      // Skip trailing partial bytes silently
    }

    return { magicValid, commands };
  }

  /**
   * Parse equipment.lst into structured equipment definitions.
   * Equipment.lst uses a line-based format: "id\tname\ttype\tgrade\tstat1=val1\tstat2=val2..."
   */
  static parseEquipmentLst(buf: Buffer): EquipmentDefinition[] {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const iconv = require("iconv-lite");
    const text = iconv.decode(buf, "cp949");
    const lines = text.split(/\r?\n/);
    const equipment: EquipmentDefinition[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

      const parts = trimmed.split("\t");
      if (parts.length < 4) continue;

      const id = parseInt(parts[0]!, 10);
      if (isNaN(id)) continue;

      const name = parts[1] ?? "";
      const type = parts[2] ?? "";
      const grade = parts[3] ?? "";
      const stats: Record<string, number> = {};

      // Parse remaining tab-separated stats (key=value format)
      for (let i = 4; i < parts.length; i++) {
        const statPart = parts[i] ?? "";
        const eqIdx = statPart.indexOf("=");
        if (eqIdx > 0) {
          const key = statPart.substring(0, eqIdx).trim();
          const val = parseFloat(statPart.substring(eqIdx + 1).trim());
          if (!isNaN(val)) {
            stats[key] = val;
          }
        }
      }

      equipment.push({ id, name, type, grade, stats });
    }

    return equipment;
  }

  /**
   * Parse stringtable.bin into index ranges with decoded string data.
   *
   * stringtable.bin structure (reverse-engineered from DNF Script.pvf):
   *   [4B] count (uint32 LE)
   *   [8B × count] index entries: start (uint32) + end (uint32)
   *   [variable] string data block
   *
   * The index offsets are relative to the string data block start
   * (= 4 + count*8). Each pair [start, end) delimits one EUC-KR
   * encoded string in the data block.
   *
   * Returns an array of { index, string } for every valid entry.
   */
  static parseStringTable(buf: Buffer): Array<{ index: number; string: string }> {
    if (buf.length < 4) return [];

    const count = buf.readUInt32LE(0);
    const indexAreaSize = count * 8;
    const stringBlockStart = 4 + indexAreaSize;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const iconv = require("iconv-lite");

    const results: Array<{ index: number; string: string }> = [];

    for (let i = 0; i < count; i++) {
      const indexOff = 4 + i * 8;
      if (indexOff + 8 > buf.length) break;

      const start = buf.readUInt32LE(indexOff);
      const end = buf.readUInt32LE(indexOff + 8);
      const len = end - start;

      if (len <= 0 || len > 10000) continue;

      // Try relative offset first (stringBlockStart + start)
      let absStart = stringBlockStart + start;
      let absEnd = absStart + len;

      // If relative goes past buffer, try absolute offset
      if (absEnd > buf.length) {
        absStart = start;
        absEnd = start + len;
      }

      // Still out of bounds — skip
      if (absStart < 0 || absEnd > buf.length || absStart >= buf.length) continue;

      try {
        const slice = buf.subarray(absStart, absEnd);
        const decoded = iconv.decode(Buffer.from(slice), "cp949").replace(/\x00/g, "");
        if (decoded.length > 0) {
          results.push({ index: i, string: decoded });
        }
      } catch {
        // Skip undecodable entries
      }
    }

    return results;
  }

  /**
   * Parse n_string.lst — note this file is binary .skl bytecode format
   * (magic 0xB0 0xD0), NOT a plain-text .lst file. We parse it as a
   * PvfScriptFile and extract key-value pair mappings.
   *
   * Returns a Map of string table index → Map<key, value> pairs.
   */
  static parseNStringLst(buf: Buffer): Map<number, Map<string, string>> {
    const result = new Map<number, Map<string, string>>();

    // Parse as bytecode script (n_string.lst starts with 0xB0 0xD0 magic)
    const scriptFile = PvfScriptParser.parse(buf);

    let currentIndex = -1;
    let currentPairs = new Map<string, string>();
    let lastKey: string | null = null;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const iconv = require("iconv-lite");

    for (const cmd of scriptFile.commands) {
      // Section markers (type 5) may indicate a new index group
      if (cmd.type === "section" && typeof cmd.value === "number") {
        // Save previous section if it had content
        if (currentIndex >= 0 && currentPairs.size > 0) {
          result.set(currentIndex, currentPairs);
        }
        currentIndex = cmd.value;
        currentPairs = new Map<string, string>();
        lastKey = null;
        continue;
      }

      // String values (type 7) — could be a key or a value
      if (cmd.type === "string" && typeof cmd.value === "string") {
        const strVal = cmd.value;
        if (lastKey === null) {
          // First string in a pair is the key
          lastKey = strVal;
        } else {
          // Second string is the value
          currentPairs.set(lastKey, strVal);
          lastKey = null;
        }
        continue;
      }

      // Int values (type 2/3) might be standalone indices
      if ((cmd.type === "int" || cmd.type === "intEx") && typeof cmd.value === "number") {
        // If we have no current index and this looks like an index, start new section
        if (currentIndex < 0) {
          currentIndex = cmd.value;
          currentPairs = new Map<string, string>();
          lastKey = null;
        }
        continue;
      }

      // stringLinkIndex (type 9) and stringLink (type 10) — resolve via iconv
      if (cmd.type === "stringLinkIndex" || cmd.type === "stringLink") {
        // These reference the stringtable; handled by the caller
        continue;
      }

      // commandSeparator (type 8) — delimiter between groups
      if (cmd.type === "commandSeparator") {
        if (currentIndex >= 0 && currentPairs.size > 0) {
          result.set(currentIndex, currentPairs);
        }
        currentIndex = -1;
        currentPairs = new Map<string, string>();
        lastKey = null;
        continue;
      }
    }

    // Save final section
    if (currentIndex >= 0 && currentPairs.size > 0) {
      result.set(currentIndex, currentPairs);
    }

    return result;
  }
}
