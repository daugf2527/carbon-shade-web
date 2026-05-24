import type { AtkAttackKind, AtkDef, AtkElement, AtkHitReaction } from "../types/AtkDef.js";
import type { PvfDocument } from "../types/PvfDocument.js";
import {
  asTier3,
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
    sections: structuredClone(document.sections),
    // D1 expansion (2026-05-24): launch / pushback / knockback are encoded
    // in PVF as raw integers but the engine's velocity / distance mapping
    // (launch curves, gravity application, hitstun timing) is hardcoded
    // inside DNF.exe C++ binary per CRT-002. PVF alone cannot resolve
    // unit semantics; mark Tier-3 until runtime-side verification.
    liftUp: asTier3(firstNumberFact(document, "lift up", "px/s")),
    pushAside: asTier3(firstNumberFact(document, "push aside", "px/s")),
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
    knuckBack: asTier3(firstNumberFact(document, "knuck back", "raw")),
    raw: Object.freeze(document),
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
    throw new Error(
      `[AtkParser] parseAttackKind: mutually-exclusive attack kinds coexist in ${document.path}: ` +
      `${matches.join(", ")}. Real PVF emits at most one (0/382 .atk files across 6 jobs have multi); ` +
      `coexistence indicates corrupted or malformed PVF input.`,
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
    throw new Error(
      `[AtkParser] parseElement: mutually-exclusive elements coexist in ${document.path}: ` +
      `${matches.join(", ")}. Real PVF emits at most one (0/382 .atk files across 6 jobs have multi); ` +
      `coexistence indicates corrupted or malformed PVF input. ` +
      `(Note: "no element" + "light element" coexistence in priest/bladeofpurewhite.atk is a different ` +
      `pattern and not flagged here because "no element" is not in the dark/fire/ice/light set.)`,
    );
  }
  return matches[0] ?? "none";
}

function parseHitReaction(document: PvfDocument): AtkHitReaction {
  const matches: AtkHitReaction[] = [];
  if (hasSection(document, "hit down")) matches.push("hit_down");
  if (hasSection(document, "hit lift up")) matches.push("hit_lift_up");
  if (hasSection(document, "hit horizon")) matches.push("hit_horizon");
  // Audit (initial): hard-throw on multi based on 0/382 .atk files in the
  // sample set. PVE-full baseline (2026-05-24, 614 .atk files across 11
  // jobs incl. atfighter atattackinfo/) found 3 real multi-reaction files
  // (lightningdance.atk, groundkick.atk, jumpsuplexlariat.atk — all
  // atfighter). Multi is real game data, not corruption: female fighter
  // grab moves combine vertical + horizontal reactions. AtkHitReaction
  // remains a single enum until a consumer needs the second reaction;
  // when multi, take the first in file order. Stage 2 implementations
  // that depend on full reaction semantics should expand AtkHitReaction
  // to AtkHitReaction[] and update the validator schema accordingly.
  return matches[0] ?? "none";
}
