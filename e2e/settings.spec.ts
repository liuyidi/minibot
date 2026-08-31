import { expect, test } from "@playwright/test";

import { hashPath, loginAsDefault } from "./helpers";

test.describe("Settings", () => {
  test("opens overview via hash route", async ({ page }) => {
    await loginAsDefault(page);
    await page.goto(hashPath("/settings/overview"));
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Overview" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("account menu can open settings", async ({ page }) => {
    await loginAsDefault(page);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: /Settings/i }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
      timeout: 15_000,
    });
  });
});
