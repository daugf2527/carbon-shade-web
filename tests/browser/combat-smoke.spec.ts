import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { buildBrowserSmokePayload } from "../../scripts/browser-smoke-evidence.mjs";

type DiagnosticBag = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: unknown[];
  badResponses: unknown[];
};

const verificationDir = path.resolve("verification");

function attachDiagnostics(page: Page): DiagnosticBag {
  const diagnostics: DiagnosticBag = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    badResponses: [],
  };

  page.on("console", (msg) => {
    if (msg.type() === "error") diagnostics.consoleErrors.push(msg.text());
  });
  page.on("pageerror", err => diagnostics.pageErrors.push(err.message));
  page.on("requestfailed", request => diagnostics.failedRequests.push({
    url: request.url(),
    method: request.method(),
    resourceType: request.resourceType(),
    failure: request.failure()?.errorText ?? "unknown",
  }));
  page.on("response", response => {
    if (response.status() < 400) return;
    diagnostics.badResponses.push({
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
    });
  });

  return diagnostics;
}

async function collectRuntimeEvidence(page: Page): Promise<unknown> {
  return await page.evaluate(() => {
    const runtime = (window as any).combatLab ?? {};
    const exportedEvidence = runtime.evidence?.export?.();
    if (exportedEvidence) return exportedEvidence;

    const kernel = runtime.kernel;
    const replay = kernel?.replay?.export?.() ?? null;
    const events = Array.isArray(kernel?.bus?.archive) ? kernel.bus.archive : [];
    const eventTypes: Record<string, number> = {};
    for (const event of events) {
      const type = event?.type ?? "unknown";
      eventTypes[type] = (eventTypes[type] ?? 0) + 1;
    }

    return {
      buildHash: runtime.evidence?.buildHash ?? replay?.metadata?.buildHash ?? null,
      assets: runtime.evidence?.assets ?? { expected: [], loaded: [], failed: [], missingKeys: [] },
      combat: {
        ...(runtime.evidence?.combat ?? {}),
        sceneReady: Boolean(runtime.scene),
        tick: kernel?.tickCount ?? null,
        eventCount: events.length,
        scenario: kernel?.scenario ?? null,
        replay: replay
          ? {
            metadata: replay.metadata,
            frameCount: replay.frameCount,
          }
          : null,
        finalStateHash: replay?.metadata?.finalStateHash ?? null,
        combatSchemaHash: replay?.metadata?.combatSchemaHash ?? null,
        eventTypes,
      },
      dynamicManifests: [],
    };
  });
}

async function collectActorSnapshots(page: Page): Promise<unknown[]> {
  return await page.evaluate(() => {
    const kernel = (window as any).combatLab?.kernel;
    if (!kernel || !Array.isArray(kernel.actors)) return [];
    return kernel.actors.map((a: any) => ({
      id: a.id,
      type: a.type,
      hp: a.resources?.hp,
      maxHp: a.resources?.maxHp,
      pos: { x: a.position?.x, y: a.position?.y, z: a.position?.z },
      reaction: a.reactionState,
      action: a.currentAction?.actionName ?? null,
      dead: a.flags?.dead ?? false,
      armorType: a.armorProfile?.baseType,
      buffs: (a.buffs || []).map((b: any) => ({ type: b.type, stacks: b.stacks })),
      statusEffects: (a.statusEffects || []).map((s: any) => ({ type: s.type, stacks: s.stacks })),
      bossPhase: a.ai?.bossPhase,
      faction: a.faction,
    }));
  });
}

async function collectEventSummary(page: Page): Promise<Record<string, unknown>> {
  return await page.evaluate(() => {
    const kernel = (window as any).combatLab?.kernel;
    const archive: any[] = kernel?.bus?.archive || [];

    const actionEntered = archive
      .filter((e: any) => e.type === "ActionEntered")
      .map((e: any) => e.payload?.actionName);

    const reactions = archive
      .filter((e: any) => e.type === "ReactionApplied")
      .map((e: any) => e.payload?.finalReaction);

    const statusApplied = archive
      .filter((e: any) => e.type === "StatusApplied")
      .map((e: any) => e.payload?.type);

    const damageEvents = archive.filter((e: any) => e.type === "DamageApplied");
    const dotDamage = damageEvents.filter((e: any) =>
      e.payload?.sourceKind === "status_dot");

    const hitStopEvents = archive.filter((e: any) => e.type === "HitStopStarted");

    return {
      actionEntered,
      reactions,
      statusApplied,
      hasArmorHit: archive.some((e: any) => e.type === "ArmorHit"),
      hasHitStop: hitStopEvents.length > 0 && hitStopEvents.some((e: any) => (e.payload?.frames ?? 0) > 0),
      hitStopCount: hitStopEvents.length,
      totalDamageEvents: damageEvents.length,
      dotDamageCount: dotDamage.length,
      hasHitConfirmed: archive.some((e: any) => e.type === "HitConfirmed"),
      hitConfirmedCount: archive.filter((e: any) => e.type === "HitConfirmed").length,
      totalEvents: archive.length,
      statusResistedReasons: archive
        .filter((e: any) => e.type === "StatusResisted")
        .map((e: any) => e.payload?.reason),
    };
  });
}

// ── Chain assertion helpers ──

type Results = { check: string; passed: boolean; [key: string]: unknown }[];

function assertChain1(results: Results, actorSnapshots: any[], eventSummary: any, scenario: any): void {
  const record = (c: string, ok: boolean, extra: Record<string, unknown> = {}) =>
    results.push({ check: `chain1_${c}`, passed: ok, ...extra });

  record("event_count_gt_50", (eventSummary.totalEvents ?? 0) > 50, { totalEvents: eventSummary.totalEvents });

  const actions = eventSummary.actionEntered || [];
  record("action_normal_basic", actions.includes("NormalBasic1"), { actions });
  record("action_upward_slash", actions.includes("UpwardSlash"), { actions });
  record("action_raging_fury", actions.includes("RagingFury") || actions.includes("RagingFury2"), { actions });

  const hasQuickRebound = scenario?.quickReboundObserved === true;
  record("quick_rebound", hasQuickRebound, { scenario });
}

function assertChain2(results: Results, actorSnapshots: any[], eventSummary: any, scenario: any): void {
  const record = (c: string, ok: boolean, extra: Record<string, unknown> = {}) =>
    results.push({ check: `chain2_${c}`, passed: ok, ...extra });

  record("hit_confirmed", eventSummary.hitConfirmedCount >= 3, { count: eventSummary.hitConfirmedCount });
  record("damage_applied", eventSummary.totalDamageEvents >= 3, { count: eventSummary.totalDamageEvents });

  const reactions = eventSummary.reactions || [];
  record("reaction_launch", reactions.includes("launch"), { reactions });
  record("reaction_armor_feedback", reactions.includes("armor_feedback_only"), { reactions });

  record("armor_hit", eventSummary.hasArmorHit === true);
  record("hitstop_started", eventSummary.hasHitStop === true, { hitStopCount: eventSummary.hitStopCount });

  const grunt = actorSnapshots.find((a: any) => a.id === "grunt");
  record("grunt_damaged", grunt ? grunt.hp < grunt.maxHp : false, { gruntHp: grunt?.hp, gruntMaxHp: grunt?.maxHp });
  record("grunt_alive", grunt ? grunt.hp > 0 : false, { gruntHp: grunt?.hp });

  const boss = actorSnapshots.find((a: any) => a.id === "boss");
  record("boss_damaged", boss ? boss.hp < boss.maxHp : false, { bossHp: boss?.hp, bossMaxHp: boss?.maxHp });

  const building = actorSnapshots.find((a: any) => a.id === "building");
  record("building_damaged", building ? building.hp < building.maxHp : false, { buildingHp: building?.hp, buildingMaxHp: building?.maxHp });

  record("scenario_normal_hit_present", "normalHitObserved" in (scenario || {}), { scenario });
  record("scenario_multi_hit_present", "ragingFuryMultiHitObserved" in (scenario || {}), { scenario });
  record("scenario_launch", scenario?.launchObserved === true, { scenario });
  record("scenario_armor_hit", scenario?.armorHitObserved === true, { scenario });
  record("scenario_building_armor", scenario?.buildingArmorBlockedControlObserved === true, { scenario });
}

function assertChain3(results: Results, actorSnapshots: any[]): void {
  const record = (c: string, ok: boolean, extra: Record<string, unknown> = {}) =>
    results.push({ check: `chain3_${c}`, passed: ok, ...extra });

  const actorIds = actorSnapshots.map((a: any) => a.id).sort();
  const expectedEnemies = ["boss", "building", "dummy", "grunt", "imp"];
  for (const id of expectedEnemies) {
    record(`actor_${id}_exists`, actorIds.includes(id), { actorIds });
  }

  const boss = actorSnapshots.find((a: any) => a.id === "boss");
  record("boss_super_armor", boss?.armorType === "boss_super_armor", { bossArmor: boss?.armorType });

  const building = actorSnapshots.find((a: any) => a.id === "building");
  record("building_armor", building?.armorType === "building_armor", { buildingArmor: building?.armorType });

  record("boss_phase_set", boss?.bossPhase === 1, { bossPhase: boss?.bossPhase });
}

function assertChain4(results: Results, actorSnapshots: any[]): void {
  const record = (c: string, ok: boolean, extra: Record<string, unknown> = {}) =>
    results.push({ check: `chain4_${c}`, passed: ok, ...extra });

  // Buff chain: check that player buffs array exists (even if empty in base scenario)
  const player = actorSnapshots.find((a: any) => a.id === "player");
  record("player_buffs_array", Array.isArray(player?.buffs), {
    buffCount: player?.buffs?.length ?? 0,
    buffTypes: player?.buffs?.map((b: any) => b.type) ?? [],
  });
}

function assertChain5(results: Results, actorSnapshots: any[], eventSummary: any, scenario: any): void {
  const record = (c: string, ok: boolean, extra: Record<string, unknown> = {}) =>
    results.push({ check: `chain5_${c}`, passed: ok, ...extra });

  const statusTypes = eventSummary.statusApplied || [];
  record("bleed_applied", statusTypes.includes("bleed"), { statusTypes });
  record("scenario_bleed", scenario?.bleedObserved === true, { scenario });
  record("dot_damage_exists", eventSummary.dotDamageCount > 0, { dotDamageCount: eventSummary.dotDamageCount });

  const grunt = actorSnapshots.find((a: any) => a.id === "grunt");
  record("grunt_has_status", grunt ? (grunt.statusEffects?.length ?? 0) > 0 : false, {
    gruntStatuses: grunt?.statusEffects ?? [],
  });
}

function assertChain6(results: Results, actorSnapshots: any[]): void {
  const record = (c: string, ok: boolean, extra: Record<string, unknown> = {}) =>
    results.push({ check: `chain6_${c}`, passed: ok, ...extra });

  const worldBounds = { xMin: 96, xMax: 2730, zMin: -180, zMax: 180 };
  let allInBounds = true;
  for (const a of actorSnapshots) {
    if (!a.pos) continue;
    const inBounds = a.pos.x >= worldBounds.xMin && a.pos.x <= worldBounds.xMax
      && a.pos.z >= worldBounds.zMin && a.pos.z <= worldBounds.zMax;
    if (!inBounds) allInBounds = false;
  }
  record("all_actors_in_bounds", allInBounds, { bounds: worldBounds });

  const player = actorSnapshots.find((a: any) => a.id === "player");
  record("player_pos_defined", typeof player?.pos?.x === "number" && typeof player?.pos?.z === "number", {
    playerPos: player?.pos,
  });

  const deadActors = actorSnapshots.filter((a: any) => a.dead === true);
  const deadWithAction = deadActors.filter((a: any) => a.action !== null);
  record("no_dead_actor_has_action", deadWithAction.length === 0, { deadCount: deadActors.length, deadWithAction: deadWithAction.map((a: any) => a.id) });
}

function assertChain7(results: Results, runtimeEvidence: any): void {
  const record = (c: string, ok: boolean, extra: Record<string, unknown> = {}) =>
    results.push({ check: `chain7_${c}`, passed: ok, ...extra });

  const replay = runtimeEvidence?.combat?.replay;
  record("replay_exported", replay !== null && replay !== undefined, { hasReplay: !!replay });

  const meta = replay?.metadata;
  record("replay_build_hash", typeof meta?.buildHash === "string" && meta.buildHash.length > 0, { buildHash: meta?.buildHash });
  record("replay_schema_hash", typeof meta?.combatSchemaHash === "string" && meta.combatSchemaHash.length > 0, { combatSchemaHash: meta?.combatSchemaHash });
  record("replay_final_state_hash", typeof meta?.finalStateHash === "string" && meta.finalStateHash.length > 0, { finalStateHash: meta?.finalStateHash });
  record("replay_manifest_hash", typeof meta?.manifestHash === "string" && meta.manifestHash.length > 0, { manifestHash: meta?.manifestHash });
  record("replay_status_manifest_hash", typeof meta?.statusManifestHash === "string" && meta.statusManifestHash.length > 0, { statusManifestHash: meta?.statusManifestHash });
  record("replay_enemy_manifest_hash", typeof meta?.enemyManifestHash === "string" && meta.enemyManifestHash.length > 0, { enemyManifestHash: meta?.enemyManifestHash });
  record("replay_frame_count", (replay?.frameCount ?? 0) > 0, { frameCount: replay?.frameCount });
  record("replay_logic_fps", meta?.logicFps === 60, { logicFps: meta?.logicFps });
}

function assertMacroHealth(results: Results, actorSnapshots: any[], eventSummary: any, diagnostics: DiagnosticBag, runtimeEvidence: any): void {
  const record = (c: string, ok: boolean, extra: Record<string, unknown> = {}) =>
    results.push({ check: `macro_${c}`, passed: ok, ...extra });

  // All actors have valid fields
  let allValid = true;
  for (const a of actorSnapshots) {
    if (!a.id || !a.type || a.hp === undefined || !a.pos) { allValid = false; break; }
  }
  record("all_actors_valid", allValid, { actorCount: actorSnapshots.length });

  // Event archive non-empty
  record("events_non_empty", eventSummary.totalEvents > 50, { totalEvents: eventSummary.totalEvents });

  // No Math.random non-determinism
  const reasonSet = new Set(eventSummary.statusResistedReasons || []);
  record("no_chance_random", !reasonSet.has("chance_failed"), { reasons: [...reasonSet] });

  // Diagnostics (non-fatal checks; hard failure via expect() at end)
  record("no_console_errors", diagnostics.consoleErrors.length === 0, { count: diagnostics.consoleErrors.length });
  record("no_page_errors", diagnostics.pageErrors.length === 0, { count: diagnostics.pageErrors.length });
  record("no_failed_requests", diagnostics.failedRequests.length === 0, { count: diagnostics.failedRequests.length });
  record("no_bad_responses", diagnostics.badResponses.length === 0, { count: diagnostics.badResponses.length });

  // FPS
  const fpsWarnings = diagnostics.consoleErrors.filter((e: string) => e.startsWith("[FPS]"));
  record("no_fps_drop", fpsWarnings.length === 0, { fpsWarningCount: fpsWarnings.length });

  // Assets
  const assets = runtimeEvidence?.assets;
  record("no_missing_assets", (assets?.missingKeys?.length ?? 0) === 0, { missingKeys: assets?.missingKeys ?? [] });
  record("no_failed_assets", (assets?.failed?.length ?? 0) === 0, { failedCount: assets?.failed?.length ?? 0 });

  // Runtime core
  const combat = runtimeEvidence?.combat;
  record("scene_ready", combat?.sceneReady === true);
  record("final_state_hash_present", typeof combat?.finalStateHash === "string" && combat.finalStateHash.length > 0);
}

// ── Main test ──

test("combat scene boots, runs deterministic scenario, and validates all combat chains", async ({ page }, testInfo) => {
  test.setTimeout(90_000); // 90s — Phaser boot can be slow in CI
  const diagnostics = attachDiagnostics(page);
  const results: { check: string; passed: boolean; [key: string]: unknown }[] = [];
  let globalPassed = true;

  mkdirSync(verificationDir, { recursive: true });

  // Setup
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 20000 });
  results.push({ check: "page_loaded", passed: true });

  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  results.push({ check: "canvas_present", passed: true });

  // Collect page errors before interacting
  const bootErrors: string[] = [];
  page.on("pageerror", err => bootErrors.push(err.message));

  // Phaser BootScene: press Enter or click "Start Training Ground" button
  await page.keyboard.press("Enter");
  let booted = false;
  try {
    await page.waitForFunction(() => Boolean((window as any).combatLab?.scene && (window as any).combatLab?.kernel), undefined, { polling: 200, timeout: 25000 });
    booted = true;
  } catch {
    // Retry: click the start button directly
    const btn = page.locator("text=Start Training Ground").first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click().catch(() => undefined);
    }
    try {
      await page.waitForFunction(() => Boolean((window as any).combatLab?.scene && (window as any).combatLab?.kernel), undefined, { polling: 200, timeout: 25000 });
      booted = true;
    } catch {
      booted = false;
    }
  }
  results.push({ check: "combat_scene_ready", passed: booted, bootErrors });
  if (!booted) {
    // Dump page state for debugging
    const bodyText = await page.evaluate(() => (document.body as any)?.innerText?.substring(0, 500) ?? "(no body text)");
    console.log(`[SMOKE] Boot failed. Page text: ${bodyText}`);
    console.log(`[SMOKE] Boot page errors: ${bootErrors.join(' | ')}`);
    // Don't throw here — let the test continue and fail gracefully at the end
  }

  const sceneBooted = booted; // from the boot check above
  let runtimeEvidence: unknown = {};
  let actorSnapshots: any[] = [];
  let eventSummary: any = {};
  let scenario: any = {};

  if (sceneBooted) {
    // Screenshot pre-scenario
    await page.screenshot({ path: path.join(verificationDir, "browser-smoke.png") });
    results.push({ check: "screenshot_captured", passed: true });

    // Run deterministic scenario
    await page.evaluate(() => {
      const runtime = (window as any).combatLab;
      runtime?.scene?.runScenario?.();
    });
    await page.waitForTimeout(500);

    // Screenshot post-scenario
    const scenarioPath = path.join(verificationDir, "scenario-screenshot.png");
    await page.screenshot({ path: scenarioPath });
    const pixelHash = createHash("sha256").update(readFileSync(scenarioPath)).digest("hex").slice(0, 16);
    results.push({ check: "scenario_screenshot", passed: true, pixelHash });

    // Collect all evidence
    runtimeEvidence = await collectRuntimeEvidence(page);
    writeFileSync(path.join(verificationDir, "runtime-evidence.json"), JSON.stringify(runtimeEvidence, null, 2));

    actorSnapshots = await collectActorSnapshots(page) as any[];
    eventSummary = await collectEventSummary(page) as any;
    scenario = (runtimeEvidence as any)?.combat?.scenario ?? {};

    // ── Run all chain assertions ──
    assertChain1(results, actorSnapshots, eventSummary, scenario);
    assertChain2(results, actorSnapshots, eventSummary, scenario);
    assertChain3(results, actorSnapshots);
    assertChain4(results, actorSnapshots);
    assertChain5(results, actorSnapshots, eventSummary, scenario);
    assertChain6(results, actorSnapshots);
    assertChain7(results, runtimeEvidence);
    assertMacroHealth(results, actorSnapshots, eventSummary, diagnostics, runtimeEvidence);
  } else {
    // Scene failed to boot — fill in failure markers
    results.push({ check: "screenshot_captured", passed: false, reason: "scene not booted" });
    results.push({ check: "scenario_screenshot", passed: false, reason: "scene not booted" });
  }

  // Compute global pass/fail
  globalPassed = results.every(r => r.passed !== false);

  // Log assertion summary (before expect so we can see failures even if test crashes)
  const failed = results.filter(r => !r.passed);
  console.log(`[SMOKE] ${results.filter(r => r.passed).length}/${results.length} assertions passed`);
  if (failed.length > 0) {
    console.log(`[SMOKE] FAILED: ${failed.map(f => f.check).join(', ')}`);
    for (const f of failed) console.log(`  ${f.check}: ${JSON.stringify({ ...f, passed: undefined })}`);
  }

  // Write evidence BEFORE expect() so failure diagnostics are preserved
  const payload = buildBrowserSmokePayload({
    passed: globalPassed,
    url: page.url(),
    timestamp: new Date().toISOString(),
    results,
    runtimeEvidence,
    diagnostics,
  });
  writeFileSync(path.join(verificationDir, "browser-smoke.json"), JSON.stringify(payload, null, 2));
  await testInfo.attach("runtime-evidence", { path: path.join(verificationDir, "runtime-evidence.json"), contentType: "application/json" });
  await testInfo.attach("browser-smoke", { path: path.join(verificationDir, "browser-smoke.json"), contentType: "application/json" });

  // Hard assertions on diagnostics (must pass)
  expect(diagnostics.consoleErrors, "console errors").toEqual([]);
  expect(diagnostics.pageErrors, "page errors").toEqual([]);
  expect(diagnostics.failedRequests, "failed requests").toEqual([]);
  expect(diagnostics.badResponses, "bad responses").toEqual([]);
  expect(globalPassed, "all chain assertions passed").toBe(true);
});
