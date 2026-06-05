import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  outputDir: "test-results/playwright",
  timeout: 30_000,
  // FPS 测试要测真实帧率：单 worker 独占 GPU/CPU，多浏览器实例会互抢资源污染测量
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5173/carbon-shade-web/",
    // headed：headless 的 RAF 节流会让 delta 飙到 >250ms，FixedStepSimulation 追不上 60 tick/s
    headless: false,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/playwright/results.json" }],
    ["junit", { outputFile: "test-results/playwright/junit.xml" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173/carbon-shade-web/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          args: ["--disable-frame-rate-limit"],
        },
      },
    },
  ],
});
