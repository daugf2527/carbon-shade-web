#!/usr/bin/env node
/**
 * Test loop script for automated browser testing
 *
 * Usage:
 *   node scripts/test-loop.mjs              # Run once
 *   node scripts/test-loop.mjs --watch      # Watch mode (rerun on file changes)
 *
 * Exit codes:
 *   0 = All tests passed
 *   1 = Tests failed
 *   2 = Server startup failed
 */

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const VITE_PORT = 5173;
const VITE_STARTUP_TIMEOUT_MS = 30000;
const PLAYWRIGHT_TIMEOUT_MS = 120000;

let viteProcess = null;

async function startViteServer() {
  console.log("[TEST-LOOP] Starting Vite dev server...");

  return new Promise((resolve, reject) => {
    viteProcess = spawn("npm", ["run", "dev"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let output = "";
    const timeout = setTimeout(() => {
      viteProcess?.kill();
      reject(new Error(`Vite server failed to start within ${VITE_STARTUP_TIMEOUT_MS}ms`));
    }, VITE_STARTUP_TIMEOUT_MS);

    viteProcess.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(`[VITE] ${text}`);
      if (output.includes(`localhost:${VITE_PORT}`) || output.includes(`Local:`) || output.includes(`ready in`)) {
        clearTimeout(timeout);
        console.log(`[TEST-LOOP] Vite server ready on port ${VITE_PORT}`);
        resolve();
      }
    });

    viteProcess.stderr.on("data", (data) => {
      console.error(`[VITE] ${data.toString()}`);
    });

    viteProcess.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    viteProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Vite exited with code ${code}`));
      }
    });
  });
}

function stopViteServer() {
  if (viteProcess) {
    console.log("[TEST-LOOP] Stopping Vite server...");
    viteProcess.kill();
    viteProcess = null;
  }
}

async function runPlaywrightTests() {
  console.log("[TEST-LOOP] Running Playwright tests...");

  return new Promise((resolve) => {
    const testProcess = spawn("npx", ["playwright", "test", "tests/browser/"], {
      stdio: "inherit",
      shell: true,
    });

    const timeout = setTimeout(() => {
      console.error(`[TEST-LOOP] Tests timed out after ${PLAYWRIGHT_TIMEOUT_MS}ms`);
      testProcess.kill();
      resolve({ passed: false, timedOut: true });
    }, PLAYWRIGHT_TIMEOUT_MS);

    testProcess.on("exit", (code) => {
      clearTimeout(timeout);
      resolve({ passed: code === 0, exitCode: code });
    });

    testProcess.on("error", (err) => {
      clearTimeout(timeout);
      console.error(`[TEST-LOOP] Test process error: ${err.message}`);
      resolve({ passed: false, error: err.message });
    });
  });
}

function collectDiagnostics() {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    browserSmokeExists: existsSync("verification/browser-smoke.json"),
    runtimeEvidenceExists: existsSync("verification/runtime-evidence.json"),
    screenshotExists: existsSync("verification/browser-smoke.png"),
  };

  if (diagnostics.browserSmokeExists) {
    try {
      const smokeData = JSON.parse(readFileSync("verification/browser-smoke.json", "utf-8"));
      diagnostics.passed = smokeData.passed;
      diagnostics.failedChecks = smokeData.results?.filter(r => !r.passed).map(r => r.check) || [];
      diagnostics.totalChecks = smokeData.results?.length || 0;
    } catch (err) {
      diagnostics.parseError = err.message;
    }
  }

  return diagnostics;
}

async function main() {
  const watchMode = process.argv.includes("--watch");

  console.log("[TEST-LOOP] Starting automated test loop");
  console.log(`[TEST-LOOP] Watch mode: ${watchMode ? "enabled" : "disabled"}`);

  try {
    // Start Vite server
    await startViteServer();
    await sleep(2000); // Extra buffer for server stabilization

    // Run tests
    const result = await runPlaywrightTests();

    // Collect diagnostics
    const diagnostics = collectDiagnostics();

    console.log("\n[TEST-LOOP] ========== RESULTS ==========");
    console.log(`[TEST-LOOP] Tests passed: ${result.passed}`);
    console.log(`[TEST-LOOP] Exit code: ${result.exitCode ?? "N/A"}`);

    if (diagnostics.browserSmokeExists) {
      console.log(`[TEST-LOOP] Total checks: ${diagnostics.totalChecks}`);
      console.log(`[TEST-LOOP] Failed checks: ${diagnostics.failedChecks?.length || 0}`);
      if (diagnostics.failedChecks?.length > 0) {
        console.log(`[TEST-LOOP] Failed: ${diagnostics.failedChecks.join(", ")}`);
      }
    }

    console.log("[TEST-LOOP] ================================\n");

    // Stop server
    stopViteServer();

    // Exit with appropriate code
    process.exit(result.passed ? 0 : 1);

  } catch (err) {
    console.error(`[TEST-LOOP] Fatal error: ${err.message}`);
    stopViteServer();
    process.exit(2);
  }
}

// Cleanup on exit
process.on("SIGINT", () => {
  console.log("\n[TEST-LOOP] Received SIGINT, cleaning up...");
  stopViteServer();
  process.exit(130);
});

process.on("SIGTERM", () => {
  console.log("\n[TEST-LOOP] Received SIGTERM, cleaning up...");
  stopViteServer();
  process.exit(143);
});

main();
