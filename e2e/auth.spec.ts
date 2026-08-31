import { expect, test } from "@playwright/test";

import { e2eAuthSecret } from "./fixtures";
import { hashPath, prepareEnglishPage, waitForPageText } from "./helpers";

test.describe("Auth", () => {
  test("shows auth form when secret is missing", async ({ page }) => {
    await prepareEnglishPage(page, { clearAuthSecret: true });
    await page.goto(hashPath("/"));
    await waitForPageText(page, "Authentication required");
    await expect(page.getByPlaceholder("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  test("rejects wrong secret and stays on auth form", async ({ page }) => {
    await prepareEnglishPage(page, { clearAuthSecret: true });
    await page.goto(hashPath("/"));
    await waitForPageText(page, "Authentication required");
    await page.getByPlaceholder("Password").fill("definitely-wrong-secret");
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText("Invalid password. Try again.")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByPlaceholder("Password")).toBeVisible();
  });

  test("accepts configured secret and enters shell", async ({ page }) => {
    await prepareEnglishPage(page, { clearAuthSecret: true });
    await page.goto(hashPath("/"));
    await waitForPageText(page, "Authentication required");
    await page.getByPlaceholder("Password").fill(e2eAuthSecret());
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByTestId("host-sidebar-flow")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();
  });
});
