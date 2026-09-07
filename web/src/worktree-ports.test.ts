import { expect, test } from "vitest";
import playwrightConfig from "../playwright.config";
import viteConfig from "../vite.config";

test("npm run dev is Vite 5175 proxying /api to this worktree sitting", () => {
  expect(viteConfig.server?.host).toBe("127.0.0.1");
  expect(viteConfig.server?.port).toBe(5175);
  expect(viteConfig.server?.strictPort).toBe(true);
  if (!process.env.ENDO_LABEL_API) {
    expect(viteConfig.server?.proxy?.["/api"]).toBe("http://127.0.0.1:7882");
  }
});

test("Playwright e2e is isolated 7892/5192, strict, and does not reuse a foreign server", () => {
  expect(playwrightConfig.use?.baseURL).toBe("http://127.0.0.1:5192");
  const servers = playwrightConfig.webServer;
  expect(Array.isArray(servers)).toBe(true);
  if (!Array.isArray(servers)) {
    throw new Error("expected two webServer entries");
  }
  expect(servers).toHaveLength(2);
  const [api, vite] = servers;
  expect(api.url).toBe("http://127.0.0.1:7892/api/health");
  expect(api.command).toContain("--port 7892");
  expect(api.reuseExistingServer).toBe(false);
  expect(vite.url).toBe("http://127.0.0.1:5192");
  expect(vite.command).toContain("--port 5192");
  expect(vite.command).toContain("--strictPort");
  expect(vite.env?.ENDO_LABEL_API).toBe("http://127.0.0.1:7892");
  expect(vite.reuseExistingServer).toBe(false);
});
