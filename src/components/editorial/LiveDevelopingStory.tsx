import Link from "next/link";
import type { Story } from "@/types/story";
import { getStoryPath } from "@/lib/routes";
import { Timestamp } from "@/components/ui/Timestamp";
import { UrgencyTag } from "@/components/ui/Tag";

/**
 * Live or developing story: Burnt Signal marker, last-update time, and what
 * changed (blueprint section 10.G). `role="status"` per section 15 — this is
 * a noncritical live region, not an interrupting alert.
 */
export function LiveDevelopingStory({ story }: { story: Story }) {
  const badgeUrgency = story.urgency !== "none" ? story.urgency : "developing";

  return (
    <article role="status" className="border border-border p-4">
      <UrgencyTag urgency={badgeUrgency} />
      <h3 className="mt-2 font-editorial text-headline-3 font-bold text-ink">
        <Link href={getStoryPath(story)} className="hover:underline focus-visible:underline">
          {story.headline}
        </Link>
      </h3>
      <p className="mt-1 text-body text-ink-muted">{story.deck}</p>
      <p className="mt-2 text-meta font-semibold text-ink-muted">
        Last updated <Timestamp iso={story.updatedAt ?? story.publishedAt} />
      </p>
    </article>
  );
}
