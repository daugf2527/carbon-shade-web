import type { Actor, ArmorProfile, ActorType, Faction } from "../types.js";
import { cloneVec3 } from "../util/geometry.js";
import { cloneEnemyTuning, enemyTuning } from "../../data/ai/enemyTuning.js";
import { createComboCorrectionState } from "../combo/ComboCorrection.js";

function armor(baseType: ArmorProfile["baseType"]): ArmorProfile {
  if (baseType === "building_armor") {
    return {
      baseType,
      canTakeDamage: true,
      canBeLaunched: false,
      canBeKnockedDown: false,
      canBeKnockedBack: false,
      canReceiveHitStop: true,
      immunities: { grab: true, control: true, damage: false, hitStop: false },
      temporaryFlags: {},
      hitStopCapFrames: 1,
      reactionOverride: "armor_feedback_only",
    };
  }
  if (baseType === "boss_super_armor") {
    return {
      baseType,
      canTakeDamage: true,
      canBeLaunched: false,
      canBeKnockedDown: false,
      canBeKnockedBack: false,
      canReceiveHitStop: true,
      immunities: { grab: true, control: true, damage: false },
      temporaryFlags: {},
      hitStopCapFrames: 2,
      reactionOverride: "armor_feedback_only",
    };
  }
  if (baseType === "super_armor") {
    return {
      baseType,
      canTakeDamage: true,
      canBeLaunched: false,
      canBeKnockedDown: false,
      canBeKnockedBack: true,
      canReceiveHitStop: true,
      immunities: { grab: false, control: true, damage: false },
      temporaryFlags: {},
      hitStopCapFrames: 3,
      reactionOverride: "armor_feedback_only",
    };
  }
  return {
    baseType,
    canTakeDamage: true,
    canBeLaunched: true,
    canBeKnockedDown: true,
    canBeKnockedBack: true,
    canReceiveHitStop: true,
    immunities: { grab: false, control: false, damage: false },
    temporaryFlags: {},
  };
}

export function createActor(id: string, type: ActorType, faction: Faction, x: number, z = 0): Actor {
  const tuning = id in enemyTuning ? cloneEnemyTuning(id as keyof typeof enemyTuning) : undefined;
  const base = tuning?.armor ?? (type === "building" ? "building_armor" : type === "boss" ? "boss_super_armor" : type === "dummy" ? "super_armor" : "none");
  const position = { x, z, y: 0 };
  const hp = tuning?.hp ?? (type === "boss" ? 420 : type === "building" ? 500 : 160);
  const pushWidth = id === "boss" ? 68 : type === "building" ? 56 : id === "imp" ? 24 : 28;
  const pushDepth = id === "boss" ? 24 : id === "imp" ? 14 : type === "building" ? 18 : 16;
  const hurtWidth = id === "boss" ? 96 : type === "building" ? 58 : id === "imp" ? 36 : 36;
  const hurtDepth = id === "boss" ? 30 : id === "imp" ? 18 : 22;
  const hurtHeight = id === "boss" ? 118 : id === "imp" ? 42 : id === "dummy" ? 50 : 48;
  const hurtOffsetY = id === "boss" ? 58 : id === "imp" ? 60 : 26;
  const mp = faction === "player" ? 1000 : 100;

  // DNF 70-85 classic stat block — local_baseline values
  // Player: Lv70 swordman baseline. Enemies: scaled by type.
  const level    = faction === "player" ? 70 : type === "boss" ? 72 : 68;
  const strength = faction === "player" ? 480 : type === "boss" ? 320 : 180;
  const physAtk  = faction === "player" ? 1800 : type === "boss" ? 1200 : 600;
  const defense  = faction === "player" ? 0 : type === "boss" ? 800 : 400;

  return {
    id,
    type,
    faction,
    name: id,
    position,
    previousPosition: cloneVec3(position),
    velocity: { x: 0, z: 0, y: 0 },
    facing: faction === "player" ? "right" : "left",
    pushBox: { w: pushWidth, d: pushDepth, immovable: type === "building" },
    hurtBoxes: [{ offset: { x: 0, z: 0, y: hurtOffsetY }, w: hurtWidth, d: hurtDepth, h: hurtHeight }],
    resources: { hp, maxHp: hp, mp, maxMp: mp, cube: 3 },
    level,
    strength,
    intelligence: 0,
    physAtk,
    magAtk: 0,
    independentAtk: 0,
    elemStrength: 0,
    elemResist: 0,
    defense,
    cooldowns: { remaining: new Map(), globalRemaining: 0 },
    buffs: [],
    statusEffects: [],
    armorProfile: armor(base),
    reactionState: "none",
    locomotion: { mode: "idle", xDirection: 0, zDirection: 0, speedScale: 1 },
    ai: tuning,
    flags: { dead: false, playerControlled: faction === "player" },
    handfeel: { reactionRemaining: 0, downRemaining: 0, getUpRemaining: 0, visualRecoilRemaining: 0, visualRecoilX: 0, visualRecoilZ: 0 },
    comboCorrection: createComboCorrectionState(),
  };
}

export function cloneActorSnapshot(actor: Actor): object {
  return {
    id: actor.id,
    hp: actor.resources.hp,
    pos: { ...actor.position },
    reaction: actor.reactionState,
    dead: actor.flags.dead,
    action: actor.currentAction?.actionName ?? null,
    facing: actor.facing,
    lockedFacing: actor.currentAction?.lockedFacing ?? actor.facing,
    locomotion: actor.locomotion.mode,
    hitFlashRemaining: actor.handfeel.hitFlashRemaining ?? 0,
    visualRecoilRemaining: actor.handfeel.visualRecoilRemaining ?? 0,
    visualRecoilX: actor.handfeel.visualRecoilX ?? 0,
    visualRecoilZ: actor.handfeel.visualRecoilZ ?? 0,
    comboCorrection: { ...actor.comboCorrection },
    buffs: actor.buffs.map(buff => ({ type: buff.type, stacks: buff.stacks, expiresAtTick: buff.expiresAtTick })),
    status: actor.statusEffects.map(status => ({ type: status.type, stacks: status.stacks, nextTickFrame: status.nextTickFrame })),
  };
}
