import { describe, expect, it } from "vitest";
import { buildHomepage } from "@/lib/editorial";
import { fixtureStories } from "@/data/stories";

describe("homepage assembly", () => {
  const homepage = buildHomepage(fixtureStories);

  it("selects a lead headline", () => {
    expect(homepage.lead).not.toBeNull();
    expect(homepage.lead?.supporting.length).toBeLessThanOrEqual(2);
  });

  it("fills the wire with only breaking or developing stories", () => {
    expect(homepage.wire.length).toBeGreaterThan(0);
    for (const story of homepage.wire) {
      expect(["breaking", "developing"]).toContain(story.urgency);
    }
  });

  it("scopes each sport package to its sport", () => {
    for (const story of homepage.run) expect(story.sport).toBe("basketball");
    for (const story of homepage.huddle) expect(story.sport).toBe("football");
    for (const story of homepage.diamond) expect(story.sport).toBe("baseball");
    for (const story of homepage.worldGame) expect(story.sport).toBe("soccer");
    for (const story of homepage.fightDesk) {
      expect(["boxing", "mma"]).toContain(story.sport);
    }
    for (const story of homepage.acrossTheBoard) {
      expect(["hockey", "tennis", "golf", "motorsports", "olympics"]).toContain(story.sport);
    }
  });

  it("picks a cut feature that breaks the basketball/football rhythm", () => {
    expect(homepage.cut).not.toBeNull();
    expect(["basketball", "football"]).not.toContain(homepage.cut?.sport);
  });

  it("never uses the same story more than twice across the whole page", () => {
    const counts = new Map<string, number>();
    const allSections = [
      ...homepage.wire,
      ...(homepage.lead ? [homepage.lead.headline, ...homepage.lead.supporting] : []),
      ...homepage.now,
      ...homepage.run,
      ...homepage.huddle,
      ...(homepage.cut ? [homepage.cut] : []),
      ...homepage.diamond,
      ...homepage.fightDesk,
      ...homepage.worldGame,
      ...homepage.acrossTheBoard,
      ...homepage.mostRead,
    ];

    for (const story of allSections) {
      counts.set(story.id, (counts.get(story.id) ?? 0) + 1);
    }

    for (const [, count] of counts) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it("orders the now river chronologically, most recent first", () => {
    for (let i = 1; i < homepage.now.length; i += 1) {
      const prev = new Date(homepage.now[i - 1].updatedAt ?? homepage.now[i - 1].publishedAt).getTime();
      const curr = new Date(homepage.now[i].updatedAt ?? homepage.now[i].publishedAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });
});
