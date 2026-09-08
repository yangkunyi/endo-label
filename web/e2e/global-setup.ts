import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default function globalSetup() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../..");
  rmSync(path.join(here, ".work"), { recursive: true, force: true });
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
