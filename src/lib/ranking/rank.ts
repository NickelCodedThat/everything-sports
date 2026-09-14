import type { Story } from "@/types/story";
import { editorialScore, type RankingContext } from "./score";

/**
 * Sorts stories by computed editorial score, highest first. Ties fall back to
 * basketball winning per editorial priority, then to the most recent story.
 */
export function rankStories(stories: Story[], ctx: RankingContext = {}): Story[] {
  const scored = stories.map((story) => ({ story, score: editorialScore(story, ctx) }));

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;

    const aIsBasketball = a.story.sport === "basketball";
    const bIsBasketball = b.story.sport === "basketball";
    if (aIsBasketball !== bIsBasketball) return aIsBasketball ? -1 : 1;

    return new Date(b.story.publishedAt).getTime() - new Date(a.story.publishedAt).getTime();
  });

  return scored.map((entry) => entry.story);
}
