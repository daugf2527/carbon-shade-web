import type { Actor, ArmorProfile, ActorType, Faction } from "../types.js";
import { cloneVec3 } from "../util/geometry.js";
import { cloneEnemyTuning, enemyTuning } from "../../data/ai/enemyTuning.js";
import { createComboCorrectionState } from "../combo/ComboCorrection.js";
import { SWORDMAN_TRUTH } from "../../data/manifest/truth/swordman.js";

/**
 * Stage 3 T-A.7 (2026-05-30): 玩家真值 stat block.
 * 从 SWORDMAN_TRUTH.chr.growth 读取 PVF 真值 (vector fact, 17 段成长曲线).
 * Phase A PoC: sum 全部 17 段近似 Lv70 总值. 精确等级表 mapping 留 Phase B.
 *
 * 真值 vs 旧硬编码对比:
 *   hp:        952.5  vs  160 (旧值 6x 偏小)
 *   physAtk:   82.8   vs  1800 (旧值 22x 偏大, 量纲错)
 *   defense:   83.8   vs  0
 */
function sumGrowthVec(values: readonly number[]): number {
  let acc = 0;
  for (const v of values) acc += v;
  return acc;
}

const SWORDMAN_LV70_HP = sumGrowthVec(SWORDMAN_TRUTH.chr.growth.hpMax.values);
const SWORDMAN_LV70_MP = sumGrowthVec(SWORDMAN_TRUTH.chr.growth.mpMax?.values ?? [100]);
const SWORDMAN_LV70_PHYS_ATK = sumGrowthVec(SWORDMAN_TRUTH.chr.growth.physicalAttack.values);
const SWORDMAN_LV70_MAG_ATK = sumGrowthVec(SWORDMAN_TRUTH.chr.growth.magicalAttack?.values ?? [0]);
const SWORDMAN_LV70_PHYS_DEF = sumGrowthVec(SWORDMAN_TRUTH.chr.growth.physicalDefense?.values ?? [0]);

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
  // Stage 3 T-A.7: 玩家 hp 改为 PVF 真值 (~953); 敌人保留旧 baseline (Phase A 不改).
  const hp = tuning?.hp ?? (faction === "player" ? Math.round(SWORDMAN_LV70_HP) : type === "boss" ? 420 : type === "building" ? 500 : 160);
  const pushWidth = id === "boss" ? 68 : type === "building" ? 56 : id === "imp" ? 24 : 28;
  const pushDepth = id === "boss" ? 24 : id === "imp" ? 14 : type === "building" ? 18 : 16;
  const hurtWidth = id === "boss" ? 96 : type === "building" ? 58 : id === "imp" ? 36 : 36;
  const hurtDepth = id === "boss" ? 30 : id === "imp" ? 18 : 22;
  const hurtHeight = id === "boss" ? 118 : id === "imp" ? 42 : id === "dummy" ? 50 : 48;
  const hurtOffsetY = id === "boss" ? 58 : id === "imp" ? 60 : 26;
  // Stage 3 T-A.7: 玩家 mp 改读 SWORDMAN_TRUTH.chr.growth.mpMax (~488); 敌人保留 100.
  const mp = faction === "player" ? Math.round(SWORDMAN_LV70_MP) : 100;

  // Stage 3 T-A.7 (2026-05-30): 玩家 stat block 全量真值化.
  // 旧 local_baseline (physAtk=1800/strength=480) 是量纲错 — DNF 真值约 83.
  // 敌人 stat 暂保留旧 baseline (Phase B 改: monster shard PVF 真值化).
  const level    = faction === "player" ? 70 : type === "boss" ? 72 : 68;
  const strength = faction === "player" ? 480 : type === "boss" ? 320 : 180;  // strength 单独 stat (装备词条), 非 chr.growth
  const physAtk  = faction === "player" ? Math.round(SWORDMAN_LV70_PHYS_ATK) : type === "boss" ? 1200 : 600;
  const magAtk   = faction === "player" ? Math.round(SWORDMAN_LV70_MAG_ATK) : 0;
  const defense  = faction === "player" ? Math.round(SWORDMAN_LV70_PHYS_DEF) : type === "boss" ? 800 : 400;

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
    magAtk,
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
