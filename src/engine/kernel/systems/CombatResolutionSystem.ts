/**
 * CombatResolutionSystem.ts — 04-Attack/Hit + damage + reaction, fused (P3.0).
 *
 * Fuses hit detection → damage → reaction into ONE system so a HitResult never has to
 * cross a system boundary (EngineContext is read-only; combat used a writable
 * SystemContext for this). For each attacker whose current frame has attackBoxes, tests
 * against every other live actor's damageBoxes; on AABB overlap it computes damage and
 * applies the hit reaction onto the defender (writes defender.hp / fsm / reaction).
 *
 * hitGroup dedup (P3.0 SIMPLIFIED): one Set per attacker tracks which defenders the
 * current attack already hit; cleared when the attacker's frame carries no attackBoxes
 * (attack window closed). NOTE: true DNF hitGroup keys off the .atk hitGroup id — this
 * per-attacker approximation is a P3.0 placeholder, to be refined when .atk attack data
 * is wired (the same hitGroup concern swordman-attack1-truth.test.ts already tracks).
 *
 * Determinism: actor iteration follows registration order (stable); no Math.random.
 */
import type { AniBox } from "../../core/AnimationPlayer.js";
import { launchAirborne } from "../../core/AirbornePhysicsSystem.js";
import { calcPhysicalDamage } from "../../core/DamageFormula.js";
import { detectHit } from "../../core/HitDetection.js";
import { applyHitReaction } from "../../core/ReactionResolver.js";
import type { ReactionState } from "../../core/ReactionResolver.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

/** Default body damage box when a defender has no current animation (idle proxy). */
const DEFAULT_BODY_BOX: readonly AniBox[] = [
  { x1: -20, y1: 0, z1: -20, x2: 20, y2: 80, z2: 20 },
];

export class CombatResolutionSystem implements EngineSystem {
  readonly name = "CombatResolution";
  readonly phase = "DETECTION" as const;

  private hitGroups = new Map<string, Set<string>>(); // attackerId → defenderIds already hit this attack

  tick(ctx: EngineContext): void {
    for (const attacker of ctx.actors) {
      const frame = attacker.animationPlayer.currentFrame;
      const atkBoxes = frame?.attackBoxes ?? [];
      if (atkBoxes.length === 0) {
        // Attack window closed — reset this attacker's hit group.
        this.hitGroups.delete(attacker.id);
        continue;
      }
      let group = this.hitGroups.get(attacker.id);
      if (!group) {
        group = new Set<string>();
        this.hitGroups.set(attacker.id, group);
      }
      for (const defender of ctx.actors) {
        if (defender.id === attacker.id || defender.isDead) continue;
        if (group.has(defender.id)) continue; // already hit by this attack
        const defFrame = defender.animationPlayer.currentFrame;
        const dmgBoxes = defFrame?.damageBoxes?.length ? defFrame.damageBoxes : DEFAULT_BODY_BOX;
        const hit = detectHit(
          attacker.id, atkBoxes, attacker.x, attacker.y, 0, attacker.facing,
          defender.id, dmgBoxes, defender.x, defender.y, 0, defender.facing,
        );
        if (!hit) continue;
        group.add(defender.id);
        const dmg = calcPhysicalDamage({
          attackerPhysAtk: attacker.stats.physicalAttack,
          atkBonus: 1.0,
          defenderPhysDef: defender.stats.physicalDefense,
        });
        // liftUp attack (anim.liftVy > 0) launches the defender airborne.
        const liftVy = attacker.animationPlayer.attackLiftVy;
        const flags = liftVy > 0 ? { liftUp: true } : {};
        defender.reaction = applyHitReaction(defender, flags, dmg, ctx.tickCount);
        if (liftVy > 0 && !defender.isDead) {
          defender.airborne = launchAirborne(liftVy, defender.y);
        }
        ctx.bus.emit("HitConfirmed", {
          attackerId: attacker.id,
          defenderId: defender.id,
          dmg,
          tick: ctx.tickCount,
        });
        // P3.1: emit render-oriented events for scene consumers.
        ctx.bus.emit("DamageNumberRequested", {
          actorId: defender.id,
          amount: dmg,
          tick: ctx.tickCount,
        });
        const reactionLabel = reactionKindToCombatLabel(defender.reaction);
        ctx.bus.emit("ReactionApplied", {
          targetActorId: defender.id,
          finalReaction: reactionLabel,
          tick: ctx.tickCount,
        });
        if (defender.isDead) {
          ctx.bus.emit("ActorDead", {
            targetActorId: defender.id,
            actorId: defender.id,
            tick: ctx.tickCount,
          });
        }
      }
    }
  }

  reset(): void {
    this.hitGroups.clear();
  }

  /** Return world-space attack hitboxes for a given actor (debug visualization, P3.1). */
  debugHitBoxes(ctx: EngineContext, actorId: string): Array<{ x: number; y: number; w: number; h: number; color: number }> {
    const actor = ctx.actors.find((a) => a.id === actorId);
    if (!actor) return [];
    const frame = actor.animationPlayer.currentFrame;
    if (!frame?.attackBoxes?.length) return [];
    return frame.attackBoxes.map((box) => {
      const x1 = actor.x + Math.min(box.x1, box.x2);
      const y1 = actor.y + Math.min(box.y1, box.y2);
      const x2 = actor.x + Math.max(box.x1, box.x2);
      const y2 = actor.y + Math.max(box.y1, box.y2);
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1, color: 0xef4444 };
    });
  }
}

/** Map engine ReactionState.kind → combat-style reaction label for scene consumers. */
function reactionKindToCombatLabel(reaction: ReactionState | null): string {
  if (!reaction) return "none";
  switch (reaction.kind) {
    case "airborne": return "launch";
    case "hit": return "light_stagger";
    case "down": return "downed";
    default: return "none";
  }
}
