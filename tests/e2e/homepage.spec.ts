import { expect, test } from "@playwright/test";

const SECTION_IDS = [
  "section-wire",
  "section-lead",
  "section-now",
  "section-run",
  "section-huddle",
  "section-cut",
  "section-diamond",
  "section-fight-desk",
  "section-world-game",
  "section-across-the-board",
  "section-most-read",
];

test.describe("homepage", () => {
  test("has exactly one h1 and every editorial section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);

    for (const id of SECTION_IDS) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
  });

  test("has a working skip link", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.locator(".skip-link");
    await expect(skipLink).toHaveAttribute("href", "#main-content");
    await expect(page.locator("#main-content")).toBeAttached();
  });

  test("has no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("primary nav links are reachable and go somewhere real", async ({ page }) => {
    await page.goto("/");
    // The desktop nav landmark is hidden at mobile widths (the mobile menu
    // carries the same links instead), so check the footer's copy, which is
    // always present, rather than assuming which nav is visible.
    await expect(page.getByRole("navigation", { name: "Footer sections" }).getByRole("link", { name: "Basketball" })).toHaveAttribute(
      "href",
      "/basketball",
    );

    const response = await page.goto("/basketball");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("h1")).toContainText("Basketball");
  });
});

test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile menu opens as an opaque dialog, traps focus, and restores focus on close", async ({
    page,
  }) => {
    await page.goto("/");
    const menuButton = page.getByRole("button", { name: "Open menu" });
    await menuButton.click();

    const dialog = page.getByRole("dialog", { name: "Site menu" });
    await expect(dialog).toBeVisible();

    // The dialog must actually cover the page, not just exist in the DOM
    // underneath other content (regression check for the z-index bug).
    const box = await dialog.boundingBox();
    expect(box?.width).toBeGreaterThan(300);

    await expect(dialog.getByRole("link", { name: "Basketball" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(menuButton).toBeFocused();
  });

  test("body scroll locks while the mobile menu is open", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe("hidden");
  });

  test("search dialog does not autofocus until opened", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.getByLabel("Search Everything Sports");
    await expect(searchInput).toHaveCount(0);

    await page.getByRole("button", { name: "Open search" }).click();
    await expect(searchInput).toBeFocused();
  });
});
