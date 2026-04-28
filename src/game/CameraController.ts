import Phaser from "phaser";

export class CameraController {
  private camera: Phaser.Cameras.Scene2D.Camera | null = null;
  private getTargetX: (() => number) | null = null;

  constructor(private readonly worldWidth = 1024, private readonly worldHeight = 640) {}

  bind(camera: Phaser.Cameras.Scene2D.Camera, getTargetX: () => number): void {
    this.camera = camera;
    this.getTargetX = getTargetX;
    camera.setBounds(0, 0, this.worldWidth, this.worldHeight);
    camera.roundPixels = true;
  }

  tick(): void {
    if (!this.camera || !this.getTargetX) return;
    const camera = this.camera;
    const roomCenterBias = this.worldWidth <= camera.width ? 0 : this.getTargetX() - camera.width * 0.42;
    const targetScrollX = Phaser.Math.Clamp(roomCenterBias, 0, Math.max(0, this.worldWidth - camera.width));
    camera.scrollX = Phaser.Math.Linear(camera.scrollX, targetScrollX, 0.045);
    camera.scrollY = 0;
  }
}
