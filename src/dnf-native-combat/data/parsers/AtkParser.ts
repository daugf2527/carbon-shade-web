import type { AtkAttackKind, AtkDef, AtkElement, AtkHitReaction } from "../types/AtkDef.js";
import type { PvfDocument } from "../types/PvfDocument.js";
import {
  documentProvenance,
  firstNumberFact,
  firstSection,
  firstStringFact,
} from "./parserUtils.js";

export function parseAtkDocument(document: PvfDocument): AtkDef {
  if (!document.path.endsWith(".atk")) {
    throw new Error(`AtkParser expected .atk document, got ${document.path}`);
  }

  return {
    kind: "atk",
    path: document.path,
    provenance: documentProvenance(document),
    sections: document.sections,
    liftUp: firstNumberFact(document, "lift up", "px/s"),
    pushAside: firstNumberFact(document, "push aside", "px/s"),
    damageBonus: firstNumberFact(document, "damage bonus", "%"),
    attackEnemy: hasSection(document, "attack enemy"),
    attackFriend: hasSection(document, "attack friend"),
    weaponDamageApply: hasSection(document, "weapon damage apply"),
    attackKind: parseAttackKind(document),
    element: parseElement(document),
    hitReaction: parseHitReaction(document),
    causesDown: hasSection(document, "down"),
    causesStun: hasSection(document, "stun"),
    causesBounce: hasSection(document, "bounce"),
    causesStuck: hasSection(document, "stuck"),
    pvpOnly: hasSection(document, "pvp"),
    ignoreWeight: hasSection(document, "ignore weight"),
    hitWav: firstStringFact(document, "hit wav", "sound-id"),
    knuckBack: firstNumberFact(document, "knuck back", "raw"),
    raw: document,
  };
}

function hasSection(document: PvfDocument, sectionName: string): boolean {
  return firstSection(document, sectionName) !== null;
}

function parseAttackKind(document: PvfDocument): AtkAttackKind {
  if (hasSection(document, "physic")) return "physic";
  if (hasSection(document, "magic")) return "magic";
  return null;
}

function parseElement(document: PvfDocument): AtkElement {
  if (hasSection(document, "dark element")) return "dark";
  if (hasSection(document, "fire element")) return "fire";
  if (hasSection(document, "ice element")) return "ice";
  if (hasSection(document, "light element")) return "light";
  return "none";
}

function parseHitReaction(document: PvfDocument): AtkHitReaction {
  if (hasSection(document, "hit down")) return "hit_down";
  if (hasSection(document, "hit lift up")) return "hit_lift_up";
  if (hasSection(document, "hit horizon")) return "hit_horizon";
  return "none";
}
