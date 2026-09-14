import type { LeagueId, Sport } from "./sport";
import type { NewsSource, PersonRef, TeamRef } from "./entities";

/** Editorial content format. Distinct from urgency: a story is one format and, separately, may be urgent. */
export type StoryType =
  | "standard"
  | "brief"
  | "analysis"
  | "opinion"
  | "visual-feature"
  | "live";

/** Breaking-news level, per blueprint section 15. `none` covers ordinary published stories. */
export type StoryUrgency = "breaking" | "developing" | "none";

export type StoryStatus = "published" | "updated" | "corrected";

/** Whether the story is our own reporting/analysis or aggregated from another outlet. */
export type Originality = "original" | "aggregated";

export interface ImageMeta {
  src: string;
  alt: string;
  width: number;
  height: number;
  credit?: string;
  /** Normalized 0-1 focal point so crops preserve the subject instead of centering blindly. */
  focalPoint?: { x: number; y: number };
}

/**
 * Editorial inputs that adjust a story's computed rank. These are separate from
 * the deterministic sport/league/recency weights so an editor can nudge or pin
 * a story without fighting the algorithm. See src/lib/ranking.
 */
export interface EditorialPriority {
  /** Editor-set score that overrides the computed one entirely, highest wins. */
  manualOverride?: number;
  /** Pins the story to the top of its section regardless of score. */
  pinned?: boolean;
  /** Distinct outlets covering the event; more coverage signals bigger news. */
  sourceCount?: number;
  /** Editorial judgment of how significant the teams/people involved are, 0-1. */
  significance?: number;
}

export interface Story {
  id: string;
  slug: string;
  headline: string;
  deck: string;
  source: NewsSource;
  sourceUrl: string;
  byline?: string;
  /** ISO 8601 timestamp. */
  publishedAt: string;
  /** ISO 8601 timestamp, present once a story has been meaningfully updated. */
  updatedAt?: string;
  sport: Sport;
  league?: LeagueId;
  teams?: TeamRef[];
  people?: PersonRef[];
  topics?: string[];
  image?: ImageMeta;
  originality: Originality;
  storyType: StoryType;
  urgency: StoryUrgency;
  status: StoryStatus;
  editorialPriority?: EditorialPriority;
}

/** Groups every format around one major event: report, live updates, analysis, reaction, etc. */
export interface StoryCluster {
  id: string;
  slug: string;
  title: string;
  leadStoryId: string;
  storyIds: string[];
}
