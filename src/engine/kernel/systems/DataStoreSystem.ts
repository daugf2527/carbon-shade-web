/**
 * DataStoreSystem.ts — 13-DataStore cross-cutting service (P2b).
 *
 * Truth anchor: src/data/manifest/truth/system-api-map.ts "13-DataStore" —
 *   sq_var (extracted, 885 calls — the single highest-frequency PVF API),
 *   sq_GetIntData / sq_IntVectPush / sq_GetLevelData / sq_GetGlobalIntVector (inferred).
 * .nut first-evidence: ap_atmage_manaburst.nut `appendage.sq_var.get_vector(0)`.
 *
 * Models the script-variable store: keyed int values + int vectors. Pure passive
 * storage — no per-tick work; consumers mutate via IDataStore. State folds into the
 * kernel stateHash through snapshot() (keys sorted for determinism).
 */
import type { CrossCuttingKind, EngineSystem } from "../EngineSystem.js";

export interface IDataStore {
  setInt(key: string, value: number): void;
  getInt(key: string, fallback?: number): number;
  pushVec(key: string, value: number): void;
  getVec(key: string): readonly number[];
  clearVec(key: string): void;
}

export class DataStoreSystem implements EngineSystem, IDataStore {
  readonly name = "DataStore";
  readonly phase = "LOGIC" as const;
  readonly provides: CrossCuttingKind = "dataStore";

  private ints = new Map<string, number>();
  private vecs = new Map<string, number[]>();

  tick(): void {
    // Passive store — mutated by consumers via the IDataStore methods.
  }

  setInt(key: string, value: number): void {
    this.ints.set(key, value | 0);
  }
  getInt(key: string, fallback = 0): number {
    return this.ints.get(key) ?? fallback;
  }
  pushVec(key: string, value: number): void {
    const v = this.vecs.get(key) ?? [];
    v.push(value | 0);
    this.vecs.set(key, v);
  }
  getVec(key: string): readonly number[] {
    return this.vecs.get(key) ?? [];
  }
  clearVec(key: string): void {
    this.vecs.delete(key);
  }

  snapshot(): string {
    const ints = [...this.ints.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    const vecs = [...this.vecs.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => `${k}=[${v.join(" ")}]`)
      .join(",");
    return `ds{${ints}|${vecs}}`;
  }

  reset(): void {
    this.ints.clear();
    this.vecs.clear();
  }
}
