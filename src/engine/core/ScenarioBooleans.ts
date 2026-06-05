/**
 * ScenarioBooleans.ts — Engine-side deterministic scenario observation flags.
 *
 * Mirrors combat's `ScenarioBooleans` (src/combat/types.ts:403) in SHAPE so the
 * runtime evidence collector + RenderAdapter scenario overlay consume engine and
 * combat uniformly. But this is an INDEPENDENT engine type (原生重写原则: engine
 * does not import combat types).
 *
 * `runDeterministicScenario()` runs a fixed scripted sequence and flips the
 * booleans it can OBSERVE; systems set them during tick (see CombatResolutionSystem).
 *
 * ── HONEST COVERAGE (2026-06-05, P3 收尾) ────────────────────────────────────────
 * engine currently has only player + grunt actors and 5 swordman actions. It can
 * genuinely observe 2 of the 7 flags; the other 5 require actors/systems engine
 * does not have yet and are documented P4 gaps (kept in the type for forward-compat
 * + uniform overlay with combat, but never set true by the engine scenario):
 *   ✅ normalHitObserved           — any hit lands (attack1 → grunt)
 *   ✅ launchObserved              — airborne reaction (attack3 liftUp → grunt)
 *   ❌ ragingFuryMultiHitObserved  — engine has no multi-hit super action (P4)
 *   ❌ armorHitObserved            — engine has no boss/super-armor actor (P4)
 *   ❌ buildingArmorBlockedControlObserved — engine has no building actor (P4)
 *   ❌ bleedObserved               — engine has no StatusEffectSystem / DOT (P4)
 *   ❌ quickReboundObserved        — engine has no quick-rebound mechanic (P4)
 */

export interface EngineScenarioBooleans {
  normalHitObserved: boolean;
  launchObserved: boolean;
  ragingFuryMultiHitObserved: boolean;
  armorHitObserved: boolean;
  buildingArmorBlockedControlObserved: boolean;
  bleedObserved: boolean;
  quickReboundObserved: boolean;
}

/** Fresh all-false scenario flags (initial state + reset). */
export function freshScenarioBooleans(): EngineScenarioBooleans {
  return {
    normalHitObserved: false,
    launchObserved: false,
    ragingFuryMultiHitObserved: false,
    armorHitObserved: false,
    buildingArmorBlockedControlObserved: false,
    bleedObserved: false,
    quickReboundObserved: false,
  };
}
