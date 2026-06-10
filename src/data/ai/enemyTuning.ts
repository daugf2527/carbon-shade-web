import type { EnemyAIState } from "../../runtime/data/EnemyAIState.js";
import { ENEMY_TUNING } from "../manifest/ai.js";
import type { EnemyManifestId } from "../manifest/aiTypes.js";

export const enemyTuning: Record<EnemyManifestId, EnemyAIState> = ENEMY_TUNING;

export function cloneEnemyTuning(id: keyof typeof enemyTuning): EnemyAIState {
  return { ...enemyTuning[id] };
}
