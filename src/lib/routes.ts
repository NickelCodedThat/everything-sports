import type { Sport } from "@/types/sport";
import type { Story } from "@/types/story";

/**
 * Everything Sports' own canonical route for a story. This is distinct from
 * `story.sourceUrl`, which records the original/source publication's URL —
 * for aggregated stories that's always an external destination; for our own
 * original reporting it may legitimately equal this same path, but the two
 * concepts must never be conflated. Editorial components should always link
 * a reader to a headline/card using this path, never `sourceUrl` directly.
 */
export function getStoryPath(story: Pick<Story, "sport" | "slug">): string {
  return `/${story.sport}/${story.slug}`;
}

/** Primary nav sections that exist as dedicated static routes. */
const SPORT_SECTION_HREF: Partial<Record<Sport, string>> = {
  basketball: "/basketball",
  football: "/football",
  baseball: "/baseball",
  boxing: "/fight",
  mma: "/fight",
  soccer: "/soccer",
};

/** Where a "back to section" link should point for a given sport; falls back to Latest for sports without a dedicated page. */
export function getSectionHref(sport: Sport): string {
  return SPORT_SECTION_HREF[sport] ?? "/latest";
}
