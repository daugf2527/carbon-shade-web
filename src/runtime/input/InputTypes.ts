export type RuntimeFacing = "left" | "right";

export type RuntimeBufferedActionName = "move" | "dash";
export type RuntimeBufferedInputSource = "command" | "hotkey" | "debug";

export interface RawInputFrame {
  tick: number;
  held: Set<string>;
  pressed: Set<string>;
  released: Set<string>;
  pressedOrder?: string[];
}

export interface BufferedInput {
  actionName: RuntimeBufferedActionName;
  source: RuntimeBufferedInputSource;
  createdFrame: number;
  expiresAtFrame: number;
  priority: number;
  consumed: boolean;
  facing?: RuntimeFacing;
}
