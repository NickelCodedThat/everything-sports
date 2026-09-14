import type { Sport } from "@/types/sport";
import type { Story } from "@/types/story";

export interface NewsProviderQuery {
  sport?: Sport;
  limit?: number;
}

/**
 * Contract every ingestion source must satisfy. Each provider is responsible
 * for fetching from its own vendor shape and normalizing into the canonical
 * `Story` type before returning, so nothing downstream ever couples to one
 * vendor's schema. Phase 1 ships only `LocalNewsProvider`; RSS/API providers
 * implement this same interface later without touching the rest of the app.
 */
export interface NewsProvider {
  id: string;
  name: string;
  fetchStories(query?: NewsProviderQuery): Promise<Story[]>;
}
