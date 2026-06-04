import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Combat QA Test Suite
 *
 * Based on docs/testing/manual-qa-checklist.md (117 checkpoints)
 * Covers: movement, attacks, reactions, boundaries, performance
 *
 * PVF Truth Reference:
 * - moveSpeed: 850 (%xSPEED_VALUE_DEFAULT) → 121.55 px/s actual
 * - jumpPower: 430 (unit ambiguous)
 * - gravity: -1500 px/s²
 * - attack1 liftUp: 80, damageBonus: 20%
 * - attack3 liftUp: 400, damageBonus: 90%
 */

const verificationDir = path.resolve("verification");
const TOLERANCE = 0.05; // 5% tolerance for physics measurements

// ── Helper: Wait for kernel ready ──
async function waitForKernelReady(page: Page): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => Boolean((window as any).combatLab?.kernelReady),
      undefined,
      { polling: 200, timeout: 30000 },
    );
    return true;
  } catch {
    return false;
  }
}

// ── Helper: Reset scene ──
async function resetScene(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scene = (window as any).combatLab?.scene;
    scene?.reset?.();
  });
  await page.waitForTimeout(100);
}

// ── Helper: Get player position ──
async function getPlayerPosition(page: Page): Promise<{ x: number; y: number; z: number } | null> {
  return await page.evaluate(() => {
    const kernel = (window as any).combatLab?.kernel;
    const player = kernel?.actors?.find((a: any) => a.id === "player");
    return player?.position ?? null;
  });
}

// ── Helper: Simulate key press ──
async function pressKey(page: Page, key: string, duration: number = 100): Promise<void> {
  await page.evaluate((k) => {
    const kernel = (window as any).combatLab?.kernel;
    kernel?.inputState?.keyDown?.(k, false);
  }, key);
  await page.waitForTimeout(duration);
  await page.evaluate((k) => {
    const kernel = (window as any).combatLab?.kernel;
    kernel?.inputState?.keyUp?.(k);
  }, key);
}

// ── Helper: Hold key ──
async function holdKey(page: Page, key: string, duration: number): Promise<void> {
  await page.evaluate((k) => {
    const kernel = (window as any).combatLab?.kernel;
    kernel?.inputState?.keyDown?.(k, false);
  }, key);
  await page.waitForTimeout(duration);
  await page.evaluate((k) => {
    const kernel = (window as any).combatLab?.kernel;
    kernel?.inputState?.keyUp?.(k);
  }, key);
}

// ── Helper: Get current tick ──
async function getCurrentTick(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const kernel = (window as any).combatLab?.kernel;
    return kernel?.tickCount ?? 0;
  });
}

// ── Helper: Wait N ticks ──
async function waitTicks(page: Page, ticks: number): Promise<void> {
  const startTick = await getCurrentTick(page);
  const targetTick = startTick + ticks;
  await page.waitForFunction(
    (target) => {
      const kernel = (window as any).combatLab?.kernel;
      return (kernel?.tickCount ?? 0) >= target;
    },
    targetTick,
    { polling: 16, timeout: (ticks * 16.67) + 1000 },
  );
}

// ── Helper: Get actor by ID ──
async function getActor(page: Page, id: string): Promise<any> {
  return await page.evaluate((actorId) => {
    const kernel = (window as any).combatLab?.kernel;
    const actor = kernel?.actors?.find((a: any) => a.id === actorId);
    if (!actor) return null;
    return {
      id: actor.id,
      hp: actor.resources?.hp,
      maxHp: actor.resources?.maxHp,
      position: actor.position,
      velocity: actor.velocity,
      currentAction: actor.currentAction?.actionName,
      reactionState: actor.reactionState,
      dead: actor.flags?.dead,
    };
  }, id);
}

// ══════════════════════════════════════════════════════════════
// 1. 基础移动测试 (4 tests)
// ══════════════════════════════════════════════════════════════

test.describe.serial("1. 基础移动测试", () => {
  test.beforeAll(async ({ browser }) => {
    mkdirSync(verificationDir, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    // Only navigate once per worker, then reset scene for each test
    const isFirstTest = !(await page.evaluate(() => Boolean((window as any).combatLab?.kernelReady)));
    console.log(`[beforeEach] isFirstTest=${isFirstTest}`);
    if (isFirstTest) {
      console.log(`[beforeEach] Loading page...`);
      await page.goto("/?scene=combat", { waitUntil: "domcontentloaded", timeout: 20000 });
      await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
      console.log(`[beforeEach] Waiting for kernel...`);
      const ready = await waitForKernelReady(page);
      expect(ready, "kernel should be ready").toBe(true);
      console.log(`[beforeEach] Kernel ready!`);
    } else {
      console.log(`[beforeEach] Skipping page load, kernel already ready`);
    }
    console.log(`[beforeEach] Resetting scene...`);
    await resetScene(page);
    console.log(`[beforeEach] Scene reset complete`);
  });

  test("1.1 Walk 速度验证", async ({ page }) => {
    test.setTimeout(30000);

    const startPos = await getPlayerPosition(page);
    expect(startPos).not.toBeNull();

    // Hold right arrow for 2 seconds (120 ticks at 60fps)
    const holdDuration = 2000;
    await holdKey(page, "ArrowRight", holdDuration);

    const endPos = await getPlayerPosition(page);
    expect(endPos).not.toBeNull();

    const distance = Math.abs(endPos!.x - startPos!.x);
    const actualSpeed = distance / (holdDuration / 1000); // px/s

    // PVF truth: moveSpeed=850 → 143 * (850/1000) = 121.55 px/s
    const expectedSpeed = 121.55;
    const tolerance = expectedSpeed * TOLERANCE;

    console.log(`[Walk] distance=${distance.toFixed(2)}px, speed=${actualSpeed.toFixed(2)}px/s, expected=${expectedSpeed}px/s`);

    expect(actualSpeed).toBeGreaterThan(expectedSpeed - tolerance);
    expect(actualSpeed).toBeLessThan(expectedSpeed + tolerance);
  });

  test("1.2 Dash 距离验证", async ({ page }) => {
    test.setTimeout(30000);

    const startPos = await getPlayerPosition(page);
    expect(startPos).not.toBeNull();

    // Double-tap right to trigger dash
    await pressKey(page, "ArrowRight", 50);
    await page.waitForTimeout(50);
    await pressKey(page, "ArrowRight", 50);

    // Wait for dash to complete (~20 frames)
    await waitTicks(page, 30);

    const endPos = await getPlayerPosition(page);
    expect(endPos).not.toBeNull();

    const distance = Math.abs(endPos!.x - startPos!.x);

    console.log(`[Dash] distance=${distance.toFixed(2)}px`);

    // Expected: 150-200px
    expect(distance).toBeGreaterThan(150);
    expect(distance).toBeLessThan(200);
  });

  test("1.3 Jump 高度验证", async ({ page }) => {
    test.setTimeout(30000);

    const startPos = await getPlayerPosition(page);
    expect(startPos).not.toBeNull();
    const groundY = startPos!.y;

    // Press space to jump
    await pressKey(page, " ", 50);

    // Wait for apex (~15-20 ticks)
    await waitTicks(page, 20);

    const apexPos = await getPlayerPosition(page);
    expect(apexPos).not.toBeNull();

    const jumpHeight = apexPos!.y - groundY;

    console.log(`[Jump] height=${jumpHeight.toFixed(2)}px`);

    // Expected: 100-120px
    expect(jumpHeight).toBeGreaterThan(100);
    expect(jumpHeight).toBeLessThan(120);
  });

  test("1.4 Gravity 验证", async ({ page }) => {
    test.setTimeout(30000);

    // Jump first
    await pressKey(page, " ", 50);
    await waitTicks(page, 20); // Wait for apex

    const startPos = await getPlayerPosition(page);
    expect(startPos).not.toBeNull();

    const startTick = await getCurrentTick(page);

    // Wait 10 ticks during fall
    await waitTicks(page, 10);

    const endPos = await getPlayerPosition(page);
    const endTick = await getCurrentTick(page);

    const deltaY = endPos!.y - startPos!.y;
    const deltaTime = (endTick - startTick) / 60; // seconds

    // v = at → a = v/t, but we measure displacement: s = 0.5*a*t²
    // Approximate: a ≈ 2*s/t²
    const accel = (2 * deltaY) / (deltaTime * deltaTime);

    console.log(`[Gravity] deltaY=${deltaY.toFixed(2)}px, deltaTime=${deltaTime.toFixed(3)}s, accel=${accel.toFixed(2)}px/s²`);

    // Expected: -1500 px/s² (negative = downward)
    const expectedAccel = -1500;
    const tolerance = Math.abs(expectedAccel) * TOLERANCE;

    expect(accel).toBeLessThan(expectedAccel + tolerance);
    expect(accel).toBeGreaterThan(expectedAccel - tolerance);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. 普通攻击测试 (3 tests)
// ══════════════════════════════════════════════════════════════

test.describe.serial("2. 普通攻击测试", () => {
  test.beforeEach(async ({ page }) => {
    mkdirSync(verificationDir, { recursive: true });
    // Only navigate once per worker, then reset scene for each test
    const isFirstTest = !(await page.evaluate(() => Boolean((window as any).combatLab?.kernelReady)));
    if (isFirstTest) {
      await page.goto("/?scene=combat", { waitUntil: "domcontentloaded", timeout: 20000 });
      await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
      const ready = await waitForKernelReady(page);
      expect(ready, "kernel should be ready").toBe(true);
    }
    await resetScene(page);
  });

  test("2.1 Attack chain 帧数", async ({ page }) => {
    test.setTimeout(30000);

    // Trigger attack1
    await pressKey(page, "j", 50);
    const startTick1 = await getCurrentTick(page);

    // Wait for attack1 to finish
    await page.waitForFunction(
      () => {
        const kernel = (window as any).combatLab?.kernel;
        const player = kernel?.actors?.find((a: any) => a.id === "player");
        return player?.currentAction?.actionName !== "attack1";
      },
      undefined,
      { polling: 16, timeout: 2000 },
    );

    const endTick1 = await getCurrentTick(page);
    const attack1Frames = endTick1 - startTick1;

    console.log(`[Attack1] frames=${attack1Frames}`);

    // Expected: 10-15 frames (from manual checklist)
    expect(attack1Frames).toBeGreaterThanOrEqual(10);
    expect(attack1Frames).toBeLessThanOrEqual(15);
  });

  test("2.2 Attack 伤害计算", async ({ page }) => {
    test.setTimeout(30000);

    // Get initial enemy HP
    const enemyBefore = await getActor(page, "grunt");
    expect(enemyBefore).not.toBeNull();
    const initialHp = enemyBefore!.hp;

    // Attack enemy
    await pressKey(page, "j", 50);
    await waitTicks(page, 20);

    const enemyAfter = await getActor(page, "grunt");
    expect(enemyAfter).not.toBeNull();
    const finalHp = enemyAfter!.hp;

    const damage = initialHp - finalHp;

    console.log(`[Damage] initial=${initialHp}, final=${finalHp}, damage=${damage}`);

    // Expected: 8-15 damage (non-one-shot)
    expect(damage).toBeGreaterThan(0);
    expect(damage).toBeLessThan(initialHp); // Not one-shot
    expect(damage).toBeGreaterThanOrEqual(8);
    expect(damage).toBeLessThanOrEqual(15);
  });

  test("2.3 Whiff cancel 窗口", async ({ page }) => {
    test.setTimeout(30000);

    // Trigger attack1 (whiff, no enemy nearby)
    await pressKey(page, "j", 50);

    // Wait for whiff cancel window (mid-animation)
    await waitTicks(page, 8);

    // Try to cancel to attack2
    await pressKey(page, "k", 50);

    await waitTicks(page, 5);

    const player = await getActor(page, "player");
    const action = player?.currentAction;

    console.log(`[Whiff Cancel] action after cancel attempt: ${action}`);

    // Should be able to cancel to attack2
    expect(action).toBe("attack2");
  });
});

// ══════════════════════════════════════════════════════════════
// 3. 受击反应测试 (3 tests)
// ══════════════════════════════════════════════════════════════

test.describe.serial("3. 受击反应测试", () => {
  test.beforeEach(async ({ page }) => {
    mkdirSync(verificationDir, { recursive: true });
    // Only navigate once per worker, then reset scene for each test
    const isFirstTest = !(await page.evaluate(() => Boolean((window as any).combatLab?.kernelReady)));
    if (isFirstTest) {
      await page.goto("/?scene=combat", { waitUntil: "domcontentloaded", timeout: 20000 });
      await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
      const ready = await waitForKernelReady(page);
      expect(ready, "kernel should be ready").toBe(true);
    }
    await resetScene(page);
  });

  test("3.1 Light stagger", async ({ page }) => {
    test.setTimeout(30000);

    const enemyBefore = await getActor(page, "grunt");
    const initialX = enemyBefore!.position.x;

    // Attack with attack1 (light hit)
    await pressKey(page, "j", 50);
    await waitTicks(page, 20);

    const enemyAfter = await getActor(page, "grunt");
    const finalX = enemyAfter!.position.x;

    const pushback = Math.abs(finalX - initialX);

    console.log(`[Light Stagger] pushback=${pushback.toFixed(2)}px, reaction=${enemyAfter!.reactionState}`);

    // Should have light pushback (pushAside=30 from PVF)
    expect(pushback).toBeGreaterThan(0);
    expect(pushback).toBeLessThan(50); // Light stagger, not launch
  });

  test("3.2 Launch 高度", async ({ page }) => {
    test.setTimeout(30000);

    const enemyBefore = await getActor(page, "grunt");
    const groundY = enemyBefore!.position.y;

    // Attack with attack3 (launch)
    await pressKey(page, "l", 50);
    await waitTicks(page, 10);

    const enemyMid = await getActor(page, "grunt");
    const launchHeight = enemyMid!.position.y - groundY;

    console.log(`[Launch] height=${launchHeight.toFixed(2)}px, velocityY=${enemyMid!.velocity?.y}`);

    // PVF: liftUp=400, formula: velocityY = liftUp × launch × weightFactor
    // Expected height > 50px (significant launch)
    expect(launchHeight).toBeGreaterThan(50);
    expect(launchHeight).toBeLessThan(200); // Not absurdly high
  });

  test("3.3 Down 状态", async ({ page }) => {
    test.setTimeout(30000);

    // Attack enemy multiple times to trigger down
    for (let i = 0; i < 5; i++) {
      await pressKey(page, "j", 50);
      await waitTicks(page, 15);
    }

    const enemy = await getActor(page, "grunt");

    console.log(`[Down] reaction=${enemy!.reactionState}, action=${enemy!.currentAction}`);

    // Should be in down state or dead
    const isDownOrDead = enemy!.reactionState === "down" || enemy!.dead === true;
    expect(isDownOrDead).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. 边界测试 (2 tests)
// ══════════════════════════════════════════════════════════════

test.describe.serial("4. 边界测试", () => {
  test.beforeEach(async ({ page }) => {
    mkdirSync(verificationDir, { recursive: true });
    // Only navigate once per worker, then reset scene for each test
    const isFirstTest = !(await page.evaluate(() => Boolean((window as any).combatLab?.kernelReady)));
    if (isFirstTest) {
      await page.goto("/?scene=combat", { waitUntil: "domcontentloaded", timeout: 20000 });
      await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
      const ready = await waitForKernelReady(page);
      expect(ready, "kernel should be ready").toBe(true);
    }
    await resetScene(page);
  });

  test("4.1 墙壁碰撞", async ({ page }) => {
    test.setTimeout(30000);

    // Walk to left edge
    await holdKey(page, "ArrowLeft", 5000);

    const pos = await getPlayerPosition(page);
    expect(pos).not.toBeNull();

    console.log(`[Wall Collision] x=${pos!.x}, z=${pos!.z}`);

    // Should be clamped to xMin=96
    expect(pos!.x).toBeGreaterThanOrEqual(96);
    expect(pos!.x).toBeLessThan(150); // Near left edge
  });

  test("4.2 地图边缘 (z-axis)", async ({ page }) => {
    test.setTimeout(30000);

    // Try to move out of z bounds (if z-axis movement is implemented)
    const pos = await getPlayerPosition(page);
    expect(pos).not.toBeNull();

    console.log(`[Map Edge] z=${pos!.z}`);

    // Should be within zMin=-180, zMax=180
    expect(pos!.z).toBeGreaterThanOrEqual(-180);
    expect(pos!.z).toBeLessThanOrEqual(180);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. 性能测试 (2 tests)
// ══════════════════════════════════════════════════════════════

test.describe.serial("5. 性能测试", () => {
  test.beforeEach(async ({ page }) => {
    mkdirSync(verificationDir, { recursive: true });
    // Only navigate once per worker, then reset scene for each test
    const isFirstTest = !(await page.evaluate(() => Boolean((window as any).combatLab?.kernelReady)));
    if (isFirstTest) {
      await page.goto("/?scene=combat", { waitUntil: "domcontentloaded", timeout: 20000 });
      await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
      const ready = await waitForKernelReady(page);
      expect(ready, "kernel should be ready").toBe(true);
    }
    await resetScene(page);
  });

  test("5.1 FPS 稳定性", async ({ page }) => {
    test.setTimeout(30000);

    // Run for 3 seconds and measure FPS
    const startTime = Date.now();
    const startTick = await getCurrentTick(page);

    await page.waitForTimeout(3000);

    const endTime = Date.now();
    const endTick = await getCurrentTick(page);

    const elapsedSeconds = (endTime - startTime) / 1000;
    const tickCount = endTick - startTick;
    const avgFps = tickCount / elapsedSeconds;

    console.log(`[FPS] ticks=${tickCount}, elapsed=${elapsedSeconds.toFixed(2)}s, avgFps=${avgFps.toFixed(2)}`);

    // Expected: 60fps ±5fps
    expect(avgFps).toBeGreaterThan(55);
    expect(avgFps).toBeLessThan(65);
  });

  test("5.2 多敌人场景", async ({ page }) => {
    test.setTimeout(30000);

    // Check if multiple enemies exist
    const actors = await page.evaluate(() => {
      const kernel = (window as any).combatLab?.kernel;
      return kernel?.actors?.length ?? 0;
    });

    console.log(`[Multi-Enemy] actor count=${actors}`);

    // Should have player + multiple enemies (5+)
    expect(actors).toBeGreaterThanOrEqual(5);

    // Measure FPS with multiple enemies
    const startTick = await getCurrentTick(page);
    await page.waitForTimeout(2000);
    const endTick = await getCurrentTick(page);

    const fps = (endTick - startTick) / 2;

    console.log(`[Multi-Enemy FPS] fps=${fps.toFixed(2)}`);

    // Should maintain 45+ fps
    expect(fps).toBeGreaterThan(45);
  });
});
