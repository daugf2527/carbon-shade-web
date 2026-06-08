/**
 * ScenarioBooleans.ts — Engine-side deterministic scenario observation flags.
 *
 * Mirrors combat's `ScenarioBooleans` (src/combat/types.ts:403) in SHAPE so the
 * runtime evidence collector + RenderAdapter scenario overlay consume engine and
 * combat uniformly. But this is an INDEPENDENT engine type (原生重写原则: engine
 * does not import combat types).
 *
 * `runDeterministicScenario()` runs a fixed scripted sequence and flips the
 * booleans it can OBSERVE; systems set them during tick (see CombatResolutionSystem + StatusSystem).
 *
 * ── HONEST COVERAGE (updated 2026-06-08, Batch 3a armor activation) ───────────────
 * engine currently has player + grunt actors, 5 swordman actions, a bleed DOT StatusSystem, and an
 * armor profile system (Batch 3a). It can genuinely observe 4 of the 7 flags; the other 3 require
 * actors/systems engine does not exercise in the scenario yet and are documented P4 gaps (kept in
 * the type for forward-compat + uniform overlay with combat, but never set true by the scenario):
 *   ✅ normalHitObserved           — any hit lands (attack1 → grunt)
 *   ✅ launchObserved              — airborne reaction (attack3 liftUp → grunt)
 *   ✅ bleedObserved               — bleed DOT deals damage (StatusSystem, 09-Status)
 *   ✅ armorHitObserved            — hit vs boss super-armor (Batch 3a; scenario sub-scenario 4)
 *   ❌ ragingFuryMultiHitObserved  — engine has no multi-hit super action (P4)
 *   ❌ buildingArmorBlockedControlObserved — scenario does not script a building-armor block (P4)
 *   ❌ quickReboundObserved        — DownSystem has quick-rebound, but the scenario kernel does not
 *                                    register DownSystem yet, so it is not observed here (P4)
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
