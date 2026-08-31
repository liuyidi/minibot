import { expect, test } from "@playwright/test";

import { hashPath, loginAsDefault } from "./helpers";

test.describe("Navigation", () => {
  test("settings section buttons switch pages", async ({ page }) => {
    await loginAsDefault(page);
    await page.goto(hashPath("/settings/overview"));
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Models" }).click();
    await expect(page.getByRole("button", { name: "Models" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page).toHaveURL(/#\/settings\/models/);

    await page.getByRole("button", { name: "Appearance" }).click();
    await expect(page.getByRole("button", { name: "Appearance" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page).toHaveURL(/#\/settings\/appearance/);

    await page.getByRole("button", { name: "Overview" }).click();
    await expect(page.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page).toHaveURL(/#\/settings\/overview/);
  });

  test("back to chat returns to main shell", async ({ page }) => {
    await loginAsDefault(page);
    await page.goto(hashPath("/settings/overview"));
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Back to chat" }).click();
    await expect(page.getByTestId("host-sidebar-flow")).toBeVisible();
    await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();
  });

  test("skills hub route loads", async ({ page }) => {
    await loginAsDefault(page);
    await page.goto(hashPath("/skills"));
    await expect(page.getByRole("button", { name: "Skills · Connectors" })).toBeVisible({
      timeout: 15_000,
    });
  });
});
