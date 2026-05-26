import type { PvfAttribute, PvfDocument, PvfSection } from "./PvfDocument.js";
import type { ExtractedDocumentProvenance, PvfFact, PvfStringFact } from "./Provenance.js";

/**
 * Skill type as extracted from the `[type]` section.
 * Real PVF values observed: "active", "passive" (from [active]/[passive] tag).
 */
export type SklSkillType = "active" | "passive" | "unknown";

/**
 * Weapon effect type from `[weapon effect type]` section.
 * Real PVF values observed: "physical", "magical" (from [physical]/[magical] tag).
 */
export type SklWeaponEffectType = "physical" | "magical" | "unknown";

/**
 * Cancel window data decoded from dual-semantics cancel* .skl files.
 *
 * Cancel skills (e.g. cancelupperslash.skl) encode cancel window parameters
 * using PVF section names that have semantic aliases:
 *   `purchase cost`         → alias: cancelWindowStart  (int, frames)
 *   `required level`        → alias: cancelWindowDuration (int, frames)
 *   `skill class`           → alias: cancelGroup         (int, group id)
 *   `growtype maximum level`→ alias: cancelWeaponMask    (int[], bit mask)
 *   `skill fitness growtype`→ alias: cancelTargetSlots   (int[], slot indices)
 *
 * Detected by the presence of `static data` section (0-attr sentinel) AND
 * the aliases property on the sections (emitted by dnf-extract v2+).
 * Tier-1 PVF truth: verified via cancelupperslash.skl sample 2026-05-23.
 */
export interface SklCancelWindowDef {
  /** Frame at which the cancel window opens (alias of `purchase cost`). */
  cancelWindowStart: number;
  /** Duration in frames the cancel window is open (alias of `required level`). */
  cancelWindowDuration: number;
  /** Cancel group identifier (alias of `skill class`). */
  cancelGroup: number;
  /** Weapon mask bit-field indicating which weapon types allow cancel (alias of `growtype maximum level`). */
  cancelWeaponMask: number[];
  /** Slot indices for valid cancel targets (alias of `skill fitness growtype`). */
  cancelTargetSlots: number[];
}

export interface SkillDef {
  kind: "skl";
  path: string;
  provenance: ExtractedDocumentProvenance;
  sections: PvfSection[];

  // --- identity ---
  /** Skill display name key. PVF emits as link ("") — present for reference. */
  name: PvfStringFact | null;
  /** Skill type tag: "active" | "passive" | "unknown". Sourced from `[type]` section. */
  skillType: SklSkillType;
  /** Weapon effect type: "physical" | "magical" | "unknown". From `[weapon effect type]` section. */
  weaponEffectType: SklWeaponEffectType;
  /** Skill class integer (e.g. 1=swordman base, 2=berserker, 3=soulmancer…). From `skill class`. */
  skillClass: PvfFact<number> | null;

  // --- cost / cooldown ---
  /** SP cost to purchase (or cancelWindowStart in cancel skills). From `purchase cost`. */
  purchaseCost: PvfFact<number> | null;
  /** Required character level to learn. From `required level`. */
  requiredLevel: PvfFact<number> | null;
  /** Level range restriction (slot/tier). From `required level range`. */
  requiredLevelRange: PvfFact<number> | null;
  /** Maximum skill level cap. From `maximum level`. */
  maximumLevel: PvfFact<number> | null;
  /** Durability decrease rate on use. From `durability decrease rate`. */
  durabilityDecreaseRate: PvfFact<number> | null;

  // --- level scaling ---
  /**
   * Per-growtype maximum levels (6 values — one per equip slot category).
   * From `growtype maximum level`. Positional: [lightsword, heavysword, lightwm,
   * shortsword, dagger, placeholder] — exact slot mapping unverified against PVF
   * enum; treat as ordered tuple only.
   */
  growtypeMaximumLevel: number[] | null;
  /**
   * Active growtype slot indices (which of the 6 growtype slots apply to this skill).
   * From `skill fitness growtype`.
   */
  skillFitnessGrowtype: number[] | null;

  // --- availability flags ---
  /** Whether skill is available in PvP mode (presence of `pvp` section). */
  hasPvp: boolean;
  /** Whether skill is available in dungeon mode (presence of `dungeon` section). */
  hasDungeon: boolean;
  /** Whether skill is available in war room (presence of `warroom` section). */
  hasWarroom: boolean;
  /** Whether skill is available in death tower (presence of `death tower` section). */
  hasDeathTower: boolean;
  /** Whether auto cooltime applies (presence + value of `auto cooltime apply` section). */
  autoCoolTimeApply: boolean;

  // --- cancel window (cancel* skills only) ---
  /**
   * Decoded cancel window definition. Non-null iff the .skl file uses
   * cancel dual-semantics (detected by `static data` section + section aliases).
   * Tier-1 PVF truth. See SklCancelWindowDef for field semantics.
   */
  cancelWindow: SklCancelWindowDef | null;

  // === Phase 4 (2026-05-26) Stage 2 启动门槛 — 12 raw section typed 化 ===
  // Per stage1-completeness-verification-2026-05-26.md §2.2.
  // 实测于 dashattackmultihit.skl / icewave.skl / hellbenter.skl (3 个 active 技能样本)。

  /** Input command sequence as token list, e.g. ["(right)", ",", "(down)", ",", "(skill)"].
   *  Tokens are PVF-internal: "(left)/(right)/(up)/(down)" 方向键, "(skill)/(attack)/(buff)" 动作键,
   *  "," 分隔符。InputLayer 下游需要 tokenize 这个序列。
   *  Source: section `[command]` (88/205 swordman skills carry this). */
  command: string[] | null;

  /** Cooldown in milliseconds [dungeon_ms, pvp_ms]. icewave: 7000/7000.
   *  Source: section `[cool time]` (22/205). */
  coolTime: { dungeonMs: number; pvpMs: number } | null;

  /** MP cost [base_mp, lvl_max_mp]. icewave: 27→308.
   *  Source: section `[consume mp]` (32/205). */
  consumeMp: { baseMp: number; lvlMaxMp: number } | null;

  /** Casting time in milliseconds [base_ms, lvl20_ms]. icewave: 300/300.
   *  Source: section `[casting time]` (20/205). */
  castingTime: { baseMs: number; lvl20Ms: number } | null;

  /** Per-level formula payload — 9-12 mixed int/float/link values.
   *  Real PVF emits a positional vector whose semantics vary per skill type.
   *  Preserved verbatim as PvfAttribute[]; Stage 2 skill-engine consumers
   *  decode per skillType.
   *  Source: section `[level property]` (155/205, highest non-icon hit). */
  levelProperty: PvfAttribute[] | null;

  /** Per-level numeric table (variable shape). Absent in 3/3 sampled active
   *  skills (dashattack/icewave/hellbenter) but present in 27/205 swordman
   *  skills. Preserved as PvfAttribute[] for downstream unpacking.
   *  Source: section `[level info]` (27/205). */
  levelInfo: PvfAttribute[] | null;

  /** Prerequisite skill chain — [skillId, level, ...]. hellbenter: [81, 3].
   *  Variable length suggests multi-prereq variants exist; keep as int[].
   *  Source: section `[pre required skill]` (103/205). */
  preRequiredSkill: number[] | null;

  /** Engine-side classification index. khazan: 164, icewave: 216.
   *  Source: section `[feature skill index]` (50/205). */
  featureSkillIndex: number | null;

  /** Skill icon — [atlas, frame, lit_atlas, lit_frame]. atlas paths point to
   *  `character/<job>/effect/skillicon.img` (external NPK reference).
   *  Source: section `[icon]` (205/205, every skill carries this). */
  icon: {
    atlasPath: string;
    frame: number;
    litAtlasPath: string;
    litFrame: number;
  } | null;

  /** Consumable items needed to cast — [itemId, count, ...]. hellbenter:
   *  [3037, 5, 5]. Variable shape; downstream unpacks per item kind.
   *  Source: section `[consume item]` (37/205). */
  consumeItem: number[] | null;

  /** Continuous MP drain (toggle/buff skills). Single number.
   *  Absent in 3/3 sampled active skills; only 4/205 carry this.
   *  Source: section `[maintain mp]` (4/205). */
  maintainMp: number | null;

  /** Input window buffer advantage in ms. icewave/hellbenter: [20, 40].
   *  [normal_priority_ms, advanced_priority_ms] — InputLayer command-buffer
   *  uses these to decide which skill wins when commands overlap.
   *  Source: section `[skill command advantage]` (35/205). */
  skillCommandAdvantage: { normal: number; advanced: number } | null;

  // --- escape hatch ---
  /**
   * All sections from the raw document that were not decoded into structured fields.
   * Keyed by section name. Retains sections with: shake screen, basic explain,
   * explain, etc.
   */
  raw: PvfDocument;
}
