/**
 * ComboSystem.ts — decays per-actor combo pressure (Stage 4C Batch 4).
 *
 * Phase CLEANUP: after hits accumulate (CombatResolutionSystem, DETECTION), count frames since the
 * last hit; once a combo goes comboResetFrames without a new hit, the gauge resets (combo dropped),
 * restoring full damage/launch. Frozen actors (hit-stop) are skipped — combo timing pauses with
 * everything else.
 *
 * Determinism: pure frame counting; combo effects flow into the stateHash via hp/y (damage/launch).
 */
import { tickComboDecay } from "../../core/ComboPressure.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";

export class ComboSystem implements EngineSystem {
  readonly name = "Combo";
  readonly phase = "CLEANUP" as const;

  tick(ctx: EngineContext): void {
    for (const actor of ctx.actors) {
      if (actor.frozenFrames > 0) continue; // hit-stop pauses combo decay
      tickComboDecay(actor.combo);
    }
  }
}
