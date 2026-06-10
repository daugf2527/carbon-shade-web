export interface ScenarioBooleans {
  normalHitObserved: boolean;
  launchObserved: boolean;
  ragingFuryMultiHitObserved: boolean;
  armorHitObserved: boolean;
  buildingArmorBlockedControlObserved: boolean;
  bleedObserved: boolean;
  quickReboundObserved: boolean;
}

export interface LastHitTraceSnapshot {
  tick: number;
  attackerId?: string;
  targetId?: string;
  actionName?: string;
  hitAccepted?: boolean;
  rejectedReason?: string;
  rawReaction?: string;
  finalReaction?: string;
  armorBaseType?: string;
  sourceKind?: string;
  reactionPolicy?: string;
  finalDamage?: number;
  hpAfter?: number;
  correlationId?: string;
}
