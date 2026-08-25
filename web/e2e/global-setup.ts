import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default function globalSetup() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  rmSync(path.join(here, ".work"), { recursive: true, force: true });
}
