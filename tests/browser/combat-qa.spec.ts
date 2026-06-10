import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";
import {
  ensureSceneReady,
  measureAttack,
  readActor,
  readTick,
  resetSceneDeterministic,
} from "./lib/deterministic-measure.js";

/**
 * Combat QA Test Suite (P3.1 engine-adapted, deterministic-measure paradigm)
 * ═════════════════════════════════════════════════════════════════════════
 *
 * 测量范式（标定见 measurement-instrument-qc.spec.ts）：
 *   - 确定性量（帧数/伤害/受击状态）：lib/deterministic-measure 手动步进，零抖动。
 *     断言用精确值（帧=4 / attack1 伤害=34 / reaction="hit"，Wave2 真值，被 static test 守护）。
 *   - 实时量（FPS）：保留真实 RAF 驱动 + 墙钟采样——这类量本就该用真实渲染帧率测。
 *
 * P4-gated 测试 skip 并注明原因——引擎尚无对应系统。
 */

const verificationDir = path.resolve("verification");

// ── FPS-only helper: 单次读 actor 数量（确定性单读，无需手动步进）──
async function readActorCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).combatLab?.kernel?.actors?.length ?? 0);
}

// ══════════════════════════════════════════════════════════════
// 1. 基础移动测试 (4 tests) — 全 P4-gated
// ══════════════════════════════════════════════════════════════

test.describe.serial("1. 基础移动测试", () => {
  test.beforeAll(async () => {
    mkdirSync(verificationDir, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await ensureSceneReady(page);
    await resetSceneDeterministic(page);
  });

  test("1.1 Walk 速度验证", async () => {
    test.skip(true, "P4: engine 尚无移动系统 (intent.dir 只更新 facing, 不改变 actor.x)");
  });

  test("1.2 Dash 距离验证", async () => {
    test.skip(true, "P4: engine 尚无 dash 系统");
  });

  test("1.3 Jump 高度验证", async () => {
    test.skip(true, "P4: engine 尚无主动跳跃 (AirborneSystem 只处理 liftUp launch, 无 Space→jump 接线)");
  });

  test("1.4 Gravity 验证", async () => {
    test.skip(true, "P4: 依赖主动跳跃触发重力下落, 无跳跃则 y 始终为 0");
  });
});

// ══════════════════════════════════════════════════════════════
// 2. 普通攻击测试 (3 tests)
// ══════════════════════════════════════════════════════════════

test.describe.serial("2. 普通攻击测试", () => {
  test.beforeEach(async ({ page }) => {
    mkdirSync(verificationDir, { recursive: true });
    await ensureSceneReady(page);
    await resetSceneDeterministic(page);
  });

  test("2.1 Attack chain 帧数", async ({ page }) => {
    test.setTimeout(30000);

    // 手动步进测量当前运行时的完整 action 生命周期。
    // 在现有场景里 attack1 命中后会进入 hit-stop，因此 actionTicks 统计值为 8 tick，
    // 不是裸动画帧数 4。
    const m = await measureAttack(page, {
      attackerId: "player",
      defenderId: "grunt",
      action: "attack1",
      attackerX: 390,
    });

    console.log(`[Attack1] actionTicks=${m.actionTicks} (deterministic)`);

    // 精确断言：当前运行时 attack1 生命周期恒为 8 tick。
    expect(m.actionTicks).toBe(8);
  });

  test("2.2 Attack 伤害计算", async ({ page }) => {
    test.setTimeout(30000);

    // 手动步进测量当前场景真值：缩放后的 grunt 为 LV31 地城怪，attack1 单次命中为 55。
    const m = await measureAttack(page, {
      attackerId: "player",
      defenderId: "grunt",
      action: "attack1",
      attackerX: 390,
    });

    console.log(`[Damage] damage=${m.damage}, reaction=${m.defenderReaction}, dead=${m.defenderDead}`);

    // 精确断言：单次 attack1 命中造成 55 伤害。
    expect(m.damage).toBe(55);
  });

  test("2.3 Whiff cancel 窗口", async () => {
    test.skip(true, "P4: ActionSystem 已支持 cancelWindow 取消链(skill-action §3)，但场景里的基础攻击 shard 无 cancelWindow，且 command→skill 输入未接入 CombatScene。whiff cancel 待 skill action 入场景");
  });
});

// ══════════════════════════════════════════════════════════════
// 3. 受击反应测试 (3 tests)
// ══════════════════════════════════════════════════════════════

test.describe.serial("3. 受击反应测试", () => {
  test.beforeEach(async ({ page }) => {
    mkdirSync(verificationDir, { recursive: true });
    await ensureSceneReady(page);
    await resetSceneDeterministic(page);
  });

  test("3.1 Light stagger", async ({ page }) => {
    test.setTimeout(30000);

    // 手动步进测量：基础攻击 → applyHitReaction 设 reaction.kind="hit"
    const m = await measureAttack(page, {
      attackerId: "player",
      defenderId: "grunt",
      action: "attack1",
      attackerX: 390,
    });

    console.log(`[Light Stagger] reaction=${m.defenderReaction}, damage=${m.damage}, dead=${m.defenderDead}`);

    // 精确断言：grunt 受击后 reaction.kind === "hit"（轻硬直）。
    // 当前缩放 grunt 321hp，attack1 55 伤害不致死 → 应停在 hit reaction，非 dead。
    expect(m.defenderReaction).toBe("hit");
    expect(m.defenderDead).toBe(false);
  });

  test("3.2 Launch 高度", async () => {
    test.skip(true, "attack3 hit_lift_up→airborne reaction 已接线，但浏览器侧尚未建立稳定的 y 轨迹断言；当前 QA 先守住 reaction=airborne 与 create-path 零崩溃。");
  });

  test("3.3 Down 状态", async () => {
    test.skip(true, "P4: engine 尚无累计击倒逻辑 (CombatResolutionSystem 每次命中独立判定, 不累积 down 计数)");
  });
});

// ══════════════════════════════════════════════════════════════
// 4. 边界测试 (2 tests)
// ══════════════════════════════════════════════════════════════

test.describe.serial("4. 边界测试", () => {
  test.beforeEach(async ({ page }) => {
    mkdirSync(verificationDir, { recursive: true });
    await ensureSceneReady(page);
    await resetSceneDeterministic(page);
  });

  test("4.1 墙壁碰撞", async () => {
    test.skip(true, "P4: engine 尚无 worldBounds 夹紧逻辑 (移动系统未做)");
  });

  test("4.2 地图边缘 (z-axis)", async ({ page }) => {
    test.setTimeout(30000);

    // 单次读快照（确定性，QC-B 标定）。
    const player = await readActor(page, "player");
    expect(player).not.toBeNull();

    console.log(`[Map Edge] z=${player!.z}`);

    // P3.1: engine actor.z defaults to 0, well within bounds
    expect(player!.z).toBeGreaterThanOrEqual(-180);
    expect(player!.z).toBeLessThanOrEqual(180);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. 性能测试 (2 tests) — 保留真实 RAF 驱动 + 墙钟采样
// ══════════════════════════════════════════════════════════════

test.describe.serial("5. 性能测试", () => {
  test.beforeEach(async ({ page }) => {
    mkdirSync(verificationDir, { recursive: true });
    await ensureSceneReady(page);
    await resetSceneDeterministic(page); // reset 内部 resume sim → RAF 驱动开着
  });

  test("5.1 FPS 稳定性", async ({ page }) => {
    test.setTimeout(30000);

    // 实时量：用真实 RAF 跑 3 秒，墙钟采样 tick 速率（这类量本就该用真实帧率测）。
    const startTime = Date.now();
    const startTick = await readTick(page);

    await page.waitForTimeout(3000);

    const endTime = Date.now();
    const endTick = await readTick(page);

    const elapsedSeconds = (endTime - startTime) / 1000;
    const tickCount = endTick - startTick;
    const avgFps = tickCount / elapsedSeconds;

    console.log(`[FPS] ticks=${tickCount}, elapsed=${elapsedSeconds.toFixed(2)}s, avgFps=${avgFps.toFixed(2)}`);

    // Expected: 60fps ±5fps（headed 真实 vsync）
    expect(avgFps).toBeGreaterThan(55);
    expect(avgFps).toBeLessThan(65);
  });

  test("5.2 多敌人场景", async ({ page }) => {
    test.setTimeout(30000);

    // 单次读 actor 数量（确定性）。
    const actors = await readActorCount(page);
    console.log(`[Multi-Enemy] actor count=${actors}`);

    // P3.1: 2 actors minimum (player + grunt). P4 will add more.
    expect(actors).toBeGreaterThanOrEqual(2);

    // 实时量：真实 RAF 帧率采样。
    const startTick = await readTick(page);
    await page.waitForTimeout(2000);
    const endTick = await readTick(page);

    const fps = (endTick - startTick) / 2;
    console.log(`[Multi-Enemy FPS] fps=${fps.toFixed(2)}`);

    // Should maintain 45+ fps
    expect(fps).toBeGreaterThan(45);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. 运行时崩溃守护 (P0-2) — 抓"测试绿但游戏一开就崩"的盲区
// ══════════════════════════════════════════════════════════════
//
// WHY: P0-1 (grunt.mp undefined → computeStateHash toFixed 崩) 是进战斗 CREATE 路径首帧 100% 必崩，
// 却被 static:test / analyze / consistency 三门禁全绿放过——根因之一是没有任何浏览器测试断言"零
// uncaught error"。其它 combat-qa 测试走 ensureSceneReady→resetSceneDeterministic（reset 路径有
// mpMax 不崩），且崩溃只让 kernelReady 永不 true → 表现为 30s 超时（软失败，根因被掩盖）。
//
// 本块直接走 create 路径 + 在 goto 之前挂 pageerror/console.error 监听，让任何首帧 uncaught 立即
// 失败并打印真实堆栈（秒级、根因清晰），而非 30s 超时。
test.describe("6. 运行时崩溃守护", () => {
  test("6.1 进战斗场景零 uncaught error（create 路径）", async ({ page }) => {
    test.setTimeout(40000);

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    // 必须在 goto 之前挂监听，否则首帧崩溃会漏掉。
    page.on("pageerror", (err) => pageErrors.push(`${err.message}\n${err.stack ?? ""}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // 干净加载 create 路径（不经 reset 旁路）。
    await page.goto("/?scene=combat", { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.locator("canvas").waitFor({ state: "visible", timeout: 15000 });
    // 跑足够多帧让 kernel 真正 tick（computeStateHash 每帧对所有 actor 求值——P0-1 在此引爆）。
    await page.waitForTimeout(3000);

    // kernel 必须真的就绪并在推进（若首帧崩，kernelReady 永远 false）。
    const state = await page.evaluate(() => {
      const k = (window as any).combatLab?.kernel;
      return {
        ready: (window as any).combatLab?.kernelReady ?? false,
        tick: k?.tickCount ?? 0,
        allMpFinite: k ? k.actors.every((a: any) => Number.isFinite(a.mp)) : false,
      };
    });

    // main.ts 把 window 'error'/'unhandledrejection' 转成 console.error("[combatLab uncaught]" / "unhandledrejection")，
    // 而 Phaser 吞掉的 system 异常会走 pageerror。两路都要零容忍。
    const combatLabUncaught = consoleErrors.filter((t) => /\[combatLab (uncaught|unhandledrejection)\]/.test(t));
    expect(pageErrors, `进战斗场景抛出 uncaught error:\n${pageErrors.join("\n---\n")}`).toEqual([]);
    expect(combatLabUncaught, `进战斗场景 window 级 uncaught:\n${combatLabUncaught.join("\n")}`).toEqual([]);
    expect(state.ready, "kernelReady 必须为 true（首帧崩溃会让它永远 false）").toBe(true);
    expect(state.tick, "kernel 必须在推进（tick > 0）").toBeGreaterThan(0);
    expect(state.allMpFinite, "所有 actor 的 mp 必须是有限数（P0-1: grunt.mp 曾为 undefined）").toBe(true);
  });
});
