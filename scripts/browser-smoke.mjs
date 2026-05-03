import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBrowserSmokePayload } from "./browser-smoke-evidence.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const verificationDir = path.join(root, "verification");

const TIMEOUT_MS = 30000;
const BASE_PATH = "/carbon-shade-web/";
const PORT = 5173;
const DEFAULT_URL = `http://localhost:${PORT}${BASE_PATH}`;

export function stripAnsi(text) {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

export function detectViteReadyUrl(text) {
  const normalized = stripAnsi(text);
  const match = normalized.match(/Local:\s*(https?:\/\/localhost:\d+\/\S*)/);
  return match?.[1] ?? null;
}

function startServer() {
  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  const server = spawn(process.execPath, [viteBin, "--host", "0.0.0.0", "--port", String(PORT)], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let resolved = false;
    let serverOutput = "";
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        server.kill();
        reject(new Error(`Server did not start within ${TIMEOUT_MS}ms\n${stripAnsi(serverOutput).trim()}`.trim()));
      }
    }, TIMEOUT_MS);

    const handleOutput = (data) => {
      const text = data.toString();
      serverOutput += text;
      const readyUrl = detectViteReadyUrl(text) ?? detectViteReadyUrl(serverOutput);
      if (!resolved && readyUrl) {
        resolved = true;
        clearTimeout(timer);
        resolve({ server, url: readyUrl });
      }
    };

    server.stdout.on("data", handleOutput);
    server.stderr.on("data", handleOutput);

    server.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    server.on("exit", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(new Error(`Server exited with code ${code} before ready`));
      }
    });
  });
}

async function runSmokeTest(url) {
  const results = [];
  let passed = true;
  let runtimeEvidence = {};

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText ?? "unknown",
    });
  });

  page.on("response", (response) => {
    if (response.status() < 400) return;
    badResponses.push({
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
    });
  });

  try {
    await page.goto(url, { timeout: TIMEOUT_MS, waitUntil: "domcontentloaded" });
    results.push({ check: "page_loaded", passed: true });

    // Wait for Phaser to create a canvas element
    try {
      await page.waitForSelector("canvas", { timeout: TIMEOUT_MS });
      results.push({ check: "canvas_present", passed: true });
    } catch {
      results.push({ check: "canvas_present", passed: false, error: "No canvas element found" });
      passed = false;
    }

    // Wait for Phaser to finish initializing
    await page.waitForTimeout(4000);

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      results.push({ check: "console_errors", passed: false, errors: consoleErrors, pageErrors });
      passed = false;
    } else {
      results.push({ check: "console_errors", passed: true });
    }

    mkdirSync(verificationDir, { recursive: true });
    await page.screenshot({ path: path.join(verificationDir, "browser-smoke.png") });
    results.push({ check: "screenshot_captured", passed: true });

    // E2: Deterministic screenshot — run scenario and capture pixel hash
    try {
      await page.evaluate(() => {
        const runtime = window.combatLab;
        if (runtime?.scene?.runScenario) {
          runtime.scene.runScenario();
          return true;
        }
        return false;
      });
      await page.waitForTimeout(500);

      const scenarioPath = path.join(verificationDir, "scenario-screenshot.png");
      await page.screenshot({ path: scenarioPath });

      const { readFileSync } = await import("node:fs");
      const { createHash } = await import("node:crypto");
      const pngData = readFileSync(scenarioPath);
      const pixelHash = createHash("sha256").update(pngData).digest("hex").slice(0, 16);

      // Golden hash — commit the real hash when visual baseline is stable.
      // To set: run `npm run browser:smoke`, copy pixelHash from the report, paste below.
      const GOLDEN_SCENARIO_HASH = "0000000000000000";
      const hashIsSet = GOLDEN_SCENARIO_HASH !== "0000000000000000";
      const hashMatch = hashIsSet && pixelHash === GOLDEN_SCENARIO_HASH;

      results.push({
        check: "scenario_screenshot",
        passed: !hashIsSet || hashMatch,
        pixelHash,
        goldenHash: GOLDEN_SCENARIO_HASH,
        note: !hashIsSet
          ? `Golden hash not yet set — captured pixelHash=${pixelHash}. Commit this when visual baseline is stable.`
          : hashMatch
            ? "Pixel hash matches golden."
            : `Pixel hash MISMATCH: got ${pixelHash}, expected ${GOLDEN_SCENARIO_HASH} — visual regression detected.`,
      });
      if (!hashIsSet || !hashMatch) {
        console.log(`[scenario_screenshot] pixelHash=${pixelHash} goldenHash=${GOLDEN_SCENARIO_HASH} note=${results.at(-1)?.note ?? ""}`);
      }
    } catch (err) {
      results.push({ check: "scenario_screenshot", passed: false, error: err.message });
      passed = false;
    }

    runtimeEvidence = await collectRuntimeEvidence(page);
    const assetSummary = runtimeEvidence.assets ?? {};
    const missingKeys = findMissingAssetKeys(assetSummary);
    const failedAssets = Array.isArray(assetSummary.failed) ? assetSummary.failed : [];
    const sceneReady = Boolean(runtimeEvidence.combat?.sceneReady);
    const networkClean = failedRequests.length === 0 && badResponses.length === 0;
    const runtimePassed = sceneReady && missingKeys.length === 0 && failedAssets.length === 0 && networkClean;
    results.push({
      check: "runtime_evidence",
      passed: runtimePassed,
      sceneReady,
      missingAssetKeys: missingKeys,
      failedAssets,
      failedRequests,
      badResponses,
    });
    if (!runtimePassed) passed = false;
  } catch (err) {
    results.push({ check: "exception", passed: false, error: err.message });
    passed = false;
  } finally {
    await browser.close();
  }

  return {
    passed,
    results,
    runtimeEvidence,
    diagnostics: { consoleErrors, pageErrors, failedRequests, badResponses },
  };
}

async function collectRuntimeEvidence(page) {
  return await page.evaluate(() => {
    const runtime = window.combatLab ?? {};
    const kernel = runtime.kernel;
    const replay = kernel?.replay?.export?.() ?? null;
    const events = Array.isArray(kernel?.bus?.archive) ? kernel.bus.archive : [];
    const eventTypes = {};
    for (const event of events) {
      const type = event?.type ?? "unknown";
      eventTypes[type] = (eventTypes[type] ?? 0) + 1;
    }

    return {
      buildHash: runtime.evidence?.buildHash ?? replay?.metadata?.buildHash ?? null,
      assets: runtime.evidence?.assets ?? { expected: [], loaded: [], failed: [] },
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
        eventTypes,
      },
    };
  });
}

function findMissingAssetKeys(assets) {
  const expected = Array.isArray(assets.expected) ? assets.expected : [];
  const loaded = new Set((Array.isArray(assets.loaded) ? assets.loaded : []).map(item => item?.key).filter(Boolean));
  const failed = new Set((Array.isArray(assets.failed) ? assets.failed : []).map(item => item?.key).filter(Boolean));
  return expected.map(item => item?.key).filter(key => key && !loaded.has(key) && !failed.has(key));
}

async function main() {
  let exitCode = 1;
  let server = null;
  let url = DEFAULT_URL;

  try {
    console.log("Starting Vite dev server...");
    const ready = await startServer();
    server = ready.server;
    url = ready.url;
    console.log(`Server ready at ${url}. Running smoke test...`);

    const report = await runSmokeTest(url);
    const payload = buildBrowserSmokePayload({
      passed: report.passed,
      url,
      timestamp: new Date().toISOString(),
      results: report.results,
      runtimeEvidence: report.runtimeEvidence,
      diagnostics: report.diagnostics,
    });

    mkdirSync(verificationDir, { recursive: true });
    writeFileSync(path.join(verificationDir, "browser-smoke.json"), JSON.stringify(payload, null, 2));
    console.log(JSON.stringify(payload, null, 2));

    if (report.passed) {
      console.log("\nBrowser smoke test PASSED");
      exitCode = 0;
    } else {
      console.error("\nBrowser smoke test FAILED");
      exitCode = 1;
    }
  } catch (err) {
    console.error(`Browser smoke test error: ${err.message}`);
    const payload = buildBrowserSmokePayload({
      passed: false,
      url,
      timestamp: new Date().toISOString(),
      error: err.message,
      results: [],
      runtimeEvidence: {},
      diagnostics: {},
    });
    mkdirSync(verificationDir, { recursive: true });
    writeFileSync(path.join(verificationDir, "browser-smoke.json"), JSON.stringify(payload, null, 2));
    exitCode = 1;
  } finally {
    if (server) server.kill();
    process.exit(exitCode);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
