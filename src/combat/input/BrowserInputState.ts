import type { ActionName, Facing } from "../types.js";
export type InputButton = "KeyX" | "KeyJ" | "KeyZ" | "KeyK" | "KeyC" | "KeyL" | "Space" | "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "KeyA" | "KeyD" | "KeyW" | "KeyS" | "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7" | "F8" | "F9";
export interface RawInputFrame { tick: number; held: Set<string>; pressed: Set<string>; released: Set<string>; pressedOrder?: string[]; }
export class BrowserInputState {
  private held = new Set<string>(); private pressed = new Set<string>(); private released = new Set<string>(); private pressedOrder: string[] = [];
  keyDown(code: string, repeat=false): void { if (repeat) return; if (!this.held.has(code)) { this.pressed.add(code); this.pressedOrder.push(code); } this.held.add(code); }
  keyUp(code: string): void { if (this.held.has(code)) this.released.add(code); this.held.delete(code); }
  isHeld(code: string): boolean { return this.held.has(code); }
  isPressed(code: string): boolean { return this.pressed.has(code); }
  snapshot(tick: number): RawInputFrame { return { tick, held:new Set(this.held), pressed:new Set(this.pressed), released:new Set(this.released), pressedOrder:[...this.pressedOrder] }; }
  endTick(): void { this.pressed.clear(); this.released.clear(); this.pressedOrder.length = 0; }
  clearAll(): void { this.held.clear(); this.pressed.clear(); this.released.clear(); this.pressedOrder.length = 0; }
}
export interface BufferedInput { actionName: ActionName; source: "command" | "hotkey" | "debug"; createdFrame: number; expiresAtFrame: number; priority: number; consumed: boolean; facing?: Facing; }
export class InputBuffer {
  private items: BufferedInput[] = [];
  push(input: BufferedInput): void { this.items.push(input); }
  consumeAllowed(tick: number, allowed: Set<ActionName>, hitStopActive: boolean): BufferedInput | null {
    if (hitStopActive) return null;
    this.items = this.items.filter(i => !i.consumed && i.expiresAtFrame >= tick);
    this.items.sort((a,b)=>b.priority-a.priority || a.createdFrame-b.createdFrame);
    const item = this.items.find(i=>allowed.has(i.actionName)); if (!item) return null; item.consumed = true; return item;
  }
  clearCombatInputs(): void { this.items = this.items.filter(i => i.source === "debug"); }
  clearAll(): void { this.items = []; }
  size(): number { return this.items.length; }
}
export interface SkillCommand { actionName: ActionName; sequence: string[]; button: string; maxGapFrames: number; holdFrames?: number; mirrorByFacing: boolean; priority: number; }
export class CommandInputParser {
  private directionHistory: Array<{token:string; tick:number}> = [];
  readonly commands: SkillCommand[] = [
    { actionName:"Derange", sequence:["forward","forward"], button:"Space", maxGapFrames:12, mirrorByFacing:true, priority:80 },
    { actionName:"RagingFury", sequence:["down","up"], button:"KeyZ", maxGapFrames:14, mirrorByFacing:false, priority:70 },
    { actionName:"Bloodlust", sequence:["forward","forward"], button:"KeyZ", maxGapFrames:12, mirrorByFacing:true, priority:65 },
    { actionName:"MountainousWheel", sequence:["forward","down"], button:"KeyZ", maxGapFrames:14, mirrorByFacing:true, priority:60 }
  ];
  parse(frame: RawInputFrame, ctx: { facing:"left"|"right"; isDowned:boolean }): BufferedInput[] {
    const out: BufferedInput[] = [];
    for (const token of this.directionTokens(frame, ctx.facing)) this.directionHistory.push({token, tick:frame.tick});
    this.directionHistory = this.directionHistory.filter(t => frame.tick - t.tick <= 30);
    for (const cmd of this.commands) {
      if (!frame.pressed.has(cmd.button)) continue;
      if (this.matchSequence(cmd.sequence, frame.tick, cmd.maxGapFrames)) out.push(this.make(cmd.actionName, "command", frame.tick, cmd.priority));
    }
    if (frame.pressed.has("KeyC") || frame.pressed.has("KeyL")) {
      if (ctx.isDowned) out.push(this.make("QuickRebound", "hotkey", frame.tick, 100));
      else if (frame.held.has("ArrowDown") || frame.held.has("KeyS")) out.push(this.make("Backstep", "hotkey", frame.tick, 50));
      else out.push(this.make("Jump", "hotkey", frame.tick, 45));
    }
    if (frame.pressed.has("KeyX") || frame.pressed.has("KeyJ")) out.push(this.make("NormalBasic1", "hotkey", frame.tick, 20));
    if (frame.pressed.has("KeyZ") || frame.pressed.has("KeyK")) out.push(this.make("UpwardSlash", "hotkey", frame.tick, 10));
    if (frame.pressed.has("F5")) out.push(this.make("FrenzyToggle", "debug", frame.tick, 200));
    if (frame.pressed.has("F9")) out.push(this.make("ForceDownPlayer", "debug", frame.tick, 200));
    if (frame.pressed.has("F7")) out.push(this.make("ForceBleed", "debug", frame.tick, 200));
    if (frame.pressed.has("F8")) out.push(this.make("RunScreenshotScenario", "debug", frame.tick, 200));
    return out;
  }
  private make(actionName: ActionName, source: BufferedInput["source"], tick:number, priority:number): BufferedInput { const ttl = actionName === "QuickRebound" ? 8 : actionName === "Backstep" || actionName === "Jump" ? 6 : 10; return { actionName, source, createdFrame:tick, expiresAtFrame:tick+ttl, priority, consumed:false }; }
  private directionTokens(frame: RawInputFrame, facing:"left"|"right"): string[] { const out:string[]=[]; if (frame.pressed.has("ArrowDown")||frame.pressed.has("KeyS")) out.push("down"); if (frame.pressed.has("ArrowUp")||frame.pressed.has("KeyW")) out.push("up"); const fwd = facing === "right" ? ["ArrowRight","KeyD"] : ["ArrowLeft","KeyA"]; if (fwd.some(k=>frame.pressed.has(k))) out.push("forward"); return out; }
  private matchSequence(seq:string[], tick:number, gap:number): boolean { let cursor=tick; for (let i=seq.length-1;i>=0;i--) { const found = [...this.directionHistory].reverse().find(t=>t.token===seq[i] && t.tick <= cursor && cursor - t.tick <= gap); if (!found) return false; cursor = found.tick; } return true; }
}
