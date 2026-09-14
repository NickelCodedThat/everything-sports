import { SOURCES } from "@/data/sources";
import type { Story } from "@/types/story";

let counter = 0;

/** Builds a minimal valid Story for unit tests, with sensible overridable defaults. */
export function makeStory(overrides: Partial<Story> = {}): Story {
  counter += 1;
  return {
    id: `story-${counter}`,
    slug: `story-${counter}`,
    headline: `Test headline ${counter}`,
    deck: "Test deck for a fixture story used only in unit tests.",
    source: SOURCES.STAFF,
    sourceUrl: `/test/story-${counter}`,
    publishedAt: new Date().toISOString(),
    sport: "other",
    originality: "original",
    storyType: "standard",
    urgency: "none",
    status: "published",
    ...overrides,
  };
}
