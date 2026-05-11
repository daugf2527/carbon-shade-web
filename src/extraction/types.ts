// Extraction types — shared interfaces and error types for NPK/IMG/PVF parsers.
// Pure TypeScript, no external dependencies, compatible with Node.js and Vite.

// ── Error types ──

/** Base error class for all extraction-related errors. */
export class ExtractionError extends Error {
  constructor(message: string, public readonly byteOffset?: number) {
    super(message);
    this.name = "ExtractionError";
  }
}

/** Thrown when NPK container parsing fails. */
export class NpkParseError extends ExtractionError {
  constructor(message: string, byteOffset?: number, public readonly partial?: boolean) {
    super(message, byteOffset);
    this.name = "NpkParseError";
  }
}

/** Thrown when IMG frame parsing fails. */
export class ImgParseError extends ExtractionError {
  constructor(message: string, byteOffset?: number, public readonly frameIndex?: number) {
    super(message, byteOffset);
    this.name = "ImgParseError";
  }
}

/** Thrown when PVF container or file extraction fails. */
export class PvfParseError extends ExtractionError {
  constructor(message: string, byteOffset?: number) {
    super(message, byteOffset);
    this.name = "PvfParseError";
  }
}

// ── NPK types ──

export interface NpkImgEntry {
  /** Byte offset in the NPK file where this IMG's data begins */
  offset: number;
  /** Size in bytes of the IMG data */
  size: number;
  /** Decrypted filename */
  name: string;
  /** Raw encrypted name bytes (debug aid) */
  rawName: Uint8Array;
}

export interface NpkContainer {
  /** Parsed from magic "NeoplePack_Bill\0\0" */
  imgCount: number;
  /** Stored SHA256 checksum from file (32 bytes), hex-encoded */
  storedChecksum: string;
  /** Computed SHA256 of all index entries + IMG data */
  computedChecksum: string;
  /** Whether stored and computed checksums match */
  checksumMatches: boolean;
  /** Parsed index entries, one per IMG */
  entries: NpkImgEntry[];
}

// ── IMG types ──

export type ImgVersion = 2 | 4 | 5 | 6;

export type ImgFrameType = "image" | "link";

export interface ImgFrame {
  frameIndex: number;
  type: ImgFrameType;

  // Image frame fields (undefined for link frames)
  colorMode?: number;        // 0x0E=1555, 0x0F=4444, 0x10=8888, 0x11=link
  compression?: number;      // 0x05=uncompressed, 0x06=ZLIB
  width?: number;            // pixel width
  height?: number;           // pixel height
  data?: Uint8Array;         // raw pixel data (decompressed if compression=ZLIB)
  pivotX?: number;           // draw start X (int32, can be negative)
  pivotY?: number;           // draw start Y (int32, can be negative)
  frameWidth?: number;       // bounding box width
  frameHeight?: number;      // bounding box height

  // Link frame fields (undefined for image frames)
  linkFrame?: number;        // target frame index (only when type="link")

  // Raw compressed data (only populated if decompress=false)
  rawData?: Uint8Array;
  compressedSize?: number;

  // Error flag (set on ZLIB failure or truncation)
  error?: string;

  // DDS flag for V5 frames
  format?: string;
}

export interface ImgContainer {
  version: ImgVersion;
  indexCount: number;
  frames: ImgFrame[];
  /** Byte counts for diagnostics */
  stats: ImgStats;
  /** V4 palette data (256 × 4 bytes RGBA), undefined for V2/V5/V6 */
  palette?: Uint8Array;
}

export interface ImgStats {
  headerBytes: number;
  indexBytes: number;
  dataBytes: number;
  compressedFrames: number;
  linkFrames: number;
}

export interface ImgParseOptions {
  /** If true, decompress ZLIB-compressed frames. Default: true */
  decompress?: boolean;
  /** If true, resolve link frames to their target frames (one level only). Default: true */
  resolveLinks?: boolean;
}

// ── PVF types ──

export interface PvfFileEntry {
  fileNumber: number;
  /** Full path, CP949-decoded (e.g. "sprite/character/swordman/...") */
  path: string;
  /** File size in bytes */
  size: number;
  /** CRC32 checksum for this file's data */
  crc32: number;
  /** Byte offset within the filePack region */
  offset: number;
  /** Path segments for convenient filtering */
  segments: string[];
}

export interface PvfContainer {
  uuid: string;
  fileVersion: number;
  headerFilesCount: number;
  /** Decrypted file tree */
  files: PvfFileEntry[];
  /** Total size of the filePack region */
  filePackSize: number;
}

// ── PVF script types ──

export type PvfScriptType =
  | "int"
  | "intEx"
  | "float"
  | "section"
  | "command"
  | "string"
  | "commandSeparator"
  | "stringLinkIndex"
  | "stringLink";

export interface PvfScriptCommand {
  type: PvfScriptType;
  value: number | string;
  /** Raw type flag byte and data bytes */
  raw?: { typeFlag: number; data: Uint8Array };
}

export interface PvfScriptFile {
  /** Verified from magic bytes 0xB0 0xD0 */
  magicValid: boolean;
  commands: PvfScriptCommand[];
}

export interface EquipmentDefinition {
  id: number;
  name: string;
  type: string;
  grade: string;
  stats: Record<string, number>;
}

// ── Extraction provenance (for output metadata) ──

export interface ExtractionProvenance {
  source: string;
  extractionDate: string;
  parserVersion: string;
  toolchain: string;
  checksum?: {
    algorithm: string;
    value: string;
    matches: boolean;
  };
}
