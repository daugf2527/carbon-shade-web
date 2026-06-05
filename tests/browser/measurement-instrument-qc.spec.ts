import { expect, test, type Page } from "@playwright/test";
import {
  computeStats,
  ensureSceneReady,
  measureAttack,
  resetSceneDeterministic,
  type Stats,
} from "./lib/deterministic-measure.js";

/**
 * Measurement Instrument QC (quality-control / self-check)
 * ════════════════════════════════════════════════════════
 *
 * 在跑正式战斗 QA 前，先标定我们的「测量仪器」本身。
 *
 * 背景：combat-qa.spec.ts 的测量分两类——
 *   - 单次读快照 (getCurrentTick/getActor)     → 怀疑稳
 *   - 跨进程轮询测时长 (waitTicks/waitForFunction) → 怀疑抖
 *
 * 本套件用 lib/deterministic-measure 的「浏览器内手动步进」helper 建立
 * ground truth（零 IPC、零 RAF），再把 IPC-轮询范式的读数与之对比，
 * 用 min/max/方差量化噪声。同时它也是 helper 的自举回归哨兵——
 * helper 提炼正确 → A/D 数据必须恒定(4 / 44)。
 *
 * 不测真实功能，只测「测量方法」——稳了再开正式测试。
 */

const SAMPLES = 20; // 每个仪器的采样次数

function report(name: string, s: Stats): void {
  const tag = s.stable ? "✅ STABLE" : `⚠ SPREAD=${s.spread}`;
  console.log(
    `[QC] ${name.padEnd(36)} ${tag.padEnd(14)} ` +
      `min=${s.min} max=${s.max} mean=${s.mean.toFixed(2)} n=${s.values.length}`,
  );
  console.log(`[QC]   raw: [${s.values.join(", ")}]`);
}

test.describe.serial("测量仪器 QC", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await ensureSceneReady(page);
    await page.close();
  });

  test("A. ground-truth 手动步进 attack1 时长 (期望零抖动)", async ({ page }) => {
    test.setTimeout(60000);
    await ensureSceneReady(page);

    const values: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      await resetSceneDeterministic(page);
      const m = await measureAttack(page, {
        attackerId: "player",
        defenderId: "grunt",
        action: "attack1",
        attackerX: 740,
      });
      values.push(m.actionTicks);
    }

    const s = computeStats(values);
    report("A: manual-step attack1 ticks", s);

    // 手动步进是确定性的 → 必须零抖动
    expect(s.stable, `手动步进应零抖动，实测 spread=${s.spread}`).toBe(true);
    // 且应等于动画真实帧数（attack(4,1) = 4 帧）
    expect(s.min).toBeGreaterThanOrEqual(3);
    expect(s.min).toBeLessThanOrEqual(5);
  });

  test("B. 单次读快照 getCurrentTick/getActor (期望稳)", async ({ page }) => {
    test.setTimeout(60000);
    await ensureSceneReady(page);

    // B1: 同一 evaluate 内连读 tickCount 两次，差值必须为 0
    const tickReadDeltas: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const delta = await page.evaluate(() => {
        const k = (window as any).combatLab?.kernel;
        const a = k.tickCount;
        const b = k.tickCount;
        return b - a;
      });
      tickReadDeltas.push(delta);
    }
    const sTick = computeStats(tickReadDeltas);
    report("B1: getCurrentTick 双读差", sTick);
    expect(sTick.stable).toBe(true);
    expect(sTick.max).toBe(0);

    // B2: reset 后立刻读 grunt.hp，N 次必须全等于初始值
    const gruntHps: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      await resetSceneDeterministic(page);
      const hp = await page.evaluate(() => {
        const k = (window as any).combatLab?.kernel;
        return k.actors.find((a: any) => a.id === "grunt")?.hp ?? -1;
      });
      gruntHps.push(hp);
    }
    const sHp = computeStats(gruntHps);
    report("B2: reset 后 grunt.hp", sHp);
    expect(sHp.stable, `reset 后 grunt.hp 应恒定，实测 ${sHp.min}~${sHp.max}`).toBe(true);
  });

  test("C. IPC 轮询测 attack1 时长 (当前范式，量化抖动)", async ({ page }) => {
    test.setTimeout(120000);
    await ensureSceneReady(page);

    // 复刻 combat-qa.spec.ts 旧 2.1 的测量法：triggerAction 抓 startTick，
    // waitForFunction(polling:16ms) 轮询动画结束抓 endTick。这是 RAF 驱动 + IPC。
    // ⚠ 这里故意 NOT 用 helper——它的全部意义就是「不手动步进」的对照组。
    // ⚠ 单次采样可能因 IPC/RAF 卡顿超时——这本身就是 IPC 范式不可靠的证据。
    //   超时返回 null（跳过该样本）而非崩测试，只要拿到多数样本即可量化抖动。
    const measureIpc = async (): Promise<number | null> => {
      await page.evaluate(() => {
        const scene = (window as any).combatLab?.scene;
        scene?.reset?.();
        scene?.simulation?.resume?.(); // 确保 RAF 驱动开着
      });
      await page.waitForTimeout(50); // 等 reset 稳定

      const startTick = await page.evaluate(() => {
        const k = (window as any).combatLab?.kernel;
        const p = k.actors.find((a: any) => a.id === "player");
        if (p) p.x = 740;
        k.requestAction("player", "attack1");
        return k.tickCount;
      });

      try {
        await page.waitForFunction(
          () => {
            const k = (window as any).combatLab?.kernel;
            const p = k?.actors?.find((a: any) => a.id === "player");
            return p?.currentActionName !== "attack1";
          },
          undefined,
          { polling: 16, timeout: 3000 },
        );
      } catch {
        return null; // IPC/RAF 卡顿超时 — 跳过该样本（正是 IPC 范式不可靠的活体证据）
      }

      const endTick = await page.evaluate(() => (window as any).combatLab?.kernel?.tickCount ?? 0);
      return endTick - startTick;
    };

    const values: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const v = await measureIpc();
      if (v !== null) values.push(v);
    }

    // 至少要拿到多数样本才有量化意义（容忍少量超时）。
    expect(values.length, `IPC 采样过半数应成功，实得 ${values.length}/${SAMPLES}`).toBeGreaterThanOrEqual(
      Math.ceil(SAMPLES / 2),
    );

    const s = computeStats(values);
    report("C: IPC-poll attack1 ticks", s);

    // C 的意义 = 量化 IPC 范式不可靠，不是验证某个数值边界。
    // 实测发现 IPC 双向都能错：偶尔高估(8>真值4，IPC 滞后)，偶尔低估(2<真值4，
    // 轮询时序错位)。所以这里 NOT 断言任何具体 tick 边界——那正是范式不可靠的体现。
    // 只断言：测出的值确实在「合理动画时长」量级（1~30），证明它没完全崩，
    // 但允许它偏离真值 4（与手动步进对照组 spread=0 形成对比）。
    expect(s.min, "IPC 测值应在动画时长量级下界").toBeGreaterThanOrEqual(1);
    expect(s.max, "IPC 测值应在动画时长量级上界").toBeLessThanOrEqual(30);
    console.log(
      `[QC] >>> IPC 轮询: min=${s.min} max=${s.max} spread=${s.spread}（真值=4，` +
        `手动步进对照组 spread=0）— 双向偏离证明 IPC 范式不可靠`,
    );
  });

  test("D. reset+战斗确定性 (查 serial 污染根)", async ({ page }) => {
    test.setTimeout(90000);
    await ensureSceneReady(page);

    // 模拟 serial 顺序：先打一拳污染状态 → reset → 再打一拳量化伤害。
    // 若 reset 干净 + 手动步进确定 → 每次伤害恒定 = 公式真值 44。
    const measureDamageAfterCombat = async (): Promise<number> => {
      await resetSceneDeterministic(page);
      // 第一拳：污染状态
      await measureAttack(page, {
        attackerId: "player",
        defenderId: "grunt",
        action: "attack1",
        attackerX: 740,
      });
      // reset（被测对象：能否清干净第一拳残余）
      await resetSceneDeterministic(page);
      // 第二拳：量化伤害
      const m = await measureAttack(page, {
        attackerId: "player",
        defenderId: "grunt",
        action: "attack1",
        attackerX: 740,
      });
      return m.damage;
    };

    const values: number[] = [];
    for (let i = 0; i < SAMPLES; i++) values.push(await measureDamageAfterCombat());

    const s = computeStats(values);
    report("D: reset 后第二拳伤害", s);
    console.log(
      `[QC] >>> 期望恒定 = 公式真值 calcPhysicalDamage(45,5)=44。` +
        ` spread>0 → reset 未清场(serial 污染根)；恒为 0 → 攻击没结算(命中/步进 bug)`,
    );

    // reset 确定性 + 手动步进 → 伤害必须恒定，且等于公式真值 44（堵"恒 0 假绿"）
    expect(s.stable, `reset 应确定性清场，实测伤害 ${s.min}~${s.max}`).toBe(true);
    expect(s.min, `第二拳应正常结算 44 伤害，实测 ${s.min}`).toBe(44);
  });
});
