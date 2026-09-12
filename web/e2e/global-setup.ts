import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Playwright starts its webServers before globalSetup, and the API server
 * registers the config's Projects and Clips at startup — so the isolated
 * sitting's wipe lives in the API webServer command, not here. This only
 * bootstraps the first Account into the DB the server is already reading.
 */
export default function globalSetup() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../..");
  const venvPython = path.resolve(repoRoot, ".venv/bin/python");
  const python = process.env.CI ? "python3" : existsSync(venvPython) ? venvPython : "python3";
  execFileSync(
    python,
    [
      "-m",
      "endo_label",
      "create-admin",
      "e2e-admin",
      "--password",
      "e2e-pass",
      "--config",
      "web/e2e/config.yaml",
    ],
    { cwd: repoRoot, env: { ...process.env, PYTHONPATH: repoRoot }, stdio: "inherit" },
  );
}
