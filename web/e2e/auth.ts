import { expect, type APIRequestContext } from "@playwright/test";

export const E2E_USER = "e2e-admin";
export const E2E_PASS = "e2e-pass";

export async function loginApi(request: APIRequestContext) {
  const response = await request.post("/api/auth/login", {
    data: { username: E2E_USER, password: E2E_PASS },
  });
  expect(response.ok()).toBeTruthy();
}
