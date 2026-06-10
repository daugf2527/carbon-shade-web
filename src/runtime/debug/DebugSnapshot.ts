import type { LastHitTraceSnapshot, ScenarioBooleans } from "../data/RuntimeScenarioTypes.js";

export interface DebugSnapshot {
  tick: number;
  actors: object[];
  lastHit: LastHitTraceSnapshot;
  eventCount: number;
  scenario?: ScenarioBooleans;
  performance: {
    actorCount: number;
    eventArchiveSize: number;
    poolStatus: string;
    tickCostMs?: number;
  };
}
