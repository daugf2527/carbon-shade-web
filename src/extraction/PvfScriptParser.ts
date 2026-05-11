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
    const text = buf.toString("euc-kr" as BufferEncoding);
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
   * Parse stringtable.bin header into index ranges.
   * Returns an array of { start, end } offsets for each string.
   */
  static parseStringTableIndices(buf: Buffer): Array<{ start: number; end: number }> {
    const reader = new ByteReader(buf);
    if (reader.remaining < 4) return [];

    const count = reader.readUint32();
    const indices: Array<{ start: number; end: number }> = [];

    for (let i = 0; i < count; i++) {
      if (reader.remaining < 8) break;
      const start = reader.readUint32();
      const end = reader.readUint32();
      indices.push({ start, end });
    }

    return indices;
  }

  /**
   * Parse n_string.lst (index-to-text mapping).
   * Returns a Map of string table ID → key-value pair list.
   */
  static parseNStringLst(buf: Buffer): Array<{ index: number; pairs: Array<[string, string]> }> {
    const text = buf.toString("euc-kr" as BufferEncoding);
    const lines = text.split(/\r?\n/);
    const result: Array<{ index: number; pairs: Array<[string, string]> }> = [];

    let currentIndex = -1;
    let currentPairs: Array<[string, string]> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

      // Lines with ">" are key-value pairs
      const gtIdx = trimmed.indexOf(">");
      if (gtIdx > 0) {
        const key = trimmed.substring(0, gtIdx).trim();
        const value = trimmed.substring(gtIdx + 1).trim();
        currentPairs.push([key, value]);
        continue;
      }

      // Non-comment, non-key-value line might start a new section
      // Try to parse as an index number
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) {
        // Save previous section if it had content
        if (currentIndex >= 0 && currentPairs.length > 0) {
          result.push({ index: currentIndex, pairs: currentPairs });
        }
        currentIndex = num;
        currentPairs = [];
      }
    }

    // Save last section
    if (currentIndex >= 0 && currentPairs.length > 0) {
      result.push({ index: currentIndex, pairs: currentPairs });
    }

    return result;
  }
}
