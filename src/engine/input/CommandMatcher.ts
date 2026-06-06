/**
 * CommandMatcher.ts — tick-based skill command-sequence parsing + matching (skill-action infra §1).
 *
 * DNF skills fire on a command sequence (.skl `command`, e.g. icewave = →,↓,→,(skill);
 * hardattack = ↑&(skill)). The engine already ships InputCommand.ts (cleanSOCD + CommandDetector)
 * but that one is WALL-CLOCK driven (nowMs / 500ms window) and never wired into the deterministic
 * kernel — same Phase-4-leftover pattern as SkillResource/StatusEffectSystem. This module is the
 * TICK-based core: parse a `command` array into steps + match an input-frame buffer against it, so
 * skill detection can fold into the kernel's replay-deterministic timeline.
 *
 * ── TRUTH SOURCING ───────────────────────────────────────────────────────────────
 * Command sequences are PVF truth (skills[id].command, 85/205 swordman skills). The 500ms input
 * window → 30 ticks @60Hz is the one LOCAL_BASELINE constant (DNF's exact window lives in the exe).
 *
 * ── SCOPE (§1: matching core only) ───────────────────────────────────────────────
 * Pure parse + match. It does NOT read live input or fire skills — wiring Actor.intent (which is
 * still {attack,dir}) → frames → matcher → skill-action request is §2/§3. Reuses InputCommand's
 * DirInput/ButtonInput/cleanSOCD so the input vocabulary stays single-sourced.
 */

import type { DirInput, ButtonInput } from "./InputCommand.js";

/** Default command input window — LOCAL_BASELINE 30 ticks (≈500ms @60Hz, mirrors InputCommand). */
export const COMMAND_WINDOW_TICKS = 30;

/** One captured input frame (a per-tick snapshot of the actor's directional + button state). */
export interface InputFrame {
  readonly dir: DirInput;
  readonly button: ButtonInput;
  readonly tick: number;
}

/** One step of a command. `dir`+`button` both set (via `&`) ⇒ they must occur on the SAME frame. */
export interface CommandStep {
  readonly dir?: DirInput;
  readonly button?: ButtonInput;
}

const DIR_TOKENS = new Set(["(left)", "(right)", "(up)", "(down)"]);
const BUTTON_TOKENS = new Set(["(attack)", "(skill)", "(jump)", "(buff)"]);

/** Strip the parentheses from a "(right)" token → "right". */
function tokenInner(token: string): string {
  return token.slice(1, -1);
}

/**
 * Parse a .skl `command` array into ordered steps.
 *   ","  separates steps (the next input in sequence)
 *   "&"  joins tokens into the SAME step (must be pressed together, e.g. ↑&skill)
 * e.g. ["(right)",",","(down)",",","(right)",",","(skill)"] → [{dir:right},{dir:down},{dir:right},{button:skill}]
 *      ["(up)","&","(skill)"] → [{dir:up,button:skill}]
 */
export function parseCommand(raw: readonly string[]): CommandStep[] {
  const steps: CommandStep[] = [];
  let group: string[] = [];
  const flush = (): void => {
    if (group.length === 0) return;
    let dir: DirInput | undefined;
    let button: ButtonInput | undefined;
    for (const tok of group) {
      if (DIR_TOKENS.has(tok)) dir = tokenInner(tok) as DirInput;
      else if (BUTTON_TOKENS.has(tok)) button = tokenInner(tok) as ButtonInput;
    }
    if (dir !== undefined || button !== undefined) steps.push({ dir, button });
    group = [];
  };
  for (const tok of raw) {
    if (tok === ",") flush();
    else if (tok === "&") { /* keep accumulating into the same step */ }
    else group.push(tok);
  }
  flush();
  return steps;
}

/** Does this frame satisfy the step? (both constraints present ⇒ both must match this frame.) */
function stepMatches(frame: InputFrame, step: CommandStep): boolean {
  if (step.dir !== undefined && frame.dir !== step.dir) return false;
  if (step.button !== undefined && frame.button !== step.button) return false;
  return step.dir !== undefined || step.button !== undefined;
}

/**
 * Match an input-frame buffer (chronological) against a command. Greedy in-order scan: each step
 * consumes the next frame that satisfies it; succeeds when all steps matched within `windowTicks`
 * (first→last step span). Deterministic — pure scan, no clock. Returns true on match.
 */
export function matchCommand(
  frames: readonly InputFrame[],
  steps: readonly CommandStep[],
  windowTicks: number = COMMAND_WINDOW_TICKS,
): boolean {
  if (steps.length === 0) return false;
  let si = 0;
  let firstTick = -1;
  for (const f of frames) {
    if (stepMatches(f, steps[si])) {
      if (si === 0) firstTick = f.tick;
      si++;
      if (si === steps.length) return f.tick - firstTick <= windowTicks;
    }
  }
  return false;
}
