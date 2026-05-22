import type { AtkAttackKind, AtkDef, AtkElement, AtkHitReaction } from "../types/AtkDef.js";
import type { PvfDocument } from "../types/PvfDocument.js";
import {
  documentProvenance,
  firstNumberFact,
  firstSection,
  firstStringFact,
} from "./parserUtils.js";

export function parseAtkDocument(document: PvfDocument): AtkDef {
  if (!document.path.toLowerCase().endsWith(".atk")) {
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
    pvpOnly: hasPvpSection(document),
    ignoreWeight: hasSection(document, "ignore weight"),
    hitWav: firstStringFact(document, "hit wav", "sound-id"),
    knuckBack: firstNumberFact(document, "knuck back", "raw"),
    raw: document,
  };
}

function hasSection(document: PvfDocument, sectionName: string): boolean {
  return firstSection(document, sectionName) !== null;
}

// PVF section name for PvP-only flag is empirically unverified (no PvP-only
// .atk found in 200+ samples from real Script.pvf). Match `pvp`, `pvp only`,
// and `pvp <suffix>` to cover plausible variants. PvE-only scope discards the
// flag at validate/export anyway (design §0.5), so over-matching is harmless.
function hasPvpSection(document: PvfDocument): boolean {
  return document.sections.some(section => {
    const name = section.name.toLowerCase();
    return name === "pvp" || name === "pvp only" || name.startsWith("pvp ");
  });
}

function parseAttackKind(document: PvfDocument): AtkAttackKind {
  const matches: AtkAttackKind[] = [];
  if (hasSection(document, "physic")) matches.push("physic");
  if (hasSection(document, "magic")) matches.push("magic");
  if (matches.length > 1) {
    console.warn(
      `[AtkParser] parseAttackKind: ${matches.length} mutually-exclusive attack kinds coexist in ${document.path}: ${matches.join(", ")}; first match wins.`,
    );
  }
  return matches[0] ?? null;
}

function parseElement(document: PvfDocument): AtkElement {
  const matches: AtkElement[] = [];
  if (hasSection(document, "dark element")) matches.push("dark");
  if (hasSection(document, "fire element")) matches.push("fire");
  if (hasSection(document, "ice element")) matches.push("ice");
  if (hasSection(document, "light element")) matches.push("light");
  if (matches.length > 1) {
    console.warn(
      `[AtkParser] parseElement: ${matches.length} mutually-exclusive elements coexist in ${document.path}: ${matches.join(", ")}; first match wins.`,
    );
  }
  return matches[0] ?? "none";
}

function parseHitReaction(document: PvfDocument): AtkHitReaction {
  const matches: AtkHitReaction[] = [];
  if (hasSection(document, "hit down")) matches.push("hit_down");
  if (hasSection(document, "hit lift up")) matches.push("hit_lift_up");
  if (hasSection(document, "hit horizon")) matches.push("hit_horizon");
  if (matches.length > 1) {
    console.warn(
      `[AtkParser] parseHitReaction: ${matches.length} mutually-exclusive hit reactions coexist in ${document.path}: ${matches.join(", ")}; first match wins.`,
    );
  }
  return matches[0] ?? "none";
}
