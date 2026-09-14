import { expect, test } from "@playwright/test";
import { baseURL, openFirstMod, signInAsAdmin, stackConfigured, uniqueTitle } from "./helpers";

test.describe.serial("issue moderation and discussion", () => {
  test.skip(!stackConfigured, "E2E stack not configured");

  let issueTitle = "";
  let issueUrl = "";

  test("anonymous bug submission shows pending moderation", async ({ page }) => {
    issueTitle = uniqueTitle("E2E bug");
    await openFirstMod(page);
    await page.getByRole("button", { name: "Report an issue" }).click();
    await page.getByLabel("What's broken").fill(issueTitle);
    await page.getByLabel("Description (optional)").fill("Submitted by the E2E suite.");
    await page.getByRole("button", { name: "Submit issue" }).click();

    const issueLink = page.getByRole("link", { name: issueTitle });
    await expect(issueLink).toBeVisible();
    await expect(page.getByText("pending moderation").first()).toBeVisible();
    issueUrl = (await issueLink.getAttribute("href")) ?? "";
    expect(issueUrl).toContain("/lucidblocks/issues/");
  });

  test("admin approves the submission and it becomes public", async ({ page, browser }) => {
    await signInAsAdmin(page);
    await page.goto("/lucidblocks/admin/submissions");

    const moderationItem = page.getByRole("article").filter({ hasText: issueTitle });
    await expect(moderationItem).toBeVisible();
    await moderationItem.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("article").filter({ hasText: issueTitle })).toHaveCount(0);

    const publicContext = await browser.newContext({ baseURL });
    const publicPage = await publicContext.newPage();
    await publicPage.goto(issueUrl);
    await expect(publicPage.getByRole("heading", { name: issueTitle })).toBeVisible();
    await expect(publicPage.getByText("pending moderation")).toHaveCount(0);
    await publicContext.close();
  });

  test("a comment and a one-level reply appear on the issue page", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(issueUrl);

    const commentBody = uniqueTitle("E2E comment");
    await page.getByPlaceholder("Add a comment").fill(commentBody);
    await page.getByRole("button", { name: "Comment", exact: true }).click();

    const commentItem = page.getByRole("listitem").filter({ hasText: commentBody });
    await expect(commentItem).toBeVisible();

    await commentItem.getByRole("button", { name: "Reply", exact: true }).click();
    const replyBody = uniqueTitle("E2E reply");
    await commentItem.getByPlaceholder(/^Reply to /).fill(replyBody);
    await commentItem.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(page.getByText(replyBody)).toBeVisible();
  });

  test("an idea can be discussed inline from the Ideas page", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/lucidblocks/ideas");

    const rows = page.locator("li.issue-row");
    await expect(rows.nth(1)).toBeVisible();
    const firstRow = rows.nth(0);
    const secondRow = rows.nth(1);
    const countOf = async (row: typeof firstRow) => {
      const text = (await row.locator("button.comment-toggle").textContent()) ?? "";
      const match = text.match(/(\d+)\s+comment/);
      return match ? Number(match[1]) : 0;
    };

    const firstCount = await countOf(firstRow);
    await firstRow.locator("button.comment-toggle").click();

    const body = uniqueTitle("E2E idea comment");
    const section = firstRow.locator(".issue-comments");
    await section.getByPlaceholder(/^Comment on/).fill(body);
    await section.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(section.locator(".comment").filter({ hasText: body })).toBeVisible();
    await expect(firstRow.locator("button.comment-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => countOf(firstRow)).toBe(firstCount + 1);

    const secondCount = await countOf(secondRow);
    await secondRow.locator("button.comment-toggle").click();
    const secondSection = secondRow.locator(".issue-comments");
    await expect(secondSection).toBeVisible();
    await expect(section).toBeVisible();

    const secondBody = uniqueTitle("E2E second idea comment");
    await secondSection.getByPlaceholder(/^Comment on/).fill(secondBody);
    await secondSection.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(secondSection.locator(".comment").filter({ hasText: secondBody })).toBeVisible();
    await expect(section.locator(".comment").filter({ hasText: body })).toBeVisible();
    await expect.poll(() => countOf(secondRow)).toBe(secondCount + 1);

    await firstRow.locator("button.comment-toggle").click();
    await expect(section).toHaveCount(0);
    await expect(secondSection).toBeVisible();
  });
});
