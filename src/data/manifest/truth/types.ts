/**
 * Stage 3 T-A.4 真值 SOT 类型定义.
 *
 * 对应 PoC 阶段裁剪的 shard 子集 (见 scripts/sync-truth-to-manifest.mjs).
 * Phase B/C 扩展时, 这里加字段, sync 脚本也要同步扩展.
 */

export interface PvfFact<T = unknown> {
  value: T;
  unit?: string;
  sourceType?: "tier1" | "tier2" | "tier3" | "extracted" | "local_baseline";
  requiresManualVerification?: boolean;
}

export interface HitBoxRaw {
  raw: number[];          // [x1, y1, z1, x2, y2, z2]
  x1: number; y1: number; z1: number;
  x2: number; y2: number; z2: number;
}

export interface FrameAnchor {
  x: number;
  y: number;
}

export interface AniFrame {
  index: number;
  anchor: FrameAnchor;
  delay: number;          // 毫秒
  imgId?: number;
  imgParam?: number;
  sprite?: string;
  attackBoxes: HitBoxRaw[];
  damageBoxes: HitBoxRaw[];
}

export interface AniDef {
  path: string;
  framesCount: number;
  loop: boolean;
  frames: AniFrame[];
}

export interface GrowthTable {
  values: number[];       // 17 段: [level1, +lv2, +lv3, ...]
  unit: string;
  provenance?: unknown;
  sourceType?: string;
  requiresManualVerification?: boolean;
}

export interface ChrGrowth {
  hpMax: GrowthTable;
  mpMax: GrowthTable;
  mpRegenSpeed?: GrowthTable;
  hitRecovery?: GrowthTable;
  physicalAttack: GrowthTable;
  magicalAttack: GrowthTable;
  physicalDefense: GrowthTable;
  magicalDefense?: GrowthTable;
  inventoryLimit?: GrowthTable;
}

export interface WeaponHitInfoEntry {
  hitTag: string;
  bloodTag: string;
  damageScalePct: number;
  critOrSimilar: number;
  pushBack: number;
  launch: number;
}

export interface ChrTruth {
  job: PvfFact<string>;
  jumpPower: PvfFact<number>;
  jumpSpeed: PvfFact<number>;
  moveSpeed: PvfFact<number>;
  attackSpeed: PvfFact<number>;
  weight: PvfFact<number>;
  widthBox: number[];     // [width, depth]
  growth: ChrGrowth;
  weaponHitInfo: WeaponHitInfoEntry[];
}

export interface AtkTruth {
  path: string;
  liftUp?: PvfFact<number>;
  pushAside?: PvfFact<number>;
  damageBonus?: PvfFact<number>;
  attackKind?: string;    // "physic" | "magic" | ...
  element?: string;
  hitReaction?: string;   // "hit_down" | "hit_lift_up" | "hit_horizon" | ...
  causesDown?: boolean;
  causesStun?: boolean;
  causesBounce?: boolean;
  causesStuck?: boolean;
  knuckBack?: PvfFact<number> | null;
}

/**
 * 职业真值: PoC 阶段 SOT.
 * 运行时通过 JobTruth.weaponAnimations[weaponRef][actionName] lookup 武器 atk.
 * 角色身体动画在 animations[actionName], 武器动画在 weaponAnimations[wpn][actionName].
 */
export interface JobTruth {
  shape_version: string;
  job: string;
  parentJob: string;
  chr: ChrTruth;
  attacks: Record<string, AtkTruth>;
  animations: Record<string, AniDef>;
  weaponAnimations: Record<string, Record<string, AniDef>>;
}
