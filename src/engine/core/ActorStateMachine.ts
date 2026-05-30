/**
 * ActorStateMachine.ts — 9-state FSM for combat actors (Phase 3 T3.2)
 *
 * States: IDLE → READY → ATTACK → HIT → DOWN → DEAD
 * + CHASE (monster), RETREAT (monster), AIRBORNE (knockup)
 */

export const ActorState = {
  IDLE: "IDLE",
  READY: "READY",
  ATTACK: "ATTACK",
  HIT: "HIT",
  DOWN: "DOWN",
  DEAD: "DEAD",
  CHASE: "CHASE",
  RETREAT: "RETREAT",
  AIRBORNE: "AIRBORNE",
} as const;

export type ActorState = (typeof ActorState)[keyof typeof ActorState];

export interface TransitionContext {
  readonly tick: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly inputAttack: boolean;
  readonly hitReceived: boolean;
  readonly knockedDown: boolean;
  readonly launchedAirborne: boolean;
  readonly animationDone: boolean;
  readonly targetInRange: boolean;
  readonly targetInSight: boolean;
}

type Transition = {
  readonly to: ActorState;
  readonly guard: (ctx: TransitionContext) => boolean;
};

const TRANSITIONS: Readonly<Record<ActorState, readonly Transition[]>> = {
  [ActorState.IDLE]: [
    { to: ActorState.DEAD, guard: (c) => c.hp <= 0 },
    { to: ActorState.HIT, guard: (c) => c.hitReceived && !c.knockedDown && !c.launchedAirborne },
    { to: ActorState.DOWN, guard: (c) => c.hitReceived && c.knockedDown },
    { to: ActorState.AIRBORNE, guard: (c) => c.hitReceived && c.launchedAirborne },
    { to: ActorState.ATTACK, guard: (c) => c.inputAttack },
    { to: ActorState.CHASE, guard: (c) => c.targetInSight && !c.targetInRange },
    { to: ActorState.READY, guard: (c) => c.targetInRange },
  ],
  [ActorState.READY]: [
    { to: ActorState.DEAD, guard: (c) => c.hp <= 0 },
    { to: ActorState.HIT, guard: (c) => c.hitReceived && !c.knockedDown && !c.launchedAirborne },
    { to: ActorState.DOWN, guard: (c) => c.hitReceived && c.knockedDown },
    { to: ActorState.AIRBORNE, guard: (c) => c.hitReceived && c.launchedAirborne },
    { to: ActorState.ATTACK, guard: (c) => c.inputAttack || c.targetInRange },
    { to: ActorState.IDLE, guard: (c) => !c.targetInSight },
  ],
  [ActorState.ATTACK]: [
    { to: ActorState.DEAD, guard: (c) => c.hp <= 0 },
    { to: ActorState.HIT, guard: (c) => c.hitReceived && !c.knockedDown && !c.launchedAirborne },
    { to: ActorState.DOWN, guard: (c) => c.hitReceived && c.knockedDown },
    { to: ActorState.AIRBORNE, guard: (c) => c.hitReceived && c.launchedAirborne },
    { to: ActorState.IDLE, guard: (c) => c.animationDone },
  ],
  [ActorState.HIT]: [
    { to: ActorState.DEAD, guard: (c) => c.hp <= 0 },
    { to: ActorState.DOWN, guard: (c) => c.knockedDown },
    { to: ActorState.IDLE, guard: (c) => c.animationDone },
  ],
  [ActorState.DOWN]: [
    { to: ActorState.DEAD, guard: (c) => c.hp <= 0 },
    { to: ActorState.IDLE, guard: (c) => c.animationDone },
  ],
  [ActorState.AIRBORNE]: [
    { to: ActorState.DEAD, guard: (c) => c.hp <= 0 },
    { to: ActorState.DOWN, guard: (c) => c.animationDone },
  ],
  [ActorState.CHASE]: [
    { to: ActorState.DEAD, guard: (c) => c.hp <= 0 },
    { to: ActorState.HIT, guard: (c) => c.hitReceived && !c.knockedDown && !c.launchedAirborne },
    { to: ActorState.DOWN, guard: (c) => c.hitReceived && c.knockedDown },
    { to: ActorState.AIRBORNE, guard: (c) => c.hitReceived && c.launchedAirborne },
    { to: ActorState.ATTACK, guard: (c) => c.targetInRange },
    { to: ActorState.IDLE, guard: (c) => !c.targetInSight },
  ],
  [ActorState.RETREAT]: [
    { to: ActorState.DEAD, guard: (c) => c.hp <= 0 },
    { to: ActorState.HIT, guard: (c) => c.hitReceived && !c.knockedDown && !c.launchedAirborne },
    { to: ActorState.IDLE, guard: (c) => c.animationDone },
  ],
  [ActorState.DEAD]: [],
};

export class ActorStateMachine {
  private _state: ActorState;
  private _enteredAt: number;

  constructor(
    initial: ActorState = ActorState.IDLE,
    private readonly onTransition?: (from: ActorState, to: ActorState, tick: number) => void,
  ) {
    this._state = initial;
    this._enteredAt = 0;
  }

  get state(): ActorState {
    return this._state;
  }

  get enteredAt(): number {
    return this._enteredAt;
  }

  /** Evaluate transitions for current state. Returns true if state changed. */
  update(ctx: TransitionContext): boolean {
    const transitions = TRANSITIONS[this._state];
    for (const t of transitions) {
      if (t.guard(ctx)) {
        const from = this._state;
        this._state = t.to;
        this._enteredAt = ctx.tick;
        this.onTransition?.(from, t.to, ctx.tick);
        return true;
      }
    }
    return false;
  }

  /** Force a state (e.g. on spawn or reset). */
  force(state: ActorState, tick: number): void {
    const from = this._state;
    this._state = state;
    this._enteredAt = tick;
    this.onTransition?.(from, state, tick);
  }
}
