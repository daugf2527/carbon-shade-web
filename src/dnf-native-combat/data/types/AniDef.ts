import type { ExtractedDocumentProvenance } from "./Provenance.js";

/**
 * Mirrors the JSON shape emitted by `printAnimationJson` in `main.cpp`.
 * Only includes fields actually emitted to stdout; runtime-only fields
 * (delay=0 omitted, sprite omitted when empty, atk/dmg omitted when empty)
 * are optional with their absence being the canonical "not present" signal.
 */
export interface AniDocument {
  /** Internal PVF path, e.g. "character/swordman/animation/stand.ani" */
  path: string;
  /** Always "animation" for this shape */
  type: "animation";
  /** From main.cpp DNF_EXTRACT_VERSION define */
  extractor_version: string;
  /** ISO-8601 timestamp string */
  extract_timestamp: string;
  /** "crc32-head:<8hex>|size:<decimal>" — optional, absent on pre-D3 extractions */
  source_pvf_hash?: string;
  /** Number of frames; must match frames.length exactly */
  framesCount: number;
  /** True if the animation loops */
  loop: boolean;
  frames: AniDocumentFrame[];
}

/**
 * Per-frame JSON shape from `printAnimationJson`.
 * Fields emitted unconditionally: i, x, y, imgId, imgParam.
 * Fields emitted conditionally: sprite (only when path non-empty),
 *   delay (only when != 0), atk (only when attackBox non-empty),
 *   dmg (only when damageBox non-empty).
 */
export interface AniDocumentFrame {
  /** 0-based frame index */
  i: number;
  /** Anchor x offset from foot origin (signed pixel, 500×500 canvas convention) */
  x: number;
  /** Anchor y offset from foot origin (signed pixel, 500×500 canvas convention) */
  y: number;
  /** Index into the animation's internal sprite-path table */
  imgId: number;
  /** Frame index within the sprite-pack IMG file */
  imgParam: number;
  /** Sprite IMG path template (e.g. "character/swordman/body.img"). Absent when empty. */
  sprite?: string;
  /** Frame display time in ms. Absent when 0 (the C++ default). */
  delay?: number;
  /**
   * Attack (hit) boxes. Each inner array is exactly 6 ints.
   * Convention: [x1, y1, z1, x2, y2, z2] — two opposite corners of a 3D box
   * in the .ani coordinate system (verified against HitResolver2D5.ts:19).
   * Source: PvfAnimation.cpp line 57-59, each box is std::array<int32_t,6>.
   */
  atk?: ReadonlyArray<readonly [number, number, number, number, number, number]>;
  /**
   * Damage (hurt) boxes. Same 6-int [x1,y1,z1,x2,y2,z2] layout as atk.
   */
  dmg?: ReadonlyArray<readonly [number, number, number, number, number, number]>;
}

// ─── Parsed output types ─────────────────────────────────────────────────────

/**
 * 6-int hitbox tuple as stored in the .ani binary
 * (PvfAnimation.cpp:54-59 — std::array<int32_t,6>).
 *
 * Convention verified against `HitResolver2D5.ts:19`:
 *   "6-int raw coordinates: x1,y1,z1,x2,y2,z2 preserved from source data"
 *
 * Two opposite corners of a 3D box in the .ani coordinate system
 * (foot-relative pixels, 500×500 canvas convention, z = depth axis).
 * Width  = x2 - x1
 * Height = y2 - y1
 * Depth  = z2 - z1
 */
export interface HitboxRect {
  readonly raw: readonly [number, number, number, number, number, number];
  readonly x1: number;
  readonly y1: number;
  readonly z1: number;
  readonly x2: number;
  readonly y2: number;
  readonly z2: number;
}

export interface AniFrameDef {
  /** 0-based frame index (preserved from input `i` field) */
  index: number;
  /** Character foot-relative pixel anchor (500×500 canvas convention) */
  anchor: { x: number; y: number };
  /** Frame display duration in ms; null when absent in source (use default downstream) */
  delay: number | null;
  /** Sprite-pack IMG path. null when absent or empty in source. */
  sprite: string | null;
  /** Index into the animation's internal sprite-path table */
  imgId: number;
  /** Frame index within the sprite-pack IMG file */
  imgParam: number;
  /** Attack (hit) boxes; empty array when none in source */
  attackBoxes: HitboxRect[];
  /** Damage (hurt) boxes; empty array when none in source */
  damageBoxes: HitboxRect[];
}

export interface AniDef {
  /** Internal PVF path */
  path: string;
  /** Total frame count; guaranteed to equal frames.length */
  framesCount: number;
  /** Whether the animation loops */
  loop: boolean;
  frames: AniFrameDef[];
  provenance: ExtractedDocumentProvenance;
}
