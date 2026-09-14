import { describe, expect, it } from "vitest";
import { editorialScore, rankStories } from "@/lib/ranking";
import { LEAGUES } from "@/types/sport";
import { makeStory } from "./helpers";

describe("editorial ranking", () => {
  it("weighs basketball above football above baseball above standard coverage, all else equal", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const basketball = makeStory({ sport: "basketball", publishedAt: now.toISOString() });
    const football = makeStory({ sport: "football", publishedAt: now.toISOString() });
    const baseball = makeStory({ sport: "baseball", publishedAt: now.toISOString() });
    const tennis = makeStory({ sport: "tennis", publishedAt: now.toISOString() });

    const scores = [basketball, football, baseball, tennis].map((story) =>
      editorialScore(story, { now }),
    );

    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
    expect(scores[2]).toBeGreaterThan(scores[3]);
  });

  it("discounts college competition relative to professional, same sport", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const pro = makeStory({ sport: "basketball", league: LEAGUES.NBA.id, publishedAt: now.toISOString() });
    const college = makeStory({ sport: "basketball", league: LEAGUES.NCAAB.id, publishedAt: now.toISOString() });

    expect(editorialScore(pro, { now })).toBeGreaterThan(editorialScore(college, { now }));
  });

  it("boosts breaking stories over developing over routine, same sport and time", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const breaking = makeStory({ urgency: "breaking", publishedAt: now.toISOString() });
    const developing = makeStory({ urgency: "developing", publishedAt: now.toISOString() });
    const routine = makeStory({ urgency: "none", publishedAt: now.toISOString() });

    expect(editorialScore(breaking, { now })).toBeGreaterThan(editorialScore(developing, { now }));
    expect(editorialScore(developing, { now })).toBeGreaterThan(editorialScore(routine, { now }));
  });

  it("favors more recent stories, all else equal", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const fresh = makeStory({ publishedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString() });
    const stale = makeStory({ publishedAt: new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString() });

    expect(editorialScore(fresh, { now })).toBeGreaterThan(editorialScore(stale, { now }));
  });

  it("lets a manual override replace the computed score entirely", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const overridden = makeStory({
      sport: "other",
      publishedAt: now.toISOString(),
      editorialPriority: { manualOverride: 9999 },
    });
    const strong = makeStory({ sport: "basketball", urgency: "breaking", publishedAt: now.toISOString() });

    const [top] = rankStories([strong, overridden], { now });
    expect(top.id).toBe(overridden.id);
  });

  it("sorts a pinned story to the top regardless of its base score", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const pinned = makeStory({
      sport: "golf",
      publishedAt: new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString(),
      editorialPriority: { pinned: true },
    });
    const strong = makeStory({ sport: "basketball", urgency: "breaking", publishedAt: now.toISOString() });

    const [top] = rankStories([strong, pinned], { now });
    expect(top.id).toBe(pinned.id);
  });

  it("breaks ties in favor of basketball", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    // Same sport weight tier is impossible across sports, so force equal scores via manual override.
    const basketball = makeStory({
      sport: "basketball",
      publishedAt: now.toISOString(),
      editorialPriority: { manualOverride: 50 },
    });
    const football = makeStory({
      sport: "football",
      publishedAt: now.toISOString(),
      editorialPriority: { manualOverride: 50 },
    });

    const [top] = rankStories([football, basketball], { now });
    expect(top.sport).toBe("basketball");
  });
});
