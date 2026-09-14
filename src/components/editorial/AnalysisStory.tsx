import Link from "next/link";
import type { Story } from "@/types/story";
import { getStoryPath } from "@/lib/routes";
import { StoryMeta } from "./StoryMeta";
import { ContentTypeTag } from "@/components/ui/Tag";

/**
 * Analysis or column: headline leads, byline is subordinate, format label is
 * explicit. Uses a strong rule rather than a tinted side stripe (blueprint
 * section 10.E).
 */
export function AnalysisStory({ story }: { story: Story }) {
  return (
    <article className="border-t-2 border-ink pt-4">
      <ContentTypeTag storyType={story.storyType} />
      <h3 className="mt-2 font-editorial text-headline-2 font-bold text-ink">
        <Link href={getStoryPath(story)} className="hover:underline focus-visible:underline">
          {story.headline}
        </Link>
      </h3>
      <p className="mt-2 font-editorial text-body-lg text-ink-muted">{story.deck}</p>
      <StoryMeta story={story} className="mt-3" />
    </article>
  );
}
