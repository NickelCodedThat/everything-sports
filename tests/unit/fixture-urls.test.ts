import { describe, expect, it } from "vitest";
import { fixtureStories } from "@/data/stories";
import { getStoryPath } from "@/lib/routes";

/**
 * Regression coverage for the audit finding: sourceUrl (the original/source
 * publication's URL) must never be conflated with Everything Sports' own
 * internal canonical story route.
 */
describe("fixture story URL semantics", () => {
  it("gives every aggregated story an external sourceUrl, distinct from its internal path", () => {
    const aggregated = fixtureStories.filter((story) => story.originality === "aggregated");
    expect(aggregated.length).toBeGreaterThan(0);

    for (const story of aggregated) {
      expect(story.sourceUrl).toMatch(/^https?:\/\//);
      expect(story.sourceUrl).not.toBe(getStoryPath(story));
    }
  });

  it("computes every story's internal path from its own sport and slug", () => {
    for (const story of fixtureStories) {
      expect(getStoryPath(story)).toBe(`/${story.sport}/${story.slug}`);
    }
  });
});
