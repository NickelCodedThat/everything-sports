import { fixtureStories } from "@/data/stories";
import type { NewsProvider, NewsProviderQuery } from "./types";

/**
 * Local/mock provider backed by typed fixture data. Stands in for a future
 * RSS/API ingestion source while the product and architecture are validated.
 * `fetchStories` is async to mirror the real provider contract even though
 * the data is already in memory.
 */
export const localNewsProvider: NewsProvider = {
  id: "local-fixtures",
  name: "Local Fixtures",
  async fetchStories(query: NewsProviderQuery = {}) {
    let stories = fixtureStories;

    if (query.sport) {
      stories = stories.filter((story) => story.sport === query.sport);
    }

    if (query.limit != null) {
      stories = stories.slice(0, query.limit);
    }

    return stories;
  },
};
