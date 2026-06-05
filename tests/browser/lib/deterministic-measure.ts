import type { Page } from "@playwright/test";

/**
 * deterministic-measure.ts — 确定性测量金标准 helper
 * ═══════════════════════════════════════════════════════
 *
 * 范式：浏览器内「暂停 RAF → 手动 kernel.tick() 步进 → 单次读快照」。
 * 彻底绕开 Playwright↔浏览器 IPC 轮询，把确定性量(帧数/伤害/状态)
 * 测成零抖动。
 *
 * 标定依据 — measurement-instrument-qc.spec.ts 实测：
 *   - 手动步进 attack1 时长：[4,4,4...] spread=0  ✅
 *   - 单次读 tick/hp：spread=0                     ✅
 *   - 对照组 IPC 轮询同一动画：5~8 spread=3        ❌
 *
 * ⚠ 步进循环铁律「先 tick 再判断」：requestAction 把请求入队，
 *   currentActionName 要等下一次 tick 的 INPUT phase 才翻成动作名。
 *   若先判断条件会一次不进循环 → 假绿。
 *
 * 仅用于「确定性量」。FPS / 真实渲染帧率仍须真实 RAF（headed），不要用本模块测。
 */

/** 防死循环的步进上限（任何普通攻击动画都远短于此）。 */
const MAX_STEPS = 60;

/** Window.combatLab 运行时句柄（浏览器侧）。 */
interface CombatLabHandle {
  scene?: {
    reset?: () => void;
    simulation?: { pause?: () => void; resume?: () => void };
  };
  kernel?: {
    tickCount: number;
    actors: Array<Record<string, unknown>>;
    requestAction: (actorId: string, action: string) => void;
    tick: () => void;
  };
  kernelReady?: boolean;
}

/** 单个 actor 的确定性快照（单次读，零抖动）。 */
export interface ActorSnapshot {
  readonly id: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly facing: number;
  readonly currentAction: string | null;
  readonly reactionKind: string | null;
  readonly dead: boolean;
}

/** 一次攻击的确定性测量结果。 */
export interface AttackMeasurement {
  /** 动画从启动到结束跨越的 tick 数（= 真实帧数）。 */
  readonly actionTicks: number;
  /** 防御方受到的伤害（hpBefore - hpAfter）。 */
  readonly damage: number;
  /** 攻击结束时防御方的 reaction kind。 */
  readonly defenderReaction: string | null;
  /** 攻击结束时防御方是否死亡。 */
  readonly defenderDead: boolean;
}

/**
 * 等场景内核就绪（首次加载页面）。其他 helper 假设已就绪。
 */
export async function ensureSceneReady(page: Page): Promise<void> {
  const ready = await page.evaluate(() =>
    Boolean((window as unknown as { combatLab?: CombatLabHandle }).combatLab?.kernelReady),
  );
  if (ready) return;
  await page.goto("/?scene=combat", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.locator("canvas").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForFunction(
    () => Boolean((window as unknown as { combatLab?: CombatLabHandle }).combatLab?.kernelReady),
    undefined,
    { polling: 100, timeout: 30000 },
  );
}

/**
 * 单次读 actor 快照（零抖动，QC-B 验证）。actor 不存在返回 null。
 */
export async function readActor(page: Page, id: string): Promise<ActorSnapshot | null> {
  return page.evaluate((actorId) => {
    const lab = (window as unknown as { combatLab?: CombatLabHandle }).combatLab;
    const actor = lab?.kernel?.actors?.find((a) => a.id === actorId) as
      | Record<string, unknown>
      | undefined;
    if (!actor) return null;
    const stats = (actor.stats ?? {}) as Record<string, unknown>;
    const reaction = actor.reaction as { kind?: string } | null;
    return {
      id: actor.id as string,
      hp: actor.hp as number,
      maxHp: (stats.hpMax as number) ?? 100,
      x: actor.x as number,
      y: actor.y as number,
      z: (actor.z as number) ?? 0,
      facing: actor.facing as number,
      currentAction: (actor.currentActionName as string | null) ?? null,
      reactionKind: reaction?.kind ?? null,
      dead: Boolean(actor.isDead),
    };
  }, id);
}

/**
 * 读当前 tick（零抖动，QC-B1 验证）。
 */
export async function readTick(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { combatLab?: CombatLabHandle }).combatLab?.kernel?.tickCount ?? 0,
  );
}

/**
 * reset 场景到初始 roster（QC-B2 验证：reset 后 grunt.hp 恒为初始值）。
 * 同步执行，无墙钟等待。
 */
export async function resetSceneDeterministic(page: Page): Promise<void> {
  await page.evaluate(() => {
    const lab = (window as unknown as { combatLab?: CombatLabHandle }).combatLab;
    lab?.scene?.reset?.();
  });
}

/**
 * 确定性测量一次攻击：把攻击者瞬移到指定 x（保证命中），手动步进 attack1
 * 直到动画结束，回报真实帧数 + 伤害 + 受击方状态。零 IPC 轮询、零抖动。
 *
 * QC-A（帧数 [4,4,4...]）+ QC-D（伤害 [44,44,44...]）联合验证。
 *
 * @param attackerX 攻击者瞬移到的 x；缺省则用当前位置。
 */
export async function measureAttack(
  page: Page,
  opts: {
    attackerId: string;
    defenderId: string;
    action: string;
    attackerX?: number;
  },
): Promise<AttackMeasurement> {
  return page.evaluate(
    ({ attackerId, defenderId, action, attackerX, maxSteps }) => {
      const lab = (window as unknown as { combatLab?: CombatLabHandle }).combatLab;
      const scene = lab?.scene;
      const kernel = lab?.kernel;
      if (!kernel) throw new Error("measureAttack: kernel 不可用");

      // 暂停 RAF 自动步进，改纯手动 tick（确定性）。
      scene?.simulation?.pause?.();

      const attacker = kernel.actors.find((a) => a.id === attackerId) as
        | Record<string, unknown>
        | undefined;
      const defender = kernel.actors.find((a) => a.id === defenderId) as
        | Record<string, unknown>
        | undefined;
      if (!attacker || !defender) throw new Error("measureAttack: actor 未找到");

      if (typeof attackerX === "number") attacker.x = attackerX;

      const hpBefore = defender.hp as number;
      const startTick = kernel.tickCount;

      kernel.requestAction(attackerId, action);
      // 先 tick 再判断（铁律）：跑完整个动画。
      let steps = 0;
      for (; steps < maxSteps; steps++) {
        kernel.tick();
        if ((attacker.currentActionName as string | null) !== action) break;
      }
      const endTick = kernel.tickCount;
      const hpAfter = defender.hp as number;
      const reaction = defender.reaction as { kind?: string } | null;

      scene?.simulation?.resume?.();

      return {
        actionTicks: endTick - startTick,
        damage: hpBefore - hpAfter,
        defenderReaction: reaction?.kind ?? null,
        defenderDead: Boolean(defender.isDead),
      };
    },
    { ...opts, maxSteps: MAX_STEPS },
  );
}

/**
 * 确定性步进 N tick（手动驱动，不依赖 RAF）。用于需要推进时间但不触发攻击的场景。
 * 返回步进后的 tickCount。
 */
export async function stepTicks(page: Page, ticks: number): Promise<number> {
  return page.evaluate((n) => {
    const lab = (window as unknown as { combatLab?: CombatLabHandle }).combatLab;
    const scene = lab?.scene;
    const kernel = lab?.kernel;
    if (!kernel) throw new Error("stepTicks: kernel 不可用");
    scene?.simulation?.pause?.();
    for (let i = 0; i < n; i++) kernel.tick();
    const t = kernel.tickCount;
    scene?.simulation?.resume?.();
    return t;
  }, ticks);
}

/** 单 tick 的帧级快照（traceAction 逐 tick 采样用）。 */
export interface FrameTrace {
  /** 步进序号：0 = 触发后未 tick，1 = 第 1 个 tick 后，依此类推。 */
  readonly step: number;
  readonly tick: number;
  /** 攻击者当前动作名（null = 动画结束/未启动）。 */
  readonly action: string | null;
  /** 当前动画帧 index（null = 无动画）。 */
  readonly frameIdx: number | null;
  /** 当前帧的 attackBox 数量（>0 = 命中窗口开启）。 */
  readonly attackBoxes: number;
  /** 防御方 HP（用于定位扣血发生在哪一 tick）。 */
  readonly defenderHp: number;
  /** 防御方 reaction kind。 */
  readonly defenderReaction: string | null;
  readonly defenderDead: boolean;
}

/**
 * ③ 逐帧轨迹：手动步进一个动作，每 tick 采一帧级快照，回报完整轨迹。
 * 用于断言「哪一帧出 hitbox、哪一 tick 扣血/进 reaction」等帧级精确性。
 *
 * 探查实测（attack1）：step1 即 frameIdx=1 + attackBoxes=1 + 扣血 + reaction=hit，
 * step2-3 attackBoxes=0，step4 action=null（动画结束）。
 *
 * @param maxSteps 最多步进多少 tick（防死循环）；缺省 60。
 */
export async function traceAction(
  page: Page,
  opts: {
    attackerId: string;
    defenderId: string;
    action: string;
    attackerX?: number;
    maxSteps?: number;
  },
): Promise<FrameTrace[]> {
  return page.evaluate(
    ({ attackerId, defenderId, action, attackerX, maxSteps }) => {
      const lab = (window as unknown as { combatLab?: CombatLabHandle }).combatLab;
      const scene = lab?.scene;
      const kernel = lab?.kernel;
      if (!kernel) throw new Error("traceAction: kernel 不可用");
      scene?.simulation?.pause?.();

      const attacker = kernel.actors.find((a) => a.id === attackerId) as
        | Record<string, unknown>
        | undefined;
      const defender = kernel.actors.find((a) => a.id === defenderId) as
        | Record<string, unknown>
        | undefined;
      if (!attacker || !defender) throw new Error("traceAction: actor 未找到");
      if (typeof attackerX === "number") attacker.x = attackerX;

      const snap = (step: number) => {
        const ap = attacker.animationPlayer as { currentFrame?: { index: number; attackBoxes: unknown[] } } | undefined;
        const f = ap?.currentFrame;
        const reaction = defender.reaction as { kind?: string } | null;
        return {
          step,
          tick: kernel.tickCount,
          action: (attacker.currentActionName as string | null) ?? null,
          frameIdx: f?.index ?? null,
          attackBoxes: f?.attackBoxes?.length ?? 0,
          defenderHp: defender.hp as number,
          defenderReaction: reaction?.kind ?? null,
          defenderDead: Boolean(defender.isDead),
        };
      };

      const rows: ReturnType<typeof snap>[] = [];
      kernel.requestAction(attackerId, action);
      rows.push(snap(0)); // 触发后、未 tick
      const limit = maxSteps ?? 60;
      for (let i = 0; i < limit; i++) {
        kernel.tick();
        rows.push(snap(i + 1));
        if ((attacker.currentActionName as string | null) === null && i > 0) break;
      }

      scene?.simulation?.resume?.();
      return rows;
    },
    { ...opts },
  );
}

/** runSequence 单步结果：一个动作跑完后的状态快照。 */
export interface SequenceStep {
  /** 本步执行的动作名。 */
  readonly action: string;
  /** 本步消耗的 tick 数（动画时长）。 */
  readonly ticks: number;
  /** 本步对防御方造成的增量伤害。 */
  readonly damage: number;
  readonly defenderHp: number;
  readonly defenderReaction: string | null;
  readonly defenderDead: boolean;
  /** 攻击者 FSM 状态（连击衔接验证）。 */
  readonly attackerState: string | null;
}

/**
 * ② 时序链：在同一不 reset 的 tick 序列里连续施加多个动作，每个动作跑完
 * 采一次状态快照，回报每步轨迹。用于测「状态机连续转移」（连击→硬直→死亡）。
 *
 * 探查实测（attack1→attack2→attack3，grunt 70hp）：
 *   step attack1 → hp26 hit；step attack2 → hp0 dead；step attack3 → 已死无变化。
 *
 * 不 reset：每步依赖上一步的累积状态。攻击者每步瞬移到 attackerX（若给）保证命中。
 */
export async function runSequence(
  page: Page,
  opts: {
    attackerId: string;
    defenderId: string;
    actions: string[];
    attackerX?: number;
    maxStepsPerAction?: number;
  },
): Promise<SequenceStep[]> {
  return page.evaluate(
    ({ attackerId, defenderId, actions, attackerX, maxStepsPerAction }) => {
      const lab = (window as unknown as { combatLab?: CombatLabHandle }).combatLab;
      const scene = lab?.scene;
      const kernel = lab?.kernel;
      if (!kernel) throw new Error("runSequence: kernel 不可用");
      scene?.simulation?.pause?.();

      const attacker = kernel.actors.find((a) => a.id === attackerId) as
        | Record<string, unknown>
        | undefined;
      const defender = kernel.actors.find((a) => a.id === defenderId) as
        | Record<string, unknown>
        | undefined;
      if (!attacker || !defender) throw new Error("runSequence: actor 未找到");

      const limit = maxStepsPerAction ?? 60;
      const rows: Array<Record<string, unknown>> = [];

      for (const action of actions) {
        if (typeof attackerX === "number") attacker.x = attackerX;
        const hpBefore = defender.hp as number;
        const tickBefore = kernel.tickCount;

        kernel.requestAction(attackerId, action);
        for (let i = 0; i < limit; i++) {
          kernel.tick();
          if ((attacker.currentActionName as string | null) !== action) break;
        }

        const fsm = attacker.fsm as { state?: string } | undefined;
        const reaction = defender.reaction as { kind?: string } | null;
        rows.push({
          action,
          ticks: kernel.tickCount - tickBefore,
          damage: hpBefore - (defender.hp as number),
          defenderHp: defender.hp as number,
          defenderReaction: reaction?.kind ?? null,
          defenderDead: Boolean(defender.isDead),
          attackerState: fsm?.state ?? null,
        });
      }

      scene?.simulation?.resume?.();
      return rows;
    },
    { ...opts },
  ) as unknown as Promise<SequenceStep[]>;
}

/** 简单统计工具（自检套件 + 回归哨兵复用）。 */
export interface Stats {
  readonly values: number[];
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly spread: number;
  readonly stable: boolean;
}

export function computeStats(values: number[]): Stats {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { values, min, max, mean, spread: max - min, stable: max - min === 0 };
}
