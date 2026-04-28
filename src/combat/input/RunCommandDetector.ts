import type { BufferedInput, RawInputFrame } from "./BrowserInputState.js";
import type { Facing } from "../types.js";

type HorizontalDirection = "left" | "right";

interface DirectionState {
  lastReleaseTick: number | null;
  pendingDoubleTap: boolean;
  pressTick: number | null;
  mode: "idle" | "walk" | "run";
}

const directionKeys: Record<HorizontalDirection, string[]> = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
};

const directionFacing: Record<HorizontalDirection, Facing> = {
  left: "left",
  right: "right",
};

export class RunCommandDetector {
  readonly doubleTapWindowFrames = 10;
  readonly holdAfterPressFrames = 2;
  private readonly states: Record<HorizontalDirection, DirectionState> = {
    left: { lastReleaseTick: null, pendingDoubleTap: false, pressTick: null, mode: "idle" },
    right: { lastReleaseTick: null, pendingDoubleTap: false, pressTick: null, mode: "idle" },
  };

  reset(): void {
    this.states.left = { lastReleaseTick: null, pendingDoubleTap: false, pressTick: null, mode: "idle" };
    this.states.right = { lastReleaseTick: null, pendingDoubleTap: false, pressTick: null, mode: "idle" };
  }

  detect(frame: RawInputFrame, currentFacing: Facing): BufferedInput[] {
    const outputs: BufferedInput[] = [];
    for (const direction of ["left", "right"] as const) {
      const keys = directionKeys[direction];
      const held = keys.some(key => frame.held.has(key));
      const pressed = keys.some(key => frame.pressed.has(key));
      const released = keys.some(key => frame.released.has(key));
      const state = this.states[direction];
      const facing = directionFacing[direction];

      if (released) {
        state.lastReleaseTick = frame.tick;
        state.pendingDoubleTap = false;
        state.pressTick = null;
        state.mode = "idle";
      }

      if (pressed) {
        const withinWindow = state.lastReleaseTick !== null && frame.tick - state.lastReleaseTick <= this.doubleTapWindowFrames;
        state.pendingDoubleTap = withinWindow;
        state.pressTick = frame.tick;
        if (!withinWindow) {
          state.mode = "walk";
          outputs.push(this.makeBufferedInput("Walk", frame.tick, facing, facing === currentFacing ? 4 : 3));
        }
      }

      if (state.pendingDoubleTap && state.pressTick !== null && held && frame.tick - state.pressTick + 1 >= this.holdAfterPressFrames) {
        state.mode = "run";
        state.pendingDoubleTap = false;
        state.pressTick = null;
        outputs.push(this.makeBufferedInput("Run", frame.tick, facing, facing === currentFacing ? 6 : 5));
      }
    }

    return outputs;
  }

  private makeBufferedInput(actionName: "Walk" | "Run", tick: number, facing: Facing, priority: number): BufferedInput {
    return {
      actionName,
      source: "command",
      createdFrame: tick,
      expiresAtFrame: tick + 24,
      priority,
      consumed: false,
      facing,
    };
  }
}
