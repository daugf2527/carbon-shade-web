import type { BrowserInputState } from "../input/BrowserInputState.js";

export interface MovementInputSnapshot {
  xDirection: -1 | 0 | 1;
  zDirection: -1 | 0 | 1;
  speedScale: number;
}

export class MovementInputProvider {
  snapshot(input: BrowserInputState): MovementInputSnapshot {
    const left = input.isHeld("ArrowLeft") || input.isHeld("KeyA");
    const right = input.isHeld("ArrowRight") || input.isHeld("KeyD");
    const up = input.isHeld("ArrowUp") || input.isHeld("KeyW");
    const down = input.isHeld("ArrowDown") || input.isHeld("KeyS");

    const xDirection = left && !right ? -1 : right && !left ? 1 : 0;
    const zDirection = up && !down ? -1 : down && !up ? 1 : 0;
    const diagonal = xDirection !== 0 && zDirection !== 0;

    return { xDirection, zDirection, speedScale: diagonal ? Math.SQRT1_2 : 1 };
  }
}
