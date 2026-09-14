import type { LeagueTier, Sport } from "@/types/sport";
import type { SourceCredibilityTier } from "@/types/entities";
import type { StoryUrgency } from "@/types/story";

/**
 * Domain-level editorial weighting per docs/BRAND-UI-BLUEPRINT.md and the
 * Phase 1 brief: basketball leads, football is a close second, baseball is a
 * strong third, and the rest receive standard coverage. This table is the
 * single place that encodes that hierarchy; nothing else should hardcode it.
 */
export const SPORT_WEIGHT: Record<Sport, number> = {
  basketball: 100,
  football: 95,
  baseball: 90,
  boxing: 70,
  mma: 70,
  soccer: 70,
  hockey: 65,
  tennis: 60,
  golf: 55,
  motorsports: 55,
  olympics: 65,
  other: 45,
};

/** Professional competition comes first; college and other tiers are discounted. */
export const TIER_MULTIPLIER: Record<LeagueTier, number> = {
  professional: 1,
  international: 0.92,
  college: 0.8,
  other: 0.7,
};

export const URGENCY_BONUS: Record<StoryUrgency, number> = {
  breaking: 40,
  developing: 20,
  none: 0,
};

export const SOURCE_CREDIBILITY_WEIGHT: Record<SourceCredibilityTier, number> = {
  staff: 10,
  wire: 6,
  syndicated: 3,
  aggregated: 0,
};

/** Added to a pinned story's score so it sorts above everything else without a special code path. */
export const PINNED_BONUS = 100_000;
