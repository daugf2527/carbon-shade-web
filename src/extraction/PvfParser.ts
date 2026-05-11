// PvfParser — PVF container parser for DNF (Dungeon & Fighter) script archives.
// Parses the PVF header, decrypts the file tree using XOR+ROTR6, and extracts
// individual files by path with optional per-file decryption.
//
// Pure TypeScript, depends only on ByteReader, types, and node:crypto.

import { ByteReader } from "./ByteReader.js";
import { PvfParseError, type PvfContainer, type PvfFileEntry } from "./types.js";

/** XOR base key for PVF decryption (documented in similing4/pvf chunk.md). */
const PVF_XOR_KEY = 0x81a79011;

export class PvfParser {
  /**
   * Parse a PVF buffer. Decrypts the header tree and returns the complete file index.
   * Does NOT extract individual files — use extractFile() for that.
   */
  static parse(buf: Buffer): PvfContainer {
    const reader = new ByteReader(buf);

    // 1. Read header
    const uuidLength = reader.readUint32();
    if (uuidLength === 0 || uuidLength > 256) {
      throw new PvfParseError(`Invalid PVF uuidLength: ${uuidLength}`, reader.position - 4);
    }
    const uuid = reader.readString(uuidLength, "ascii");
    const fileVersion = reader.readUint32();
    const dirTreeLength = reader.readUint32();
    const dirTreeCrc32 = reader.readUint32();
    const headerFilesCount = reader.readUint32();

    // 2. Read and decrypt the header tree
    if (dirTreeLength === 0) {
      return {
        uuid,
        fileVersion,
        headerFilesCount: 0,
        files: [],
        filePackSize: 0,
      };
    }

    if (reader.remaining < dirTreeLength) {
      throw new PvfParseError(
        `Truncated PVF: expected ${dirTreeLength} bytes for header tree, but only ${reader.remaining} remaining`,
        reader.position
      );
    }

    const encryptedTree = reader.readBytes(dirTreeLength);
    const decryptedTree = PvfParser.decryptChunk(encryptedTree, dirTreeCrc32);

    // 3. Parse the decrypted file tree
    const treeReader = new ByteReader(decryptedTree);
    const files: PvfFileEntry[] = [];

    for (let i = 0; i < headerFilesCount; i++) {
      if (treeReader.remaining < 16) {
        // 4 + 4 + 8 minimum (fileNumber + filePathLength + fileLength + fileCrc32 + relativeOffset)
        throw new PvfParseError(
          `Truncated PVF file tree: expected entry ${i}/${headerFilesCount}, but only ${treeReader.remaining} bytes remaining`,
          treeReader.position
        );
      }

      const fileNumber = treeReader.readUint32();
      const filePathLength = treeReader.readUint32();

      if (filePathLength === 0 || treeReader.remaining < filePathLength + 12) {
        throw new PvfParseError(
          `Truncated PVF file path: path length ${filePathLength} exceeds remaining bytes`,
          treeReader.position
        );
      }

      // Read file path (CP949 encoded)
      const path = treeReader.readEUCKR(filePathLength);

      const fileLength = treeReader.readUint32();
      const fileCrc32 = treeReader.readUint32();
      const relativeOffset = treeReader.readUint32();

      // Normalize path separators (PVF uses backslash, we use forward slash)
      const normalizedPath = path.replace(/\\/g, "/");
      const segments = normalizedPath.split("/").filter(s => s.length > 0);

      files.push({
        fileNumber,
        path: normalizedPath,
        size: fileLength,
        crc32: fileCrc32,
        offset: relativeOffset,
        segments,
      });
    }

    // 4. Calculate filePack size (remaining bytes after header tree)
    const filePackSize = reader.remaining;

    return {
      uuid,
      fileVersion,
      headerFilesCount,
      files,
      filePackSize,
    };
  }

  /**
   * Extract a single file from the PVF by path.
   * Returns the raw bytes (decrypted if the file has its own CRC32).
   * Returns undefined if the file is not found.
   *
   * @param buf - The original PVF buffer.
   * @param container - The parsed PvfContainer (from parse()).
   * @param filePath - The exact path to extract (forward-slash separated).
   */
  static extractFile(buf: Buffer, container: PvfContainer, filePath: string): Buffer | undefined {
    const normalizedPath = filePath.replace(/\\/g, "/");
    const entry = container.files.find(f => f.path === normalizedPath);
    if (!entry) return undefined;

    // Calculate absolute offset: header ends where filePack begins
    // header = uuidLength(4) + uuid(uuidLength) + fileVersion(4) + dirTreeLength(4) + dirTreeCrc32(4) + headerFilesCount(4) + dirTreeLength
    const headerSize = 4 + Buffer.byteLength(container.uuid, "ascii") + 4 + 4 + 4 + 4;
    // The dirTreeLength was already consumed from the buffer in parse()
    // We don't have enough info to reconstruct the exact offset, so we use a simpler approach:
    // The filePack starts after the header + encrypted tree
    // We can find filePackStart from: total buffer length - filePackSize
    const filePackStart = buf.length - container.filePackSize;
    const absoluteOffset = filePackStart + entry.offset;

    if (absoluteOffset + entry.size > buf.length) {
      return undefined; // offset out of bounds
    }

    const raw = buf.subarray(absoluteOffset, absoluteOffset + entry.size);

    // If the file has its own CRC32, decrypt it
    if (entry.crc32 !== 0) {
      return PvfParser.decryptChunk(Buffer.from(raw), entry.crc32);
    }

    return Buffer.from(raw);
  }

  /**
   * Decrypt a chunk of PVF-encrypted data using the XOR+ROTR6 algorithm.
   * Exposed publicly for testability.
   *
   * Algorithm (from chunk.md):
   *   For each 4-byte chunk:
   *     1. value = le_u32(chunk)
   *     2. value ^= key        // key = 0x81A79011 ^ crc32
   *     3. value = rotate_right(value, 6)  // last 6 bits → first 6 bits
   *     4. write le_u32(value) to output
   */
  static decryptChunk(buf: Buffer, crc32: number): Buffer {
    const key = (PVF_XOR_KEY ^ crc32) >>> 0;
    const result = Buffer.alloc(buf.length);

    // Process in 4-byte chunks
    const chunkCount = Math.floor(buf.length / 4);
    for (let i = 0; i < chunkCount; i++) {
      const offset = i * 4;

      // Read 4 bytes as LE uint32
      const b0 = buf[offset]!;
      const b1 = buf[offset + 1]!;
      const b2 = buf[offset + 2]!;
      const b3 = buf[offset + 3]!;
      let value = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;

      // XOR with key
      value ^= key;

      // Rotate right 6 bits
      value = ((value >>> 6) | (value << 26)) >>> 0;

      // Write back as LE
      result[offset] = value & 0xff;
      result[offset + 1] = (value >>> 8) & 0xff;
      result[offset + 2] = (value >>> 16) & 0xff;
      result[offset + 3] = (value >>> 24) & 0xff;
    }

    // Copy remaining bytes (less than 4) as-is
    const remaining = buf.length % 4;
    if (remaining > 0) {
      const start = chunkCount * 4;
      for (let i = 0; i < remaining; i++) {
        result[start + i] = buf[start + i]!;
      }
    }

    return result;
  }
}
