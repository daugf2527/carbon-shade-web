import type { AniDef, AniDocument, AniDocumentFrame, AniFrameDef, HitboxRect } from "../types/AniDef.js";
import type { ExtractedDocumentProvenance } from "../types/Provenance.js";

export function parseAniDocument(document: AniDocument): AniDef {
  if (!document.path.toLowerCase().endsWith(".ani")) {
    throw new Error(`[AniParser] expected .ani document, got ${document.path}`);
  }

  if (!Array.isArray(document.frames)) {
    throw new Error(
      `[AniParser] missing "frames" array in ${document.path}. ` +
      `Real PVF .ani always emits a frames array (even framesCount=0 emits []).`,
    );
  }

  if (document.frames.length !== document.framesCount) {
    throw new Error(
      `[AniParser] framesCount mismatch in ${document.path}: ` +
      `declared framesCount=${document.framesCount} but frames.length=${document.frames.length}. ` +
      `Real PVF .ani data is uniformly consistent; mismatch indicates corrupted or malformed extractor output.`,
    );
  }

  return {
    path: document.path,
    framesCount: document.framesCount,
    loop: Boolean(document.loop),
    frames: document.frames.map((frame, idx) => parseFrame(frame, idx, document.path)),
    provenance: animationProvenance(document),
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function animationProvenance(document: AniDocument): ExtractedDocumentProvenance {
  const provenance: ExtractedDocumentProvenance = {
    extractorVersion: document.extractor_version,
    extractTimestamp: document.extract_timestamp,
    sourceRef: `pvf:${document.path}`,
  };
  if (typeof document.source_pvf_hash === "string" && document.source_pvf_hash.length > 0) {
    provenance.sourcePvfHash = document.source_pvf_hash;
  }
  return provenance;
}

function parseFrame(frame: AniDocumentFrame, idx: number, sourcePath: string): AniFrameDef {
  return {
    index: frame.i,
    anchor: { x: frame.x, y: frame.y },
    delay: (frame.delay !== undefined && frame.delay !== null) ? frame.delay : null,
    sprite: (typeof frame.sprite === "string" && frame.sprite.length > 0) ? frame.sprite : null,
    imgId: frame.imgId,
    imgParam: frame.imgParam,
    attackBoxes: parseBoxes(frame.atk, "atk", idx, sourcePath),
    damageBoxes: parseBoxes(frame.dmg, "dmg", idx, sourcePath),
  };
}

/**
 * Parses an array of 6-int hitbox tuples. Each row must be exactly 6 numbers.
 * Absent or undefined → empty array (tolerated: many frames have no boxes).
 * Row with wrong length or non-numbers → throw (PVF invariant).
 */
function parseBoxes(
  boxes: ReadonlyArray<readonly unknown[]> | undefined | null,
  field: "atk" | "dmg",
  frameIdx: number,
  sourcePath: string,
): HitboxRect[] {
  if (!boxes || boxes.length === 0) return [];

  return boxes.map((row, rowIdx) => {
    if (!Array.isArray(row) || row.length !== 6) {
      throw new Error(
        `[AniParser] frame[${frameIdx}].${field}[${rowIdx}]: expected exactly 6-int tuple, ` +
        `got ${Array.isArray(row) ? `length=${row.length}` : `type=${typeof row}`} in ${sourcePath}. ` +
        `Real PVF .ani emits hitbox rows as exactly 6 int32 values (PvfAnimation.cpp lines 54-59).`,
      );
    }
    for (let i = 0; i < 6; i++) {
      if (typeof row[i] !== "number" || !Number.isFinite(row[i] as number)) {
        throw new Error(
          `[AniParser] frame[${frameIdx}].${field}[${rowIdx}][${i}]: expected finite number, ` +
          `got ${typeof row[i]} (${row[i]}) in ${sourcePath}. ` +
          `Real PVF .ani hitbox values are int32 (never NaN/Infinity).`,
        );
      }
    }
    return {
      raw: row as unknown as readonly [number, number, number, number, number, number],
      x1: row[0] as number,
      y1: row[1] as number,
      z1: row[2] as number,
      x2: row[3] as number,
      y2: row[4] as number,
      z2: row[5] as number,
    };
  });
}
