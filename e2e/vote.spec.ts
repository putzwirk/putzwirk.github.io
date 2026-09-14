import { expect, test } from "@playwright/test";
import { stackConfigured } from "./helpers";

function voteCount(text: string): number {
  return Number(text.match(/\d+/)?.[0] ?? 0);
}

test.describe("idea voting", () => {
  test.skip(!stackConfigured, "E2E stack not configured");

  test("an idea vote toggles once", async ({ page }) => {
    await page.goto("/lucidblocks/ideas");
    await expect(page.getByRole("heading", { name: "Ideas" })).toBeVisible();

    const voteButton = page.getByRole("button", { name: /vote/i }).first();
    await expect(voteButton).toBeVisible();
    const before = voteCount((await voteButton.textContent()) ?? "");

    await voteButton.click();
    await expect(voteButton).toContainText("voted");
    await expect.poll(async () => voteCount((await voteButton.textContent()) ?? "")).toBe(before + 1);

    await voteButton.click();
    await expect(voteButton).not.toContainText("voted");
    await expect.poll(async () => voteCount((await voteButton.textContent()) ?? "")).toBe(before);
  });
});
