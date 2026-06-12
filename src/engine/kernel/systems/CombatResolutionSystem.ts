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
import { calcPhysicalDamage } from "../../core/DamageFormula.js";
import { detectHit } from "../../core/HitDetection.js";
import { applyHitReaction, routeFromHitReaction, routeFromLegacyBools, applyArmorToKind } from "../../core/ReactionResolver.js";
import { applyHitStop, hitStopFor } from "../../core/HitStop.js";
import { applyComboFromHit } from "../../core/ComboPressure.js";
import type { ReactionState, AtkFlags, HitReaction } from "../../core/ReactionResolver.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";
// PVF truth tables (Wave 2, 2026-06-05): per-action atk facts + per-weapon-class hit info.
// swordman-attacks.json lives under src/ (always bundled); weaponHitInfo rides the baseline
// shard, imported the same static-JSON way combat's ReactionResolver does (Vite bundles it).
import SWORDMAN_ATTACKS from "../../../data/manifest/truth/swordman-attacks.json" with { type: "json" };
import SWORDMAN_DATA from "../../../../verification/baseline-shards/players/swordman.json" with { type: "json" };

/** Default body damage box when a defender has no current animation (idle proxy). */
const DEFAULT_BODY_BOX: readonly AniBox[] = [
  { x1: -20, y1: 0, z1: -20, x2: 20, y2: 80, z2: 20 },
];

/**
 * Action → weaponHitInfo slot routing (D9=B hardcoded path, mirrored from combat
 * ReactionResolver WEAPON_SLOT_ROUTING). Default slot 0.
 *
 * Batch 5 investigation (2026-06-07): VERIFIED this CANNOT be truth-driven from PVF. The .atk
 * attack files (swordman-attacks.json) carry hit characteristics (lift up / push aside / damage
 * reaction / attack direction / elemental property / attackKind) but NO weapon-slot selector and
 * NO per-attack hitTag — hitTag is a weaponHitInfo ROW property ([cut]/[blow]), not an attack→slot
 * mapper. The attack→slot table lives in DNF.exe, not PVF (L3 data gap, requiresManualVerification).
 * This hardcoded map stays the honest D9=B path; do NOT invent a truth-derivation that isn't there.
 */
const WEAPON_SLOT_ROUTING: Record<string, number> = {
  attack1: 0, attack2: 0, attack3: 0, dashattack: 0, jumpattack: 0,
  hardattack: 3, chargecrash: 3, chargecrashfinish: 3,
};

interface AtkTruth {
  damageBonus: { value: number } | null;
  hitReaction?: string;
  liftUp?: { value: number };
  pushAside?: { value: number };
  causesDown?: boolean;
  attackLevel?: number;
}
const ATTACKS = SWORDMAN_ATTACKS as unknown as Record<string, AtkTruth>;
const WEAPON_HIT_INFO = SWORDMAN_DATA.chr.weaponHitInfo as unknown as Array<{
  launch: number; pushBack: number; damageScalePct: number;
}>;

export class CombatResolutionSystem implements EngineSystem {
  readonly name = "CombatResolution";
  readonly phase = "DETECTION" as const;

  private hitGroups = new Map<string, Set<string>>(); // "attackerId:action" → defenders already hit by this action's window

  tick(ctx: EngineContext): void {
    for (const attacker of ctx.actors) {
      if (attacker.frozenFrames > 0) continue; // hit-stop: frozen attacker emits no hitbox
      const frame = attacker.animationPlayer.currentFrame;
      const atkBoxes = frame?.attackBoxes ?? [];
      // hitGroup key (B3): attacker + action. True DNF dedup keys off the .atk hitGroup id, which is
      // NOT in PVF (data-gap, confirmed — the combat kernel synthesizes `${action}_group` for the same
      // reason). Action-keying is the best available approximation: one hit per defender per action
      // active window; the window-close reset below re-arms looping/multi-window attacks; canceling
      // into a new action gets a fresh group. requiresManualVerification (no PVF hitGroup truth).
      const groupKey = `${attacker.id}:${attacker.currentActionName ?? ""}`;
      if (atkBoxes.length === 0) {
        // Active window closed — reset this action's hit group (re-arms the next loop/window).
        this.hitGroups.delete(groupKey);
        continue;
      }
      let group = this.hitGroups.get(groupKey);
      if (!group) {
        group = new Set<string>();
        this.hitGroups.set(groupKey, group);
      }
      for (const defender of ctx.actors) {
        if (defender.id === attacker.id || defender.isDead) continue;
        if (defender.isInvulnerable(ctx.tickCount)) continue;
        if (group.has(defender.id)) continue; // already hit by this attack
        const defFrame = defender.animationPlayer.currentFrame;
        const dmgBoxes = defFrame?.damageBoxes?.length ? defFrame.damageBoxes : DEFAULT_BODY_BOX;
        const hit = detectHit(
          attacker.id, atkBoxes, attacker.x, attacker.y, 0, attacker.facing,
          defender.id, dmgBoxes, defender.x, defender.y, 0, defender.facing,
        );
        if (!hit) continue;
        group.add(defender.id);
        const actionName = attacker.currentActionName;
        const atk = actionName ? ATTACKS[actionName] : undefined;
        const slot = (actionName ? WEAPON_SLOT_ROUTING[actionName] : undefined) ?? 0;
        const weaponInfo = WEAPON_HIT_INFO[slot];
        // Damage (PVF truth): atkBonus = 1 + damageBonus%/100 (null → 1.0). Negative bonus like
        // attack1 -15% → 0.85 reduces; NOT value/100 which would make negatives go negative.
        // requiresManualVerification: % semantics inferred from negative values present in the
        // shard (combat never consumed damageBonus, so there is no first-evidence to mirror).
        const atkBonus = atk?.damageBonus == null ? 1.0 : 1 + atk.damageBonus.value / 100;
        const damageScalePct = weaponInfo?.damageScalePct ?? 100;
        const baseDmg = calcPhysicalDamage({
          // Equipment (C2): flat weapon-atk / armor-def fold into the damage totals (local_baseline).
          attackerPhysAtk: attacker.stats.physicalAttack + attacker.equipment.weaponPhysAtk,
          atkBonus,
          defenderPhysDef: defender.stats.physicalDefense + defender.equipment.armorPhysDef,
          damageScalePct,
        });
        // Combo decay (Batch 4): repeated hits on the same target do less damage. damageScale reflects
        // the pressure from hits 1..N-1 (accumulated AFTER applyHitReaction below), so the FIRST hit
        // lands at scale=1 — single-hit truth tests are byte-identical (only scaled when <1).
        const dmg = defender.combo.damageScale < 1
          ? Math.max(1, Math.round(baseDmg * defender.combo.damageScale))
          : baseDmg;
        // Reaction (PVF truth): route from atk hitReaction; fall back to AniDef attackLiftVy for
        // synthetic animations carrying no swordman actionName. applyHitReaction sets
        // defender.airborne internally (cohesive with hp/fsm), so no separate launchAirborne here.
        const liftVy = attacker.animationPlayer.attackLiftVy;
        let flags: AtkFlags;
        if (atk?.hitReaction) {
          flags = {
            hitReaction: atk.hitReaction as HitReaction,
            liftUpValue: atk.liftUp?.value,
            causesDown: atk.causesDown,
            attackLevel: atk.attackLevel,
            weaponLaunch: weaponInfo?.launch,
            // Horizontal knockback truth (P4-GAP fill): pushAside × pushBack × attacker facing.
            pushAsideValue: atk.pushAside?.value,
            weaponPushBack: weaponInfo?.pushBack,
            attackerFacing: attacker.facing,
          };
        } else if (liftVy > 0) {
          flags = { liftUp: true, liftUpValue: liftVy };
        } else {
          flags = {};
        }
        defender.reaction = applyHitReaction(defender, flags, dmg, ctx.tickCount);
        // Combo pressure (Batch 4): fold THIS hit into the defender's gauge so the NEXT hit on it
        // decays (damage + launch). Per-defender accumulation; ComboSystem (CLEANUP) resets on drop.
        applyComboFromHit(defender.combo, defender.reaction.kind, atk?.attackLevel ?? 1);
        // Hit-stop (命中停帧): freeze attacker + defender on the hit (local_baseline frames).
        // Defender freeze ≈ 1.5× attacker (DNF victim hangs longer). Armor (Batch 3) caps the
        // freeze: hitting a super-armored/boss/building target gives a shorter "thunk" (cap=3/2/1).
        const hs = hitStopFor(actionName);
        const cap = defender.armorProfile.hitStopCapFrames; // null → no cap (unarmored)
        const atkFrames = cap == null ? hs.frames : Math.min(hs.frames, cap);
        const defFrames = cap == null ? Math.round(hs.frames * 1.5) : Math.min(Math.round(hs.frames * 1.5), cap);
        attacker.frozenFrames = applyHitStop(attacker.frozenFrames, atkFrames);
        defender.frozenFrames = applyHitStop(defender.frozenFrames, defFrames);
        ctx.bus.emit("HitStopStarted", {
          attackerId: attacker.id, defenderId: defender.id,
          attackerFrames: atkFrames, defenderFrames: defFrames, tick: ctx.tickCount,
        });
        // Scenario observation (P3 收尾): flip the booleans this hit demonstrates. ctx.scenario
        // is a live object on the kernel (undefined only on bare test contexts). Any landed hit
        // proves normalHit; an airborne reaction proves launch. The remaining flags need actors/
        // systems the engine exercises only in specific sub-scenarios (see ScenarioBooleans.ts).
        if (ctx.scenario) {
          ctx.scenario.normalHitObserved = true;
          if (defender.reaction?.kind === "airborne") ctx.scenario.launchObserved = true;
          // Armor (Batch 3): hitting any armored target (non-none) is an observable armor hit.
          // Stays false in the default scenario (player+grunt are NONE_ARMOR) — wiring is ready
          // for when runDeterministicScenario spawns an armored dummy.
          if (defender.armorProfile.baseType !== "none") ctx.scenario.armorHitObserved = true;
          // Building armor (Batch 3a): a control reaction (launch/down) that folds to a plain HIT
          // because the building can't be launched/knocked down is a BLOCKED control. Re-derive the
          // would-be raw reaction and check armor downgraded it. Mirrors combat HitResolutionSystem:235
          // (building_armor + armor_feedback_only + dmg>0). Read-only — scenario flags are not hashed.
          if (defender.armorProfile.baseType === "building_armor" && dmg > 0) {
            const rawKind = flags.hitReaction
              ? routeFromHitReaction(flags.hitReaction, flags.causesDown ?? false, flags.attackLevel ?? 1)
              : routeFromLegacyBools(flags);
            if (rawKind !== applyArmorToKind(defender.armorProfile, rawKind)) {
              ctx.scenario.buildingArmorBlockedControlObserved = true;
            }
          }
        }
        const reactionLabel = reactionKindToCombatLabel(defender.reaction, defender.armorProfile.baseType);
        ctx.bus.emit("HitConfirmed", {
          attackerId: attacker.id,
          defenderId: defender.id,
          targetId: defender.id,
          actionName,
          dmg,
          finalDamage: dmg,
          hpAfter: defender.hp,
          finalReaction: reactionLabel,
          armorBaseType: defender.armorProfile.baseType,
          tick: ctx.tickCount,
        });
        // P3.1: emit render-oriented events for scene consumers.
        ctx.bus.emit("DamageNumberRequested", {
          actorId: defender.id,
          amount: dmg,
          tick: ctx.tickCount,
        });
        ctx.bus.emit("ReactionApplied", {
          targetActorId: defender.id,
          finalReaction: reactionLabel,
          tick: ctx.tickCount,
        });
        if (defender.isDead) {
          ctx.bus.emit("ActorDied", {
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
function reactionKindToCombatLabel(
  reaction: ReactionState | null,
  armorBaseType: string = "none",
): string {
  if (!reaction) return "none";
  if (reaction.kind === "hit" && armorBaseType !== "none") return "armor_feedback_only";
  switch (reaction.kind) {
    case "airborne": return "launch";
    case "down": return "downed";
    case "stagger": return "light_stagger";
    case "hit": return "light_stagger";
    default: return "none";
  }
}
