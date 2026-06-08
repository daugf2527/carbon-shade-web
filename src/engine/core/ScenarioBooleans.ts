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
 * ── HONEST COVERAGE (updated 2026-06-08, building-armor blocked-control activation) ──
 * engine currently has player + grunt actors, 5 swordman actions, a bleed DOT StatusSystem, an
 * armor profile system (Batch 3a, incl. building armor), and a DownSystem (Stage 4B-B1). It can
 * genuinely observe 6 of the 7 flags; the last one requires a multi-hit super action engine does not
 * have yet (documented P4 gap — kept in the type for forward-compat + uniform overlay with combat,
 * but never set true by the scenario):
 *   ✅ normalHitObserved           — any hit lands (attack1 → grunt)
 *   ✅ launchObserved              — airborne reaction (attack3 liftUp → grunt)
 *   ✅ bleedObserved               — bleed DOT deals damage (StatusSystem, 09-Status)
 *   ✅ armorHitObserved            — hit vs boss super-armor (Batch 3a; scenario sub-scenario 4)
 *   ✅ quickReboundObserved        — DownSystem quick-rebound fires (Stage 4B-B1; sub-scenario 5)
 *   ✅ buildingArmorBlockedControlObserved — building armor folds a lift_up to HIT (Batch 3a; sub-scenario 6)
 *   ❌ ragingFuryMultiHitObserved  — engine has no multi-hit super action (P4)
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
