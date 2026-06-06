/**
 * SkillInputSystem.ts — command-sequence → skill-action bridge (skill-action infra §2).
 *
 * The runtime half of the command system: §1 (CommandMatcher) is the pure parse+match core; this
 * system wires it to live input. Each tick it captures every actor's intent (commandDir + button)
 * into a per-actor rolling InputFrame buffer, then tests the buffer against every registered skill
 * command. On a match it fires the skill through ActionSystem (same intent→animation pipeline the
 * basic attacks use) and clears that actor's buffer so the sequence isn't re-triggered.
 *
 * Phase INPUT, registered BEFORE ActionSystem (same phase, insertion order) so a matched skill's
 * request lands in the SAME tick ActionSystem drains it — exactly how InputSystem is ordered.
 *
 * Determinism: pure read of actor.intent + tick-windowed match (no wall clock, no randomness). The
 * buffer is transient input state (like ActionSystem's pending queue) — not folded into stateHash;
 * the triggered skill action surfaces in the deterministic timeline via ActionStarted + animation.
 *
 * Truth: skill command sequences are PVF (skills[id].command). Registered via registerSkill().
 */
import type { Actor } from "../../core/Actor.js";
import { parseCommand, matchCommand, type CommandStep, type InputFrame } from "../../input/CommandMatcher.js";
import type { DirInput, ButtonInput } from "../../input/InputCommand.js";
import type { EngineContext } from "../EngineContext.js";
import type { EngineSystem } from "../EngineSystem.js";
import type { ActionSystem } from "./ActionSystem.js";

/** How many recent input frames to retain per actor (≥ command window so matches stay in range). */
const BUFFER_TICKS = 40;

export class SkillInputSystem implements EngineSystem {
  readonly name = "SkillInput";
  readonly phase = "INPUT" as const;

  private readonly skills: Array<{ skillId: string; steps: CommandStep[] }> = [];
  private readonly buffers = new Map<string, InputFrame[]>(); // actorId → recent frames

  constructor(private readonly actions: ActionSystem) {}

  /** Register a skill's PVF command sequence (raw .skl `command` array). */
  registerSkill(skillId: string, command: readonly string[]): void {
    const steps = parseCommand(command);
    if (steps.length > 0) this.skills.push({ skillId, steps });
  }

  tick(ctx: EngineContext): void {
    if (this.skills.length === 0) return;
    for (const actor of ctx.actors) {
      if (actor.isDead) continue;
      const frame = this.captureFrame(actor, ctx.tickCount);
      // Only buffer frames that carry an actual input (keeps the window meaningful + dedup cheap).
      if (frame.dir === "none" && frame.button === "none") continue;

      let buf = this.buffers.get(actor.id);
      if (!buf) { buf = []; this.buffers.set(actor.id, buf); }
      buf.push(frame);
      // Drop frames older than the retention window.
      const cutoff = ctx.tickCount - BUFFER_TICKS;
      while (buf.length > 0 && buf[0].tick < cutoff) buf.shift();

      for (const skill of this.skills) {
        if (matchCommand(buf, skill.steps)) {
          this.actions.request(actor.id, skill.skillId);
          ctx.bus.emit("SkillCommandMatched", { actorId: actor.id, skillId: skill.skillId, tick: ctx.tickCount });
          buf.length = 0; // consumed — don't re-trigger from the same inputs
          break;
        }
      }
    }
  }

  /** Build an InputFrame from the actor's intent (commandDir falls back to the horizontal dir). */
  private captureFrame(actor: Actor, tick: number): InputFrame {
    const dir: DirInput = actor.intent.commandDir
      ?? (actor.intent.dir === 1 ? "right" : actor.intent.dir === -1 ? "left" : "none");
    const button: ButtonInput = actor.intent.button ?? (actor.intent.attack ? "attack" : "none");
    return { dir, button, tick };
  }

  reset(): void {
    this.buffers.clear();
  }
}
