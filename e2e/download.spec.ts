import { expect, test, type Page } from "@playwright/test";
import { firstModDownloadLink, stackConfigured } from "./helpers";

async function downloadCount(page: Page): Promise<number> {
  const chip = page.locator("details.version-entry").first().locator("summary .chip").last();
  const text = (await chip.textContent()) ?? "0";
  return Number(text.match(/\d+/)?.[0] ?? 0);
}

test.describe("downloads", () => {
  test.skip(!stackConfigured, "E2E stack not configured");

  test("a download link responds 200 and the counter increments once", async ({ page, request }) => {
    const downloadLink = await firstModDownloadLink(page);

    const href = await downloadLink.getAttribute("href");
    expect(href).toBeTruthy();
    const response = await request.get(href as string);
    expect(response.status()).toBe(200);

    const before = await downloadCount(page);

    const firstFunction = page.waitForResponse((res) => res.url().includes("/functions/v1/download") && res.request().method() === "POST");
    await downloadLink.dispatchEvent("click");
    const firstBody = await (await firstFunction).json();
    expect(firstBody.counted).toBe(true);
    await expect.poll(() => downloadCount(page)).toBe(before + 1);

    const secondFunction = page.waitForResponse((res) => res.url().includes("/functions/v1/download") && res.request().method() === "POST");
    await downloadLink.dispatchEvent("click");
    const secondBody = await (await secondFunction).json();
    expect(secondBody.counted).toBe(false);
    await expect.poll(() => downloadCount(page)).toBe(before + 1);
  });
});
