import { expect, type Locator, type Page } from "@playwright/test";
import { adminCredentials, baseURL, stackConfigured } from "../playwright.config";

export { baseURL, stackConfigured };

export function uniqueTitle(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

export async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto("/lucidblocks/login");
  await page.locator('input[type="email"]').fill(adminCredentials.email ?? "");
  await page.locator('input[type="password"]').fill(adminCredentials.password ?? "");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Manage mods" })).toBeVisible();
}

export async function openFirstMod(page: Page): Promise<void> {
  await page.goto("/lucidblocks/mods");
  const modLink = page.getByRole("link", { name: / by / }).first();
  await expect(modLink).toBeVisible();
  await modLink.click();
  await expect(page.getByRole("button", { name: "Report an issue" })).toBeVisible();
}

export async function firstModDownloadLink(page: Page): Promise<Locator> {
  await openFirstMod(page);
  const downloadLink = page.getByRole("link", { name: /Download latest/ }).first();
  await expect(downloadLink).toBeVisible();
  return downloadLink;
}
