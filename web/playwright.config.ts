import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webRoot, "..");
const venvPython = path.join(repoRoot, ".venv", "bin", "python");
const python =
  process.env.ENDO_LABEL_PYTHON ||
  (existsSync(venvPython) ? venvPython : "python3");

const apiPort = 7894;
const vitePort = 5194;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${vitePort}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: [
    {
      command: `${python} -m endo_label --config web/e2e/config.yaml --port ${apiPort}`,
      cwd: repoRoot,
      env: { ...process.env, PYTHONPATH: repoRoot },
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${vitePort} --strictPort`,
      cwd: webRoot,
      env: { ...process.env, ENDO_LABEL_API: `http://127.0.0.1:${apiPort}` },
      url: `http://127.0.0.1:${vitePort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
