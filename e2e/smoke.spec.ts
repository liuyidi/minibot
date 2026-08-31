import { expect, test, type Page } from "@playwright/test";

import { TestApiClient } from "./fixtures";
import { loginAsDefault } from "./helpers";

async function expectEmptyStateComposer(page: Page) {
  await expect(page.getByRole("textbox", { name: "Message input" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByPlaceholder(/How can I help/)).toBeVisible();
}

test.describe("Smoke", () => {
  test("authenticated shell loads with sidebar and empty-state composer", async ({ page }) => {
    await loginAsDefault(page);
    await expect(page.getByTestId("host-sidebar-flow")).toBeVisible();
    await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();
    await expectEmptyStateComposer(page);
  });

  test("api client can bootstrap against the gateway", async () => {
    const api = new TestApiClient();
    const boot = await api.bootstrap();
    expect(boot.token.length).toBeGreaterThan(0);
    expect(boot.ws_path).toBeTruthy();
  });
});
