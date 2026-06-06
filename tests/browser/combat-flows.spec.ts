import { expect, test } from "@playwright/test";
import {
  ensureSceneReady,
  measureAttack,
  resetSceneDeterministic,
  runSequence,
  traceAction,
} from "./lib/deterministic-measure.js";

/**
 * Combat Flow Test Suite — 三层流程测试
 * ════════════════════════════════════════
 *
 * 全部基于 engine-capability-probe 的实物真值（非臆测），手动步进零抖动。
 *
 *   ③ 逐帧轨迹  — 单动作的 tick 级展开（哪帧出 hitbox、哪 tick 扣血）
 *   ① 多场景    — 5 个 action 各自独立断言（帧数/伤害/reaction）
 *   ② 时序链    — 连击不 reset 的状态机连续转移（硬直→死亡）
 *
 * 引擎尚无的环节（浮空/落地/击倒/起身/dash 位移）标 P4 skip 并注明，
 * 不写"看起来合理"的假断言。
 */

// ══════════════════════════════════════════════════════════════
// ③ 逐帧轨迹 — attack1 的 tick 级精确性
// ══════════════════════════════════════════════════════════════

test.describe.serial("③ 逐帧轨迹", () => {
  test.beforeEach(async ({ page }) => {
    await ensureSceneReady(page);
    await resetSceneDeterministic(page);
  });

  test("F1. attack1 帧序列 + hitbox 时序", async ({ page }) => {
    test.setTimeout(30000);

    const trace = await traceAction(page, {
      attackerId: "player",
      defenderId: "grunt",
      action: "attack1",
      attackerX: 740,
    });

    console.log("[Flow③] attack1 trace:");
    for (const r of trace) {
      console.log(
        `[Flow③]   step${r.step} tick=${r.tick} action=${r.action} ` +
          `frameIdx=${r.frameIdx} atkBoxes=${r.attackBoxes} hp=${r.defenderHp} reaction=${r.defenderReaction}`,
      );
    }

    // 真值：step0 请求未处理 → action=null
    expect(trace[0].action, "step0 请求入队未 tick").toBeNull();

    // 真值：step1 即推进到 frameIdx=1，attackBox 开启，命中扣血(46→12)，进 hit reaction
    const s1 = trace[1];
    expect(s1.action).toBe("attack1");
    expect(s1.frameIdx, "attack1 hitFrame = index 1").toBe(1);
    expect(s1.attackBoxes, "hitFrame 出 1 个 attackBox").toBe(1);
    expect(s1.defenderHp, "命中在 step1 完成扣血 46-34=12").toBe(12);
    expect(s1.defenderReaction).toBe("hit");

    // 真值：hitbox 只在 step1 出现一次（hitGroup 单次命中），step2+ 关闭
    const stepsWithBox = trace.filter((r) => r.attackBoxes > 0).map((r) => r.step);
    expect(stepsWithBox, "attackBox 仅 step1 开启一次").toEqual([1]);

    // 真值：扣血只发生一次——后续 tick HP 恒定 26（不重复结算）
    const hpAfterHit = trace.slice(1).map((r) => r.defenderHp);
    expect(new Set(hpAfterHit).size, "命中后 HP 恒定不重复扣").toBe(1);

    // 真值：动画在 4 个 tick 内结束（最后一帧 action=null）
    const endStep = trace.findIndex((r, i) => i > 0 && r.action === null);
    expect(endStep, "attack1 第4个tick动画结束").toBe(4);
  });
});

// ══════════════════════════════════════════════════════════════
// ① 多场景横向 — 5 个 action 各自断言
// ══════════════════════════════════════════════════════════════

test.describe.serial("① 多场景横向", () => {
  test.beforeEach(async ({ page }) => {
    await ensureSceneReady(page);
  });

  // 探查实测真值表：action → {帧数, 伤害, reaction}。伤害 = measureAttack 实际扣血(受 grunt 46hp clamp)。
  // 2026-06-06 重标定：Wave2(b01024b) damageBonus 真值化后伤害差异化、reaction 按各 action hitReaction
  // 分化。被 engine-damage-truth / engine-reaction-truth static test 守护。grunt: hp46 def4 (statsFromGoblinTruth)。
  const SCENARIOS: Array<{ action: string; ticks: number; damage: number; reaction: string }> = [
    { action: "attack1", ticks: 4, damage: 34, reaction: "hit" },       // bonus -15% → 34
    { action: "attack2", ticks: 5, damage: 40, reaction: "stagger" },   // bonus null → 40
    { action: "attack3", ticks: 6, damage: 46, reaction: "airborne" },  // bonus +20% → 48, clamp 46hp; hit_lift_up
    { action: "dashattack", ticks: 4, damage: 46, reaction: "stagger" },// bonus +40% → 56, clamp 46hp
    { action: "jumpattack", ticks: 5, damage: 44, reaction: "down" },   // bonus +10% → 44
  ];

  for (const sc of SCENARIOS) {
    test(`S-${sc.action} 帧数=${sc.ticks} 伤害=${sc.damage}`, async ({ page }) => {
      test.setTimeout(30000);
      await resetSceneDeterministic(page);

      const m = await measureAttack(page, {
        attackerId: "player",
        defenderId: "grunt",
        action: sc.action,
        attackerX: 740,
      });

      console.log(
        `[Flow①] ${sc.action}: ticks=${m.actionTicks} damage=${m.damage} reaction=${m.defenderReaction}`,
      );

      // 精确断言（手动步进零抖动）
      expect(m.actionTicks, `${sc.action} 动画帧数`).toBe(sc.ticks);
      expect(m.damage, `${sc.action} 命中伤害`).toBe(sc.damage);
      expect(m.defenderReaction, `${sc.action} 受击 reaction`).toBe(sc.reaction);
    });
  }

  test("S-浮空落地链(P4): 累计击倒/起身未接线", async () => {
    test.skip(
      true,
      "差异化伤害(damageBonus) + attack3 浮空(airborne)已 Wave2 接线(见上方 SCENARIOS)。" +
        "剩余 P4: 浮空→落地→累计击倒→起身的多段链(AirborneSystem 只 liftVy launch, 无累计击倒)",
    );
  });
});

// ══════════════════════════════════════════════════════════════
// ② 时序链 — 连击不 reset 的状态机连续转移
// ══════════════════════════════════════════════════════════════

test.describe.serial("② 时序链", () => {
  test.beforeEach(async ({ page }) => {
    await ensureSceneReady(page);
    await resetSceneDeterministic(page);
  });

  test("C1. 连击致死链: attack1(硬直) → attack2(死亡)", async ({ page }) => {
    test.setTimeout(30000);

    // 不 reset 连续 3 拳。grunt 46hp：attack1 扣 34→12，attack2 扣 12(clamp)致死，第3拳已死无效。
    const steps = await runSequence(page, {
      attackerId: "player",
      defenderId: "grunt",
      actions: ["attack1", "attack2", "attack3"],
      attackerX: 740,
    });

    console.log("[Flow②] 连击时序链:");
    for (const s of steps) {
      console.log(
        `[Flow②]   ${s.action}: ticks=${s.ticks} dmg=${s.damage} hp=${s.defenderHp} ` +
          `reaction=${s.defenderReaction} dead=${s.defenderDead} attacker=${s.attackerState}`,
      );
    }

    // 第1拳：硬直，未死，HP 46→12（attack1 真值伤害 34）
    expect(steps[0].action).toBe("attack1");
    expect(steps[0].damage).toBe(34);
    expect(steps[0].defenderHp).toBe(12);
    expect(steps[0].defenderReaction).toBe("hit");
    expect(steps[0].defenderDead).toBe(false);

    // 第2拳：致死，HP 12→0（attack2 真值伤害 40，但只能扣到 0，不溢出）
    expect(steps[1].action).toBe("attack2");
    expect(steps[1].damage).toBe(12); // 只能扣到 0，不溢出
    expect(steps[1].defenderHp).toBe(0);
    expect(steps[1].defenderDead).toBe(true);

    // 第3拳：目标已死，CombatResolution 跳过 dead defender → 0 增量伤害
    expect(steps[2].action).toBe("attack3");
    expect(steps[2].damage, "死后攻击不再结算").toBe(0);
    expect(steps[2].defenderDead).toBe(true);

    // 攻击者每步动画跑完都回到 IDLE（连击衔接正常）
    expect(steps.every((s) => s.attackerState === "IDLE"), "每拳后攻击者回 IDLE").toBe(true);
  });

  test("C2. 完整战斗链(P4): 浮空→落地→击倒→起身", async () => {
    test.skip(
      true,
      "P4: engine 无浮空/落地/击倒/起身系统(AirborneSystem 只 liftVy launch, 无累计击倒)。" +
        " 时序链目前只能覆盖 命中→硬直→死亡 三态",
    );
  });
});
