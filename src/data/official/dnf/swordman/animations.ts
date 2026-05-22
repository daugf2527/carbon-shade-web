// Swordman .ani frame sequences — Tier-1 truths from PVF.
//
// Source: character/swordman/animation/*.ani (Script.pvf v66282).
// Extracted 2026-05-21 via tools/dnf-extract.exe.
//
// Schema per frame:
//   i         — frame index (0-based)
//   delay     — milliseconds to hold this frame. `10000` is the engine's
//               'wait for external event' sentinel (jump apex, damage
//               unfreeze, etc.). The actual wall-clock duration depends
//               on game state, not on the timer.
//   imgParam  — atlas frame index inside the body sprite (.img) template
//   aniOffset — top-left → feet-anchor offset (x, y) for this frame.
//               Constant per .ani in the common case; differs e.g. on
//               overturn (sprite pivots to lying-down posture).
//   atk       — optional active-hitbox geometry [x, y, z, w, h, d]. Only
//               populated on .ani that mark active windows explicitly
//               (e.g. attack3, jumpattack, dashattack). Other motions
//               rely on .atk references attached via .skl.
//   dmgCount  — number of damage_box (hurtbox) entries on this frame.
//               Geometry is omitted here to keep this file readable;
//               full hurtbox data lives in the raw .ani files.
//
// NOTE on `delay_event` (sq_JumpUpStartFrame / JumpDownStartFrame / 
// AttackCancelWindowStartFrame markers):
//   The current tools/dnf-extract.exe `.ani` parser does NOT emit an
//   explicit `delay_event` field. The convention `delay: 10000` is the
//   in-band marker (e.g. jump.ani frames 7 and 14 = apex hold + landing
//   hold). Explicit event tags need either a parser upgrade or DNF.exe
//   reverse engineering; we tag them requiresManualVerification.

import type { Provenance } from "../../../../combat/types.js";

const aniProv = (aniName: string): Provenance => ({
  sourceType: "pvf_extraction",
  sourceRef: `pvf:character/swordman/animation/${aniName}.ani`,
  capturedAt: "2026-05-21",
  version: "Script.pvf v66282",
  confidence: "high",
  requiresCalibration: false,
  notes: "delay_event markers (jump phase / cancel window) not extracted; use delay=10000 as proxy and reverse-engineer engine for exact tags.",
  requiresManualVerification: true,
});

export interface SwordmanAniFrame {
  i: number;
  delay: number;
  imgParam: number;
  aniOffset: { x: number; y: number };
  /** Active hitbox geometry if marked on this frame. */
  atk: ReadonlyArray<readonly [number, number, number, number, number, number]> | null;
  /** Number of damage_box (hurtbox) entries on this frame. */
  dmgCount: number;
}

export interface SwordmanAniMotion {
  framesCount: number;
  loop: boolean;
  /** Total ms of the timed portion (excludes external-event waits where delay=10000). */
  totalTimedMs: number;
  /** Indices of frames whose delay==10000 — engine waits for event there. */
  externalWaitFrames: ReadonlyArray<number>;
  /** Sprite atlas template used by every frame. */
  sprite: string;
  frames: ReadonlyArray<SwordmanAniFrame>;
  provenance: Provenance;
}

export const SWORDMAN_ANI: Record<string, SwordmanAniMotion> = {
  stay: {
    framesCount: 6,
    loop: true,
    totalTimedMs: 720,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 120, imgParam: 90, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 1, delay: 120, imgParam: 91, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 2, delay: 120, imgParam: 92, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 3, delay: 120, imgParam: 93, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 4, delay: 120, imgParam: 94, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 5, delay: 120, imgParam: 95, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
    ],
    provenance: aniProv("stay"),
  },
  simple_rest: {
    framesCount: 4,
    loop: true,
    totalTimedMs: 1050,
    externalWaitFrames: [],
    sprite: "character/swordman.img",
    frames: [
      { i: 0, delay: 600, imgParam: 0, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 1, delay: 150, imgParam: 1, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 2, delay: 150, imgParam: 2, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 3, delay: 150, imgParam: 3, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
    ],
    provenance: aniProv("simple_rest"),
  },
  rest: {
    framesCount: 4,
    loop: true,
    totalTimedMs: 1050,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 600, imgParam: 176, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 1, delay: 150, imgParam: 177, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 2, delay: 150, imgParam: 178, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 3, delay: 150, imgParam: 179, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
    ],
    provenance: aniProv("rest"),
  },
  move: {
    framesCount: 8,
    loop: true,
    totalTimedMs: 800,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 100, imgParam: 180, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 1, delay: 100, imgParam: 181, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 2, delay: 100, imgParam: 182, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 3, delay: 100, imgParam: 183, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 4, delay: 100, imgParam: 184, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 5, delay: 100, imgParam: 185, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 6, delay: 100, imgParam: 186, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 7, delay: 100, imgParam: 187, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
    ],
    provenance: aniProv("move"),
  },
  simple_move: {
    framesCount: 8,
    loop: true,
    totalTimedMs: 800,
    externalWaitFrames: [],
    sprite: "character/swordman.img",
    frames: [
      { i: 0, delay: 100, imgParam: 4, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 1, delay: 100, imgParam: 5, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 2, delay: 100, imgParam: 6, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 3, delay: 100, imgParam: 7, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 4, delay: 100, imgParam: 8, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 5, delay: 100, imgParam: 9, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 6, delay: 100, imgParam: 10, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 7, delay: 100, imgParam: 11, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
    ],
    provenance: aniProv("simple_move"),
  },
  dash: {
    framesCount: 8,
    loop: true,
    totalTimedMs: 800,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 100, imgParam: 105, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 1, delay: 100, imgParam: 106, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 2, delay: 100, imgParam: 107, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 3, delay: 100, imgParam: 108, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 4, delay: 100, imgParam: 109, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 5, delay: 100, imgParam: 110, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 6, delay: 100, imgParam: 111, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 7, delay: 100, imgParam: 112, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
    ],
    provenance: aniProv("dash"),
  },
  jump: {
    framesCount: 16,
    loop: false,
    totalTimedMs: 1150,
    externalWaitFrames: [7, 14],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 100, imgParam: 125, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 1, delay: 100, imgParam: 126, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 2, delay: 80, imgParam: 127, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 3, delay: 80, imgParam: 128, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 4, delay: 80, imgParam: 128, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 5, delay: 80, imgParam: 128, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 6, delay: 80, imgParam: 128, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 7, delay: 10000, imgParam: 128, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 8, delay: 100, imgParam: 129, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 9, delay: 80, imgParam: 130, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 10, delay: 80, imgParam: 131, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 11, delay: 80, imgParam: 131, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 12, delay: 80, imgParam: 131, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 13, delay: 80, imgParam: 131, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 14, delay: 10000, imgParam: 131, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 15, delay: 50, imgParam: 132, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
    ],
    provenance: aniProv("jump"),
  },
  jumpattack: {
    framesCount: 6,
    loop: false,
    totalTimedMs: 300,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 100, imgParam: 133, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 1, delay: 50, imgParam: 134, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 2, delay: 50, imgParam: 135, aniOffset: { x: -232, y: -333 }, atk: [[13, -13, -11, 88, 26, 167] as const], dmgCount: 2 },
      { i: 3, delay: 40, imgParam: 136, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 4, delay: 30, imgParam: 137, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 5, delay: 30, imgParam: 138, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
    ],
    provenance: aniProv("jumpattack"),
  },
  attack1: {
    framesCount: 10,
    loop: false,
    totalTimedMs: 600,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 50, imgParam: 0, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 1, delay: 50, imgParam: 1, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 2, delay: 50, imgParam: 2, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 3, delay: 50, imgParam: 3, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 4, delay: 50, imgParam: 4, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 5, delay: 50, imgParam: 5, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 6, delay: 50, imgParam: 6, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 7, delay: 50, imgParam: 7, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 8, delay: 50, imgParam: 8, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 9, delay: 150, imgParam: 9, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
    ],
    provenance: aniProv("attack1"),
  },
  attack2: {
    framesCount: 11,
    loop: false,
    totalTimedMs: 650,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 50, imgParam: 10, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 1, delay: 50, imgParam: 11, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 2, delay: 50, imgParam: 12, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 5 },
      { i: 3, delay: 50, imgParam: 13, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 4, delay: 50, imgParam: 14, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 5, delay: 50, imgParam: 15, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 6, delay: 50, imgParam: 16, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 7, delay: 50, imgParam: 17, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 8, delay: 50, imgParam: 18, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 9, delay: 50, imgParam: 19, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 10, delay: 150, imgParam: 20, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
    ],
    provenance: aniProv("attack2"),
  },
  attack3: {
    framesCount: 9,
    loop: false,
    totalTimedMs: 550,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 50, imgParam: 33, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 1, delay: 50, imgParam: 34, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 2, delay: 50, imgParam: 35, aniOffset: { x: -232, y: -333 }, atk: [[-32, -13, 0, 179, 26, 94] as const], dmgCount: 3 },
      { i: 3, delay: 50, imgParam: 36, aniOffset: { x: -232, y: -333 }, atk: [[15, -13, 1, 137, 26, 138] as const], dmgCount: 3 },
      { i: 4, delay: 50, imgParam: 37, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 5, delay: 50, imgParam: 38, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 6, delay: 50, imgParam: 39, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 7, delay: 50, imgParam: 40, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 8, delay: 150, imgParam: 41, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
    ],
    provenance: aniProv("attack3"),
  },
  dashattack: {
    framesCount: 10,
    loop: false,
    totalTimedMs: 630,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 100, imgParam: 113, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 1, delay: 80, imgParam: 114, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 2, delay: 50, imgParam: 115, aniOffset: { x: -232, y: -333 }, atk: [[82, -13, 51, 85, 26, 27] as const], dmgCount: 2 },
      { i: 3, delay: 100, imgParam: 116, aniOffset: { x: -232, y: -333 }, atk: [[82, -13, 51, 85, 26, 27] as const], dmgCount: 4 },
      { i: 4, delay: 60, imgParam: 117, aniOffset: { x: -232, y: -333 }, atk: [[82, -13, 51, 85, 26, 27] as const], dmgCount: 5 },
      { i: 5, delay: 60, imgParam: 118, aniOffset: { x: -232, y: -333 }, atk: [[82, -13, 51, 85, 26, 27] as const], dmgCount: 5 },
      { i: 6, delay: 60, imgParam: 119, aniOffset: { x: -232, y: -333 }, atk: [[82, -13, 51, 85, 26, 27] as const], dmgCount: 5 },
      { i: 7, delay: 60, imgParam: 120, aniOffset: { x: -232, y: -333 }, atk: [[82, -13, 51, 85, 26, 27] as const], dmgCount: 5 },
      { i: 8, delay: 30, imgParam: 121, aniOffset: { x: -232, y: -333 }, atk: [[82, -13, 51, 85, 26, 27] as const], dmgCount: 5 },
      { i: 9, delay: 30, imgParam: 122, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 5 },
    ],
    provenance: aniProv("dashattack"),
  },
  hardattack: {
    framesCount: 18,
    loop: false,
    totalTimedMs: 950,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 50, imgParam: 139, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 1, delay: 50, imgParam: 140, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 2, delay: 50, imgParam: 141, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 3, delay: 25, imgParam: 142, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 4, delay: 25, imgParam: 143, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 5, delay: 50, imgParam: 144, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 6, delay: 50, imgParam: 145, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 7, delay: 50, imgParam: 146, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 8, delay: 50, imgParam: 147, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 9, delay: 50, imgParam: 148, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 10, delay: 50, imgParam: 149, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 11, delay: 50, imgParam: 150, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 12, delay: 50, imgParam: 151, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 13, delay: 50, imgParam: 152, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 14, delay: 50, imgParam: 153, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 15, delay: 50, imgParam: 154, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 16, delay: 50, imgParam: 155, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 17, delay: 150, imgParam: 156, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
    ],
    provenance: aniProv("hardattack"),
  },
  hitback: {
    framesCount: 9,
    loop: false,
    totalTimedMs: 850,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 100, imgParam: 51, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 1, delay: 50, imgParam: 52, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 2, delay: 50, imgParam: 53, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 3, delay: 50, imgParam: 54, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 4, delay: 50, imgParam: 55, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 5, delay: 50, imgParam: 56, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 6, delay: 50, imgParam: 57, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 7, delay: 50, imgParam: 58, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
      { i: 8, delay: 400, imgParam: 59, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 4 },
    ],
    provenance: aniProv("hitback"),
  },
  damage1: {
    framesCount: 1,
    loop: false,
    totalTimedMs: 0,
    externalWaitFrames: [0],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 10000, imgParam: 96, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
    ],
    provenance: aniProv("damage1"),
  },
  damage2: {
    framesCount: 1,
    loop: false,
    totalTimedMs: 0,
    externalWaitFrames: [0],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 10000, imgParam: 104, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
    ],
    provenance: aniProv("damage2"),
  },
  down: {
    framesCount: 6,
    loop: false,
    totalTimedMs: 660,
    externalWaitFrames: [2, 3],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 80, imgParam: 98, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 1, delay: 80, imgParam: 99, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 2, delay: 10000, imgParam: 100, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 3, delay: 10000, imgParam: 101, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 4, delay: 70, imgParam: 102, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 5, delay: 430, imgParam: 103, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
    ],
    provenance: aniProv("down"),
  },
  overturn: {
    framesCount: 1,
    loop: false,
    totalTimedMs: 0,
    externalWaitFrames: [0],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 10000, imgParam: 97, aniOffset: { x: -226, y: -246 }, atk: null, dmgCount: 2 },
    ],
    provenance: aniProv("overturn"),
  },
  sit: {
    framesCount: 1,
    loop: false,
    totalTimedMs: 150,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 150, imgParam: 157, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
    ],
    provenance: aniProv("sit"),
  },
  getitem: {
    framesCount: 1,
    loop: false,
    totalTimedMs: 200,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 200, imgParam: 158, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
    ],
    provenance: aniProv("getitem"),
  },
  ghost: {
    framesCount: 4,
    loop: true,
    totalTimedMs: 640,
    externalWaitFrames: [],
    sprite: "character/swordman/effect/ghost.img",
    frames: [
      { i: 0, delay: 160, imgParam: 0, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 1, delay: 160, imgParam: 2, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 2, delay: 160, imgParam: 4, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 3, delay: 160, imgParam: 6, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
    ],
    provenance: aniProv("ghost"),
  },
  ghost_dodge: {
    framesCount: 4,
    loop: true,
    totalTimedMs: 640,
    externalWaitFrames: [],
    sprite: "character/swordman/effect/ghost.img",
    frames: [
      { i: 0, delay: 160, imgParam: 1, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 1, delay: 160, imgParam: 3, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 2, delay: 160, imgParam: 5, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
      { i: 3, delay: 160, imgParam: 7, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 0 },
    ],
    provenance: aniProv("ghost_dodge"),
  },
  guard: {
    framesCount: 2,
    loop: false,
    totalTimedMs: 0,
    externalWaitFrames: [0, 1],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 10000, imgParam: 123, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 1, delay: 10000, imgParam: 124, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
    ],
    provenance: aniProv("guard"),
  },
  throw1: {
    framesCount: 6,
    loop: false,
    totalTimedMs: 300,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 50, imgParam: 159, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 1, delay: 50, imgParam: 160, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 2, delay: 50, imgParam: 161, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 3, delay: 50, imgParam: 162, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 4, delay: 50, imgParam: 163, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 5, delay: 50, imgParam: 164, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
    ],
    provenance: aniProv("throw1"),
  },
  throw2: {
    framesCount: 11,
    loop: false,
    totalTimedMs: 600,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 50, imgParam: 165, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 1, delay: 50, imgParam: 166, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 2, delay: 50, imgParam: 167, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 3, delay: 50, imgParam: 168, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 4, delay: 50, imgParam: 169, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 5, delay: 50, imgParam: 170, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 6, delay: 50, imgParam: 171, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 7, delay: 50, imgParam: 172, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 8, delay: 50, imgParam: 173, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 9, delay: 50, imgParam: 174, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
      { i: 10, delay: 100, imgParam: 175, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 3 },
    ],
    provenance: aniProv("throw2"),
  },
  summon1: {
    framesCount: 3,
    loop: false,
    totalTimedMs: 150,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 50, imgParam: 75, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 1, delay: 50, imgParam: 76, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 2, delay: 50, imgParam: 77, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
    ],
    provenance: aniProv("summon1"),
  },
  summon2: {
    framesCount: 12,
    loop: false,
    totalTimedMs: 600,
    externalWaitFrames: [],
    sprite: "character/swordman/equipment/avatar/skin/sm_body%04d.img",
    frames: [
      { i: 0, delay: 50, imgParam: 78, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 1, delay: 50, imgParam: 79, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 2 },
      { i: 2, delay: 50, imgParam: 80, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 3, delay: 50, imgParam: 81, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 4, delay: 50, imgParam: 82, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 5, delay: 50, imgParam: 83, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 6, delay: 50, imgParam: 84, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 7, delay: 50, imgParam: 85, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 8, delay: 50, imgParam: 86, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 9, delay: 50, imgParam: 87, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 10, delay: 50, imgParam: 88, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
      { i: 11, delay: 50, imgParam: 89, aniOffset: { x: -232, y: -333 }, atk: null, dmgCount: 1 },
    ],
    provenance: aniProv("summon2"),
  },
};

/** Names of the .ani files referenced by base motion slots in swordman.chr. */
export const SWORDMAN_CORE_MOTION_ANI = [
  "stay",
  "simple_rest",
  "rest",
  "move",
  "simple_move",
  "dash",
  "jump",
  "jumpattack",
  "attack1",
  "attack2",
  "attack3",
  "dashattack",
  "hardattack",
  "hitback",
  "damage1",
  "damage2",
  "down",
  "overturn",
  "sit",
  "getitem",
  "ghost",
  "ghost_dodge",
  "guard",
  "throw1",
  "throw2",
  "summon1",
  "summon2",
] as const;
