import { expect, test } from "@playwright/test";

import { TestApiClient } from "./fixtures";
import { loginAsDefault } from "./helpers";

test.describe("Sessions", () => {
  let api: TestApiClient;

  test.beforeEach(async () => {
    api = new TestApiClient();
    await api.bootstrap();
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  test("api-created session appears in sidebar", async ({ page }) => {
    const title = `E2E Session ${Date.now()}`;
    const session = await api.createSession(title);
    expect(session.id).toBeTruthy();
    expect(session.title).toBe(title);

    await loginAsDefault(page);
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  });

  test("multiple sessions are listed after login", async ({ page }) => {
    const stamp = Date.now();
    const titles = [`E2E Alpha ${stamp}`, `E2E Beta ${stamp}`];
    for (const title of titles) {
      await api.createSession(title);
    }

    await loginAsDefault(page);
    for (const title of titles) {
      await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
    }
  });
});
