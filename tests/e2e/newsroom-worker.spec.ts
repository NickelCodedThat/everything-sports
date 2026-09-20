import { expect, test } from "@playwright/test";

/**
 * The internal newsroom worker endpoint must never be usable, indexable or cacheable by the
 * public. These run without any secret, so they only exercise the "closed door" paths — the
 * authenticated path is covered by unit/integration tests and the live validation.
 */
const TICK = "/api/internal/newsroom/tick";

test.describe("internal newsroom worker endpoint", () => {
  test("rejects an unauthenticated POST (401 with a secret configured, 503 without) — never runs anything", async ({ request }) => {
    const response = await request.post(TICK, { data: { provider: "gdelt-gkg" } });
    expect([401, 503]).toContain(response.status());
    const body = await response.json();
    expect(body).toEqual({ error: expect.stringMatching(/^(unauthorized|worker-not-configured)$/) });
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["x-robots-tag"]).toMatch(/noindex/);
  });

  test("rejects a wrong bearer secret", async ({ request }) => {
    const response = await request.post(TICK, { headers: { authorization: "Bearer definitely-not-the-secret-0123456789abcdef" } });
    expect([401, 503]).toContain(response.status());
  });

  test("is POST-only", async ({ request }) => {
    expect((await request.get(TICK)).status()).toBe(405);
  });
});

test("the site still disallows crawling everywhere, including the worker path", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Disallow: \//);
});
