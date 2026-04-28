import type { Actor, HitDecision, HitQuery } from "../types.js";
import { ArmorResolver } from "../armor/ArmorResolver.js";

export interface HitGeometryResult {
  overlap: boolean;
  zMismatch: boolean;
  yMismatch: boolean;
}

export class HitRejectionResolver {
  constructor(private readonly armor = new ArmorResolver()) {}

  resolve(tick: number, query: HitQuery, attacker: Actor, target: Actor, geometry: HitGeometryResult, alreadyHit: boolean): HitDecision["rejectedReason"] | undefined {
    if (!geometry.overlap) return geometry.zMismatch ? "z_mismatch" : geometry.yMismatch ? "y_mismatch" : "out_of_active_frame";
    if (attacker.faction === target.faction) return "same_faction";
    if (target.flags.dead) return "target_dead";
    if (this.armor.isInvulnerable(target, tick)) return "target_invulnerable";
    if (target.armorProfile.immunities.damage) return "damage_immune";
    if (alreadyHit) return "already_hit_in_group";
    if (target.reactionState === "downed" && !query.canHitDowned) return "downed_not_allowed";
    return undefined;
  }
}
