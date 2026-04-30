import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const verificationDir = path.join(root, "verification");

const TIMEOUT_MS = 30000;
const BASE_PATH = "/carbon-shade-web/";
const PORT = 5173;
const URL = `http://localhost:${PORT}${BASE_PATH}`;

function startServer() {
  const server = spawn("npx", ["vite", "--host", "0.0.0.0", "--port", String(PORT)], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  return new Promise((resolve, reject) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        server.kill();
        reject(new Error(`Server did not start within ${TIMEOUT_MS}ms`));
      }
    }, TIMEOUT_MS);

    server.stdout.on("data", (data) => {
      const text = data.toString();
      if (!resolved && text.includes("Local:")) {
        resolved = true;
        clearTimeout(timer);
        resolve(server);
      }
    });

    server.stderr.on("data", (data) => {
      // Vite writes some info to stderr, don't treat as error
    });

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

async function runSmokeTest(server) {
  const results = [];
  let passed = true;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  try {
    await page.goto(URL, { timeout: TIMEOUT_MS, waitUntil: "domcontentloaded" });
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

    if (consoleErrors.length > 0) {
      results.push({ check: "console_errors", passed: false, errors: consoleErrors });
      passed = false;
    } else {
      results.push({ check: "console_errors", passed: true });
    }

    mkdirSync(verificationDir, { recursive: true });
    await page.screenshot({ path: path.join(verificationDir, "browser-smoke.png") });
    results.push({ check: "screenshot_captured", passed: true });
  } catch (err) {
    results.push({ check: "exception", passed: false, error: err.message });
    passed = false;
  } finally {
    await browser.close();
  }

  return { passed, results };
}

let exitCode = 1;
let server = null;

try {
  console.log("Starting Vite dev server...");
  server = await startServer();
  console.log("Server ready. Running smoke test...");

  const report = await runSmokeTest(server);
  const payload = { passed: report.passed, url: URL, timestamp: new Date().toISOString(), results: report.results };

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
  const payload = { passed: false, url: URL, timestamp: new Date().toISOString(), error: err.message, results: [] };
  mkdirSync(verificationDir, { recursive: true });
  writeFileSync(path.join(verificationDir, "browser-smoke.json"), JSON.stringify(payload, null, 2));
  exitCode = 1;
} finally {
  if (server) server.kill();
  process.exit(exitCode);
}
