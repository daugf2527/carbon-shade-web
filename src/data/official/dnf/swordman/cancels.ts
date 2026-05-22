// Swordman cancel system — partial truth from PVF.
//
// Source: skill/swordman/cancel*.skl (19 cancel passives).
// Extracted 2026-05-21 via tools/dnf-extract.exe.
//
// IMPORTANT: cancel*.skl is the *passive that lets a player learn* a cancel
// chain. The actual cancel-window data (start frame + duration + target slot
// allow-mask + weapon mask) lives in two places we have NOT fully captured:
//   1. .skl binary sections with IDs 371543/241483/371546/371547/371549
//      (CLAUDE.md). tools/dnf-extract.exe currently does NOT emit these as
//      named sections — only the schema-known section names come out as
//      JSON, so values for these IDs are MISSING from our output.
//   2. .ani delay_event tags (sq_AttackCancelWindowStartFrame /
//      AttackCancelWindowDurationFrame) emitted from per-frame event hooks.
//      The current .ani parser does not emit delay_event either.
//
// What IS reliable from cancel*.skl: required level, growtype eligibility,
// purchase cost, and the implicit source-motion name (from the cancel<X>
// filename convention).

import type { Provenance } from "../../../../combat/types.js";

const cancelProv = (sklName: string): Provenance => ({
  sourceType: "pvf_extraction",
  sourceRef: `pvf:skill/swordman/${sklName}.skl`,
  capturedAt: "2026-05-21",
  version: "Script.pvf v66282",
  confidence: "high",
  requiresCalibration: false,
  notes: "cancel window start/duration NOT extracted (binary section IDs 371543/241483 not parsed).",
  requiresManualVerification: true,
});

export interface SwordmanCancelPassive {
  /** Source motion name (the .ani that the player can cancel out of). */
  sourceMotion: string;
  /** Player level required to unlock. */
  requiredLevel: number;
  /** SP cost to learn. */
  purchaseCost: number;
  /** Growtype index list (0-5) that can learn this passive. */
  eligibleGrowtypes: number[];
  /** Maximum learnable level per growtype slot. */
  growtypeMaxLevel: [number, number, number, number, number, number];
  /** Internal skill class (1-4). */
  skillClass: number;
  /** Skillicon img + frame index (icon, frameId, iconLit, frameIdLit). */
  icon: [string, number, string, number];
  /** PLACEHOLDER — actual cancel window timings live in unresolved section IDs. */
  cancelWindow: {
    /** Frame index of cancel window start in source-motion .ani. */
    startFrame: null;
    /** Length of the cancel window in frames. */
    durationFrames: null;
    /** Which target action slots may receive the cancel. */
    allowedTargetSlots: null;
    /** Weapon class mask. */
    weaponMask: null;
    /** Group ID for chain identity. */
    groupId: null;
  };
  provenance: Provenance;
}

export const SWORDMAN_CANCEL: Record<string, SwordmanCancelPassive> = {
  cancelbackstep: {
    sourceMotion: "backstep",
    requiredLevel: 10,
    purchaseCost: 70,
    eligibleGrowtypes: [0, 1, 2, 3, 4],
    growtypeMaxLevel: [1, 1, 1, 1, 1, 1],
    skillClass: 4,
    icon: ["character/common/skillicon.img", 2, "character/common/skillicon.img", 3],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelbackstep"),
  },
  cancelbloodblast: {
    sourceMotion: "bloodblast",
    requiredLevel: 40,
    purchaseCost: 50,
    eligibleGrowtypes: [3],
    growtypeMaxLevel: [0, 0, 0, 1, 0, 1],
    skillClass: 2,
    icon: ["character/swordman/effect/skillicon.img", 58, "character/swordman/effect/skillicon.img", 59],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelbloodblast"),
  },
  cancelbloodsword: {
    sourceMotion: "bloodsword",
    requiredLevel: 40,
    purchaseCost: 50,
    eligibleGrowtypes: [3],
    growtypeMaxLevel: [0, 0, 0, 1, 0, 1],
    skillClass: 2,
    icon: ["character/swordman/effect/skillicon.img", 264, "character/swordman/effect/skillicon.img", 265],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelbloodsword"),
  },
  cancelchargecrash: {
    sourceMotion: "chargecrash",
    requiredLevel: 40,
    purchaseCost: 50,
    eligibleGrowtypes: [1],
    growtypeMaxLevel: [0, 1, 0, 0, 0, 1],
    skillClass: 1,
    icon: ["character/swordman/effect/skillicon.img", 152, "character/swordman/effect/skillicon.img", 153],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelchargecrash"),
  },
  cancelflowmind: {
    sourceMotion: "flowmind",
    requiredLevel: 25,
    purchaseCost: 50,
    eligibleGrowtypes: [1],
    growtypeMaxLevel: [1, 1, 1, 1, 1, 1],
    skillClass: 1,
    icon: ["character/swordman/effect/skillicon.img", 262, "character/swordman/effect/skillicon.img", 263],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelflowmind"),
  },
  cancelghostsidewind: {
    sourceMotion: "ghostsidewind",
    requiredLevel: 40,
    purchaseCost: 50,
    eligibleGrowtypes: [2],
    growtypeMaxLevel: [0, 0, 1, 0, 0, 0],
    skillClass: 3,
    icon: ["character/swordman/effect/skillicon.img", 340, "character/swordman/effect/skillicon.img", 341],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelghostsidewind"),
  },
  cancelgorecross: {
    sourceMotion: "gorecross",
    requiredLevel: 20,
    purchaseCost: 50,
    eligibleGrowtypes: [3],
    growtypeMaxLevel: [0, 0, 0, 1, 0, 1],
    skillClass: 2,
    icon: ["character/swordman/effect/skillicon.img", 166, "character/swordman/effect/skillicon.img", 167],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelgorecross"),
  },
  cancelgrabblastblood: {
    sourceMotion: "grabblastblood",
    requiredLevel: 30,
    purchaseCost: 50,
    eligibleGrowtypes: [3],
    growtypeMaxLevel: [0, 0, 0, 1, 0, 1],
    skillClass: 2,
    icon: ["character/swordman/effect/skillicon.img", 122, "character/swordman/effect/skillicon.img", 123],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelgrabblastblood"),
  },
  cancelguard: {
    sourceMotion: "guard",
    requiredLevel: 15,
    purchaseCost: 50,
    eligibleGrowtypes: [0, 1, 2, 3, 4],
    growtypeMaxLevel: [1, 1, 1, 1, 1, 1],
    skillClass: 1,
    icon: ["character/swordman/effect/skillicon.img", 92, "character/swordman/effect/skillicon.img", 93],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelguard"),
  },
  cancelhardattack: {
    sourceMotion: "hardattack",
    requiredLevel: 2,
    purchaseCost: 10,
    eligibleGrowtypes: [0, 1, 2, 3, 4],
    growtypeMaxLevel: [1, 1, 1, 1, 1, 1],
    skillClass: 3,
    icon: ["character/swordman/effect/skillicon.img", 22, "character/swordman/effect/skillicon.img", 23],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelhardattack"),
  },
  cancelhopsmash: {
    sourceMotion: "hopsmash",
    requiredLevel: 25,
    purchaseCost: 50,
    eligibleGrowtypes: [3],
    growtypeMaxLevel: [0, 0, 0, 1, 0, 1],
    skillClass: 2,
    icon: ["character/swordman/effect/skillicon.img", 158, "character/swordman/effect/skillicon.img", 159],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelhopsmash"),
  },
  cancelmoonlightslash: {
    sourceMotion: "moonlightslash",
    requiredLevel: 25,
    purchaseCost: 50,
    eligibleGrowtypes: [2],
    growtypeMaxLevel: [0, 0, 1, 0, 0, 0],
    skillClass: 3,
    icon: ["character/swordman/effect/skillicon.img", 180, "character/swordman/effect/skillicon.img", 181],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelmoonlightslash"),
  },
  cancelreflectguard: {
    sourceMotion: "reflectguard",
    requiredLevel: 25,
    purchaseCost: 50,
    eligibleGrowtypes: [4],
    growtypeMaxLevel: [0, 0, 0, 0, 1, 0],
    skillClass: 0,
    icon: ["character/swordman/effect/skillicon.img", 146, "character/swordman/effect/skillicon.img", 147],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelreflectguard"),
  },
  cancelthrowitem: {
    sourceMotion: "throwitem",
    requiredLevel: 20,
    purchaseCost: 50,
    eligibleGrowtypes: [0, 1, 2, 3, 4],
    growtypeMaxLevel: [1, 1, 1, 1, 1, 1],
    skillClass: 4,
    icon: ["character/common/skillicon.img", 4, "character/common/skillicon.img", 5],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelthrowitem"),
  },
  canceltripleslash: {
    sourceMotion: "tripleslash",
    requiredLevel: 20,
    purchaseCost: 50,
    eligibleGrowtypes: [0, 1, 2, 3, 4],
    growtypeMaxLevel: [1, 1, 1, 1, 1, 1],
    skillClass: 1,
    icon: ["character/swordman/effect/skillicon.img", 56, "character/swordman/effect/skillicon.img", 57],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("canceltripleslash"),
  },
  canceltriplestab: {
    sourceMotion: "triplestab",
    requiredLevel: 40,
    purchaseCost: 50,
    eligibleGrowtypes: [2],
    growtypeMaxLevel: [0, 0, 1, 0, 0, 0],
    skillClass: 3,
    icon: ["character/swordman/effect/skillicon.img", 342, "character/swordman/effect/skillicon.img", 343],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("canceltriplestab"),
  },
  cancelupperslash: {
    sourceMotion: "upperslash",
    requiredLevel: 1,
    purchaseCost: 50,
    eligibleGrowtypes: [0, 1, 2, 3, 4],
    growtypeMaxLevel: [1, 1, 1, 1, 1, 1],
    skillClass: 1,
    icon: ["character/swordman/effect/skillicon.img", 104, "character/swordman/effect/skillicon.img", 105],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelupperslash"),
  },
  cancelvaneslash: {
    sourceMotion: "vaneslash",
    requiredLevel: 20,
    purchaseCost: 50,
    eligibleGrowtypes: [0, 1, 2, 3, 4],
    growtypeMaxLevel: [1, 1, 1, 1, 1, 1],
    skillClass: 0,
    icon: ["character/swordman/effect/skillicon.img", 130, "character/swordman/effect/skillicon.img", 131],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelvaneslash"),
  },
  cancelwave: {
    sourceMotion: "wave",
    requiredLevel: 18,
    purchaseCost: 30,
    eligibleGrowtypes: [4],
    growtypeMaxLevel: [0, 0, 0, 0, 1, 0],
    skillClass: 0,
    icon: ["character/swordman/effect/skillicon.img", 186, "character/swordman/effect/skillicon.img", 187],
    cancelWindow: { startFrame: null, durationFrames: null, allowedTargetSlots: null, weaponMask: null, groupId: null },
    provenance: cancelProv("cancelwave"),
  },
};

/** Cancel relationship graph (sourceMotion ⇒ cancel-into-anything flag).
//  This is a coarse representation — the actual valid cancel TARGETS depend on
//  the engine's cancel-group / weapon-mask tables that we have NOT extracted. */
export const SWORDMAN_CANCEL_GRAPH: Record<string, ReadonlyArray<string>> = {
  "backstep": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "bloodblast": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "bloodsword": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "chargecrash": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "flowmind": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "ghostsidewind": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "gorecross": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "grabblastblood": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "guard": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "hardattack": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "hopsmash": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "moonlightslash": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "reflectguard": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "throwitem": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "tripleslash": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "triplestab": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "upperslash": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "vaneslash": ["<unknown — see cancelWindow.allowedTargetSlots>"],
  "wave": ["<unknown — see cancelWindow.allowedTargetSlots>"],
};
