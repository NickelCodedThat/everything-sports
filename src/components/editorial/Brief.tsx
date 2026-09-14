import Link from "next/link";
import type { Story } from "@/types/story";
import { Timestamp } from "@/components/ui/Timestamp";

/** Brief: timestamp, concise headline, optional update marker, no image (blueprint section 10.D). */
export function Brief({ story }: { story: Story }) {
  return (
    <article className="flex items-baseline gap-3 border-b border-border py-3 last:border-b-0">
      <Timestamp iso={story.updatedAt ?? story.publishedAt} className="shrink-0 text-meta font-semibold text-ink-muted" />
      <p className="text-ui font-semibold text-ink">
        <Link href={story.sourceUrl} className="hover:underline focus-visible:underline">
          {story.headline}
        </Link>
        {story.status === "updated" ? <span className="ml-2 text-meta font-semibold text-brand">Updated</span> : null}
      </p>
    </article>
  );
}
