export type SfxKind = "light" | "heavy" | "uppercut" | "burst" | "berserk" | "armor";

export class AudioUnlockGate {
  private ctx: any = null;
  private unlocked = false;

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const Ctor = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    await this.ctx.resume();
    this.unlocked = true;
  }

  playHit(kind: SfxKind): void {
    if (!this.unlocked || !this.ctx) return;
    const { frequency, duration, type, gain } = this.tone(kind);
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    env.gain.setValueAtTime(gain, this.ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(env).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private tone(kind: SfxKind): { frequency: number; duration: number; type: string; gain: number } {
    switch (kind) {
      case "light": return { frequency: 520, duration: 0.08, type: "square", gain: 0.18 };
      case "heavy": return { frequency: 240, duration: 0.16, type: "sawtooth", gain: 0.22 };
      case "uppercut": return { frequency: 380, duration: 0.18, type: "triangle", gain: 0.2 };
      case "burst": return { frequency: 120, duration: 0.32, type: "sawtooth", gain: 0.26 };
      case "berserk": return { frequency: 680, duration: 0.1, type: "square", gain: 0.2 };
      case "armor": return { frequency: 1040, duration: 0.06, type: "square", gain: 0.16 };
    }
  }
}
