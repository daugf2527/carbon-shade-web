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

// ── SKL semantic types ──

/** Parsed skill definition from .skl bytecode analysis. */
export interface SklSkillDef {
  /** Skill ID extracted from section markers or explicit fields */
  skillId: number;
  /** Human-readable skill name resolved from stringtable or n_string.lst */
  name?: string;
  /** Job/class ID (e.g. swordman=1, demonicswordman=2 for Berserker) */
  jobId?: number;
  /** Cooldown in milliseconds */
  coolTimeMs?: number;
  /** Cast time in milliseconds */
  castTimeMs?: number;
  /** MP consumption */
  consumeMp?: number;
  /** Cube fragment cost (无色小晶块) */
  cubeCost?: number;
  /** Maximum skill level */
  maxLevel?: number;
  /** Paths to referenced .ani animation files */
  aniFileRefs: string[];
  /** Source file path (for provenance tracking) */
  sourcePath?: string;
  /** Raw command count for diagnostics */
  commandCount: number;
  /** Magic bytes valid flag */
  magicValid: boolean;
  /** Fields requiring manual verification */
  unverifiedFields?: string[];
}

// ── ANI semantic types ──

/** Raw hitbox data extracted from .ani binary format.
 *  Corresponds to [ATTACK BOX] sections in DNF .ani files.
 *  Coordinates use the DNF 2.5D coordinate system (X=horizontal, Y=vertical, Z=depth). */
export interface AniHitBox {
  /** Hitbox shape: rect for box-shaped, circle for radial */
  shape: "rect" | "circle";
  /** First animation frame this hitbox is active (0-indexed) */
  frameStart: number;
  /** Last animation frame this hitbox is active (inclusive) */
  frameEnd: number;
  /** Left/front corner X in DNF coordinate space */
  x1: number;
  /** Top corner Y in DNF coordinate space */
  y1: number;
  /** Near corner Z in DNF coordinate space */
  z1: number;
  /** Right/back corner X in DNF coordinate space */
  x2: number;
  /** Bottom corner Y in DNF coordinate space */
  y2: number;
  /** Far corner Z in DNF coordinate space */
  z2: number;
  /** Damage rate multiplier for this hitbox (1.0 = 100%) */
  damageRate?: number;
  /** Hit type classification (slash, blunt, pierce, etc.) */
  hitType?: string;
  /** Elemental attribute index */
  elementType?: number;
  /** Attack category for combo/link logic */
  attackCategory?: string;
}

/** Parsed .ani animation definition from binary format.
 *  Maps 1:1 with a DNF .ani file inside Script.pvf. */
export interface AniDef {
  /** Associated .img sprite file path (e.g. "Character/Swordman/.../ChargeDodge1.img") */
  imgPath: string;
  /** Total number of animation frames */
  totalFrames: number;
  /** Frames per second (if encoded in .ani, otherwise estimated from frame data) */
  frameRate?: number;
  /** Per-frame hitbox definitions extracted from [ATTACK BOX] sections */
  hitBoxes: AniHitBox[];
  /** Raw unparsed data sections for forward compatibility */
  rawSections: Array<{ type: string; offset: number; size: number }>;
  /** Source .ani file path (for provenance tracking) */
  sourcePath?: string;
  /** Parse diagnostics and warnings */
  parseWarnings: string[];
}

// ── Phase 4: mapper output types ──

/** Intermediate mapped action produced by SklToActionMapper.
 *  Uses string for actionName (not ActionName union) since DNF skill names
 *  may not match the existing enum. Phase 5/6 can validate and convert. */
export interface MappedFrameDataAction {
  /** Derived action name from skill name or ID */
  actionName: string;
  /** Total duration in game ticks (from .ani or estimated) */
  totalFrames: number;
  /** Startup phase frame windows */
  startup: Array<{ start: number; end: number }>;
  /** Active hitbox windows */
  active: Array<{
    start: number;
    end: number;
    id: string;
    hitGroupId: string;
    shape: string;
    offsetX: number;
    offsetZ: number;
    offsetY: number;
    w: number;
    d: number;
    h: number;
    baseDamage: number;
  }>;
  /** Cooldown from .skl properties */
  cooldownMs?: number;
  /** Cast time from .skl properties */
  castTimeMs?: number;
  /** MP cost from .skl properties */
  mpCost?: number;
  /** Cube fragment cost from .skl properties */
  cubeCost?: number;
  /** Original DNF skill ID */
  skillId: number;
  /** Resolved skill name (if stringtable available) */
  name?: string;
  /** Provenance: .skl source file */
  sourceSklPath?: string;
  /** Provenance: .ani source file */
  sourceAniPaths?: string[];
  /** Mapping issues and format gaps */
  warnings: string[];
}
