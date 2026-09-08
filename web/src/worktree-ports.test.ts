import { expect, test } from "vitest";
import playwrightConfig from "../playwright.config";
import viteConfig from "../vite.config";

test("npm run dev is Vite 5173 proxying /api to sitting 7880", () => {
  expect(viteConfig.server?.host).toBe("127.0.0.1");
  expect(viteConfig.server?.port).toBe(5173);
  expect(viteConfig.server?.strictPort).toBe(true);
  if (!process.env.ENDO_LABEL_API) {
    expect(viteConfig.server?.proxy?.["/api"]).toBe("http://127.0.0.1:7880");
  }
});

test("Playwright e2e is 7881/5174 plus worker-down 7893, and does not reuse sitting", () => {
  expect(playwrightConfig.use?.baseURL).toBe("http://127.0.0.1:5174");
  const servers = playwrightConfig.webServer;
  expect(Array.isArray(servers)).toBe(true);
  if (!Array.isArray(servers)) {
    throw new Error("expected three webServer entries");
  }
  expect(servers).toHaveLength(3);
  const [api, vite, downApi] = servers;
  expect(api.url).toBe("http://127.0.0.1:7881/api/health");
  expect(api.command).toContain("--port 7881");
  expect(api.reuseExistingServer).toBe(false);
  expect(vite.url).toBe("http://127.0.0.1:5174");
  expect(vite.command).toContain("--port 5174");
  expect(vite.command).toContain("--strictPort");
  expect(vite.env?.ENDO_LABEL_API).toBe("http://127.0.0.1:7881");
  expect(vite.reuseExistingServer).toBe(false);
  expect(downApi.url).toBe("http://127.0.0.1:7893/api/health");
  expect(downApi.command).toContain("worker_down_sitting.py");
  expect(downApi.reuseExistingServer).toBe(false);
});
