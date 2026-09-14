import type { Story } from "@/types/story";

/**
 * Enforces the homepage rule "no story appears more than twice on the
 * homepage, including related-link echoes" (blueprint section 11) across
 * every section, since sections are assembled independently but share one
 * page.
 */
export function createUsageTracker(maxUses = 2) {
  const counts = new Map<string, number>();

  return {
    canUse(story: Story): boolean {
      return (counts.get(story.id) ?? 0) < maxUses;
    },
    use(story: Story): void {
      counts.set(story.id, (counts.get(story.id) ?? 0) + 1);
    },
  };
}

export type UsageTracker = ReturnType<typeof createUsageTracker>;

/** Takes up to `count` stories from `pool`, in order, respecting the usage tracker and an optional predicate. */
export function takeStories(
  pool: Story[],
  count: number,
  tracker: UsageTracker,
  predicate: (story: Story) => boolean = () => true,
): Story[] {
  const picked: Story[] = [];
  for (const story of pool) {
    if (picked.length >= count) break;
    if (!predicate(story)) continue;
    if (!tracker.canUse(story)) continue;
    picked.push(story);
    tracker.use(story);
  }
  return picked;
}
