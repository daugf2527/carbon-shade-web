import type { Actor, ArmorDecision, HitQuery, ReactionKind } from "../types.js";
export class ArmorResolver {
  decide(target: Actor, query: HitQuery, rawReaction: ReactionKind): ArmorDecision {
    const armor = target.armorProfile;
    const damageImmune = armor.immunities.damage;
    const controlBlocked = armor.immunities.control || armor.baseType === "building_armor" || armor.baseType === "boss_super_armor";
    let finalReaction = rawReaction;
    if (controlBlocked) finalReaction = armor.reactionOverride ?? "armor_feedback_only";
    if (query.canLaunch && !armor.canBeLaunched) finalReaction = "armor_feedback_only";
    if (query.canKnockdown && !armor.canBeKnockedDown) finalReaction = "armor_feedback_only";
    return { baseType: armor.baseType, damageAllowed: armor.canTakeDamage && !damageImmune, controlBlocked, hitStopAllowed: armor.canReceiveHitStop && !armor.immunities.hitStop, finalReaction, reason: controlBlocked ? "control_blocked_by_armor" : undefined };
  }
  isInvulnerable(target: Actor, tick: number): boolean { return Boolean(target.armorProfile.temporaryFlags.invulnerableUntilTick && target.armorProfile.temporaryFlags.invulnerableUntilTick >= tick); }
}
