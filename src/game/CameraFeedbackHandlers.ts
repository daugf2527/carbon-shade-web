import type { CombatEventBus } from "../combat/events/CombatEventBus.js";
import type { CameraController } from "./CameraController.js";

export function bindCameraFeedbackHandlers(bus: CombatEventBus, cameraController: CameraController): void {
  bus.on("CameraShakeRequested", event => {
    const payload = event.payload as { intensity?: number; durationMs?: number };
    cameraController.shake(payload.intensity ?? 5, payload.durationMs ?? 80);
  });

  bus.on("CameraFlashRequested", event => {
    const payload = event.payload as { color?: number; alpha?: number; durationMs?: number };
    cameraController.flash(payload.color ?? 0xffffff, payload.alpha ?? 0.3, payload.durationMs ?? 60);
  });
}
