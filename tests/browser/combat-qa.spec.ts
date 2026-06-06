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

    // 手动步进测量：attack1 = attack(4,1) → 动画恒为 4 tick（QC-A 标定零抖动）
    const m = await measureAttack(page, {
      attackerId: "player",
      defenderId: "grunt",
      action: "attack1",
      attackerX: 740,
    });

    console.log(`[Attack1] actionTicks=${m.actionTicks} (deterministic)`);

    // 精确断言：动画 4 帧。手动步进零抖动 → 不需要容差区间。
    expect(m.actionTicks).toBe(4);
  });

  test("2.2 Attack 伤害计算", async ({ page }) => {
    test.setTimeout(30000);

    // 手动步进测量：attack1 真值伤害 34（Wave2: damageBonus -15% → atkBonus 0.85, grunt def4, slot0 scale90%）
    const m = await measureAttack(page, {
      attackerId: "player",
      defenderId: "grunt",
      action: "attack1",
      attackerX: 740,
    });

    console.log(`[Damage] damage=${m.damage}, reaction=${m.defenderReaction}, dead=${m.defenderDead}`);

    // 精确断言：单次 attack1 命中造成 34 伤害（被 engine-damage-truth static test 守护）。
    expect(m.damage).toBe(34);
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
      attackerX: 740,
    });

    console.log(`[Light Stagger] reaction=${m.defenderReaction}, damage=${m.damage}, dead=${m.defenderDead}`);

    // 精确断言：grunt 受击后 reaction.kind === "hit"（轻硬直）。
    // grunt 46hp，attack1 34 伤害不致死 → 应停在 hit reaction，非 dead。
    expect(m.defenderReaction).toBe("hit");
    expect(m.defenderDead).toBe(false);
  });

  test("3.2 Launch 高度", async () => {
    test.skip(true, "attack3 hit_lift_up→airborne reaction 已 Wave2 接线(combat-flows S-attack3 断言 reaction=airborne)。但 launch 高度需存活目标(applyHitReaction 仅 hp>0 设 airborne 物理)，而 attack3 48 伤害秒杀 46hp grunt → 测 y 轨迹需更高血量目标，待场景支持");
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
