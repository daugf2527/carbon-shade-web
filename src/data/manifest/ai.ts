import type { EnemyAIState } from "../../combat/ai/EnemyAIState.js";
import type { BossConfig } from "../../combat/ai/EnemyAI.js";
import type { EnemyManifest, EnemyManifestId, EnemyRuntimeProfile } from "./aiTypes.js";
import enemyManifestJson from "./ai/enemy-default.json" with { type: "json" };
import bossPatternsJson from "./ai/boss-patterns.json" with { type: "json" };

export const DEFAULT_ENEMY_MANIFEST = enemyManifestJson as EnemyManifest;
export const ENEMY_PROFILE_IDS: EnemyManifestId[] = ["grunt", "dummy", "imp", "boss", "building"];
export const ENEMY_PROFILES = DEFAULT_ENEMY_MANIFEST.profiles;
export const BOSS_CONFIGS: Record<string, BossConfig> = (bossPatternsJson as { bosses: Record<string, BossConfig> }).bosses;

export function toEnemyAIState(profile: EnemyRuntimeProfile): EnemyAIState {
  const isBoss = profile.id === "boss";
  return {
    phase: "idle",
    phaseEnteredTick: 0,
    bossPhase: isBoss ? 1 : undefined,
    bossPhaseEnteredTick: isBoss ? 0 : undefined,
    windupRemaining: 0,
    recoverRemaining: 0,
    detectRange: profile.detectRange,
    attackRange: profile.attackRange,
    preAttackFrames: profile.preAttackFrames,
    postCooldown: profile.postCooldown,
    moveSpeedPerTick: profile.moveSpeedPerTick,
    loseAggroRange: profile.loseAggroRange,
    hp: profile.hp,
    damage: profile.damage,
    baseDamage: profile.damage,
    armor: profile.armor,
    sightRange: profile.sightRange,
    aggressiveness: profile.aggressiveness,
    targetSwitchTime: profile.targetSwitchTime,
    longRangeReactionChance: profile.longRangeReactionChance,
    behaviorWeights: profile.behaviorWeights,
    flinchDurationTicks: profile.flinchDurationTicks,
    launchDurationTicks: profile.launchDurationTicks,
    knockdownDurationTicks: profile.knockdownDurationTicks,
    getupDurationTicks: profile.getupDurationTicks,
  };
}

export const ENEMY_TUNING: Record<EnemyManifestId, EnemyAIState> = Object.fromEntries(
  ENEMY_PROFILE_IDS.map(id => [id, toEnemyAIState(ENEMY_PROFILES[id])])
) as Record<EnemyManifestId, EnemyAIState>;
