export type CombatEventType =
  | "TickStarted" | "TickEnded" | "LifecyclePaused" | "LifecycleResumed"
  | "RawInputCollected" | "CommandMatched" | "InputBuffered" | "InputConsumed" | "InputExpired"
  | "ActionRequested" | "ActionEntered" | "ActionPhaseChanged" | "ActionInterrupted" | "ActionEnded" | "ActiveHitboxesCleared"
  | "HitQueryBuilt" | "HitConfirmed" | "HitRejected" | "ArmorHit" | "DownedHit" | "GrabAttempted" | "GrabSucceeded" | "GrabFailed" | "GrabAttached" | "BloodlustEruptionReleased" | "BloodlustWhiffEruption" | "ComboCorrectionUpdated" | "ComboCorrectionReset" | "ComboStandKnockdown" | "ComboForcedWake"
  | "DamageRequested" | "DamageApplied" | "DamagePrevented"
  | "ReactionRequested" | "ReactionApplied" | "HitStopStarted" | "HitStopEnded" | "RecoilStarted" | "RecoilEnded"
  | "ResourceCostRequested" | "ResourceCostPaid" | "ResourceCostRejected" | "CooldownCheckRequested" | "CooldownReady" | "CooldownRejected" | "CooldownStarted" | "CooldownTicked" | "CooldownEnded"
  | "BuffApplyRequested" | "BuffApplied" | "BuffRefreshed" | "BuffStacked" | "BuffReplaced" | "BuffTicked" | "BuffExpired" | "BuffDispelled" | "BuffDeathCleanup"
  | "StatusApplyRequested" | "StatusApplied" | "StatusTickRequested" | "StatusTicked" | "StatusSplashTicked" | "StatusExpired" | "StatusResisted" | "StatusDispelled" | "StatusDeathCleanup"
  | "ActorDied" | "DeathCleanupCompleted" | "ActorRespawned"
  | "SoundRequested" | "CameraShakeRequested" | "CameraFlashRequested" | "DamageNumberRequested" | "VfxRequested"
  | "DebugActionRequested" | "DebugActionApplied"
  | "LastHitTraceUpdated" | "ReplayFrameRecorded" | "DebugOverlayUpdated";
