import Link from "next/link";
import type { Story } from "@/types/story";
import { StoryImage } from "./StoryImage";
import { StoryMeta } from "./StoryMeta";
import { ContentTypeTag, UrgencyTag } from "@/components/ui/Tag";

/** Standard river story: headline, metadata, optional dek, small thumbnail, bottom divider (blueprint section 10.C). */
export function RiverStory({ story }: { story: Story }) {
  return (
    <article className="flex gap-4 border-b border-border py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {story.urgency !== "none" ? <UrgencyTag urgency={story.urgency} /> : null}
          <ContentTypeTag storyType={story.storyType} />
        </div>
        <h3 className="mt-1 font-editorial text-headline-3 font-semibold text-ink">
          <Link href={story.sourceUrl} className="hover:underline focus-visible:underline">
            {story.headline}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-body text-ink-muted">{story.deck}</p>
        <StoryMeta story={story} className="mt-2" />
      </div>

      {story.image ? (
        <Link href={story.sourceUrl} className="block w-[104px] shrink-0">
          <StoryImage image={story.image} aspectRatio="4/3" sizes="104px" className="rounded-[4px]" />
        </Link>
      ) : null}
    </article>
  );
}
