import { LEAGUES } from "@/types/sport";
import type { Story } from "@/types/story";
import {
  PINNED_BONUS,
  SOURCE_CREDIBILITY_WEIGHT,
  SPORT_WEIGHT,
  TIER_MULTIPLIER,
  URGENCY_BONUS,
} from "./weights";

const LEAGUE_BY_ID = new Map(Object.values(LEAGUES).map((league) => [league.id, league]));

export interface RankingContext {
  /** Injectable clock so recency scoring is deterministic in tests. */
  now?: Date;
}

/** Hours between a story's most recent timestamp and now, floored at 0. */
function hoursSinceUpdate(story: Story, now: Date): number {
  const latest = story.updatedAt ?? story.publishedAt;
  const hours = (now.getTime() - new Date(latest).getTime()) / (1000 * 60 * 60);
  return Math.max(0, hours);
}

/** Linear recency decay: full weight at publish, zero after 36 hours. */
function recencyScore(story: Story, now: Date): number {
  const hours = hoursSinceUpdate(story, now);
  const window = 36;
  return Math.max(0, window - hours);
}

/**
 * Deterministic editorial score combining sport priority, competition tier,
 * recency, breaking/developing urgency, source quality, and editor input.
 * A manual override replaces the computed score outright; pinning adds a
 * bonus large enough to always sort first instead.
 */
export function editorialScore(story: Story, ctx: RankingContext = {}): number {
  if (story.editorialPriority?.manualOverride != null) {
    return story.editorialPriority.manualOverride;
  }

  const now = ctx.now ?? new Date();
  const league = story.league ? LEAGUE_BY_ID.get(story.league) : undefined;
  const tierMultiplier = league ? TIER_MULTIPLIER[league.tier] : 1;

  const base = SPORT_WEIGHT[story.sport] * tierMultiplier;
  const urgency = URGENCY_BONUS[story.urgency];
  const sourceCredibility = SOURCE_CREDIBILITY_WEIGHT[story.source.credibilityTier];
  const significance = (story.editorialPriority?.significance ?? 0) * 20;
  const sourceCount = Math.min(story.editorialPriority?.sourceCount ?? 1, 10) * 1.5;
  const pinned = story.editorialPriority?.pinned ? PINNED_BONUS : 0;

  return (
    base +
    recencyScore(story, now) +
    urgency +
    sourceCredibility +
    significance +
    sourceCount +
    pinned
  );
}
