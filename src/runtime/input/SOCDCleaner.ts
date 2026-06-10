const LEFT_KEYS = new Set(["ArrowLeft"]);
const RIGHT_KEYS = new Set(["ArrowRight"]);
const UP_KEYS = new Set(["ArrowUp"]);
const DOWN_KEYS = new Set(["ArrowDown"]);

export class SOCDCleaner {
  private lastHorizontal: "left" | "right" | null = null;
  private lastVertical: "up" | "down" | null = null;

  clean(heldDirections: Set<string>): Set<string> {
    const cleaned = new Set(heldDirections);
    const hasLeft = [...LEFT_KEYS].some((key) => cleaned.has(key));
    const hasRight = [...RIGHT_KEYS].some((key) => cleaned.has(key));
    const hasUp = [...UP_KEYS].some((key) => cleaned.has(key));
    const hasDown = [...DOWN_KEYS].some((key) => cleaned.has(key));

    if (hasLeft && hasRight) {
      if (this.lastHorizontal === "left") {
        for (const key of RIGHT_KEYS) cleaned.delete(key);
      } else {
        for (const key of LEFT_KEYS) cleaned.delete(key);
      }
    } else if (hasLeft) {
      this.lastHorizontal = "left";
    } else if (hasRight) {
      this.lastHorizontal = "right";
    } else {
      this.lastHorizontal = null;
    }

    if (hasUp && hasDown) {
      if (this.lastVertical === "up") {
        for (const key of DOWN_KEYS) cleaned.delete(key);
      } else {
        for (const key of UP_KEYS) cleaned.delete(key);
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
