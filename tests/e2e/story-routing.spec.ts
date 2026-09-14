import { expect, test } from "@playwright/test";

/**
 * Regression coverage for the routing/source-semantics audit finding: the
 * homepage must never link a reader to a 404, and an aggregated story must
 * expose a clear, correct outbound action to its actual external source.
 */
test.describe("story routing", () => {
  test("a homepage lead/headline link resolves to a real, non-404 story route", async ({ page }) => {
    await page.goto("/");
    const leadHeadlineLink = page.locator('section[aria-labelledby="section-lead"] h3 a').first();
    const href = await leadHeadlineLink.getAttribute("href");
    expect(href).toMatch(/^\/[a-z]+\/[a-z0-9-]+$/);

    const response = await page.goto(href!);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("h1")).toBeVisible();
    // The page must be our own canonical route, not an external source URL.
    expect(page.url()).toContain(href!);
  });

  test("an aggregated story route renders and links out to its real external source", async ({
    page,
  }) => {
    const response = await page.goto("/basketball/marcus-devereaux-knee-injury");
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator("h1")).toContainText("Marcus Devereaux");
    await expect(page.getByText(/This reporting originated at/)).toBeVisible();

    const outboundLink = page.getByRole("link", { name: /Read original reporting at/ });
    await expect(outboundLink).toBeVisible();
    const outboundHref = await outboundLink.getAttribute("href");
    expect(outboundHref).toMatch(/^https:\/\/example\.com\//);
    await expect(outboundLink).toHaveAttribute("target", "_blank");
    await expect(outboundLink).toHaveAttribute("rel", /noopener/);
  });

  test("an original story route renders without an outbound source action or a fabricated body", async ({
    page,
  }) => {
    const response = await page.goto("/basketball/ironline-trade-for-elias-kovac");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("h1")).toContainText("Ironline Trade");
    await expect(page.getByRole("link", { name: /Read original reporting at/ })).toHaveCount(0);
  });

  test("an unknown story slug returns a real 404", async ({ page }) => {
    const response = await page.goto("/basketball/this-story-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.locator("h1")).toContainText("Page not found");
  });

  test("an unknown sport segment also returns a real 404", async ({ page }) => {
    const response = await page.goto("/not-a-real-sport/whatever");
    expect(response?.status()).toBe(404);
  });

  test("primary navigation still resolves correctly alongside the new story route", async ({
    page,
  }) => {
    await page.goto("/");
    const response = await page.goto("/basketball");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("h1")).toContainText("Basketball");
  });
});
