/**
 * InputCommand.ts — SOCD cleaner + skill command sequence detector (Phase 4 T4.1)
 *
 * Command tokens from .skl: "(right)", "(down)", "(skill)", etc.
 * Input window: 500ms to complete a sequence.
 */

export type DirInput = "left" | "right" | "up" | "down" | "none";
export type ButtonInput = "attack" | "skill" | "jump" | "none";

export interface RawInput {
  dir: DirInput;
  button: ButtonInput;
}

/** SOCD: simultaneous left+right → neutral; up+down → up (DNF convention). */
export function cleanSOCD(left: boolean, right: boolean, up: boolean, down: boolean): DirInput {
  const h = left && right ? "none" : left ? "left" : right ? "right" : "none";
  const v = up && down ? "up" : up ? "up" : down ? "down" : "none";
  if (v !== "none") return v;
  return h;
}

export type CommandToken = string; // "(right)", "(down)", "(skill)", "(attack)", ","

const COMMAND_WINDOW_MS = 500;

export interface CommandMatch {
  readonly skillId: string;
  readonly tokens: readonly CommandToken[];
}

interface PendingInput {
  token: CommandToken;
  timeMs: number;
}

export class CommandDetector {
  private history: PendingInput[] = [];
  private readonly commands: Array<{ skillId: string; tokens: CommandToken[] }> = [];

  registerSkill(skillId: string, tokens: CommandToken[]): void {
    this.commands.push({ skillId, tokens: tokens.filter(t => t !== ",") });
  }

  /** Feed a new input token at current time. Returns matched skill or null. */
  feed(token: CommandToken, nowMs: number): CommandMatch | null {
    // Prune expired
    this.history = this.history.filter(h => nowMs - h.timeMs < COMMAND_WINDOW_MS);
    this.history.push({ token, timeMs: nowMs });

    const recent = this.history.map(h => h.token);
    for (const cmd of this.commands) {
      if (this.matches(recent, cmd.tokens)) {
        this.history = [];
        return { skillId: cmd.skillId, tokens: cmd.tokens };
      }
    }
    return null;
  }

  private matches(recent: CommandToken[], pattern: CommandToken[]): boolean {
    if (recent.length < pattern.length) return false;
    const tail = recent.slice(recent.length - pattern.length);
    return tail.every((t, i) => t === pattern[i]);
  }
}

/** Convert raw dir + button to command token. */
export function toToken(input: RawInput): CommandToken | null {
  if (input.button !== "none") return `(${input.button})`;
  if (input.dir !== "none") return `(${input.dir})`;
  return null;
}
