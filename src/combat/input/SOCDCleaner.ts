// SOCDCleaner — Simultaneous Opposite Cardinal Direction cleaner
// Fighting games require resolving left+right and up+down held simultaneously.
// Pattern: Last Input Priority — the most recently pressed direction wins.

const LEFT_KEYS = new Set(["ArrowLeft", "KeyA"]);
const RIGHT_KEYS = new Set(["ArrowRight", "KeyD"]);
const UP_KEYS = new Set(["ArrowUp", "KeyW"]);
const DOWN_KEYS = new Set(["ArrowDown", "KeyS"]);

export class SOCDCleaner {
  private lastHorizontal: "left" | "right" | null = null;
  private lastVertical: "up" | "down" | null = null;

  // Called each frame with current held directions. Returns cleaned set.
  clean(heldDirections: Set<string>): Set<string> {
    const cleaned = new Set(heldDirections);
    const hasLeft = [...LEFT_KEYS].some(k => cleaned.has(k));
    const hasRight = [...RIGHT_KEYS].some(k => cleaned.has(k));
    const hasUp = [...UP_KEYS].some(k => cleaned.has(k));
    const hasDown = [...DOWN_KEYS].some(k => cleaned.has(k));

    // Horizontal SOCD: last input priority
    if (hasLeft && hasRight) {
      if (this.lastHorizontal === "left") {
        for (const k of RIGHT_KEYS) cleaned.delete(k);
      } else {
        for (const k of LEFT_KEYS) cleaned.delete(k);
      }
    } else if (hasLeft) {
      this.lastHorizontal = "left";
    } else if (hasRight) {
      this.lastHorizontal = "right";
    } else {
      this.lastHorizontal = null;
    }

    // Vertical SOCD: last input priority
    if (hasUp && hasDown) {
      if (this.lastVertical === "up") {
        for (const k of DOWN_KEYS) cleaned.delete(k);
      } else {
        for (const k of UP_KEYS) cleaned.delete(k);
      }
    } else if (hasUp) {
      this.lastVertical = "up";
    } else if (hasDown) {
      this.lastVertical = "down";
    } else {
      this.lastVertical = null;
    }

    return cleaned;
  }

  cleanFrame<T extends { held: Set<string>; pressed: Set<string>; pressedOrder?: string[] }>(frame: T): T {
    for (const code of frame.pressedOrder ?? frame.pressed) this.trackPress(code);
    frame.held = this.clean(frame.held);
    frame.pressed = this.clean(frame.pressed);
    return frame;
  }

  // Track press events to determine last-input ordering
  trackPress(code: string): void {
    if (LEFT_KEYS.has(code)) this.lastHorizontal = "left";
    else if (RIGHT_KEYS.has(code)) this.lastHorizontal = "right";
    else if (UP_KEYS.has(code)) this.lastVertical = "up";
    else if (DOWN_KEYS.has(code)) this.lastVertical = "down";
  }

  reset(): void {
    this.lastHorizontal = null;
    this.lastVertical = null;
  }
}
