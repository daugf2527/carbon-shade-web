import type { PvfDocument, PvfSection } from "./PvfDocument.js";
import type { ExtractedDocumentProvenance, PvfFact, PvfStringFact } from "./Provenance.js";

export type AtkAttackKind = "physic" | "magic" | null;
export type AtkElement = "none" | "dark" | "fire" | "ice" | "light";
export type AtkHitReaction = "none" | "hit_down" | "hit_lift_up" | "hit_horizon";

export interface AtkDef {
  kind: "atk";
  path: string;
  provenance: ExtractedDocumentProvenance;
  sections: PvfSection[];
  liftUp: PvfFact<number> | null;
  pushAside: PvfFact<number> | null;
  damageBonus: PvfFact<number> | null;
  attackEnemy: boolean;
  attackFriend: boolean;
  weaponDamageApply: boolean;
  attackKind: AtkAttackKind;
  element: AtkElement;
  hitReaction: AtkHitReaction;
  causesDown: boolean;
  causesStun: boolean;
  causesBounce: boolean;
  causesStuck: boolean;
  pvpOnly: boolean;
  ignoreWeight: boolean;
  hitWav: PvfStringFact | null;
  knuckBack: PvfFact<number> | null;
  raw: PvfDocument;
}
