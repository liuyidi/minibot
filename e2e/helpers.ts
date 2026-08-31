import { expect, type Page } from "@playwright/test";

import { e2eAuthSecret } from "./fixtures";

const SECRET_STORAGE_KEY = "minibot-webui.bootstrap-secret";
const LOCALE_STORAGE_KEY = "minibot.locale";

/** WebUI uses HashRouter — paths are `/#/...`, not `/...`. */
export function hashPath(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `/#${normalized}`;
}

export async function waitForPageText(page: Page, text: string, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    (expected) => document.body?.innerText.includes(expected),
    text,
    { timeout },
  );
}

export async function prepareEnglishPage(
  page: Page,
  options: { clearAuthSecret?: boolean } = {},
): Promise<void> {
  const { clearAuthSecret = false } = options;
  await page.addInitScript(
    ({ storageKey, localeKey, clearSecret }) => {
      if (clearSecret) {
        localStorage.removeItem(storageKey);
      }
      localStorage.setItem(localeKey, "en");
    },
    {
      storageKey: SECRET_STORAGE_KEY,
      localeKey: LOCALE_STORAGE_KEY,
      clearSecret: clearAuthSecret,
    },
  );
}

export async function seedAuthLocalStorage(page: Page, secret = e2eAuthSecret()): Promise<void> {
  await page.addInitScript(
    ({ storageSecret, storageKey, localeKey, localeValue }) => {
      localStorage.setItem(storageKey, storageSecret);
      localStorage.setItem(localeKey, localeValue);
    },
    {
      storageSecret: secret,
      storageKey: SECRET_STORAGE_KEY,
      localeKey: LOCALE_STORAGE_KEY,
      localeValue: "en",
    },
  );
}

/**
 * Inject the E2E bootstrap secret and open the main shell.
 * Returns after the sidebar chrome is visible (WS + bootstrap succeeded).
 */
export async function loginAsDefault(page: Page): Promise<void> {
  await seedAuthLocalStorage(page);
  await page.goto(hashPath("/"));
  await expect(page.getByTestId("host-sidebar-flow")).toBeVisible({ timeout: 30_000 });
}
